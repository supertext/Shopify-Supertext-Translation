import { describe, expect, it } from "vitest";
import {
  selectFields,
  titleOf,
  type ContentItem,
  type ExistingTranslation,
} from "../app/translation/fields.server";
import { translateResource } from "../app/translation/translate.server";
import { processJob } from "../app/translation/process.server";
import type { AdminClient } from "../app/translation/shopify.server";
import { LocalizedError } from "../app/i18n/error";
import { fakeSupertext, prefixSegments } from "./fake-supertext";
import { localizeError } from "../app/supertext/client.server";

const product: ContentItem[] = [
  { key: "title", value: "Swiss chocolate", digest: "d-title", locale: "en", type: "SINGLE_LINE_TEXT_FIELD" },
  { key: "body_html", value: "<p>Made in <b>Zurich</b>, see <a href=\"/pages/about\">our story</a>.</p>", digest: "d-body", locale: "en", type: "HTML" },
  { key: "handle", value: "swiss-chocolate", digest: "d-handle", locale: "en", type: "URI" },
  { key: "product_type", value: "", digest: "d-type", locale: "en", type: "STRING" },
  { key: "meta_description", value: "Line one\nLine two", digest: "d-meta", locale: "en", type: "MULTI_LINE_TEXT_FIELD" },
  { key: "some_json", value: "{\"a\":1}", digest: "d-json", locale: "en", type: "JSON" },
];

/** A Shopify admin with one product that records registered translations. */
function fakeAdmin(translations: ExistingTranslation[] = []) {
  const registered: { id: string; translations: { key: string; value: string; locale: string; translatableContentDigest: string }[] }[] = [];
  const admin: AdminClient = {
    async graphql(query, options) {
      const vars = options?.variables ?? {};
      if (query.includes("translatableResource(")) {
        if (vars.id === "gid://shopify/Product/404") {
          return Response.json({ data: { translatableResource: null } });
        }
        return Response.json({
          data: { translatableResource: { translatableContent: product, translations } },
        });
      }
      if (query.includes("translationsRegister")) {
        registered.push({ id: vars.id as string, translations: vars.translations as never });
        return Response.json({ data: { translationsRegister: { userErrors: [] } } });
      }
      throw new Error(`unexpected query: ${query}`);
    },
  };
  return { admin, registered };
}

describe("selectFields", () => {
  it("sends text and HTML fields, skips handles, empty values and unsupported types", () => {
    const selection = selectFields(product, [], false);
    expect(selection.fields.map((f) => f.key)).toEqual(["title", "body_html", "meta_description"]);
    expect(selection.segments.map((s) => s.html)).toEqual([false, true, false]);
  });

  it("keeps current translations unless asked to overwrite, but retranslates outdated ones", () => {
    const existing = [
      { key: "title", value: "Schweizer Schokolade", outdated: false },
      { key: "body_html", value: "<p>alt</p>", outdated: true },
    ];
    const kept = selectFields(product, existing, false);
    expect(kept.fields.map((f) => f.key)).toEqual(["body_html", "meta_description"]);
    expect(kept.skipped).toBe(1);
    expect(selectFields(product, existing, true).fields).toHaveLength(3);
  });

  it("finds a title for lists", () => {
    expect(titleOf(product)).toBe("Swiss chocolate");
    expect(titleOf([])).toBe("(untitled)");
  });
});

describe("translateResource", () => {
  it("translates the fields and registers them with their digests", async () => {
    const { admin, registered } = fakeAdmin();
    const supertext = fakeSupertext();
    const result = await translateResource(admin, supertext.translate, "gid://shopify/Product/1", "de", false);

    expect(result).toEqual({ written: 3, skipped: 0 });
    // One document for all fields; the SDK sends the regional code and deletes the file.
    expect(supertext.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST translate/ai/file",
      "GET translate/ai/file/f1/status",
      "GET translate/ai/file/f1/translation",
      "DELETE translate/ai/file/f1",
    ]);
    expect(supertext.requests[0].targetLang).toBe("de-DE");
    const byKey = Object.fromEntries(registered[0].translations.map((t) => [t.key, t]));
    expect(byKey.title).toMatchObject({ value: "[de-DE] Swiss chocolate", locale: "de", translatableContentDigest: "d-title" });
    // Markup and links survive, line breaks in plain text too.
    expect(byKey.body_html.value).toContain('<a href="/pages/about">');
    expect(byKey.body_html.value).toContain("<b>[de-DE] Zurich</b>");
    expect(byKey.meta_description.value).toBe("[de-DE] Line one\nLine two");
  });

  it("does nothing when everything is already translated", async () => {
    const { admin, registered } = fakeAdmin([
      { key: "title", value: "x", outdated: false },
      { key: "body_html", value: "x", outdated: false },
      { key: "meta_description", value: "x", outdated: false },
    ]);
    const supertext = fakeSupertext();
    const result = await translateResource(admin, supertext.translate, "gid://shopify/Product/1", "fr", false);
    expect(result).toEqual({ written: 0, skipped: 3 });
    expect(supertext.requests).toHaveLength(0);
    expect(registered).toHaveLength(0);
  });

  it("refuses to write a partial result", async () => {
    const { admin, registered } = fakeAdmin();
    const supertext = fakeSupertext(() => '<div data-st-id="0">Nur Titel</div>');
    await expect(
      translateResource(admin, supertext.translate, "gid://shopify/Product/1", "de", false),
    ).rejects.toMatchObject({ code: "incomplete_response" });
    expect(registered).toHaveLength(0);
  });
});

