import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useState } from "react";
import { Form, redirect, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Card } from "../components/Card";
import { AppButton } from "../components/AppButton";
import prisma from "../db.server";
import { getBillingAccount } from "../lib/billing.server";
import { PLAN_CREDITS, PLAN_LABELS, PLAN_ANNUAL_PRICE, PLAN_ONE_TIME_PRICE } from "../lib/plan-options";
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
  const totalImages = await prisma.productImage.count({ where: { shop: session.shop } });

  return { billing, totalImages };
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
  const { billing, totalImages } = useLoaderData<typeof loader>();
  const [interval, setInterval] = useState<"monthly" | "annual">("annual");

  const regensPerYear = totalImages > 0 ? Math.round(PLAN_CREDITS.starter / totalImages) : null;

  return (
    <s-page heading="Pricing">
      <s-paragraph>Choose a plan that fits your catalog — or top up credits whenever you need.</s-paragraph>

      {totalImages > 0 && regensPerYear ? (
        <Card>
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-icon type="chart-line" />
            <div>
              <s-text type="strong">Your store has {totalImages} images.</s-text>
              <br />
              <s-text color="subdued">Starter covers a full re-generation of your catalog {regensPerYear}× per year.</s-text>
            </div>
          </s-stack>
        </Card>
      ) : null}

      <Card>
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-icon type="apps" />
          <div>
            <s-text type="strong">{billing.planTier === "free" ? "Pick a plan to get started" : "Manage your plan"}</s-text>
            <br />
            <s-text color="subdued">You have {billing.creditBalance} credits. Choose a plan below to top up monthly.</s-text>
          </div>
        </s-stack>
      </Card>

      <div className="app-billing-toggle">
        <button type="button" className={interval === "monthly" ? "app-billing-toggle__btn app-billing-toggle__btn--active" : "app-billing-toggle__btn"} onClick={() => setInterval("monthly")}>
          Monthly
        </button>
        <button type="button" className={interval === "annual" ? "app-billing-toggle__btn app-billing-toggle__btn--active" : "app-billing-toggle__btn"} onClick={() => setInterval("annual")}>
          Annual <span className="app-billing-toggle__badge">Save 2 months</span>
        </button>
      </div>

      <div className="app-plan-cards">
        {PLAN_TIERS.map((tier) => {
          const annualPrice = PLAN_ANNUAL_PRICE[tier];
          const monthlyEquivalent = annualPrice / 12;
          const displayedPrice = interval === "annual" ? annualPrice : Math.ceil(monthlyEquivalent * 1.2);
          const savings = PLAN_ONE_TIME_PRICE[tier] - annualPrice;
          const isCurrent = billing.planTier === tier;

          return (
            <div key={tier} className={`app-plan-card${tier === "growth" ? " app-plan-card--popular" : ""}`}>
              {tier === "growth" ? <span className="app-plan-card__ribbon app-plan-card__ribbon--popular">Most popular</span> : null}
              {tier === "scale" ? <span className="app-plan-card__ribbon app-plan-card__ribbon--save">Save ≈50%</span> : null}

              <s-text type="strong">{PLAN_LABELS[tier]}</s-text>
              <div className="app-plan-card__price">
                <span className="app-plan-card__price-currency">$</span>
                <span className="app-plan-card__price-amount">{displayedPrice}</span>
                <span className="app-plan-card__price-period">/{interval === "annual" ? "year" : "mo"}</span>
              </div>
              <s-text color="subdued">
                {PLAN_CREDITS[tier].toLocaleString()} credits/yr · ${monthlyEquivalent.toFixed(2)}/mo
              </s-text>

              {interval === "annual" ? (
                <div className="app-plan-card__savings">
                  <s-icon type="check-circle" tone="success" size="small" /> Save ${savings.toFixed(2)} / year vs one-time
                </div>
              ) : null}

              <ul className="app-plan-card__features">
                {PLAN_FEATURES[tier].map((feature) => (
                  <li key={feature}>
                    <s-icon type="check" size="small" /> {feature}
                  </li>
                ))}
              </ul>

              <Form method="post">
                <input type="hidden" name="intent" value="switch-plan" />
                <input type="hidden" name="planTier" value={tier} />
                <AppButton
                  type="submit"
                  variant={tier === "growth" ? "gradient" : "primary"}
                  disabled={isCurrent}
                >
                  {isCurrent ? "Current plan" : tier === "growth" ? "Upgrade to Growth" : `Choose ${PLAN_LABELS[tier]}`}
                </AppButton>
              </Form>
            </div>
          );
        })}
      </div>

      <p className="app-pricing-footnote">
        Just exploring? <span className="app-upgrade-link">You&apos;re already on Free — 30 credits/month</span>
      </p>

      <Card heading="Need extra credits this month?">
        <s-paragraph>Buy a one-time credit pack on top of your plan.</s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="topup-credits" />
          <input type="hidden" name="amountUsd" value="10" />
          <input type="hidden" name="creditsGranted" value="1000" />
          <AppButton type="submit" variant="secondary">Buy 1,000 credits for $10</AppButton>
        </Form>
      </Card>

      <div className="app-faq-grid">
        <Card>
          <s-text type="strong">What&apos;s a credit?</s-text>
          <s-paragraph>One credit = one image alt-text generation. Edits and template-based generation are free.</s-paragraph>
        </Card>
        <Card>
          <s-text type="strong">Do credits expire?</s-text>
          <s-paragraph>Plan credits reset monthly. Top-up credits never expire and roll over indefinitely.</s-paragraph>
        </Card>
        <Card>
          <s-text type="strong">Can I switch plans?</s-text>
          <s-paragraph>Yes. Upgrade anytime — your existing credits carry over. Downgrades take effect next cycle.</s-paragraph>
        </Card>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
