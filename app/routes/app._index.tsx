import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppButton } from "../components/AppButton";
import { Card, StatTile } from "../components/Card";
import { DashboardHeader } from "../components/DashboardHeader";
import { GettingStarted } from "../components/GettingStarted";
import { useToast } from "../components/Toast";
import { useFetcherToast } from "../hooks/useFetcherToast";
import { Choice } from "../components/PolarisChoice";
import prisma from "../db.server";
import { syncProductImages, syncOtherImages } from "../lib/sync-images.server";
import { getAppSettings } from "../lib/settings.server";
import { getBillingAccount } from "../lib/billing.server";
import { getRecentJobs, createJob, completeJob } from "../lib/job-history.server";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const totalImages = await prisma.productImage.count({ where: { shop } });
  const withAltText = await prisma.productImage.count({ where: { shop, status: "completed" } });
  const missingAltText = totalImages - withAltText;

  const settings = await getAppSettings(shop);
  const billing = await getBillingAccount(shop);
  const recentJobs = await getRecentJobs(shop, 5);

  const daysSinceCycleStart = Math.max(
    1,
    (Date.now() - new Date(billing.cycleStartedAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  const creditsUsed = billing.creditsGrantedTotal - billing.creditBalance;
  const dailyRate = creditsUsed / daysSinceCycleStart;
  const creditsRunwayDays = dailyRate > 0 ? Math.ceil(billing.creditBalance / dailyRate) : null;

  const shopName = shop.replace(/\.myshopify\.com$/, "");
  const greeting = `${greetingForHour(new Date().getHours())}, ${shopName}`;

  return {
    greeting,
    totalImages,
    withAltText,
    missingAltText,
    settings,
    billing,
    recentJobs,
    creditsRunwayDays,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "sync") {
    const productStatus = (String(formData.get("productStatus") ?? "all")) as "active" | "draft" | "all";
    const job = await createJob(shop, "sync", 0);
    try {
      const productCount = await syncProductImages(admin, shop, productStatus);
      const otherCount = await syncOtherImages(admin, shop);
      await completeJob(job.id, { imagesSucceeded: productCount + otherCount, imagesFailed: 0, creditsUsed: 0 });
      return { synced: productCount + otherCount };
    } catch (error) {
      console.error("[dashboard] sync failed:", error);
      await completeJob(job.id, { imagesSucceeded: 0, imagesFailed: 1, creditsUsed: 0 });
      return { synced: 0 };
    }
  }

  return null;
};

export default function Dashboard() {
  const { greeting, totalImages, withAltText, missingAltText, settings, billing, recentJobs, creditsRunwayDays } =
    useLoaderData<typeof loader>();
  const syncFetcher = useFetcher<{ synced: number }>();
  const { showToast } = useToast();
  const [resyncStatus, setResyncStatus] = useState<"active" | "draft" | "all">("active");
  const isSyncing = syncFetcher.state !== "idle";
  const withAltPercent = totalImages > 0 ? Math.round((withAltText / totalImages) * 100) : 0;

  useFetcherToast(syncFetcher, (data) => `Resync complete — ${data.synced} images synced.`);

  const startSync = () => {
    const formData = new FormData();
    formData.set("intent", "sync");
    formData.set("productStatus", resyncStatus);
    syncFetcher.submit(formData, { method: "post" });
    showToast("Resync started.");
  };

  return (
    <s-page>
      <DashboardHeader
        greeting={greeting}
        subtitle={
          missingAltText === 0 && totalImages > 0
            ? "Every image in your catalog has alt text. Nice work."
            : "Sync your catalog and let AI write alt text for every image."
        }
        actions={
          <AppButton variant="primary" disabled={isSyncing} command="--show" commandFor="resync-modal">
            {isSyncing ? "Resyncing..." : "Sync from Shopify"}
          </AppButton>
        }
      />

      <GettingStarted
        steps={[
          { label: "Sync your Shopify catalog", detail: `We've imported ${totalImages} images. ${missingAltText} still missing alt text.`, done: totalImages > 0 },
          {
            label: "Set language & brand voice",
            detail: "Pick your language and add a short brand description. AI uses this on every generation.",
            done: settings.id !== "",
            action: { label: "Edit settings", href: "/app/settings" },
          },
          { label: "Generate your first batch", detail: "Generate alt text for at least one image to see it in action.", done: withAltText > 0 },
          { label: "Turn on auto-generate", detail: "When new products are added in Shopify, we'll write alt text for them automatically.", done: settings.autoGenerateOnSync },
          { label: "Pick a plan for your catalog", detail: "Manage credits or switch tiers from Pricing.", done: billing.planTier !== "free" },
        ]}
      />

      <div className="app-card-row" style={{ marginTop: "1.25rem", marginBottom: "1.25rem" }}>
        <StatTile icon="credit-card" label="Available credits" value={String(billing.creditBalance)} />
        <StatTile icon="images" label="Total images" value={String(totalImages)} />
        <StatTile icon="check-circle" tone="success" label="With alt text" value={`${withAltText} (${withAltPercent}%)`} />
        <StatTile icon="alert-triangle" tone={missingAltText > 0 ? "warning" : "default"} label="Missing alt text" value={String(missingAltText)} />
      </div>

      <Card heading="Recent activity">
        {recentJobs.length === 0 ? (
          <s-banner tone="info">No jobs yet — sync your catalog to get started.</s-banner>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header>Job</s-table-header>
              <s-table-header>Images</s-table-header>
              <s-table-header>Credits</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Started</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {recentJobs.map((job) => (
                <s-table-row key={job.id}>
                  <s-table-cell>{job.kind === "sync" ? "Sync" : "AI Generate"}</s-table-cell>
                  <s-table-cell>{job.imagesSucceeded + job.imagesFailed} of {job.imagesTotal || job.imagesSucceeded + job.imagesFailed}</s-table-cell>
                  <s-table-cell>{job.creditsUsed}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={job.status === "completed" ? "success" : job.status === "failed" ? "critical" : "neutral"}>
                      {job.status}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>{new Date(job.startedAt).toLocaleString()}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </Card>

      <Card heading="Credits runway">
        <h3>
          {creditsRunwayDays !== null ? `~${creditsRunwayDays} day${creditsRunwayDays === 1 ? "" : "s"}` : "No usage yet"}
        </h3>
        <s-paragraph>At current usage on the {billing.planTier} plan.</s-paragraph>
        <AppButton href="/app/pricing" variant="primary">Top up credits</AppButton>
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
          <s-button command="--hide" commandFor="resync-modal" variant="primary" onClick={startSync}>Resync</s-button>
        </div>
      </s-modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
