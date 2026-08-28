import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Card, StatTile } from "../components/Card";
import { AppButton } from "../components/AppButton";
import { getBillingAccount } from "../lib/billing.server";
import { PLAN_CREDITS, PLAN_LABELS, PLAN_PRICE_LABEL } from "../lib/plan-options";
import { requestPlanSubscription, requestCreditsTopUp, reconcileActiveSubscription, grantToppedUpCredits } from "../lib/shopify-billing.server";

const PLAN_TIERS = ["starter", "growth", "scale"] as const;

const PLAN_FEATURES: Record<string, string[]> = {
  starter: ["AI-powered alt text", "Bulk image processing", "Live chat support"],
  growth: ["Bulk image processing", "Product detail-based alt text", "Brand voice & tone presets", "Priority + dedicated support"],
  scale: ["Everything in Growth", "Customizable brand voice", "Dedicated success manager", "SLA + uptime guarantee"],
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const auth = await authenticate.admin(request);
  const { session } = auth;
  const url = new URL(request.url);

  const topupCredits = url.searchParams.get("topupCredits");
  const chargeId = url.searchParams.get("charge_id");
  if (topupCredits) {
    await grantToppedUpCredits(session.shop, Number(topupCredits));
    return redirect("/app/pricing");
  }
  if (chargeId) {
    await reconcileActiveSubscription(auth, session.shop);
    return redirect("/app/pricing");
  }

  const billing = await getBillingAccount(session.shop);

  const daysSinceCycleStart = Math.max(
    1,
    (Date.now() - new Date(billing.cycleStartedAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  const creditsUsed = billing.creditsGrantedTotal - billing.creditBalance;
  const dailyRate = creditsUsed / daysSinceCycleStart;
  const creditsRunwayDays = dailyRate > 0 ? Math.ceil(billing.creditBalance / dailyRate) : null;

  return { billing, creditsRunwayDays };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const auth = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const appUrl = process.env.SHOPIFY_APP_URL || "";
  const returnUrl = `${appUrl}/app/pricing`;

  if (intent === "switch-plan") {
    const planTier = String(formData.get("planTier") ?? "starter") as "starter" | "growth" | "scale";
    const confirmationUrl = await requestPlanSubscription(auth, planTier, returnUrl);
    return redirect(confirmationUrl);
  }

  if (intent === "topup-credits") {
    const amountUsd = Number(formData.get("amountUsd") ?? 10);
    const creditsGranted = Number(formData.get("creditsGranted") ?? 1000);
    const confirmationUrl = await requestCreditsTopUp(auth, amountUsd, creditsGranted, returnUrl);
    return redirect(confirmationUrl);
  }

  return null;
};

export default function Pricing() {
  const { billing, creditsRunwayDays } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Pricing">
      <s-paragraph>Choose a plan that fits your catalog — or top up credits whenever you need.</s-paragraph>

      <div className="app-card-row" style={{ marginTop: "1.25rem", marginBottom: "1.25rem" }}>
        <StatTile icon="reward" label="Plan" value={PLAN_LABELS[billing.planTier] ?? billing.planTier} />
        <StatTile icon="credit-card" label="Credits remaining" value={String(billing.creditBalance)} />
        <StatTile icon="chart-line" label="Credits granted this cycle" value={String(billing.creditsGrantedTotal)} />
        <StatTile
          icon="chart-line"
          label="Credits runway"
          value={creditsRunwayDays !== null ? `~${creditsRunwayDays} day${creditsRunwayDays === 1 ? "" : "s"}` : "No usage yet"}
        />
      </div>

      <div className="app-card-row">
        {PLAN_TIERS.map((tier) => (
          <Card key={tier} heading={PLAN_LABELS[tier]}>
            <h3>{PLAN_PRICE_LABEL[tier]}</h3>
            <s-paragraph>{PLAN_CREDITS[tier].toLocaleString()} credits/yr</s-paragraph>
            <ul>
              {PLAN_FEATURES[tier].map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <Form method="post">
              <input type="hidden" name="intent" value="switch-plan" />
              <input type="hidden" name="planTier" value={tier} />
              <AppButton type="submit" variant={billing.planTier === tier ? "secondary" : "primary"} disabled={billing.planTier === tier}>
                {billing.planTier === tier ? "Current plan" : `Choose ${PLAN_LABELS[tier]}`}
              </AppButton>
            </Form>
          </Card>
        ))}
      </div>

      <s-paragraph>
        Just exploring? You&apos;re on the Free plan with 30 credits/month until you upgrade.
      </s-paragraph>

      <Card heading="Need extra credits this month?">
        <s-paragraph>Buy a one-time credit pack on top of your plan.</s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="topup-credits" />
          <input type="hidden" name="amountUsd" value="10" />
          <input type="hidden" name="creditsGranted" value="1000" />
          <AppButton type="submit" variant="secondary">Buy 1,000 credits for $10</AppButton>
        </Form>
      </Card>

      <Card heading="FAQ">
        <p><strong>What&apos;s a credit?</strong> One credit = one image alt-text generation. Manual edits are free.</p>
        <p><strong>Do credits expire?</strong> Plan credits reset on your next billing cycle. Top-up credits never expire.</p>
        <p><strong>Can I switch plans?</strong> Yes — upgrade anytime, your credits carry over.</p>
      </Card>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
