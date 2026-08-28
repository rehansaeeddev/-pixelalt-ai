import { authenticate, BILLING_PLANS } from "../shopify.server";
import { setPlan, addCredits } from "./billing.server";

type AdminAuthResult = Awaited<ReturnType<typeof authenticate.admin>>;

const PLAN_TIER_BY_BILLING_PLAN: Record<string, string> = {
  [BILLING_PLANS.starter]: "starter",
  [BILLING_PLANS.growth]: "growth",
  [BILLING_PLANS.scale]: "scale",
};

/**
 * Kicks off a real Shopify recurring subscription for the given plan tier and
 * returns the confirmation URL the merchant must be redirected to.
 */
export async function requestPlanSubscription(
  auth: AdminAuthResult,
  planTier: "starter" | "growth" | "scale",
  returnUrl: string,
): Promise<string> {
  const billingPlan =
    planTier === "starter" ? BILLING_PLANS.starter : planTier === "growth" ? BILLING_PLANS.growth : BILLING_PLANS.scale;

  const confirmationUrl = await auth.billing.request({
    plan: billingPlan,
    isTest: process.env.NODE_ENV !== "production",
    returnUrl,
  });

  return confirmationUrl;
}

/**
 * Kicks off a real Shopify one-time purchase for a credit top-up.
 */
export async function requestCreditsTopUp(
  auth: AdminAuthResult,
  amountUsd: number,
  creditsGranted: number,
  returnUrl: string,
): Promise<string> {
  const confirmationUrl = await auth.billing.request({
    plan: BILLING_PLANS.creditsTopUp,
    isTest: process.env.NODE_ENV !== "production",
    returnUrl: `${returnUrl}?topupCredits=${creditsGranted}`,
    amount: amountUsd,
    currencyCode: "USD",
  });

  return confirmationUrl;
}

/**
 * Called once the merchant lands back on our app after approving a subscription
 * charge — checks for an active subscription and syncs the local plan/credits.
 */
export async function reconcileActiveSubscription(auth: AdminAuthResult, shop: string) {
  const billingCheck = await auth.billing.check({
    plans: Object.values(BILLING_PLANS).filter((p) => p !== BILLING_PLANS.creditsTopUp),
    isTest: process.env.NODE_ENV !== "production",
    returnObject: true,
  });

  const activeSub = billingCheck.appSubscriptions[0];
  if (!activeSub) return null;

  const billingPlanName = activeSub.name;
  const planTier = PLAN_TIER_BY_BILLING_PLAN[billingPlanName];
  if (!planTier) return null;

  return setPlan(shop, planTier, activeSub.id);
}

/**
 * Called on return from a credit top-up purchase confirmation.
 */
export async function grantToppedUpCredits(shop: string, credits: number) {
  return addCredits(shop, credits);
}
