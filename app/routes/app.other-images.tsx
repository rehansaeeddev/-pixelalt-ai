import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useState } from "react";
import { Form, useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppButton } from "../components/AppButton";
import { Card, StatTile } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { Choice } from "../components/PolarisChoice";
import { EmptyState } from "../components/EmptyState";
import { useToast } from "../components/Toast";
import { useFetcherToast } from "../hooks/useFetcherToast";
import prisma from "../db.server";
import { syncOtherImages } from "../lib/sync-images.server";
import { generateAltText, generateTemplateAltText } from "../lib/alt-text-generator.server";
import { updateFileAltText } from "../lib/image-mutations.server";
import { getAppSettings } from "../lib/settings.server";
import { getBillingAccount, hasCredits, deductCredit } from "../lib/billing.server";
import { createJob, completeJob } from "../lib/job-history.server";
import type { AltTextTone } from "../lib/tone-options";
import type { AltTextLanguage } from "../lib/language-options";

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

  const totalCount = await prisma.otherImage.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const images = await prisma.otherImage.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const allTotal = await prisma.otherImage.count({ where: { shop } });
  const allWithAlt = await prisma.otherImage.count({ where: { shop, altText: { not: null } } });
  const allMissing = allTotal - allWithAlt;
  const billing = await getBillingAccount(shop);

  return { images, page, totalPages, tab, allTotal, allWithAlt, allMissing, billing };
};

async function generateForFile(shop: string, imageId: string, mode: "ai" | "template") {
  const image = await prisma.otherImage.findUnique({ where: { id: imageId } });
  if (!image || image.shop !== shop) return { succeeded: false };

  if (mode === "template") {
    const settings = await getAppSettings(shop);
    const result = generateTemplateAltText({
      productTitle: image.fileName,
      targetKeywords: settings.targetKeywords,
    });
    await prisma.otherImage.update({ where: { id: imageId }, data: { altText: result.altText, status: "completed" } });
    return { succeeded: true, altText: result.altText };
  }

  if (!(await hasCredits(shop))) return { succeeded: false, outOfCredits: true };

  await prisma.otherImage.update({ where: { id: imageId }, data: { status: "processing" } });

  const settings = await getAppSettings(shop);
  const result = await generateAltText({
    imageUrl: image.imageUrl,
    productTitle: image.fileName,
    tone: settings.tone as AltTextTone,
    language: settings.defaultLanguage as AltTextLanguage,
    brandDescription: settings.brandDescription,
    includeBrandName: settings.includeBrandName,
    targetKeywords: settings.targetKeywords,
    forbiddenWords: settings.forbiddenWords,
  });

  if (!result) {
    await prisma.otherImage.update({ where: { id: imageId }, data: { status: "failed" } });
    return { succeeded: false };
  }

  await deductCredit(shop);
  await prisma.otherImage.update({ where: { id: imageId }, data: { altText: result.altText, status: "completed" } });
  return { succeeded: true, altText: result.altText };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "sync") {
    const job = await createJob(shop, "sync", 0);
    const count = await syncOtherImages(admin, shop);
    await completeJob(job.id, { imagesSucceeded: count, imagesFailed: 0, creditsUsed: 0 });
    return { synced: count };
  }

  if (intent === "save-edit") {
    const imageId = String(formData.get("imageId") ?? "");
    const altText = String(formData.get("altText") ?? "").trim();
    const image = await prisma.otherImage.findUnique({ where: { id: imageId } });
    if (!image || image.shop !== shop) return { succeeded: false };

    const mutation = await updateFileAltText(admin, image.shopifyFileId, altText);
    if (mutation.succeeded) {
      await prisma.otherImage.update({
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
      const image = await prisma.otherImage.findUnique({ where: { id: imageId } });
      if (!image || image.shop !== shop) {
        failed += 1;
        continue;
      }
      const genResult = await generateForFile(shop, imageId, mode);
      if (genResult.succeeded && genResult.altText) {
        await updateFileAltText(admin, image.shopifyFileId, genResult.altText);
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

export default function OtherImages() {
  const { images, page, totalPages, tab, allTotal, allWithAlt, allMissing, billing } = useLoaderData<typeof loader>();
  const { showToast } = useToast();

  const syncFetcher = useFetcher<{ synced: number }>();
  const generateFetcher = useFetcher<{ succeeded: number; failed: number }>();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingGenerateIds, setPendingGenerateIds] = useState<string[]>([]);
  const [generateMode, setGenerateMode] = useState<"ai" | "template">("ai");

  const outOfCredits = billing.creditBalance <= 0;
  const isSyncing = syncFetcher.state !== "idle";
  const isGenerating = generateFetcher.state !== "idle";

  useFetcherToast(syncFetcher, (data) => `Sync complete — ${data.synced} images synced.`);
  useFetcherToast(generateFetcher, ({ succeeded, failed }) =>
    succeeded === 1 && failed === 0
      ? "Alt tag generated."
      : `Generated ${succeeded} alt tag${succeeded === 1 ? "" : "s"}${failed > 0 ? `, ${failed} failed` : ""}.`,
  );

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const startSync = () => {
    const formData = new FormData();
    formData.set("intent", "sync");
    syncFetcher.submit(formData, { method: "post" });
    showToast("Sync started.");
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
    <s-page>
      <PageHeader
        title="Other Images"
        actions={
          <>
            <AppButton href="/app/job-history" variant="secondary">Job history</AppButton>
            <AppButton href="/app/pricing" variant="secondary">Buy credits</AppButton>
            <s-button variant="primary" icon="refresh" disabled={isSyncing} onClick={startSync}>
              {isSyncing ? "Syncing..." : "Sync Images"}
            </s-button>
          </>
        }
      />
      <s-paragraph>Non-product images from your Shopify Files — banners, theme assets, and more.</s-paragraph>

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
              <AppButton key={t.value} href={`/app/other-images?tab=${t.value}`} variant={tab === t.value ? "primary" : "secondary"}>
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
              <AppButton variant="primary" onClick={startSync}>Sync Images</AppButton>
            }
          />
        ) : (
          <>
            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header>Image</s-table-header>
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
                          aria-label="Select image"
                        />
                        <img src={image.imageUrl} alt="" width={40} height={40} style={{ objectFit: "cover" }} />
                      </div>
                    </s-table-cell>
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
            <Pagination page={page} totalPages={totalPages} basePath="/app/other-images" extraParams={{ tab }} />
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
          <Choice value="template" details="Combine file details like name">Template</Choice>
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
