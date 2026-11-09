import prisma from "./db.server";
import { createClients, reviewUrl, type Clients, type Politeness } from "./supertext/client.server";
import { appVersion } from "./version.server";
import {
  decryptSecret,
  encryptionConfigured,
  encryptSecret,
  isEncrypted,
} from "./crypto.server";

export interface Settings {
  apiKey: string;
  politeness: Politeness;
  /** Shopify locale → Supertext code set by the shop (one mapping for targets and the source). */
  languageCodes: Record<string, string>;
  /** Shopify locales with *Translation review* on: translations into them go through the review service. */
  reviewLocales: string[];
  /** "Send version information to Supertext" as saved (the environment can still turn it off). */
  versionReports: boolean;
  /** A key is stored but can't be decrypted (the server's encryption key changed). */
  apiKeyUnreadable: boolean;
}

const POLITENESS = new Set<Politeness>(["default", "more", "less"]);

export const toPoliteness = (value: unknown): Politeness =>
  POLITENESS.has(value as Politeness) ? (value as Politeness) : "default";

export async function getSettings(shop: string): Promise<Settings> {
  const row = await prisma.shopSettings.findUnique({ where: { shop } });
  const stored = row?.apiKey ?? "";
  let apiKey = "";
  let apiKeyUnreadable = false;
  if (stored) {
    try {
      apiKey = decryptSecret(stored);
    } catch (error) {
      console.error(`[supertext] can't decrypt the API key of ${shop}: ${(error as Error).message}`);
      apiKeyUnreadable = true;
    }
    // Keys saved before encryption existed: encrypt them now.
    if (apiKey && !isEncrypted(stored) && encryptionConfigured()) {
      await prisma.shopSettings
        .update({ where: { shop }, data: { apiKey: encryptSecret(apiKey) } })
        .catch((error: Error) => console.error(`[supertext] re-encrypting ${shop} failed: ${error.message}`));
    }
  }
  return {
    apiKey,
    politeness: toPoliteness(row?.politeness),
    languageCodes: parseCodes(row?.languageCodes),
    reviewLocales: parseLocales(row?.reviewLocales),
    versionReports: row?.versionReports ?? true,
    apiKeyUnreadable,
  };
}

function parseCodes(json: string | undefined): Record<string, string> {
  try {
    const value = JSON.parse(json || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    return {};
  }
}

function parseLocales(json: string | undefined): string[] {
  try {
    const value = JSON.parse(json || "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * An empty `apiKey` keeps the saved key (the field never shows it). A new key
 * is stored encrypted; throws EncryptionKeyMissing if the server can't encrypt.
 */
export async function saveSettings(
  shop: string,
  input: {
    apiKey?: string;
    politeness: Politeness;
    languageCodes?: Record<string, string>;
    reviewLocales?: string[];
    versionReports?: boolean;
  },
): Promise<void> {
  const plainKey = input.apiKey?.trim();
  const apiKey = plainKey ? encryptSecret(plainKey) : undefined;
  const languageCodes =
    input.languageCodes !== undefined ? JSON.stringify(input.languageCodes) : undefined;
  const reviewLocales =
    input.reviewLocales !== undefined ? JSON.stringify([...new Set(input.reviewLocales)].sort()) : undefined;
  await prisma.shopSettings.upsert({
    where: { shop },
    create: {
      shop,
      apiKey: apiKey ?? "",
      politeness: input.politeness,
      languageCodes: languageCodes ?? "{}",
      reviewLocales: reviewLocales ?? "[]",
      versionReports: input.versionReports ?? true,
    },
    update: {
      ...(input.versionReports !== undefined ? { versionReports: input.versionReports } : {}),
      politeness: input.politeness,
      ...(apiKey ? { apiKey } : {}),
      ...(languageCodes !== undefined ? { languageCodes } : {}),
      ...(reviewLocales !== undefined ? { reviewLocales } : {}),
    },
  });
}

export async function removeApiKey(shop: string): Promise<void> {
  await prisma.shopSettings.updateMany({ where: { shop }, data: { apiKey: "" } });
}

/** The key in use: the shop's own, else the SUPERTEXT_API_KEY variable. */
export const effectiveApiKey = (settings: Settings): string =>
  settings.apiKey || process.env.SUPERTEXT_API_KEY?.trim() || "";

/**
 * The shop's Supertext clients: `direct` (the live API, or SUPERTEXT_API_ENDPOINT
 * for tests and screenshots) and, for languages with *Translation review* on,
 * the review service (SUPERTEXT_REVIEW_URL, default Supertext's), same key and
 * User-Agent. Only translations use the review service.
 */
export const supertextClients = (settings: Settings): Clients =>
  createClients({
    apiKey: effectiveApiKey(settings),
    baseUrl: process.env.SUPERTEXT_API_ENDPOINT || undefined,
    userAgent: `Shopify-Supertext-Translation/${appVersion() ?? "dev"}`,
    reviewUrl: reviewUrl(),
  });
