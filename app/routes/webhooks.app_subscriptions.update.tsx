import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { setPlan, PLAN_CREDITS } from "../lib/billing.server";

type SubscriptionPayload = {
  app_subscription: {
    admin_graphql_api_id: string;
    name: string;
    status: string;
  };
};

const PLAN_TIER_BY_NAME: Record<string, string> = {
  starter: "starter",
  growth: "growth",
  scale: "scale",
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (!session) return new Response();

  const data = (payload as SubscriptionPayload).app_subscription;
  if (!data) return new Response();

  if (data.status === "CANCELLED" || data.status === "EXPIRED") {
    await prisma.shopBilling.updateMany({
      where: { shop, shopifySubscriptionId: data.admin_graphql_api_id },
      data: { planTier: "free", creditBalance: PLAN_CREDITS.free, creditsGrantedTotal: PLAN_CREDITS.free },
    });
    return new Response();
  }

  if (data.status === "ACTIVE") {
    const planTier = PLAN_TIER_BY_NAME[data.name];
    if (planTier) {
      await setPlan(shop, planTier, data.admin_graphql_api_id);
    }
  }

  return new Response();
};
