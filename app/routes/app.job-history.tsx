import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppButton } from "../components/AppButton";
import { Card, StatTile } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import prisma from "../db.server";
import { getJobStats } from "../lib/job-history.server";

const PAGE_SIZE = 20;

const KIND_LABEL: Record<string, string> = {
  sync: "Sync",
  ai_generate: "AI Generate",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const q = url.searchParams.get("q")?.trim() || "";
  const status = url.searchParams.get("status") || "all";

  const where = {
    shop,
    ...(status !== "all" ? { status } : {}),
    ...(q ? { kind: { contains: q } } : {}),
  };

  const totalCount = await prisma.generationJob.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const jobs = await prisma.generationJob.findMany({
    where,
    orderBy: { startedAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const isFiltered = Boolean(q) || status !== "all";
  const stats = await getJobStats(shop);

  const [allCount, runningCount, completedCount, failedCount] = await Promise.all([
    prisma.generationJob.count({ where: { shop } }),
    prisma.generationJob.count({ where: { shop, status: "running" } }),
    prisma.generationJob.count({ where: { shop, status: "completed" } }),
    prisma.generationJob.count({ where: { shop, status: "failed" } }),
  ]);

  return {
    jobs,
    page,
    totalPages,
    q,
    status,
    isFiltered,
    stats,
    counts: { all: allCount, running: runningCount, completed: completedCount, failed: failedCount },
  };
};

export default function JobHistory() {
  const { jobs, page, totalPages, q, status, isFiltered, stats, counts } = useLoaderData<typeof loader>();

  return (
    <s-page>
      <PageHeader
        title="Job history"
        subtitle="Every generation, sync, and bulk action — searchable."
        actions={<AppButton href="/app/product-images" variant="secondary">Back to images</AppButton>}
      />

      <div className="app-card-row" style={{ marginTop: "1.25rem", marginBottom: "1.25rem" }}>
        <StatTile icon="chart-line" label="Jobs run" value={String(stats.jobsRun)} />
        <StatTile icon="check-circle" tone="success" label="Success rate" value={`${stats.successRate}%`} />
        <StatTile icon="images" label="Images processed" value={String(stats.imagesProcessed)} />
        <StatTile icon="credit-card" label="Credits used" value={String(stats.creditsUsed)} />
      </div>

      <Card>
        <div className="app-tabs-row">
          <s-stack direction="inline" gap="small-200">
            {[
              { value: "all", label: "All", count: counts.all },
              { value: "running", label: "Running", count: counts.running },
              { value: "completed", label: "Completed", count: counts.completed },
              { value: "failed", label: "Failed", count: counts.failed },
            ].map((t) => (
              <AppButton key={t.value} href={`/app/job-history?status=${t.value}`} variant={status === t.value ? "primary" : "secondary"}>
                {t.label} · {t.count}
              </AppButton>
            ))}
          </s-stack>
          <Form method="get" className="app-search-compact">
            <input type="hidden" name="status" value={status} />
            <s-icon type="search" color="subdued" size="small" />
            <input type="text" name="q" placeholder="Search jobs" defaultValue={q} />
          </Form>
        </div>

        {jobs.length === 0 ? (
          <EmptyState
            icon="plus-circle"
            heading="No jobs to show"
            description={
              isFiltered
                ? "No jobs match your search or filter."
                : "When you generate alt text for your images, the progress will appear here."
            }
            action={
              <AppButton variant="gradient" href="/app/product-images">Start generating</AppButton>
            }
          />
        ) : (
          <>
            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header>Job</s-table-header>
                <s-table-header>Images total</s-table-header>
                <s-table-header>Succeeded</s-table-header>
                <s-table-header>Failed</s-table-header>
                <s-table-header>Credits used</s-table-header>
                <s-table-header>Status</s-table-header>
                <s-table-header>Started</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {jobs.map((job) => (
                  <s-table-row key={job.id}>
                    <s-table-cell>{KIND_LABEL[job.kind] ?? job.kind}</s-table-cell>
                    <s-table-cell>{job.imagesTotal}</s-table-cell>
                    <s-table-cell>{job.imagesSucceeded}</s-table-cell>
                    <s-table-cell>{job.imagesFailed}</s-table-cell>
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
            <Pagination page={page} totalPages={totalPages} basePath="/app/job-history" extraParams={{ q, status }} />
          </>
        )}
      </Card>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
