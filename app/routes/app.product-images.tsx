import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useEffect, useState } from "react";
import { Form, useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppButton } from "../components/AppButton";
import { Card, StatTile } from "../components/Card";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { Choice } from "../components/PolarisChoice";
import { EmptyState } from "../components/EmptyState";
import { useToast } from "../components/Toast";
import prisma from "../db.server";
import { syncProductImages } from "../lib/sync-images.server";
import { generateAltText, generateTemplateAltText } from "../lib/alt-text-generator.server";
import type { AltTextTone } from "../lib/tone-options";
import type { AltTextLanguage } from "../lib/language-options";
import { updateProductImageAltText } from "../lib/image-mutations.server";
import { getAppSettings } from "../lib/settings.server";
import { getBillingAccount, hasCredits, deductCredit } from "../lib/billing.server";
import { createJob, completeJob } from "../lib/job-history.server";

const PAGE_SIZE = 25;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const tab = url.searchParams.get("tab") || "all";

  const where = {
    shop,
    ...(tab === "containing" ? { altText: { not: null } } : {}),
    ...(tab === "missing" ? { altText: null } : {}),
    ...(tab === "processing" ? { status: "processing" } : {}),
    ...(tab === "completed" ? { status: "completed" } : {}),
    ...(tab === "failed" ? { status: "failed" } : {}),
  };

  const totalCount = await prisma.productImage.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const images = await prisma.productImage.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const allTotal = await prisma.productImage.count({ where: { shop } });
  const allWithAlt = await prisma.productImage.count({ where: { shop, altText: { not: null } } });
  const allMissing = allTotal - allWithAlt;

  const settings = await getAppSettings(shop);
  const billing = await getBillingAccount(shop);

  return { images, page, totalPages, tab, allTotal, allWithAlt, allMissing, settings, billing };
};

async function generateForImage(shop: string, imageId: string, mode: "ai" | "template") {
  const image = await prisma.productImage.findUnique({ where: { id: imageId } });
  if (!image || image.shop !== shop) return { succeeded: false };

  if (mode === "template") {
    const settings = await getAppSettings(shop);
    const result = generateTemplateAltText({
      productTitle: image.productTitle,
      productVendor: image.productVendor,
      targetKeywords: settings.targetKeywords,
    });
    await prisma.productImage.update({
      where: { id: imageId },
      data: { altText: result.altText, status: "completed" },
    });
    return { succeeded: true, altText: result.altText };
  }

  if (!(await hasCredits(shop))) return { succeeded: false, outOfCredits: true };

  await prisma.productImage.update({ where: { id: imageId }, data: { status: "processing" } });

  const settings = await getAppSettings(shop);
  const result = await generateAltText({
    imageUrl: image.imageUrl,
    productTitle: image.productTitle,
    tone: settings.tone as AltTextTone,
    language: settings.defaultLanguage as AltTextLanguage,
    brandDescription: settings.brandDescription,
    includeBrandName: settings.includeBrandName,
    targetKeywords: settings.targetKeywords,
    forbiddenWords: settings.forbiddenWords,
  });

  if (!result) {
    await prisma.productImage.update({ where: { id: imageId }, data: { status: "failed" } });
    return { succeeded: false };
  }

  await deductCredit(shop);
  await prisma.productImage.update({
    where: { id: imageId },
    data: { altText: result.altText, status: "completed" },
  });

  return { succeeded: true, altText: result.altText };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "sync") {
    const productStatus = (String(formData.get("productStatus") ?? "all")) as "active" | "draft" | "all";
    const job = await createJob(shop, "sync", 0);
    const count = await syncProductImages(admin, shop, productStatus);
    await completeJob(job.id, { imagesSucceeded: count, imagesFailed: 0, creditsUsed: 0 });
    return { synced: count };
  }

  if (intent === "save-edit") {
    const imageId = String(formData.get("imageId") ?? "");
    const altText = String(formData.get("altText") ?? "").trim();
    const image = await prisma.productImage.findUnique({ where: { id: imageId } });
    if (!image || image.shop !== shop) return { succeeded: false };

    const mutation = await updateProductImageAltText(admin, image.shopifyProductId, image.shopifyImageId, altText);
    if (mutation.succeeded) {
      await prisma.productImage.update({
        where: { id: imageId },
        data: { altText, status: altText ? "completed" : "not_generated" },
      });
    }
    return { succeeded: mutation.succeeded };
  }

  if (intent === "generate") {
    const ids = formData.getAll("imageIds").map(String);
    const mode = (String(formData.get("mode") ?? "ai")) as "ai" | "template";
    const job = await createJob(shop, "ai_generate", ids.length);
    let succeeded = 0;
    let failed = 0;

    for (const imageId of ids) {
      const image = await prisma.productImage.findUnique({ where: { id: imageId } });
      if (!image || image.shop !== shop) {
        failed += 1;
        continue;
      }
      const genResult = await generateForImage(shop, imageId, mode);
      if (genResult.succeeded && genResult.altText) {
        await updateProductImageAltText(admin, image.shopifyProductId, image.shopifyImageId, genResult.altText);
        succeeded += 1;
      } else {
        failed += 1;
        if (genResult.outOfCredits) break;
      }
    }

    await completeJob(job.id, { imagesSucceeded: succeeded, imagesFailed: failed, creditsUsed: mode === "ai" ? succeeded : 0 });
    return { succeeded, failed };
  }

  return null;
};

