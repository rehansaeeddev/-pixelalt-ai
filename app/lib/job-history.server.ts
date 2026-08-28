import prisma from "../db.server";

export async function createJob(shop: string, kind: "sync" | "ai_generate", imagesTotal: number) {
  return prisma.generationJob.create({
    data: { shop, kind, imagesTotal, status: "running" },
  });
}

export async function completeJob(
  jobId: string,
  input: { imagesSucceeded: number; imagesFailed: number; creditsUsed: number },
) {
  return prisma.generationJob.update({
    where: { id: jobId },
    data: {
      imagesSucceeded: input.imagesSucceeded,
      imagesFailed: input.imagesFailed,
      creditsUsed: input.creditsUsed,
      status: input.imagesFailed > 0 && input.imagesSucceeded === 0 ? "failed" : "completed",
      completedAt: new Date(),
    },
  });
}

export async function getRecentJobs(shop: string, limit = 10) {
  return prisma.generationJob.findMany({
    where: { shop },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}

export async function getJobStats(shop: string) {
  const jobs = await prisma.generationJob.findMany({ where: { shop } });
  const jobsRun = jobs.length;
  const completed = jobs.filter((j) => j.status === "completed").length;
  const successRate = jobsRun > 0 ? Math.round((completed / jobsRun) * 100) : 0;
  const imagesProcessed = jobs.reduce((sum, j) => sum + j.imagesSucceeded + j.imagesFailed, 0);
  const creditsUsed = jobs.reduce((sum, j) => sum + j.creditsUsed, 0);
  return { jobsRun, successRate, imagesProcessed, creditsUsed };
}
