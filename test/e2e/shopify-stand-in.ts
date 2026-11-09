/**
 * A stand-in for the Shopify Admin GraphQL API (test-only), for the end-to-end test
 * against the real Supertext API (test/e2e/live.e2e.ts).
 *
 * It answers the queries and the mutation the app sends (app/translation/shopify.server.ts)
 * from a small sample shop held in memory, and behaves like Shopify where it matters:
 * `translationsRegister` refuses unknown resources, keys and locales, the primary locale and
 * a digest that doesn't match the current source text, and stores one translation per
 * resource, key and locale (registering again replaces it). Every request is recorded, so
 * the test can check what the app sent. Anything else the app might send is an error.
 */
import type { AdminClient } from "../../app/translation/shopify.server";
import type { ContentItem } from "../../app/translation/fields.server";

export const SHOP = "supertext-e2e.myshopify.com";

export interface SampleResource {
  id: string;
  type: "PRODUCT" | "COLLECTION" | "PAGE" | "ARTICLE" | "BLOG";
  content: ContentItem[];
}

const digest = (value: string) => {
  // Shopify's digest is a SHA-256 of the value; any stable fingerprint does here.
  let h = 0;
  for (const ch of value) h = (Math.imul(h, 31) + ch.codePointAt(0)!) | 0;
  return `d${(h >>> 0).toString(16)}`;
};

const field = (key: string, type: string, value: string): ContentItem => ({
  key,
  value,
  digest: digest(value),
  locale: "en",
  type,
});

/**
 * The sample shop: English content with the formatting merchants use in Shopify's rich
 * text editor (bold, italics, lists, headings, links). Shopify doesn't run Liquid in these
 * fields, so there are no placeholders to keep.
 */
export const SAMPLE: SampleResource[] = [
  {
    id: "gid://shopify/Product/1001",
    type: "PRODUCT",
    content: [
      field("title", "SINGLE_LINE_TEXT_FIELD", "Organic dark chocolate with sea salt"),
      field(
        "body_html",
        "HTML",
        '<p>Our <strong>dark chocolate</strong> is made in small batches from organic cocoa beans and a pinch of sea salt. It melts slowly and has a deep, fruity taste.</p>' +
          '<ul><li>70 % cocoa from fair trade cooperatives</li><li>No palm oil and no artificial flavours</li><li>Wrapped in recycled paper</li></ul>' +
          '<p>Read more about <a href="/pages/our-story">how we make our chocolate</a> or <a href="https://www.example.com/cocoa" target="_blank">where our cocoa comes from</a>.</p>',
      ),
      field("handle", "URI", "organic-dark-chocolate-sea-salt"),
      field("product_type", "SINGLE_LINE_TEXT_FIELD", "Chocolate bar"),
      field("meta_title", "SINGLE_LINE_TEXT_FIELD", "Organic dark chocolate with sea salt | Swiss Sweets"),
      field(
        "meta_description",
        "MULTI_LINE_TEXT_FIELD",
        "Small-batch organic dark chocolate with a pinch of sea salt.\nMade with fair trade cocoa and wrapped in recycled paper.",
      ),
    ],
  },
  {
    id: "gid://shopify/Product/1002",
    type: "PRODUCT",
    content: [
      field("title", "SINGLE_LINE_TEXT_FIELD", "Hazelnut milk chocolate gift box"),
      field(
        "body_html",
        "HTML",
        '<p>A box of <em>twelve hand-made pralines</em> with roasted hazelnuts from Piedmont. The perfect present for birthdays, weddings and every other day that deserves something sweet.</p>' +
          '<p><strong>Please note:</strong> this product contains nuts and milk. See our <a href="/pages/allergens">allergen information</a> for details.</p>',
      ),
      field("handle", "URI", "hazelnut-milk-chocolate-gift-box"),
      field("product_type", "SINGLE_LINE_TEXT_FIELD", "Gift box"),
    ],
  },
  {
    id: "gid://shopify/Collection/2001",
    type: "COLLECTION",
    content: [
      field("title", "SINGLE_LINE_TEXT_FIELD", "Chocolate gifts for every occasion"),
      field(
        "body_html",
        "HTML",
        "<p>Looking for a present? Our <strong>gift boxes and bars</strong> are packed by hand and shipped within two working days.</p>",
      ),
      field("handle", "URI", "chocolate-gifts"),
    ],
  },
  {
    id: "gid://shopify/Page/3001",
    type: "PAGE",
    content: [
      field("title", "SINGLE_LINE_TEXT_FIELD", "Our story"),
      field(
        "body_html",
        "HTML",
        "<h2>From a small kitchen to your table</h2>" +
          "<p>We started making chocolate in our own kitchen in 2012. Today a team of eight people roasts, grinds and tempers every batch by hand.</p>" +
          '<p>Do you have a question about our products? <a href="mailto:hello@example.com">Write to us</a> and we will answer within one working day.</p>',
      ),
      field("handle", "URI", "our-story"),
    ],
  },
  {
    id: "gid://shopify/Article/4001",
    type: "ARTICLE",
    content: [
      field("title", "SINGLE_LINE_TEXT_FIELD", "How to store chocolate the right way"),
      field(
        "body_html",
        "HTML",
        "<p>Chocolate likes it <strong>cool, dry and dark</strong>. Keep it between 15 and 18 degrees and away from strong smells, because it absorbs them easily.</p>" +
          "<ol><li>Do not put it in the fridge.</li><li>Close the package well after opening it.</li><li>Eat it within a few weeks for the best taste.</li></ol>",
      ),
      field("summary_html", "HTML", "<p>Three simple rules that keep your chocolate fresh and tasty for weeks.</p>"),
      field("handle", "URI", "how-to-store-chocolate"),
    ],
  },
  {
    id: "gid://shopify/Blog/5001",
    type: "BLOG",
    content: [
      field("title", "SINGLE_LINE_TEXT_FIELD", "News from our chocolate kitchen"),
      field("handle", "URI", "news"),
    ],
  },
];

