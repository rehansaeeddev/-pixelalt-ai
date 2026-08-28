import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useState } from "react";
import { Form, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Card } from "../components/Card";
import { AppButton } from "../components/AppButton";
import { SearchableSelect } from "../components/SearchableSelect";
import { getAppSettings, updateAppSettings } from "../lib/settings.server";
import { getBillingAccount, canUseBrandVoice } from "../lib/billing.server";
import { TONE_OPTIONS, type AltTextTone } from "../lib/tone-options";
import { LANGUAGE_OPTIONS } from "../lib/language-options";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getAppSettings(session.shop);
  const billing = await getBillingAccount(session.shop);
  const aiEnabled = Boolean(process.env.GEMINI_API_KEY);
  return { settings, aiEnabled, canEditBrandVoice: canUseBrandVoice(billing.planTier) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const billing = await getBillingAccount(session.shop);
  if (!canUseBrandVoice(billing.planTier)) return { error: "upgrade_required" };

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save-automation") {
    await updateAppSettings(session.shop, {
      autoGenerateOnSync: formData.get("autoGenerateOnSync") === "true",
    });
    return null;
  }

  await updateAppSettings(session.shop, {
    defaultLanguage: String(formData.get("defaultLanguage") ?? "en"),
    tone: String(formData.get("tone") ?? "professional") as AltTextTone,
    contentCategory: String(formData.get("contentCategory") ?? "general"),
    brandDescription: String(formData.get("brandDescription") ?? "").trim() || null,
    includeBrandName: formData.get("includeBrandName") === "true",
    targetKeywords: String(formData.get("targetKeywords") ?? "").trim() || null,
    forbiddenWords: String(formData.get("forbiddenWords") ?? "").trim() || null,
  });

  return null;
};

export default function Settings() {
  const { settings, aiEnabled, canEditBrandVoice } = useLoaderData<typeof loader>();
  const [defaultLanguage, setDefaultLanguage] = useState(settings.defaultLanguage);

  return (
    <s-page heading="Settings">
      <s-paragraph>Configure how AI writes alt text for your store.</s-paragraph>

      {aiEnabled ? (
        <s-banner tone="success">AI generation active (Gemini) — alt text is written by a real vision model.</s-banner>
      ) : (
        <s-banner tone="warning">Add GEMINI_API_KEY to your .env to enable AI generation.</s-banner>
      )}

      <Form method="post">
        <Card heading="Brand voice">
          {!canEditBrandVoice ? (
            <s-banner tone="info">
              Brand voice customization is available on Growth and Scale plans. <a href="/app/pricing">Upgrade to enable →</a>
            </s-banner>
          ) : null}
          <s-select label="Tone of voice" name="tone" value={settings.tone} disabled={!canEditBrandVoice}>
            {TONE_OPTIONS.map((option) => (
              <s-option key={option.value} value={option.value}>
                {option.label}
              </s-option>
            ))}
          </s-select>
          <SearchableSelect
            label="Default language"
            name="defaultLanguage"
            value={defaultLanguage}
            options={LANGUAGE_OPTIONS}
            onChange={setDefaultLanguage}
          />
          <s-select label="Content category" name="contentCategory" value={settings.contentCategory} disabled={!canEditBrandVoice}>
            <s-option value="general">General products</s-option>
            <s-option value="adult">Adult products (18+)</s-option>
          </s-select>
          <s-text-area
            label="Brand description"
            name="brandDescription"
            value={settings.brandDescription ?? ""}
            placeholder="2-3 sentences about your brand. The AI uses this to make alt text feel on-brand."
            disabled={!canEditBrandVoice}
          />
          <s-checkbox
            label="Include brand name in alt text"
            name="includeBrandName"
            value="true"
            checked={settings.includeBrandName}
            disabled={!canEditBrandVoice}
          />
          <s-text-field
            label="Target keywords"
            name="targetKeywords"
            value={settings.targetKeywords ?? ""}
            placeholder="Weave these in naturally for SEO"
            disabled={!canEditBrandVoice}
          />
          <s-text-field
            label="Forbidden words"
            name="forbiddenWords"
            value={settings.forbiddenWords ?? ""}
            placeholder="The AI will avoid these"
            disabled={!canEditBrandVoice}
          />
          <AppButton type="submit" variant="primary" disabled={!canEditBrandVoice}>Save settings</AppButton>
        </Card>
      </Form>

      <Form method="post">
        <Card heading="Automation">
          <input type="hidden" name="intent" value="save-automation" />
          <s-checkbox
            label="Auto-generate alt text for new products"
            name="autoGenerateOnSync"
            value="true"
            checked={settings.autoGenerateOnSync}
            disabled={!canEditBrandVoice}
          />
          <s-paragraph>When new products are added in Shopify, we&apos;ll write alt text for them automatically.</s-paragraph>
          <AppButton type="submit" variant="primary" disabled={!canEditBrandVoice}>Save automation</AppButton>
        </Card>
      </Form>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
