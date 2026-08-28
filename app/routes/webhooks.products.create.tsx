import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getAppSettings } from "../lib/settings.server";
import { hasCredits, deductCredit } from "../lib/billing.server";
import { generateAltText } from "../lib/alt-text-generator.server";
import { updateProductImageAltText } from "../lib/image-mutations.server";
import { createJob, completeJob } from "../lib/job-history.server";
import type { AltTextTone } from "../lib/tone-options";
import type { AltTextLanguage } from "../lib/language-options";

type WebhookProductImage = { id: number; src: string; alt?: string | null };
type WebhookProductPayload = {
  id: number;
  title: string;
  handle: string;
  status: string;
  vendor?: string | null;
  images?: WebhookProductImage[];
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload, session, topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (!session || !admin) return new Response();

  const product = payload as WebhookProductPayload;
  const productGid = `gid://shopify/Product/${product.id}`;
  const images = product.images ?? [];
  if (images.length === 0) return new Response();

  const createdRows = [];
  for (const image of images) {
    const imageGid = `gid://shopify/ProductImage/${image.id}`;
    const row = await prisma.productImage.upsert({
      where: { shop_shopifyImageId: { shop, shopifyImageId: imageGid } },
      create: {
        shop,
        shopifyImageId: imageGid,
        shopifyProductId: productGid,
        productTitle: product.title,
        productHandle: product.handle,
        productStatus: product.status,
        productVendor: product.vendor ?? null,
        imageUrl: image.src,
        altText: image.alt ?? null,
        status: image.alt ? "completed" : "not_generated",
      },
      update: {},
    });
    createdRows.push(row);
  }

  const settings = await getAppSettings(shop);
  if (!settings.autoGenerateOnSync) return new Response();

  const job = await createJob(shop, "ai_generate", createdRows.length);
  let succeeded = 0;
  let failed = 0;

  for (const row of createdRows) {
    if (row.altText || !(await hasCredits(shop))) continue;

    const result = await generateAltText({
      imageUrl: row.imageUrl,
      productTitle: row.productTitle,
      tone: settings.tone as AltTextTone,
      language: settings.defaultLanguage as AltTextLanguage,
      brandDescription: settings.brandDescription,
      includeBrandName: settings.includeBrandName,
      targetKeywords: settings.targetKeywords,
      forbiddenWords: settings.forbiddenWords,
    });

    if (!result) {
      failed += 1;
      await prisma.productImage.update({ where: { id: row.id }, data: { status: "failed" } });
      continue;
    }

    await deductCredit(shop);
    await updateProductImageAltText(admin, row.shopifyProductId, row.shopifyImageId, result.altText);
    await prisma.productImage.update({
      where: { id: row.id },
      data: { altText: result.altText, status: "completed" },
    });
    succeeded += 1;
  }

  await completeJob(job.id, { imagesSucceeded: succeeded, imagesFailed: failed, creditsUsed: succeeded });
  return new Response();
};