export interface StoredTranslation {
  key: string;
  value: string;
  locale: string;
  translatableContentDigest: string;
}

export interface Request {
  operation: string;
  variables: Record<string, unknown>;
}

export interface ShopLocale {
  locale: string;
  name: string;
  primary: boolean;
  published: boolean;
}

export function createShopifyStandIn(locales: ShopLocale[]) {
  const resources = new Map(SAMPLE.map((r) => [r.id, r]));
  /** resourceId → "key|locale" → translation */
  const translations = new Map<string, Map<string, StoredTranslation>>();
  const requests: Request[] = [];
  const unexpected: string[] = [];
  const primary = locales.find((l) => l.primary)!.locale;

  const answer = (data: unknown) => Response.json({ data });

  const admin: AdminClient = {
    async graphql(query, options) {
      const variables = options?.variables ?? {};
      const operation = query.match(/(?:query|mutation)\s+(\w+)/)?.[1] ?? "anonymous";
      requests.push({ operation, variables });

      if (operation === "SupertextShopLocales") {
        return answer({ shopLocales: locales });
      }
      if (operation === "SupertextResources") {
        const type = variables.type as string;
        const nodes = SAMPLE.filter((r) => r.type === type).map((r) => ({
          resourceId: r.id,
          translatableContent: r.content,
        }));
        return answer({
          translatableResources: { nodes, pageInfo: { endCursor: null, hasNextPage: false } },
        });
      }
      if (operation === "SupertextResource") {
        const resource = resources.get(variables.id as string);
        if (!resource) return answer({ translatableResource: null });
        const locale = variables.locale as string;
        const stored = [...(translations.get(resource.id)?.values() ?? [])].filter((t) => t.locale === locale);
        return answer({
          translatableResource: {
            translatableContent: resource.content,
            translations: stored.map((t) => ({
              key: t.key,
              value: t.value,
              outdated: resource.content.find((c) => c.key === t.key)?.digest !== t.translatableContentDigest,
            })),
          },
        });
      }
      if (operation === "SupertextRegister") {
        const resource = resources.get(variables.id as string);
        const inputs = variables.translations as StoredTranslation[];
        const userErrors: { field: string[]; message: string }[] = [];
        if (!resource) {
          userErrors.push({ field: ["resourceId"], message: "Resource does not exist" });
        } else {
          inputs.forEach((input, i) => {
            const source = resource.content.find((c) => c.key === input.key);
            const fieldPath = ["translations", String(i)];
            if (!source) userErrors.push({ field: [...fieldPath, "key"], message: `Key ${input.key} is not a valid translatable field` });
            else if (source.digest !== input.translatableContentDigest)
              userErrors.push({ field: [...fieldPath, "translatableContentDigest"], message: "Translatable content hash is invalid" });
            if (input.locale === primary || !locales.some((l) => l.locale === input.locale))
              userErrors.push({ field: [...fieldPath, "locale"], message: `Locale ${input.locale} is not enabled for this shop` });
          });
        }
        if (!userErrors.length && resource) {
          const map = translations.get(resource.id) ?? new Map<string, StoredTranslation>();
          for (const input of inputs) map.set(`${input.key}|${input.locale}`, { ...input });
          translations.set(resource.id, map);
        }
        return answer({ translationsRegister: { userErrors } });
      }
      unexpected.push(operation);
      return Response.json({ errors: [{ message: `The stand-in doesn't know ${operation}` }] });
    },
  };

  return {
    admin,
    requests,
    unexpected,
    /** Stored translations of one resource in one locale. */
    stored(resourceId: string, locale: string): StoredTranslation[] {
      return [...(translations.get(resourceId)?.values() ?? [])].filter((t) => t.locale === locale);
    },
    /** All stored translations, for the debug artifact. */
    dump() {
      return Object.fromEntries([...translations].map(([id, map]) => [id, [...map.values()]]));
    },
  };
}

export type ShopifyStandIn = ReturnType<typeof createShopifyStandIn>;

/** The sample shop's languages: English primary, German published, French not yet (both are translated). */
export const LOCALES: ShopLocale[] = [
  { locale: "en", name: "English", primary: true, published: true },
  { locale: "de", name: "German", primary: false, published: true },
  { locale: "fr", name: "French", primary: false, published: false },
];

/** One stand-in per test run, shared by the mocked app/shopify.server and the test. */
export const standIn = createShopifyStandIn(LOCALES);
