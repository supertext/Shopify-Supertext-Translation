import { describe, expect, it } from "vitest";
import {
  exportFile,
  fileReference,
  importFile,
  MAX_UPLOAD_BYTES,
  refuseLargeUpload,
  parseReference,
  PLUGIN,
  type ExportRequest,
} from "../app/translation/files.server";
import type { ContentItem, ExistingTranslation } from "../app/translation/fields.server";
import type { AdminClient } from "../app/translation/shopify.server";
import { TranslationFiles } from "../vendor/supertext-sdk/index";

const product: ContentItem[] = [
  { key: "title", value: "Swiss chocolate", digest: "d-title", locale: "en", type: "SINGLE_LINE_TEXT_FIELD" },
  { key: "body_html", value: "<p>Made in <b>Zurich</b>.</p>", digest: "d-body", locale: "en", type: "HTML" },
  { key: "handle", value: "swiss-chocolate", digest: "d-handle", locale: "en", type: "URI" },
  { key: "meta_description", value: "Line one\nLine two", digest: "d-meta", locale: "en", type: "MULTI_LINE_TEXT_FIELD" },
];

/** A shop with product 1 (content may change between export and import) that records registered translations. */
function fakeShop(options: { content?: ContentItem[]; translations?: ExistingTranslation[] } = {}) {
  const state = { content: options.content ?? product, translations: options.translations ?? [] };
  const registered: { id: string; translations: { key: string; value: string; locale: string; translatableContentDigest: string }[] }[] = [];
  const admin: AdminClient = {
    async graphql(query, opts) {
      const vars = opts?.variables ?? {};
      if (query.includes("translatableResource(")) {
        if (vars.id !== "gid://shopify/Product/1") return Response.json({ data: { translatableResource: null } });
        return Response.json({ data: { translatableResource: { translatableContent: state.content, translations: state.translations } } });
      }
      if (query.includes("translationsRegister")) {
        registered.push({ id: vars.id as string, translations: vars.translations as never });
        return Response.json({ data: { translationsRegister: { userErrors: [] } } });
      }
      throw new Error(`unexpected query: ${query}`);
    },
  };
  return { admin, registered, state };
}

const request = (overrides: Partial<ExportRequest> = {}): ExportRequest => ({
  resourceId: "gid://shopify/Product/1",
  locales: ["fr"],
  format: "xliff",
  primaryLocale: "en",
  mapping: { fr: "fr-CH" },
  ...overrides,
});

/** A translator: copies every XLIFF source into a target with "[fr] " in front. */
const translateXliff = (xliff: string) =>
  xliff.replace(/<source>([\s\S]*?)<\/source>/g, (_m, inner: string) => `<source>${inner}</source><target>[fr] ${inner}</target>`);

const options = { includeChanged: false, overwrite: false, locales: ["fr", "de"] };

describe("references", () => {
  it("round-trips the resource and the Shopify locale", () => {
    const reference = fileReference("gid://shopify/Product/8123456789", "pt-BR");
    expect(reference).toBe("Product:8123456789:pt-BR");
    expect(parseReference(reference)).toEqual({ resourceId: "gid://shopify/Product/8123456789", locale: "pt-BR" });
    expect(parseReference("OnlineStorePage:5:de")).toEqual({ resourceId: "gid://shopify/OnlineStorePage/5", locale: "de" });
    expect(parseReference("page:abc")).toBeNull();
    expect(parseReference("gid://shopify/Product/1")).toBeNull();
  });
});

describe("exportFile", () => {
  it("exports the fields the API translation sends, keyed by Shopify field, with the mapped codes", async () => {
    const { admin } = fakeShop({ translations: [{ key: "title", value: "Chocolat suisse", outdated: false }] });
    const file = await exportFile(admin, request({ locales: ["fr", "de"] }));
    expect(file.filename).toBe("shopify-1.xlf");
    expect(file.contentType).toBe("application/x-xliff+xml");
    const jobs = TranslationFiles.read(file.content);
    expect(jobs.map((j) => [j.plugin, j.reference, j.sourceLanguage, j.targetLanguage])).toEqual([
      [PLUGIN, "Product:1:fr", "en", "fr-CH"],
      [PLUGIN, "Product:1:de", "en", "de-DE"], // SDK default
    ]);
    // Also fields that already have a translation; never the handle.
    expect(jobs[0].units.map((u) => u.key)).toEqual(["title", "body_html", "meta_description"]);
  });

  it("names a one-language file after the target and doesn't block unmapped languages", async () => {
    const { admin } = fakeShop();
    const file = await exportFile(admin, request({ locales: ["en-IE"], format: "html", primaryLocale: "de_CH" }));
    expect(file.filename).toBe("shopify-1-en-IE.html");
    expect(file.contentType).toBe("text/html; charset=utf-8");
    const [job] = TranslationFiles.read(file.content);
    expect([job.format, job.sourceLanguage, job.targetLanguage]).toEqual(["html", "de", "en-IE"]);
  });

  it("refuses HTML with several languages, unknown items and items with nothing to translate", async () => {
    await expect(exportFile(fakeShop().admin, request({ locales: ["fr", "de"], format: "html" }))).rejects.toMatchObject({ code: "fileHtmlOneLanguage" });
    await expect(exportFile(fakeShop().admin, request({ locales: [] }))).rejects.toMatchObject({ code: "fileSelectLanguage" });
    await expect(exportFile(fakeShop().admin, request({ resourceId: "gid://shopify/Product/404" }))).rejects.toMatchObject({ code: "itemGone" });
    const empty = fakeShop({ content: [product[2]] });
    await expect(exportFile(empty.admin, request())).rejects.toMatchObject({ code: "nothingToTranslate" });
  });
});

