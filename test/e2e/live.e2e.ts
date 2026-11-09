/**
 * End-to-end test against the REAL Supertext API, without a real Shopify store.
 *
 * The app runs as it does on Railway: its Translate page's own loader and action
 * (app/routes/app._index.tsx), the background job runner (app/jobs.server.ts) with a real
 * PostgreSQL database, the shop's settings (language mapping) and the bundled Supertext SDK
 * talking to the live API with SUPERTEXT_API_KEY. Only Shopify is replaced: the session check
 * (`authenticate.admin`, `unauthenticated.admin`) returns the stand-in Admin GraphQL API in
 * test/e2e/shopify-stand-in.ts, which holds a sample shop and records what the app registers
 * with `translationsRegister`. See "End-to-end tests" in docs/DEVELOPER.md.
 *
 *   DATABASE_URL=postgresql://… SUPERTEXT_API_KEY=… npx vitest run --config test/e2e/vitest.config.ts
 *
 * Prints ok / FAIL / note lines; the test fails if any check failed.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

vi.mock("../../app/shopify.server", async () => {
  const { SHOP, standIn } = await import("./shopify-stand-in");
  const session = { shop: SHOP, id: `offline_${SHOP}`, isOnline: false };
  return {
    default: {},
    apiVersion: "2026-10",
    authenticate: { admin: async () => ({ admin: standIn.admin, session }) },
    unauthenticated: { admin: async () => ({ admin: standIn.admin, session }) },
    addDocumentResponseHeaders: () => undefined,
  };
});

import prisma from "../../app/db.server";
import { saveSettings } from "../../app/settings.server";
import { loader, action } from "../../app/routes/app._index";
import { SAMPLE, SHOP, standIn, LOCALES, type StoredTranslation } from "./shopify-stand-in";
import { RESOURCE_TYPES } from "../../app/translation/resource-types";

/** The demo store's languages and their Supertext codes (Settings → Languages). */
const MAPPING: Record<string, string> = { de: "de-CH", fr: "fr-CH" };
const TARGETS = LOCALES.filter((l) => !l.primary).map((l) => l.locale);

const failures: string[] = [];
function check(name: string, ok: boolean, detail = ""): boolean {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}
const note = (text: string) => console.log(`note ${text}`);

// Common words, to tell the target languages apart. Lower case, whole words.
const STOPWORDS: Record<string, string[]> = {
  en: ["the", "and", "is", "are", "with", "for", "you", "your", "our", "of", "to", "we", "who", "what"],
  de: ["der", "die", "das", "und", "ist", "sind", "mit", "für", "sie", "ihre", "ihr", "unser", "unsere", "wir", "eine", "ein", "den", "zu", "von", "was"],
  fr: ["le", "les", "et", "est", "sont", "avec", "pour", "vous", "votre", "vos", "notre", "nos", "nous", "des", "une", "un", "du", "de", "qui", "que"],
  it: ["il", "lo", "gli", "e", "è", "sono", "con", "per", "lei", "sua", "suo", "nostro", "nostra", "noi", "una", "un", "del", "della", "di", "che", "chi"],
};
const words = (text: string) => text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
const score = (text: string, lang: string) => words(text).filter((w) => STOPWORDS[lang].includes(w)).length;
const plain = (html: string) => html.replace(/<[^>]+>/g, " ");
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]).sort();

const LEFTOVERS = ["data-st-id", "data-st-ph", "st-ph-", "<!DOCTYPE", "<html", "<body"];
const TAGS = ["<a ", "<strong", "<em", "<p>", "<ul>", "<ol>", "<li>", "<h2>"];
/** Fields the app sends to Supertext (fields.server.ts): text and HTML types, no handle. */
const SENT_TYPES = new Set(["STRING", "SINGLE_LINE_TEXT_FIELD", "MULTI_LINE_TEXT_FIELD", "HTML", "INLINE_RICH_TEXT"]);
const sentFields = (resource: (typeof SAMPLE)[number]) =>
  resource.content.filter((c) => SENT_TYPES.has(c.type) && c.key !== "handle" && c.value?.trim());

// Counts requests to the Supertext API (the SDK uses the global fetch).
const supertextHost = new URL(process.env.SUPERTEXT_API_ENDPOINT || "https://api.supertext.com/v1/").host;
let supertextRequests = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (new URL(url).host === supertextHost) supertextRequests++;
  return realFetch(input, init);
}) as typeof fetch;