describe("processJob", () => {
  it("goes through every item and language and reports per-item errors", async () => {
    const { admin, registered } = fakeAdmin();
    const updates: number[] = [];
    const result = await processJob(
      admin,
      fakeSupertext().translate,
      { resourceIds: ["gid://shopify/Product/1", "gid://shopify/Product/404"], locales: ["de", "fr"], overwrite: false },
      async (p) => void updates.push(p.completed),
    );
    expect(result.written).toBe(6);
    expect(result.errors).toEqual([
      { resource: "gid://shopify/Product/404", locale: "de", message: "The item no longer exists.", code: "itemGone", params: {} },
      { resource: "gid://shopify/Product/404", locale: "fr", message: "The item no longer exists.", code: "itemGone", params: {} },
    ]);
    expect(updates).toEqual([1, 2, 3, 4]);
    expect(registered.map((r) => r.translations[0].locale)).toEqual(["de", "fr"]);
  });

  it("stops at once when the API key is rejected", async () => {
    const { admin } = fakeAdmin();
    let calls = 0;
    const result = await processJob(
      admin,
      async () => {
        calls++;
        throw new LocalizedError("Authentication failed.", "auth");
      },
      { resourceIds: ["a", "b", "c"], locales: ["de", "fr"], overwrite: false },
      async () => undefined,
    );
    expect(calls).toBe(1);
    expect(result.completed).toBe(6);
    expect(result.errors).toHaveLength(1);
  });
});

describe("refused languages", () => {
  it("sends nothing for a language without mapping or default and reports unsupported_language once", async () => {
    const { admin, registered } = fakeAdmin();
    const supertext = fakeSupertext(undefined, { mapping: { de: "de-CH" } });
    const result = await processJob(
      admin,
      (segments, locale) =>
        supertext.translate(segments, locale).catch((error: unknown) => {
          throw localizeError(error);
        }),
      { resourceIds: ["gid://shopify/Product/1", "gid://shopify/Product/2"], locales: ["en-IE", "de"], overwrite: false },
      async () => undefined,
    );
    expect(result.errors).toEqual([
      expect.objectContaining({ locale: "en-IE", code: "unsupportedLanguage", params: { language: "en-IE" } }),
    ]);
    expect(supertext.requests.every((r) => r.targetLang === undefined || r.targetLang === "de-CH")).toBe(true);
    expect(supertext.requests.filter((r) => r.method === "POST")).toHaveLength(2);
    expect(registered.map((r) => r.translations[0].locale)).toEqual(["de", "de"]);
  });

  it("reports a language Supertext refuses once and skips it for the other items", async () => {
    const { admin, registered } = fakeAdmin();
    const calls: string[] = [];
    const result = await processJob(
      admin,
      async (segments, locale) => {
        calls.push(locale);
        if (locale === "de") {
          throw new LocalizedError('Supertext doesn\'t translate from "en" into "de".', "languagePair", { source: "en", target: "de" });
        }
        return fakeSupertext(prefixSegments).translate(segments, locale);
      },
      { resourceIds: ["gid://shopify/Product/1", "gid://shopify/Product/2"], locales: ["de", "fr"], overwrite: false },
      async () => undefined,
    );
    expect(calls).toEqual(["de", "fr", "fr"]);
    expect(result.errors).toHaveLength(1);
    expect(result.completed).toBe(4);
    expect(registered).toHaveLength(2);
  });
});
