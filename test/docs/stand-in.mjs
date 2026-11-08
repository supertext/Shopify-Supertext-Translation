// Stand-ins for the docs movies (docs/DEVELOPER.md → Demo movie): the parts of Shopify's Admin GraphQL
// API the app uses, for a sample shop (samples.json → shop), and the Supertext AI file translation API v1,
// which returns the human translations in samples.json → translations for the sample texts and
// "[<target>] text" for anything else. Both are plain request handlers (Request → Response); env.mjs
// routes the app's outgoing requests to them in-process, so nothing reaches Shopify or Supertext.
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const samples = JSON.parse(readFileSync(new URL('samples.json', import.meta.url), 'utf8'));

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const digest = (value) => createHash('sha256').update(value).digest('hex');

/** Shopify's Admin GraphQL API: shopLocales, translatableResources, translatableResource, translationsRegister. */
export function createShopifyStandin() {
  const primary = samples.shop.locales.find((l) => l.primary).locale;
  const resources = samples.shop.products.map((p) => ({
    resourceId: p.id,
    translatableContent: Object.entries(p.content).map(([key, [type, value]]) => ({
      key, value, digest: digest(value), locale: primary, type,
    })),
  }));
  /** resourceId → locale → key → value (what translationsRegister wrote). */
  const translations = new Map();
  const operation = (query) => query.match(/(?:query|mutation)\s+(\w+)/)?.[1];

  return {
    translations,
    async handle(request) {
      if (!/\/admin\/api\/[\w-]+\/graphql\.json$/.test(new URL(request.url).pathname)) return json({}, 404);
      const { query, variables = {} } = await request.json();
      switch (operation(query)) {
        case 'SupertextShopLocales':
          return json({ data: { shopLocales: samples.shop.locales } });
        case 'SupertextResources': {
          const nodes = variables.type === 'PRODUCT' ? resources : [];
          return json({ data: { translatableResources: { nodes, pageInfo: { endCursor: null, hasNextPage: false } } } });
        }
        case 'SupertextResource': {
          const resource = resources.find((r) => r.resourceId === variables.id);
          if (!resource) return json({ data: { translatableResource: null } });
          const saved = translations.get(resource.resourceId)?.get(variables.locale) ?? new Map();
          return json({
            data: {
              translatableResource: {
                translatableContent: resource.translatableContent,
                translations: [...saved].map(([key, value]) => ({ key, value, outdated: false })),
              },
            },
          });
        }
        case 'SupertextRegister': {
          const resource = resources.find((r) => r.resourceId === variables.id);
          const userErrors = [];
          for (const t of variables.translations ?? []) {
            const field = resource?.translatableContent.find((c) => c.key === t.key);
            if (!field || field.digest !== t.translatableContentDigest) {
              userErrors.push({ field: ['translations'], message: `Translatable content hash is invalid: ${t.key}` });
              continue;
            }
            if (!translations.has(variables.id)) translations.set(variables.id, new Map());
            const byLocale = translations.get(variables.id);
            if (!byLocale.has(t.locale)) byLocale.set(t.locale, new Map());
            byLocale.get(t.locale).set(t.key, t.value);
          }
          return json({ data: { translationsRegister: { userErrors } } });
        }
        default:
          return json({ errors: [{ message: `The stand-in doesn't know this operation: ${operation(query)}` }] });
      }
    },
  };
}

const norm = (value) => value.replace(/\s+/g, ' ').replace(/> </g, '><').trim();
const decode = (value) =>
  value.replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const encode = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const known = Object.fromEntries(
  Object.entries(samples.translations).map(([lang, pairs]) => [lang, new Map(Object.entries(pairs).map(([k, v]) => [norm(k), v]))]),
);

/** Translates every `data-st-id` element: the sample's translation, else "[<target>] text". */
export function translate(html, target) {
  const pairs = known[target.split('-')[0]] ?? new Map();
  return html.replace(/(<div data-st-id="\d+">)([\s\S]*?)(<\/div>\n)/g, (_all, open, inner, close) => {
    if (pairs.has(norm(inner))) return open + pairs.get(norm(inner)) + close;
    if (pairs.has(norm(decode(inner)))) return open + encode(pairs.get(norm(decode(inner)))) + close;
    return open + inner.replace(/>([^<]+)</g, (m, text) => (text.trim() ? `>[${target}] ${text}<` : m)).replace(/^([^<]+)/, `[${target}] $1`) + close;
  });
}

/**
 * The Supertext API v1 (upload, status, translation, delete, features for the key check) and the
 * Commando Center's POST /report. `statusDelayMs` holds every status answer, so the movie shows the
 * waiting state (and cuts it).
 */
export function createSupertextStandin({ statusDelayMs = 0 } = {}) {
  const files = new Map();
  const documents = [];
  return {
    documents,
    async handle(request) {
      const path = new URL(request.url).pathname.replace(/^\/v1/, '');
      if (request.method === 'POST' && path.endsWith('/report')) return json({ ok: true }, 202);
      if (!/^Supertext-Auth-Key \S+$/.test(request.headers.get('authorization') ?? '')) return json({ detail: 'missing key' }, 401);
      if (path === '/features') return json({ supported_features: [] });
      if (request.method === 'POST' && path === '/translate/ai/file') {
        const form = await request.formData();
        const file = form.get('file');
        if (!file || file.type !== 'text/html') return json({ detail: 'FILETYPE_NOT_ALLOWED' }, 415);
        const id = randomBytes(6).toString('hex');
        const target = String(form.get('target_lang'));
        const html = await file.text();
        files.set(id, { html, target });
        documents.push({ target, source: String(form.get('source_lang')), html });
        return json({ file_id: id });
      }
      const match = path.match(/file\/([a-f0-9]+)(\/status|\/translation)?$/);
      const file = match && files.get(match[1]);
      if (!file) return json({}, 404);
      if (request.method === 'DELETE') {
        files.delete(match[1]);
        return json({});
      }
      if (match[2] === '/status') {
        if (statusDelayMs) await new Promise((r) => setTimeout(r, statusDelayMs));
        return json({ status: 'done' });
      }
      return new Response(translate(file.html, file.target), { headers: { 'Content-Type': 'text/html' } });
    },
  };
}
