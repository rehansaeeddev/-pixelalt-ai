import prisma from "../db.server";
import type { AltTextTone } from "./tone-options";
import type { AltTextLanguage } from "./language-options";

export const DEFAULT_SETTINGS = {
  defaultLanguage: "en" as AltTextLanguage,
  tone: "professional" as AltTextTone,
  contentCategory: "general",
  brandDescription: null as string | null,
  includeBrandName: false,
  targetKeywords: null as string | null,
  forbiddenWords: null as string | null,
  autoGenerateOnSync: false,
};

export async function getAppSettings(shop: string) {
  const existing = await prisma.appSettings.findUnique({ where: { shop } });
  return existing ?? { id: "", shop, ...DEFAULT_SETTINGS, updatedAt: new Date() };
}

export async function updateAppSettings(
  shop: string,
  input: Partial<typeof DEFAULT_SETTINGS>,
) {
  return prisma.appSettings.upsert({
    where: { shop },
    create: { shop, ...DEFAULT_SETTINGS, ...input },
    update: input,
  });
}
