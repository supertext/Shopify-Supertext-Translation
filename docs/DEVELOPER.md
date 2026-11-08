# Developer guide — Supertext Translation for Shopify

## Repository layout

```
app/
  routes/
    app.tsx                 embedded admin layout and navigation
    app._index.tsx          Translate page (list, languages, start job, progress)
    app.settings.tsx        API key, language mapping and Translation review per language, form of address, version information, key check, version
    app.files.export.tsx    resource route: POST → the translation file as a download (see Translation files)
    app.files.import.tsx    resource route: POST an upload → its translations written, summary per job as JSON
    webhooks.*.tsx          app/uninstalled, app/scopes_update, privacy compliance
    healthz.tsx             health check for Railway
    privacy.tsx             public privacy policy (linked from the App Store listing)
    _index/, auth.*         landing and login pages (Supertext's look, see Look and feel)
  components/PublicPage.tsx  header bar and stylesheet of the public pages (landing, login, privacy)
  components/TranslationFiles.tsx  Export for translation / Import translation sections of the Translate page
  styles/public.css       Supertext's look for the public pages; colours as CSS variables at the top
  translation/
    shopify.server.ts       GraphQL Admin API calls (locales, resources, translationsRegister)
    fields.server.ts        which fields go to Supertext, and back into translation inputs
    translate.server.ts     one resource × one locale: read → Supertext → register
    process.server.ts       a whole job: every resource × every locale
    resource-types.ts       the resource types the UI offers (shared with the browser)
    language-codes.ts       Shopify locale → Supertext code (the shop's mapping, SDK Languages with its defaults)
    files.server.ts         translation files: export, import, reference format (SDK TranslationFiles)
  supertext/
    client.server.ts        creates the Supertext SDK clients (direct and, for Translation review, the review service); maps SDK error codes to the app's messages
  reporting/
    reporting.ts            Commando Center glue around Plugin Health's InstallationReporter and the SDK's key check (no database imports)
    index.server.ts         the same wired to ShopSettings (reporter state per shop) and the settings
  i18n/
    en.ts, de.ts, fr.ts, it.ts  interface strings (English is the source and fallback)
    index.ts                locale from Shopify's ?locale=, translator, plural forms
    react.tsx               I18nProvider / useI18n, rich() for links inside sentences
    error.ts                LocalizedError: English message + code for the UI
  jobs.server.ts            job rows in the database, background runner
  settings.server.ts        per-shop settings, API key resolution
  crypto.server.ts          AES-256-GCM encryption of stored API keys
  version.server.ts         app version from package.json
  shopify.server.ts         Shopify app setup (auth, sessions, API version)
prisma/                     schema and migrations (PostgreSQL)
public/                     favicon.svg / favicon.ico (S mark), supertext-logo.svg, fonts/ (Inter, SIL Open Font License)
vendor/supertext-sdk/       the Supertext SDK (TypeScript), bundled unchanged; see *Supertext SDK*
vendor/supertext-plugin-health/  Supertext Plugin Health (TypeScript), bundled unchanged; see *Supertext Plugin Health*
scripts/start.mjs           production start: create database, migrate, serve
scripts/vendor-sdk.sh       updates the bundled SDK
scripts/vendor-plugin-health.sh  updates the bundled Plugin Health
test/                       Vitest unit tests with fake Shopify and fake Supertext
test/docs/                  the docs movies: scripts, stand-ins for Shopify and Supertext, the movie kit (see *Demo movie*)
shopify.app.toml            app configuration: client ID, URLs, scopes, webhooks
```

## Interface languages

The app's UI is in English, German, French and Italian and follows the merchant's admin language: Shopify adds `?locale=` (e.g. `de`, `fr-CA`) when it loads an embedded app. `app/routes/app.tsx` reads it once (`localeFromRequest`, falling back to `Accept-Language`, then English) and provides it to every page through `I18nProvider`; it sets `shouldRevalidate` to false because later requests from inside the app don't carry `?locale=`. The landing and login pages read it from their own request.

- Strings live in `app/i18n/{en,de,fr,it}.ts`. `en.ts` defines the keys; the other files are typed `Messages`, so a missing key fails `npm run typecheck`, and `test/i18n.test.ts` checks that placeholders, URLs and "Supertext" are kept. **Every new or changed string gets all four languages in the same commit.** Formal address (Sie, vous, Lei), Shopify's own terms in each language (de *Kategorien*, *Blogbeiträge*; fr *boutique*; it *negozio*, *collezioni*), placeholders and URLs untranslated; French uses `\u00a0` before `? ! : ;`.
- Plurals: keys ending in `.one` / `.other`, used with `tn(key, count)` (`Intl.PluralRules`).
- Server errors shown in the UI are `LocalizedError`s (`SupertextError` is one): an English `message` for logs plus a `code` and `params` that select `error.<code>` in the message files; `detail` (Supertext's or Shopify's own text) is shown as it is. Job errors are stored with these fields in the job row, so the page translates them when it shows them. Actions return message keys, not text.

