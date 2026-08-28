import prisma from "../db.server";
import { PLAN_CREDITS } from "./plan-options";

export { PLAN_CREDITS } from "./plan-options";

export async function getBillingAccount(shop: string) {
  const existing = await prisma.shopBilling.findUnique({ where: { shop } });
  if (existing) return existing;
  return prisma.shopBilling.create({ data: { shop } });
}

export async function hasCredits(shop: string, amount = 1): Promise<boolean> {
  const account = await getBillingAccount(shop);
  return account.creditBalance >= amount;
}

export async function deductCredit(shop: string, amount = 1): Promise<{ ok: boolean; remaining: number }> {
  const result = await prisma.shopBilling.updateMany({
    where: { shop, creditBalance: { gte: amount } },
    data: { creditBalance: { decrement: amount } },
  });
  const account = await getBillingAccount(shop);
  return { ok: result.count > 0, remaining: account.creditBalance };
}

export async function addCredits(shop: string, amount: number) {
  await getBillingAccount(shop);
  return prisma.shopBilling.update({
    where: { shop },
    data: { creditBalance: { increment: amount }, creditsGrantedTotal: { increment: amount } },
  });
}

export async function setPlan(shop: string, planTier: string, shopifySubscriptionId?: string) {
  const credits = PLAN_CREDITS[planTier] ?? PLAN_CREDITS.free;
  await getBillingAccount(shop);
  return prisma.shopBilling.update({
    where: { shop },
    data: {
      planTier,
      creditBalance: credits,
      creditsGrantedTotal: credits,
      cycleStartedAt: new Date(),
      ...(shopifySubscriptionId ? { shopifySubscriptionId } : {}),
    },
  });
}

export function canUseBrandVoice(planTier: string): boolean {
  return planTier === "growth" || planTier === "scale";
}