export default function ProductImages() {
  const { images, page, totalPages, tab, allTotal, allWithAlt, allMissing, billing } = useLoaderData<typeof loader>();
  const { showToast } = useToast();

  const syncFetcher = useFetcher<{ synced: number }>();
  const generateFetcher = useFetcher<{ succeeded: number; failed: number }>();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resyncStatus, setResyncStatus] = useState<"active" | "draft" | "all">("active");
  const [pendingGenerateIds, setPendingGenerateIds] = useState<string[]>([]);
  const [generateMode, setGenerateMode] = useState<"ai" | "template">("ai");

  const outOfCredits = billing.creditBalance <= 0;
  const isSyncing = syncFetcher.state !== "idle";
  const isGenerating = generateFetcher.state !== "idle";

  useEffect(() => {
    if (syncFetcher.data && syncFetcher.state === "idle") {
      showToast(`Resync complete — ${syncFetcher.data.synced} images synced.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncFetcher.data]);

  useEffect(() => {
    if (generateFetcher.data && generateFetcher.state === "idle") {
      const { succeeded, failed } = generateFetcher.data;
      showToast(
        succeeded === 1 && failed === 0
          ? "Alt tag generated."
          : `Generated ${succeeded} alt tag${succeeded === 1 ? "" : "s"}${failed > 0 ? `, ${failed} failed` : ""}.`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateFetcher.data]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const startResync = () => {
    const formData = new FormData();
    formData.set("intent", "sync");
    formData.set("productStatus", resyncStatus);
    syncFetcher.submit(formData, { method: "post" });
    showToast("Resync started.");
  };

  const openGenerateModal = (ids: string[]) => {
    setPendingGenerateIds(ids);
  };

  const runGenerate = () => {
    const formData = new FormData();
    formData.set("intent", "generate");
    formData.set("mode", generateMode);
    pendingGenerateIds.forEach((id) => formData.append("imageIds", id));
    generateFetcher.submit(formData, { method: "post" });
    setSelectedIds([]);
  };

  return (
    <s-page heading="Product Images">
      <s-button slot="primary-action" command="--show" commandFor="resync-modal" variant="primary" icon="refresh" disabled={isSyncing}>
        {isSyncing ? "Resyncing..." : "Sync from Shopify"}
      </s-button>
      <s-button slot="secondary-actions" href="/app/job-history" variant="secondary" icon="clock">Job history</s-button>
      <s-button slot="secondary-actions" href="/app/pricing" variant="secondary" icon="credit-card">Buy credits</s-button>
      <s-paragraph>{allTotal} images across your store</s-paragraph>

      {allMissing === 0 && allTotal > 0 ? (
        <s-banner tone="success">
          You&apos;re all caught up. Every product image in your store has alt text — great for SEO and accessibility.
        </s-banner>
      ) : allTotal === 0 ? (
        <s-banner tone="info">No images synced yet. Click &quot;Sync from Shopify&quot; above.</s-banner>
      ) : null}

      <div className="app-card-row" style={{ marginTop: "1.25rem", marginBottom: "1.25rem" }}>
        <StatTile icon="credit-card" label="Available credits" value={String(billing.creditBalance)} />
        <StatTile icon="images" label="Total images" value={String(allTotal)} />
        <StatTile icon="check-circle" tone="success" label="With alt text" value={String(allWithAlt)} />
        <StatTile icon="alert-triangle" tone={allMissing > 0 ? "warning" : "default"} label="Missing alt text" value={String(allMissing)} />
      </div>

      <Card>
        <div className="app-search-bar">
          <s-stack direction="inline" gap="small-200">
            {[
              { value: "all", label: "All" },
              { value: "containing", label: "Containing Alt Text" },
              { value: "missing", label: "Missing Alt Text" },
              { value: "processing", label: "Processing" },
              { value: "completed", label: "Completed" },
              { value: "failed", label: "Failed" },
            ].map((t) => (
              <AppButton key={t.value} href={`/app/product-images?tab=${t.value}`} variant={tab === t.value ? "primary" : "secondary"}>
                {t.label}
              </AppButton>
            ))}
          </s-stack>
        </div>

        {images.length === 0 ? (
          <EmptyState
            heading="No images found"
            description="No images match your search criteria. Please try again or sync images."
            action={
              <s-button command="--show" commandFor="resync-modal" variant="primary">Sync Images</s-button>
            }
          />
        ) : (
          <>
            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header>Image</s-table-header>
                <s-table-header>Product Name</s-table-header>
                <s-table-header>Product Status</s-table-header>
                <s-table-header>Product Vendor</s-table-header>
                <s-table-header>Alt Text</s-table-header>
                <s-table-header>Status</s-table-header>
                <s-table-header>Actions</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {images.map((image) => (
                  <s-table-row key={image.id}>
                    <s-table-cell>
                      <div className="app-image-cell">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(image.id)}
                          onChange={() => toggleSelected(image.id)}
                          aria-label={`Select ${image.productTitle}`}
                        />
                        <img src={image.imageUrl} alt="" width={40} height={40} style={{ objectFit: "cover" }} />
                      </div>
                    </s-table-cell>
                    <s-table-cell>{image.productTitle}</s-table-cell>
                    <s-table-cell>{image.productStatus}</s-table-cell>
                    <s-table-cell>{image.productVendor || "—"}</s-table-cell>
                    <s-table-cell>
                      {editingId === image.id ? (
                        <Form method="post" onSubmit={() => setEditingId(null)}>
                          <input type="hidden" name="intent" value="save-edit" />
                          <input type="hidden" name="imageId" value={image.id} />
                          <s-text-field label="" name="altText" value={image.altText ?? ""} />
                          <AppButton type="submit" variant="secondary">Save</AppButton>
                        </Form>
                      ) : (
                        image.altText || "—"
                      )}
                    </s-table-cell>
                    <s-table-cell>
                      <StatusBadge status={image.status} />
                    </s-table-cell>
                    <s-table-cell>
                      <s-stack direction="inline" gap="small-200">
                        <s-button
                          command="--show"
                          commandFor="generate-modal"
                          variant="secondary"
                          disabled={outOfCredits}
                          onClick={() => openGenerateModal([image.id])}
                        >
                          Generate
                        </s-button>
                        <AppButton type="button" variant="secondary" onClick={() => setEditingId(image.id)}>Edit</AppButton>
                      </s-stack>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
            <Pagination page={page} totalPages={totalPages} basePath="/app/product-images" extraParams={{ tab }} />
          </>
        )}
      </Card>

      <Card heading="Bulk actions">
        <s-button
          command="--show"
          commandFor="generate-modal"
          variant="primary"
          disabled={selectedIds.length === 0 || isGenerating || outOfCredits}
          onClick={() => openGenerateModal(selectedIds)}
        >
          {`Generate for selected (${selectedIds.length})`}
        </s-button>
        {outOfCredits ? <s-banner tone="warning">You&apos;re out of credits. Visit Pricing to top up.</s-banner> : null}
      </Card>

      <s-modal id="resync-modal" heading="Resync Product Images">
        <s-choice-list
          label="Choose which product status you want to resync"
          name="resyncStatus"
          values={[resyncStatus]}
          onChange={(event: Event) => {
            const value = (event.target as HTMLElement & { values: string[] }).values[0];
            setResyncStatus(value as "active" | "draft" | "all");
          }}
        >
          <Choice value="active" details="Resync images from active products">Active products only</Choice>
          <Choice value="draft" details="Resync images from draft products">Draft products only</Choice>
          <Choice value="all" details="Resync images from all products">All products</Choice>
        </s-choice-list>
        <div className="app-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
          <s-button command="--hide" commandFor="resync-modal" variant="secondary">Cancel</s-button>
          <s-button command="--hide" commandFor="resync-modal" variant="primary" onClick={startResync}>Resync</s-button>
        </div>
      </s-modal>

      <s-modal id="generate-modal" heading="Generate Alt Text">
        <div className="app-generate-summary">
          <div>
            <div className="app-generate-summary__label">
              {pendingGenerateIds.length} image{pendingGenerateIds.length === 1 ? "" : "s"} selected
            </div>
            <div className="app-generate-summary__detail">
              {generateMode === "ai" ? `Will use ~${pendingGenerateIds.length} credits` : "Free — no credits used"}
            </div>
          </div>
        </div>
        <s-choice-list
          label=""
          name="mode"
          values={[generateMode]}
          onChange={(event: Event) => {
            const value = (event.target as HTMLElement & { values: string[] }).values[0];
            setGenerateMode(value as "ai" | "template");
          }}
        >
          <Choice value="ai" details="Best quality — uses vision AI to describe each image">AI generation</Choice>
          <Choice value="template" details="Combine product fields like title, vendor">Template</Choice>
        </s-choice-list>
        <div className="app-generate-note">
          Uses your default language, brand voice, tone, and keywords from <a href="/app/settings">Settings</a>.
        </div>
        <div className="app-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
          <s-button command="--hide" commandFor="generate-modal" variant="primary" onClick={runGenerate}>Generate</s-button>
        </div>
      </s-modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