describe("importFile", () => {
  it("writes ok results through translationsRegister with the current digests", async () => {
    const { admin, registered } = fakeShop();
    const xliff = translateXliff((await exportFile(admin, request())).content);
    const [summary] = await importFile(admin, xliff, options);
    expect(summary).toMatchObject({ reference: "Product:1:fr", title: "Swiss chocolate", locale: "fr", written: 3, kept: 0 });
    expect(summary.counts.ok).toBe(3);
    const byKey = Object.fromEntries(registered[0].translations.map((t) => [t.key, t]));
    expect(byKey.title).toEqual({ key: "title", value: "[fr] Swiss chocolate", locale: "fr", translatableContentDigest: "d-title" });
    expect(byKey.body_html.value).toBe("[fr] <p>Made in <b>Zurich</b>.</p>");
  });

  it("writes source_changed results only with the option", async () => {
    const shop = fakeShop();
    const xliff = translateXliff((await exportFile(shop.admin, request())).content);
    shop.state.content = product.map((c) => (c.key === "title" ? { ...c, value: "Swiss dark chocolate", digest: "d-title-2" } : c));

    const [skipped] = await importFile(shop.admin, xliff, options);
    expect(skipped.counts.source_changed).toBe(1);
    expect(skipped.skippedChanged).toBe(1);
    expect(shop.registered[0].translations.map((t) => t.key)).toEqual(["body_html", "meta_description"]);

    const [included] = await importFile(shop.admin, xliff, { ...options, includeChanged: true });
    expect(included.skippedChanged).toBe(0);
    expect(shop.registered[1].translations.find((t) => t.key === "title")).toMatchObject({ translatableContentDigest: "d-title-2" });
  });

  it("doesn't write untranslated, invalid or missing texts, and keeps current translations unless Overwrite", async () => {
    const shop = fakeShop({ translations: [{ key: "meta_description", value: "Ligne", outdated: false }] });
    let xliff = (await exportFile(shop.admin, request())).content;
    // Title translated, body with a broken tag code, meta untranslated.
    xliff = xliff.replace(/(<source>Swiss chocolate<\/source>)/, "$1<target>Chocolat suisse</target>");
    xliff = xliff.replace(/(<source>(<bpt[\s\S]*?)<\/source>)/, '$1<target>Fabriqué à <bpt id="9">&lt;i&gt;</bpt>Zurich</target>');
    shop.state.content = [...product, { key: "body_html_2", value: "New field", digest: "d-new", locale: "en", type: "STRING" }];

    const [summary] = await importFile(shop.admin, xliff, options);
    expect(summary.kept).toBe(1); // meta_description has a current translation
    expect(summary.counts).toEqual({ ok: 1, source_changed: 0, untranslated: 0, invalid_markup: 1, missing: 1 });
    expect(shop.registered[0].translations.map((t) => t.key)).toEqual(["title"]);

    const [overwritten] = await importFile(shop.admin, xliff, { ...options, overwrite: true });
    expect(overwritten.kept).toBe(0);
    expect(overwritten.counts.untranslated).toBe(1);
  });

  it("refuses files of other systems, unknown items and languages the shop doesn't have", async () => {
    const shop = fakeShop();
    const job = (plugin: string, reference: string) => ({
      plugin, reference, sourceLanguage: "en", targetLanguage: "fr-FR", segments: [{ key: "title", text: "Swiss chocolate" }],
    });
    const file = TranslationFiles.exportXliff([
      job("Wix-Supertext-Translation", "Product:1:fr"),
      job(PLUGIN, "page:12"),
      job(PLUGIN, "Product:404:fr"),
      job(PLUGIN, "Product:1:ja"),
    ]);
    const summaries = await importFile(shop.admin, file, options);
    expect(summaries.map((s) => [s.error?.code, s.error?.params])).toEqual([
      ["fileOtherSystem", { plugin: "Wix-Supertext-Translation" }],
      ["fileItemGone", {}],
      ["fileItemGone", {}],
      ["fileNoLanguage", { language: "ja" }],
    ]);
    expect(shop.registered).toHaveLength(0);
  });

  it("turns the SDK's file errors into messages", async () => {
    const { admin } = fakeShop();
    await expect(importFile(admin, "hello", options)).rejects.toMatchObject({ code: "fileInvalid" });
    await expect(importFile(admin, "<html><body><div data-st-id=\"0\">x</div></body></html>", options)).rejects.toMatchObject({ code: "fileMissingMetadata" });
  });

  it("imports an unchanged HTML file as the source text", async () => {
    const { admin, registered } = fakeShop();
    const html = (await exportFile(admin, request({ format: "html" }))).content;
    const [summary] = await importFile(admin, html.replace("Made in", "Fabriqué à"), options);
    expect(summary.written).toBe(3);
    expect(registered[0].translations.find((t) => t.key === "body_html")?.value).toBe("<p>Fabriqué à <b>Zurich</b>.</p>");
  });
});

describe("upload size", () => {
  it("refuses uploads over 10 MB, by Content-Length before reading and by file size", () => {
    expect(() => refuseLargeUpload(String(11 * 1024 * 1024))).toThrow(expect.objectContaining({ code: "fileTooLarge" }));
    expect(() => refuseLargeUpload(null, { size: MAX_UPLOAD_BYTES + 1 })).toThrow(expect.objectContaining({ code: "fileTooLarge" }));
    expect(() => refuseLargeUpload(String(MAX_UPLOAD_BYTES), { size: MAX_UPLOAD_BYTES })).not.toThrow();
  });
});
