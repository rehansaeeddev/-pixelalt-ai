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
  return { settings, billing, canEditBrandVoice: canUseBrandVoice(billing.planTier) };
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
  const { settings, billing, canEditBrandVoice } = useLoaderData<typeof loader>();
  const [defaultLanguage, setDefaultLanguage] = useState(settings.defaultLanguage);
  const [activeTab, setActiveTab] = useState<"brand" | "automation">("brand");

  return (
    <s-page heading="Settings">
      <s-paragraph>Configure how AI writes alt text for your store.</s-paragraph>

      <div className="app-settings-layout">
        <div className="app-settings-nav">
          <div className="app-settings-nav__card">
            <button
              type="button"
              className={`app-settings-nav__item${activeTab === "brand" ? " app-settings-nav__item--active" : ""}`}
              onClick={() => setActiveTab("brand")}
            >
              <s-icon type="wand" />
              Brand voice
            </button>
            <button
              type="button"
              className={`app-settings-nav__item${activeTab === "automation" ? " app-settings-nav__item--active" : ""}`}
              onClick={() => setActiveTab("automation")}
            >
              <s-icon type="bolt" />
              Automation
            </button>
          </div>
          <div className="app-settings-nav__credits">
            <s-text color="subdued">Available credits</s-text>
            <s-heading>{billing.creditBalance}</s-heading>
          </div>
        </div>

        <div className="app-settings-content">
          {activeTab === "brand" ? (
            <Form method="post">
              <Card>
                <div className="app-settings-card-header">
                  <s-icon type="wand" />
                  <div>
                    <div className="app-settings-card-header__title">
                      Brand voice
                      {!canEditBrandVoice ? <span className="app-plan-badge">Growth+</span> : null}
                      {!canEditBrandVoice ? <a className="app-upgrade-link" href="/app/pricing">Upgrade to enable →</a> : null}
                    </div>
                    <s-text color="subdued">Applied to every AI generation.</s-text>
                  </div>
                </div>

                <div className="app-settings-grid">
                  <SearchableSelect
                    label="Default language"
                    name="defaultLanguage"
                    value={defaultLanguage}
                    options={LANGUAGE_OPTIONS}
                    onChange={setDefaultLanguage}
                  />
                  <s-select label="Tone of voice" name="tone" value={settings.tone} disabled={!canEditBrandVoice}>
                    {TONE_OPTIONS.map((option) => (
                      <s-option key={option.value} value={option.value}>
                        {option.label}
                      </s-option>
                    ))}
                  </s-select>
                </div>

                <s-select label="Content category" name="contentCategory" value={settings.contentCategory} disabled={!canEditBrandVoice}>
                  <s-option value="general">General products</s-option>
                  <s-option value="adult">Adult products (18+)</s-option>
                </s-select>
                <s-paragraph>Choose &apos;Adult products (18+)&apos; if your store sells explicit merchandise. The AI will identify subjects accurately.</s-paragraph>

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
                <s-text color="subdued">Boosts SEO for branded search terms</s-text>

                <div className="app-settings-grid">
                  <div>
                    <s-text-field
                      label="Target keywords"
                      name="targetKeywords"
                      value={settings.targetKeywords ?? ""}
                      placeholder="Type and press Enter"
                      disabled={!canEditBrandVoice}
                    />
                    <s-text color="subdued">Weave these in naturally for SEO</s-text>
                  </div>
                  <div>
                    <s-text-field
                      label="Forbidden words"
                      name="forbiddenWords"
                      value={settings.forbiddenWords ?? ""}
                      placeholder="Type and press Enter"
                      disabled={!canEditBrandVoice}
                    />
                    <s-text color="subdued">The AI will avoid these</s-text>
                  </div>
                </div>

                {!canEditBrandVoice ? (
                  <a className="app-upgrade-link" href="/app/pricing">Upgrade to enable →</a>
                ) : (
                  <AppButton type="submit" variant="primary">Save settings</AppButton>
                )}
              </Card>
            </Form>
          ) : (
            <Form method="post">
              <Card>
                <div className="app-settings-card-header">
                  <s-icon type="bolt" />
                  <div>
                    <div className="app-settings-card-header__title">Automation</div>
                    <s-text color="subdued">Auto-generate alt text as your catalog changes.</s-text>
                  </div>
                </div>
                <input type="hidden" name="intent" value="save-automation" />
                <s-checkbox
                  label="Auto-generate alt text for new products"
                  name="autoGenerateOnSync"
                  value="true"
                  checked={settings.autoGenerateOnSync}
                  disabled={!canEditBrandVoice}
                />
                <s-paragraph>When new products are added in Shopify, we&apos;ll write alt text for them automatically.</s-paragraph>
                {!canEditBrandVoice ? (
                  <a className="app-upgrade-link" href="/app/pricing">Upgrade to enable →</a>
                ) : (
                  <AppButton type="submit" variant="primary">Save automation</AppButton>
                )}
              </Card>
            </Form>
          )}
        </div>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