## Look and feel

Two looks, on purpose:

- **Embedded admin pages** (`app/routes/app.*`, shown inside the Shopify admin): Shopify's Polaris web components and Shopify's Inter, as Shopify's app design guidelines expect. Don't restyle them.
- **Public pages outside the admin** (the landing page `_index/`, the login page `auth.login/`, the privacy policy `privacy.tsx`): Supertext's look, as on supertext.com and in the other hosted Supertext apps. The deep-green header bar (`#003230`, rounded bottom corners) with Supertext's mint logo (`public/supertext-logo.svg`, the website's own SVG), the warm off-white background (`#f7f5f3`), deep-green text and outlines, mint (`#78ffaf`) for the main action, light grey lines (`#dfe1df`), pill-shaped buttons. They use `PublicPage` and its `publicLinks` (`app/components/PublicPage.tsx`), which load `app/styles/public.css`; the colours are CSS variables at the top of that file. Text is set in Inter, bundled in `public/fonts/` (variable font, Latin and Latin Extended; SIL Open Font License in `Inter-LICENSE.txt`), so these pages load no font from elsewhere. Supertext's heading font (ABC Ginto Nord) is licensed and not bundled; headings use Inter Bold.

The favicon (`public/favicon.svg`, with `favicon.ico` for older browsers) is the logo's S mark on deep green.

## How a translation runs

1. The Translate page lists items with `translatableResources(resourceType: …)` and the languages with `shopLocales`.
2. *Translate with Supertext* posts the selected resource IDs and locales. The action creates a `TranslationJob` row and starts the job in the same process (`jobs.server.ts`), then returns at once.
3. The job gets the shop's offline Admin API session (`unauthenticated.admin(shop)`) and, for each resource and each locale, one after the other:
   - reads `translatableResource(resourceId)` with `translatableContent { key value digest type }` and `translations(locale) { key value outdated }`;
   - selects fields (`fields.server.ts`): types `STRING`, `SINGLE_LINE_TEXT_FIELD`, `MULTI_LINE_TEXT_FIELD` as escaped plain text; `HTML`, `INLINE_RICH_TEXT` as markup; skips `handle`, empty values and other types (JSON, URLs, file references); skips fields with a current translation unless *overwrite*; outdated translations are always redone;
   - passes the fields, keyed by position, to the SDK's `translateTexts`: it builds one HTML document with one `<div data-st-id="N">` per field (a whole field per element, as the shared rich-text rule requires), splits above 900,000 characters, translates, deletes the files and reads the fields back;
   - source = the shop's primary locale, target = the locale's **Supertext code**, both resolved before anything is sent (`translation/language-codes.ts`, see *Language codes*): the shop's mapping, else an exact Supertext code, else the SDK default (`de` → `de-DE`, …), else `unsupported_language`. That error, and a pair Supertext still refuses (`invalid_language_pair`), become messages pointing to Settings → Languages (`client.server.ts`); the job reports them once per language and skips that language. Formal/informal is sent only where the target offers it;
   - languages in the shop's *Translation review* list (`ShopSettings.reviewLocales`) are translated with the review service's client (see *Translation review*), all others directly;
   - writes the fields with `translationsRegister`, passing each field's `translatableContentDigest`. If Supertext returns fewer fields than sent, nothing is written for that item.
4. Progress (`completed`, `written`, `skipped`, `errors`) is saved after every pair; the page polls every 2 seconds while a job runs. Authentication and limit errors stop the job, other errors only skip the item.

## Translation files (XLIFF and HTML)

*Export for translation* and *Import translation* (Translate page, `app/components/TranslationFiles.tsx`) use the SDK's `TranslationFiles` (SDK 0.5.0, `vendor/supertext-sdk/translation-file.ts`, imported from `vendor/supertext-sdk/index`: it doesn't call the API, so it isn't in `v1`). The glue is `app/translation/files.server.ts`; the two resource routes only authenticate (`authenticate.admin`, the session token App Bridge adds to `fetch`), read the form and return the file or JSON.

- **Segments:** `selectFields(content, [], true)`, the API translation's own field selection with *overwrite*, so the file has every translatable field, also translated ones. Keys are Shopify's field keys (`title`, `body_html`, `meta_description`), unique per resource and stable, unlike the positional keys `translateTexts` gets.
- **Job metadata:** `plugin` = `Shopify-Supertext-Translation`; `reference` = `<GraphQL type>:<numeric id>:<Shopify locale>`, e.g. `Product:8123456789:fr` for `gid://shopify/Product/8123456789` in French (`fileReference` / `parseReference`; ids, never titles); `sourceLanguage`/`targetLanguage` = the codes the shop's mapping resolves (`resolvedSource`/`resolvedTarget`), else the Shopify code with `_` → `-`, so unmapped languages never block an export. XLIFF: one job per target locale in one file; HTML: exactly one locale.
- **Download:** `shopify-<id>-<target>.xlf|.html`, or `shopify-<id>.xlf` for several languages; `application/x-xliff+xml` / `text/html; charset=utf-8`, `Content-Disposition: attachment`. The browser fetches it and saves the blob (a plain link can't carry the session token).
- **Import:** `refuseLargeUpload` checks `Content-Length` before the body is read and the file's size (10 MB); the upload is parsed in memory and never stored. `TranslationFiles.read` (errors `invalid_file`, `missing_metadata`, `too_large` → `error.fileInvalid` / `fileMissingMetadata` / `fileTooLarge`), then per job: `plugin` must be ours (`fileOtherSystem`), the reference must parse and the resource exist (`fileItemGone`), the locale must be one of the shop's target locales (`fileNoLanguage`). The current fields are selected with the import's *overwrite* option, exactly as for an API run (fields with a current translation are *kept*), `importTranslations(file, current)`, and `ok` results (plus `source_changed` with *Also import texts whose source changed*) are written with `registerTranslations`, using the current digests. `untranslated`, `invalid_markup` and `missing` are counted, never written.
- Tests: `test/files.test.ts` (reference round trip, keys and mapping, HTML/XLIFF names, every import outcome, upload size).

## Shopify API

- Admin GraphQL API version `2026-10` (`ApiVersion.October26`, webhooks in `shopify.app.toml`).
- Scopes: `read_products` (products, collections), `read_content` (pages, blogs, articles), `read_locales`, `read_translations`, `write_translations`. Change them in `shopify.app.toml` and `SCOPES` together.
- Distribution is `AppStore` in `shopify.server.ts` (works for custom-distribution installs as well).
- Since January 2026, apps can no longer be created in a store's own admin: the app is created in the **Dev Dashboard** (dev.shopify.com). Client ID `d001de0fc4c060b4b044489f7992553a` (public, in `shopify.app.toml`); the client secret is only in Railway (`SHOPIFY_API_SECRET`).

## Supertext SDK

All calls to Supertext go through the **Supertext SDK** for TypeScript (0.5.0) from [Supertext-API-SDK-and-Guide](https://github.com/Supertext/Supertext-API-SDK-and-Guide), bundled in `vendor/supertext-sdk/` because the SDK isn't on npm yet. It handles the protocol below, the language list, document packing and batching, retries, errors and the API key check (`checkApiKey()`, `apiKeyFingerprint()`, `SDK_VERSION`); version reports are Supertext Plugin Health's (below). The app adds only its own error messages (`app/supertext/client.server.ts`, `localizeError`: SDK code → `error.<code>` in `app/i18n`) and sends `Shopify-Supertext-Translation/<version>` in the User-Agent.

- Everything that talks to the API is in the SDK's `v1/` folder: the app imports from `vendor/supertext-sdk/v1/index` (the top-level `index.ts` re-exports it as `v1` with `SDK_VERSION`, plus the version-neutral `TranslationFiles`, see *Translation files*). A later API version gets `v2/` next to it.
- `vendor/supertext-sdk/` holds the SDK's sources (`sdk/typescript/src`, with its `v1/` folder) plus `LICENSE`, `COMMIT` (the SDK commit it was copied from), `VERSION` and a `README.md`. **Never edit those files**: fix the SDK in its own repository instead.
- Every SDK error code (`ErrorCode`) needs an arm in `localizeError` and an `error.<code>` string in all four languages; `test/language-codes.test.ts` checks every code.
- To update: `scripts/vendor-sdk.sh [commit-or-branch]` (default `main`; `SDK_DIR=/path/to/clone scripts/vendor-sdk.sh` uses a local clone as it is). It replaces the folder entirely. Then run the tests and add a changelog entry for what merchants notice.
- Once the SDK is on npm, replace the folder with the `supertext-sdk` dependency; the imports are the only change.

## Supertext Plugin Health

[Supertext Plugin Health](https://github.com/Supertext/Commando-Center-Supertext-Translation/tree/main/plugin-health) (`plugin-health/typescript` in the Commando Center repository) sends the version reports and the API key check result to the Supertext Commando Center (`InstallationReporter`, `reportsEnabled()`, `reporterState()`; its ping endpoint isn't used, the app is hosted). It has no dependencies and doesn't call Supertext: `app/reporting/reporting.ts` passes it `SDK_VERSION` and a key checker built on the SDK (`{ check: (key) => new SupertextClient(key, …).checkApiKey(), fingerprint: apiKeyFingerprint }`).

- `vendor/supertext-plugin-health/` holds its sources (`plugin-health/typescript/src`) plus `LICENSE`, `COMMIT`, `VERSION` (0.1.0) and a `README.md`. **Never edit those files**: fix it in Commando-Center-Supertext-Translation/plugin-health instead.
- To update: `scripts/vendor-plugin-health.sh <tag>` (e.g. `plugin-health-v0.1.0`; default `main`; `PLUGIN_HEALTH_DIR=/path/to/clone` uses a local clone as it is). It replaces the folder entirely. Then run the tests and add a changelog entry.

## Supertext API protocol

AI file translation API v1 at `https://api.supertext.com/v1/` (handled by the SDK):

1. `POST translate/ai/file` (multipart): `file` (type exactly `text/html`), `target_lang`, `source_lang` (primary subtag only), optional `politeness` (`more`/`less`) → `{ file_id }`.
2. `GET translate/ai/file/{id}/status` every 2 s until `done` (`error`, `limit_exceeded`, `deleted` stop; timeout 3 minutes).
3. `GET translate/ai/file/{id}/translation` → the translated HTML.
4. `DELETE translate/ai/file/{id}`, always.

Header `Authorization: Supertext-Auth-Key <key>` (a pasted prefix is stripped). HTTP 429 is retried up to 4 times (`Retry-After`, else 1/2/4/8 s with jitter). `GET features` checks the key (after every settings save and on *Test connection*, see *Commando Center*).

The API key is the shop's own (Settings, stored encrypted in `ShopSettings`; keys saved before encryption existed are encrypted on first read), else the `SUPERTEXT_API_KEY` variable. `SUPERTEXT_API_ENDPOINT` points the app at a stand-in API.

**Translation review** (per target language, `ShopSettings.reviewLocales`, a JSON array of Shopify locales, migration `20261019000000_translation_review`; existing shops start with none): Settings → Languages has a checkbox below each target language's combo box (not for the default language). `settings.server.ts` → `supertextClients(settings)` returns `createClients()` from `client.server.ts`: `direct` (the live API or `SUPERTEXT_API_ENDPOINT`) and `forReview(review)`, a second SDK client with the same key, User-Agent and options whose base URL is `reviewUrl()` (`SUPERTEXT_REVIEW_URL`, default `REVIEW_URL`, the translation proxy of [Supertext Localization Review](https://github.com/Supertext/Localization-Review-Supertext-Translation)), created on first use. `jobs.server.ts` picks the client per locale; `translateTexts` uploads, polls, downloads and deletes with that one client, so a job is always collected where it was submitted. The proxy speaks the same API v1, forwards to the live Supertext API with the shop's key, stores every segment per key and serves reviewers' corrections on the next upload, so nothing else changes in the app. `SUPERTEXT_REVIEW_URL=""` (or the API's own URL) means `forReview()` always returns the direct client; the settings page then disables the checkboxes and saving keeps the stored list. The key check (`reporting.ts`), the version reports and translation files never use the review service. Tests: `test/review.test.ts` (a review language's upload, status, download and delete go to the review URL, others directly, same key and User-Agent; one review client; off with an empty or the same URL; the default is Supertext's review service).

## Language codes

Supertext accepts exactly the codes its `GET features` lists (the SDK's `Languages`, from the live API): bare sources (`en`, `de`); targets in one exact form each, regional for German, English, French, Italian and Portuguese (`de-CH`, `en-US`, `pt-BR`), with a script for Chinese and Serbian (`zh-Hans`, `sr-Latn`), `gsw-u-sd-chzh`/`chbe` for Swiss German, bare for the others (`es`, `nl`, `sl`). Anything else is HTTP 404 `INVALID_LANGUAGE_PAIR`; formal/informal for a target without it (`en-US`, `rm`, …) is HTTP 400 `FEATURE_ERROR`.

`app/translation/language-codes.ts` turns Shopify locales into Supertext codes with the SDK's `Languages`. One mapping per shop (`ShopSettings.languageCodes`, JSON `{"de":"de-CH"}`, edited under Settings → Languages) serves the targets and the source:

- **Target** (`supertextTarget` = `Languages.target(locale, mapping)`): the mapping wins; else a Shopify locale that equals a Supertext code apart from case and `_`/`-` (`pt-BR`, `es`, `de_ch` → `de-CH`); else the SDK default where one is obvious (`de` → `de-DE`, `en` → `en-US`, `fr` → `fr-FR`, `it` → `it-IT`, `pt` → `pt-PT`, `zh`/`zh-CN`/`zh-SG` → `zh-Hans`, `zh-TW`/`zh-HK`/`zh-MO` → `zh-Hant`, `sr` → `sr-Latn`, `es-ES` → `es`; `DEFAULT_TARGETS` in the SDK); else `SupertextError('unsupported_language')` (`en-IE`, `de-LI`, `gsw`, `sr-RS`, … need a mapping).
- **Source** (`supertextSource` = `Languages.source(primary, mapping)`): the mapping in its source form (`en` → `en-US` sends `en`), else the Supertext source for the locale (`en-GB` → `en`), else `unsupported_language`.
- `jobs.server.ts` resolves both per language before calling `translateTexts`, so a language without mapping, match or default sends nothing; the job shows `error.unsupportedLanguage` (naming the locale and Settings → Languages) once and skips that language.
- The settings page has one Polaris `<s-select>` (form-associated, submitted with the form as `code:<locale>`) per shop language, primary included, with `targetOptions()` as `<s-option>`s labelled *Name (code)*; names come from `Intl.DisplayNames` in the admin language (`targetName`; the SDK's English name for `gsw-u-sd-*`). Preselected: the saved code, else `suggestTarget(locale)` (exact match, else default), else *— choose —* (empty). A saved bare source code for the primary language from before 0.4.0 (`en`) shows as its target (`en-US`, sent as `en` again); a saved code that isn't in the list is kept as an extra option, so nothing stored is lost and no migration is needed. The action accepts only listed codes (`canonicalCode`: `Languages.matchTarget`, for the primary language also a bare source) and stores them in Supertext's spelling; empty removes the mapping. Below each select the page shows the code it is sent as or *No Supertext language* (red). The translate page shows the code next to each language and disables languages that resolve to nothing.
- There is no environment override for the mapping: it is per shop, in the database.

`test/language-codes.test.ts` covers the rules; the fake Supertext (`test/fake-supertext.ts`) translates through a shop mapping (`SHOP_MAPPING`) like a job. The SDK repo's stand-in API (`stand-in/stand-in.mjs`) accepts only listed codes, like the real API.

## Commando Center: version reports, key check

Protocol: [Commando-Center-Supertext-Translation](https://github.com/Supertext/Commando-Center-Supertext-Translation) → `docs/DEVELOPER.md` → *Report protocol*. Plugin Health's `InstallationReporter` and `reportsEnabled()` and the SDK's `checkApiKey()` implement it; `app/reporting/reporting.ts` (`ShopReporting`) only supplies what the app knows about one shop, `app/reporting/index.server.ts` wires it to the database:

- **Hosted app:** one installation per shop. `site_url` = `https://<shop>.myshopify.com` (the shop's permanent domain, also when it has a custom domain); plugin `Shopify-Supertext-Translation` (the GitHub repository name) with the version from `package.json`; system `Shopify` with the Admin API version the app uses (`apiVersion` in `shopify.server.ts`, e.g. `2026-10`), so moving to a new API version is reported as `upgraded`; runtime Node.js (Plugin Health's default). **No ping endpoint and no `callback`.**
- **Setting:** *Send version information to Supertext* per shop (`ShopSettings.versionReports`, on by default), on the settings page. `SUPERTEXT_VERSION_REPORTS=0` on the server turns it off for every shop (the checkbox is then disabled with a note); `SUPERTEXT_REPORT_URL` sends reports elsewhere (tests, the stand-in's `POST /report`).
- **State:** the reporter's JSON state per shop (`reporterState()`, the same format the SDK 0.2 reporter stored, so the switch sent no new `installed`) in `ShopSettings.reporterState` (migration `20261014000000_commando_center`; upserted, so a shop using the server's `SUPERTEXT_API_KEY` without saved settings gets a row). It holds the last reported versions, the key status and the latest key check with the key's SHA-256 fingerprint; the key itself is never stored there, sent or logged. The row goes with the shop's other data (shop redact).
- **When:** `afterSettingsSaved` after every save and after *Remove API key* (the settings page shows the key-check message, with both Supertext links in a new tab for `invalid`/`missing`); `testConnection` on *Test connection* (in the *API key check* box, which shows the last result and its time); `onRequest` in the background on the Translate and Settings pages and after each translation job (reports `installed`, `upgraded` or `api_key_check`; checks the key only when its fingerprint changed, e.g. a new `SUPERTEXT_API_KEY`); `authenticationFailed` when a translation gets 401/403 (once per job; reported only when the status changes). Calls are serialized per shop in the process.
- **Never breaks anything:** every call catches its errors and returns `null` (logged at debug level without the key); Plugin Health sends with a 3 s timeout and waits an hour after a failed report. Background runs are never awaited by a page.
- **Tests:** `test/reporting.test.ts` with a fake center and a fake Supertext (events, no callback, setting off, env override, 401 once, failures). `vitest.config.ts` sets `SUPERTEXT_REPORT_URL` to a dead local address, so tests never reach the live center.

## Local development

Requirements: Node.js 22.12+ (CI runs the tests on Node 22, 24 and 26; the Docker image uses Node 22), a PostgreSQL database, the [Shopify CLI](https://shopify.dev/docs/apps/tools/cli) and access to the app in the Dev Dashboard.

```bash
npm install
cp .env.example .env          # DATABASE_URL at minimum
npx prisma migrate deploy
npm run dev                   # shopify app dev: tunnel, install on a dev store
```

`shopify app dev` asks you to log in, picks the app (*Supertext Translation*) and a development store, and temporarily points the app's URLs at a tunnel.

## Tests

```bash
npm test            # Vitest: field selection, translation flow, job loop, translation files, language codes, Translation review clients, reporting, error messages, encryption
npm run typecheck
npm run build
```

The tests use a fake Admin API client and the real bundled SDK talking to an in-memory Supertext API (`test/fake-supertext.ts`), so they need neither a store, a database nor the network. To try the app against the SDK repo's stand-in API (which enforces the live API's rules): `node stand-in/stand-in.mjs` in the SDK repo and `SUPERTEXT_API_ENDPOINT=http://127.0.0.1:8765/v1/`.

## Hosting (Railway)

The backend runs on Railway (project *supertext-cms-demos*, service **Shopify**, EU region Amsterdam, like the shared Postgres; the privacy policy names the region) from this repo's `Dockerfile` (`railway.json`, health check `/healthz`). Every push to `main` deploys. If pushes stop deploying, check that Railway's GitHub app has access to this repo (https://github.com/organizations/Supertext/settings/installations → Railway → Configure), then reconnect the service's source once.

| Variable | Value |
| --- | --- |
| `SHOPIFY_API_KEY` | the client ID |
| `SHOPIFY_API_SECRET` | the client secret (Dev Dashboard → app → Settings) |
| `SHOPIFY_APP_URL` | the service's public URL, e.g. `https://shopify-production-d86d.up.railway.app` |
| `SCOPES` | as in `shopify.app.toml` |
| `DATABASE_URL` | the shared Postgres service's URL |
| `SHOPIFY_DB_NAME` | `shopify_supertext` (created on first start) |
| `SUPERTEXT_API_KEY` | optional default key (the demo store) |
| `SUPERTEXT_REVIEW_URL` | optional: another review service than Supertext's for languages with *Translation review* on (unset: Supertext's; empty: review off for every shop). The service must reach `https://api.supertext.com` and, for Translation review, Supertext's review service. |
| `SUPERTEXT_KEY_ENCRYPTION_KEY` | random string of at least 32 characters (e.g. `openssl rand -base64 48`). Encrypts the shops' Supertext API keys (AES-256-GCM, `app/crypto.server.ts`). Required: without it, keys can't be saved. If it changes, stored keys can't be read any more and shops are asked to enter theirs again; so never rotate it casually. |

`scripts/start.mjs` creates `SHOPIFY_DB_NAME` on the Postgres server if needed, runs `prisma migrate deploy` and starts `react-router-serve`. When the URL changes, update `application_url` and `redirect_urls` in `shopify.app.toml` and deploy the configuration (next section).

## Deploying the app configuration

URLs, scopes and webhooks are app configuration in Shopify, separate from the code. After changing `shopify.app.toml`:

```bash
npx shopify app deploy        # creates a new app version from shopify.app.toml
```

Without the CLI, create a new version in the Dev Dashboard (app → Versions → Create version) with the same URL, redirect URLs and scopes.

## Demo

The demo is a Shopify **development store** (free, from a Shopify developer account), not a container: Shopify hosts the store, Railway only the app backend.

Setting it up (once, by hand, because development stores can't be created or seeded from outside):

1. Dev Dashboard → **Dev stores** → create *supertext-demo*.
2. Settings → Languages: add German and French (published or not).
3. Add a few sample products, a page and a blog post in English.
4. Settings → Users: add staff accounts for Supertext staff (full permissions) and an editor-level account with *Apps* permission for tests and screenshots. Passwords stay in Keeper, never in the repo or chat.
5. Install the app from the Dev Dashboard (app → Install app → the dev store), and enter the API key under Settings, or set `SUPERTEXT_API_KEY` on Railway.

## Demo movie

`docs/images/demo.gif` (at the top of the README) and a narrated MP4 are recorded by `test/docs/movie.mjs` with Supertext's shared movie kit (`test/docs/movie/movie-kit.mjs` and `assets/`: intro and outro cards, caption bar, cursor, cuts the waiting time; Inter under the SIL OFL, `assets/fonts/Inter-LICENSE.txt`). The kit is the same in every Supertext plugin repo: don't restyle it here.

The movies need no Shopify store. `test/docs/movie/env.mjs` serves the app's production build in the script's own process and answers every request the app makes to Shopify and Supertext in-process with the stand-ins in `test/docs/stand-in.mjs`: the Admin GraphQL operations the app uses, for a sample shop (English, German, French; three products, `test/docs/samples.json`), and the Supertext API v1 with real translations of the sample texts (it holds each status answer, so the waiting state is visible; the movie cuts it). Anything else the app tries to reach is refused, so nothing reaches Shopify, Supertext or the Commando Center. The pages are the real embedded pages with Shopify's real Polaris script from cdn.shopify.com; only what the Shopify admin around the app provides is stood in: the offline session (seeded in the database, as Shopify's token exchange would leave it), a session token signed with the demo's own app secret (`authenticate.admin()` checks it as in production), and a small App Bridge stand-in that adds that token to the app's own requests, which is what App Bridge does inside the admin. The browser loads nothing but the app and cdn.shopify.com; the app's navigation (shown in Shopify's sidebar, not in the app's frame) is hidden, and the page sits on the admin's grey background.

```bash
pip install piper-tts                                  # the voice (once)
npm run build                                          # the movies use the production build
DATABASE_URL=postgresql://…/empty_db npm run docs:movie           # README GIF + MP4
DATABASE_URL=postgresql://…/empty_db npm run docs:movie:install   # install and configuration MP4
```

`DATABASE_URL` is an empty PostgreSQL database just for the movies (migrated on start; the demo shop's rows are reset). `CHROME=/path/to/chrome` uses another Chromium than Playwright's own (Playwright is installed into `test/docs/node_modules` by the npm scripts, not into the app); `MOVIE_PORT` (default 8796); `MOVIE_OUT` for the MP4's path. Behind an HTTP proxy, add `NODE_USE_ENV_PROXY=1` so the script can fetch cdn.shopify.com. Headless Chrome counts as a bot for the app (`authenticate.admin()` answers 410), so the scripts use a normal Chrome user agent.

- **Demo movie** (`test/docs/movie.mjs`, about 50 s): the Translate page with the products in English, *Linen apron* ticked, German kept and French unticked, *Translate 1 with Supertext*, the running job, and the result (*Done · de · 4 fields translated*). The translated product itself is shown in Shopify's Translate & Adapt app, which is Shopify's UI and isn't shown; the script checks that the stand-in received the German texts. Record it again when the Translate page changes.
- **Install movie** (`test/docs/movie-install.mjs`, about 75 s, MP4 only): the app is hosted, so there are no install commands; installing it from the Shopify App Store is Shopify's own screens, summed up in one spoken line over the app's first page (*Add your Supertext API key*). Then *Settings*: the fake key `st-demo-0000-0000-0000` and where to get a real one, *Languages* (the shop's languages come from Shopify's Settings → Languages; German set to *Swiss High German (de-CH)*, *Translation review* left off), *Save* with the key check (*the connection to Supertext works*), and the Translate page where editors start. Record it again when the settings change.

Both MP4s are narrated with [Piper](https://pypi.org/project/piper-tts/) (`pip install piper-tts`): the kit's `say()` speaks each step's line, shows its caption and holds until the line is finished; the time spent making the speech is cut. The voice model (63 MB, pinned revision, checked by SHA-256) downloads itself once into `~/.cache/supertext-movie`. Without Piper, or with `MOVIE_VOICE=0`, the movies are made silent with the captions only. The GIF is silent.

Voice: Piper voice “alba” (en_GB), trained on a dataset from the University of Edinburgh's Centre for Speech Technology Research, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)

They need `ffmpeg` and write 1280×720 at 30 fps. The GIF (800 px, 12 fps, keep it under 3 MB) is committed; the MP4s aren't: they go to `test/docs/movie/out/Shopify-Supertext-Translation.mp4` and `…-install.mp4` (git-ignored) or to `MOVIE_OUT`.

## Dependency updates

Dependabot (`.github/dependabot.yml`) opens weekly pull requests: minor and patch updates grouped into one, GitHub Actions in another, each major update on its own. Merge one when CI is green and it doesn't change what the plugin supports.

Some major versions are ignored on purpose: TypeScript (7.x is the native compiler, which the type-checking and build tools here don't support yet) and `@types/node` (the types must match the oldest Node version the plugin supports, not the newest). Lift an ignore rule when the plugin moves to the new version.

React Router majors are ignored too (`react-router` and all `@react-router/*`): the whole family has to move together with `@shopify/shopify-app-react-router`, whose 3.x releases still require `react-router` ^7, and React Router 8 needs Node 22.22 or later while the app supports 22.12. Lift the rule once a Shopify release supports React Router 8, then update all of them (and `engines.node`, if needed) in one change.

Prisma majors (`prisma`, `@prisma/client`) wait for `@shopify/shopify-app-session-storage-prisma`, whose 11.x releases require Prisma ^6. `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` must always have the same version; Dependabot proposes their majors one at a time, which can't pass, so those majors are ignored and done by hand for both at once.

React 19 (`react`, `react-dom` and their types): `@shopify/app-bridge-react` 4.x now accepts any React version, but with React 19's types the app's `<s-app-nav>` element no longer type-checks (`Property 's-app-nav' does not exist on type 'JSX.IntrinsicElements'`, in `app/routes/app.tsx`): the declaration of the `s-*` elements has to move to React 19's `React.JSX` namespace first, then lift the rule. ESLint 10 no longer reads `.eslintrc.cjs`: moving to a flat `eslint.config.js` comes first (see *Known limitations / roadmap*), then lift the `eslint` rule.

## Code quality and security checks

- **Checks** workflow (`.github/workflows/checks.yml`): [actionlint](https://github.com/rhysd/actionlint) and [zizmor](https://docs.zizmor.sh/) lint the workflows on every push and pull request. Dependency review fails a pull request that adds a package with a known vulnerability (moderate or worse). Third-party actions are pinned to commit SHAs; Dependabot keeps the pins up to date. To run the workflow lint locally: `pip install actionlint-py zizmor`, then `actionlint` and `zizmor .github/workflows` in the repo root.
- **Links** workflow (`.github/workflows/links.yml`): [lychee](https://lychee.cli.rs/) checks the links in all Markdown files weekly and whenever docs change on `main`. Broken links open (or update) the issue "Broken links in the docs". Links that can't work from CI (local URLs, placeholders, pages behind a login) are excluded in `.lycheeignore`.
- JavaScript and TypeScript are analysed by CodeQL (see below), so this repo runs no separate static analyser.
- GitHub settings (set by Remy's setup script, not stored in the repo): **secret scanning with push protection** (a push containing a known token format is rejected; findings under *Security → Secret scanning*) and **CodeQL default setup** (findings under *Security → Code scanning* and as comments on pull requests; PHP isn't covered by CodeQL, which is why the PHP plugins run PHPStan).
- `.github/workflows/support-triage.yml`: support requests from the Supertext integrations website arrive as issues labelled `support` (contact details stay in the Supertext CMS). Claude classifies each one: answers questions (marked `<!-- supertext:reply -->`, emailed to the sender by the CMS) and closes them, fixes bugs as pull requests for review (never merged automatically), labels feature requests `feature-request`. Only people with triage rights can add labels, so outsiders can't start it. Needs the organisation secret `ANTHROPIC_API_KEY`; the workflow is the same in every Supertext repo.

Before starting work in this repo, look at its open findings: code scanning alerts, secret scanning alerts, Dependabot PRs and the "Broken links in the docs" issue.

## Releasing

`package.json` holds the version (the release workflow's `VERSION_FILES`); the settings page reads it at runtime.

1. Move the *Unreleased* entries in `CHANGELOG.md` under a new `## X.Y.Z — YYYY-MM-DD` heading, leaving *Unreleased* empty.
2. Set the same version in `package.json` (and `package-lock.json`, via `npm version X.Y.Z --no-git-tag-version`).
3. Push to `main`. `.github/workflows/release.yml` tags `vX.Y.Z` and creates the GitHub release with the changelog section; 0.x versions are pre-releases.
4. Railway deploys the code on the same push; run `npx shopify app deploy` if `shopify.app.toml` changed.

Never tag or create releases by hand.

## Known limitations / roadmap

- ESLint still uses the legacy `.eslintrc.cjs`; ESLint 10 needs a flat `eslint.config.js` (Dependabot ignores ESLint majors until then).
- Jobs run inside the web process. A restart (every deploy) stops running jobs; on start, `scripts/start.mjs` marks them *failed* with "Interrupted by an app update", and the merchant starts them again (finished items are kept). A queue that resumes them comes later.
- Only products, collections, pages, blog posts and blogs. Next: product options and values, metafields, metaobjects, menus, shop policies, theme texts.
- JSON rich-text fields (metafields of type rich text) and URL handles aren't translated.
- Up to 50 items per run (one page of the list); selecting across pages and "translate everything" come later.
- An admin action on the product and collection pages (*Translate with Supertext* in the **More actions** menu) would save a trip to the app.
- Not in the App Store yet: see [APP_STORE.md](APP_STORE.md) for the submission checklist, listing texts and reviewer instructions.
- The demo store is set up by hand; screenshots for the guides (including the export and import sections) follow once it exists.
- Translation files export one item at a time; a bulk export of the selected items comes later.
- Re-translating with *Overwrite* replaces edits made in Translate & Adapt; no change detection. A translation memory and reviewers' corrections come from the review service when a language has *Translation review* on; corrections reach Shopify only with the next translation with *Overwrite* (no push).