const args = (request: Request) => ({ request, params: {}, context: {} }) as never;
const pageUrl = (type: string) => `https://app.test/app?type=${type}&locale=en`;

/** Clicks "Translate with Supertext" on one list page, like the UI's form, and waits for the job. */
async function translate(type: string, resourceIds: string[], locales: string[], overwrite = false) {
  const form = new FormData();
  for (const id of resourceIds) form.append("resource", id);
  for (const locale of locales) form.append("locale", locale);
  if (overwrite) form.append("overwrite", "on");
  const result = (await action(args(new Request(pageUrl(type), { method: "POST", body: form })))) as
    | { jobId: string }
    | { error: string };
  if ("error" in result) throw new Error(`The Translate page refused: ${result.error}`);
  const deadline = Date.now() + 10 * 60_000;
  for (;;) {
    const job = await prisma.translationJob.findUniqueOrThrow({ where: { id: result.jobId } });
    if (job.status === "done" || job.status === "failed") return job;
    if (Date.now() > deadline) throw new Error(`Job ${job.id} still ${job.status} after 10 minutes`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

type Loaded = Awaited<ReturnType<typeof loader>>;
const jobs: unknown[] = [];

describe("Translate page against the real Supertext API", () => {
  afterAll(async () => {
    const dir = fileURLToPath(new URL("./artifacts/", import.meta.url));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      `${dir}result.json`,
      JSON.stringify({ jobs, translations: standIn.dump(), requests: standIn.requests, failures }, null, 2),
    );
    await prisma.$disconnect();
  });

  it("translates the sample shop into every language", async () => {
    // A fresh shop: no jobs, the demo's language mapping, the key from SUPERTEXT_API_KEY.
    await prisma.translationJob.deleteMany({ where: { shop: SHOP } });
    await prisma.shopSettings.deleteMany({ where: { shop: SHOP } });
    await saveSettings(SHOP, { politeness: "default", languageCodes: MAPPING, versionReports: false });

    // --- First run: every list page, every language ----------------------------------
    for (const { value: type } of RESOURCE_TYPES) {
      const page = (await loader(args(new Request(pageUrl(type))))) as Loaded;
      check(`${type}: page has an API key`, page.hasApiKey);
      for (const locale of TARGETS) {
        const target = page.targets.find((t) => t.locale === locale);
        check(`${type}: ${locale} is mapped to ${MAPPING[locale]}`, target?.code === MAPPING[locale], String(target?.code));
      }
      const expected = SAMPLE.filter((r) => r.type === type).map((r) => r.id);
      const listed = page.resources.map((r) => r.id);
      check(`${type}: all sample items listed`, expected.every((id) => listed.includes(id)), `${listed.length}/${expected.length}`);
      if (!listed.length) continue;

      const job = await translate(type, listed, TARGETS);
      jobs.push(job);
      const errors = JSON.parse(job.errors) as { message: string }[];
      check(`${type}: job finished without errors`, job.status === "done" && errors.length === 0, errors.map((e) => e.message).join("; ") || job.status);
      check(`${type}: job completed every item and language`, job.completed === job.total, `${job.completed}/${job.total}`);

      // What the Translate page would show after the job (the job list, errors included).
      const after = (await loader(args(new Request(pageUrl(type))))) as Loaded;
      const shown = after.jobs.find((j) => j.id === job.id);
      check(`${type}: the page shows the job as done, no error message`, shown?.status === "done" && shown.errors.length === 0);
    }
    check("the app sent nothing to Shopify but locale/resource reads and translationsRegister", standIn.unexpected.length === 0, standIn.unexpected.join(", "));

    // --- What Shopify received ---------------------------------------------------------
    for (const locale of TARGETS) {
      const code = MAPPING[locale];
      const tag = `${locale} (${code})`;
      let fields = 0;
      let changed = 0;
      let text = "";
      for (const resource of SAMPLE) {
        const stored = new Map(standIn.stored(resource.id, locale).map((t) => [t.key, t]));
        for (const source of sentFields(resource)) {
          fields++;
          const name = `${tag}: ${resource.type} ${resource.id.split("/").pop()} ${source.key}`;
          const t = stored.get(source.key) as StoredTranslation | undefined;
          if (!check(`${name} filled`, Boolean(t?.value.trim()), t ? "" : "not registered")) continue;
          const value = t!.value;
          const src = source.value ?? "";
          check(`${name} registered with the current digest`, t!.translatableContentDigest === source.digest);
          if (value !== src) changed++;
          else note(`${name} unchanged: ${JSON.stringify(value)}`);
          text += ` ${plain(value)}`;
          const left = LEFTOVERS.filter((l) => value.includes(l));
          check(`${name} has no protocol leftovers`, left.length === 0, left.join(", "));
          if (source.type === "HTML") {
            for (const tagName of TAGS) {
              const n = count(src, tagName);
              if (n) check(`${name} keeps ${tagName.trim()}…>`, count(value, tagName) === n, `${count(value, tagName)}/${n}`);
            }
            if (hrefs(src).length) check(`${name} keeps its link targets`, JSON.stringify(hrefs(value)) === JSON.stringify(hrefs(src)), hrefs(value).join(" "));
          } else {
            const markup = /<[a-z]/i.test(value);
            check(`${name} has no markup added`, !markup, markup ? value : "");
            const breaks = count(src, "\n");
            if (breaks) check(`${name} keeps its line breaks`, count(value, "\n") === breaks, `${count(value, "\n")}/${breaks}`);
          }
        }
        const extra = [...stored.keys()].filter((k) => !sentFields(resource).some((f) => f.key === k));
        check(`${tag}: ${resource.type} ${resource.id.split("/").pop()} has no translations of fields the app skips (handle …)`, extra.length === 0, extra.join(", "));
      }
      check(`${tag}: texts were changed by the translation`, fields > 0 && changed / fields >= 0.8, `${changed}/${fields} fields`);
      const lang = code.slice(0, 2);
      const scores = Object.fromEntries(Object.keys(STOPWORDS).map((l) => [l, score(text, l)]));
      const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
      check(`${tag}: text is in the target language`, best === lang, JSON.stringify(scores));
      if (/^de-ch$/i.test(code)) check(`${tag}: Swiss German spelling (no "ß")`, !text.includes("ß"));
    }

    // --- Translating again --------------------------------------------------------------
    const product = SAMPLE[0];
    const fieldCount = sentFields(product).length;
    const before = standIn.stored(product.id, "de").map((t) => t.key).sort().join(",");

    // Without "overwrite": current translations are kept and nothing goes to Supertext.
    const requestsBefore = supertextRequests;
    const kept = await translate("PRODUCT", [product.id], TARGETS);
    jobs.push(kept);
    check("again without overwrite: nothing written, every field kept", kept.written === 0 && kept.skipped === fieldCount * TARGETS.length, `written ${kept.written}, skipped ${kept.skipped}`);
    check("again without overwrite: no request to Supertext", supertextRequests === requestsBefore, `${supertextRequests - requestsBefore} requests`);

    // With "overwrite": translated again and registered for the same keys (Shopify keeps one per key and locale).
    const registersBefore = standIn.requests.filter((r) => r.operation === "SupertextRegister").length;
    const redone = await translate("PRODUCT", [product.id], ["de"], true);
    jobs.push(redone);
    const errors = JSON.parse(redone.errors) as { message: string }[];
    check("again with overwrite: every field translated again", redone.status === "done" && redone.written === fieldCount && errors.length === 0, [`written ${redone.written}/${fieldCount}`, ...errors.map((e) => e.message)].join("; "));
    const registers = standIn.requests.filter((r) => r.operation === "SupertextRegister").slice(registersBefore);
    check("again with overwrite: one translationsRegister for the product", registers.length === 1 && registers[0].variables.id === product.id, String(registers.length));
    const afterKeys = standIn.stored(product.id, "de").map((t) => t.key).sort().join(",");
    check("again with overwrite: the same fields are updated in place (no extra keys)", before === afterKeys, `${before} → ${afterKeys}`);
    check("again with overwrite: still Swiss German spelling", !standIn.stored(product.id, "de").some((t) => t.value.includes("ß")));

    console.log(failures.length ? `\n${failures.length} check(s) failed:\n- ${failures.join("\n- ")}` : "\nAll end-to-end checks passed.");
    expect(failures).toEqual([]);
  });
});
