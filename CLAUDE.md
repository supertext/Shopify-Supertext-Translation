# Working on this repository

Part of Supertext's translation plugins project: Supertext AI translation for the top open source CMS, plus PIM systems (Akeneo, AtroPIM, Pimcore) and e-commerce systems (Shopify). Each system has its own repo named `Supertext/<System>-Supertext-Translation`.

This repo is a **Shopify app** (Shopify's React Router template): an embedded admin page hosted on Railway, talking to Shopify through the GraphQL Admin API. See `docs/DEVELOPER.md`.

## Documentation rule (always)

Every plugin repo keeps three guides, and **every change that affects behaviour, settings, installation or the code structure updates them in the same commit**:

| File | Audience | Must cover |
| --- | --- | --- |
| `docs/INSTALLATION.md` | Administrators | Requirements, install/update/uninstall, API key, language setup, all settings, troubleshooting |
| `docs/USER_GUIDE.md` | Editors | How to translate and review in the CMS's own UI, what is and isn't translated, what errors mean |
| `docs/DEVELOPER.md` | Developers | Architecture, Supertext API protocol, local setup, tests, CI/deploy, releasing, known limitations/roadmap |

Also: `README.md` stays a short overview linking the three guides, and `CHANGELOG.md` gets an entry under *Unreleased* for every user-visible change. Before finishing any task, check the docs still match the code.

## Supertext account and API key links (always)

Everywhere an administrator enters or is told about the API key — the settings field's help text, the "no API key" / "authentication failed" messages, `docs/INSTALLATION.md`, `README.md` and the demo's `.env.example` — show both links (same as the WordPress plugin):

- Create a Supertext account (or log in): https://www.supertext.com/person/en/account/signin
- Generate the AI API key: https://www.supertext.com/en/integrations/api (supertext.com → Integrations → API; requires the **Admin** role)

Wording: "No Supertext account yet? Create one at supertext.com. Generate your API key at supertext.com → Integrations → API (requires the Admin role)." In the UI, links open in a new tab (`target="_blank" rel="noopener"`); where the CMS shows plain text only, use the bare URLs.

## UI languages (always)

The plugin's own UI (buttons, panels, dialogs, settings, permissions, messages) is available in English, German, French and Italian through the CMS's own translation mechanism, so it follows the user's back-end language. New or changed strings get all four languages in the same commit. Formal address (Sie, vous, Lei), the CMS's own terms in each language, "Supertext", placeholders and URLs never translated.

Here: Shopify passes the admin language as `?locale=`; strings live in `app/i18n/{en,de,fr,it}.ts` (typed, so a missing key fails `npm run typecheck`; `test/i18n.test.ts` checks placeholders and URLs). Server errors shown in the UI are `LocalizedError`s with a `code` (`error.<code>`); actions return message keys, not English text. See `docs/DEVELOPER.md` → *Interface languages*.

## Plugin version on the settings screen (always)

Where the CMS doesn't show the plugin's version itself, the plugin's own settings or status screen does. It is read at runtime from the official version source (here `package.json`), never a second hardcoded copy, and links to the GitHub release when it is an X.Y.Z version.

## Plugin list (always)

`README.md` ends with the shared list of all Supertext plugins, between the `<!-- supertext-plugins:start -->` and `<!-- supertext-plugins:end -->` markers. It is identical in every Supertext plugin repo: when a plugin is added, renamed or its description changes, update the list in **all** repos. The project's `plugin-conventions.md` holds the current block. It has four tables: CMS, PIM, E-commerce (Magento, PrestaShop, Shopify, Wix) and Design files.

## Releases (always)

`.github/workflows/release.yml` publishes a GitHub release only when the version is officially bumped: a new `## X.Y.Z — YYYY-MM-DD` section at the top of `CHANGELOG.md`, below an empty *Unreleased*, with `package.json` (the workflow's `VERSION_FILES`) carrying the same number. Then it tags `vX.Y.Z` and creates the release with that CHANGELOG section as notes (0.x as pre-releases). Pushes without a new version release nothing. Never tag or create releases by hand. A Shopify app has no installable file: `shopify app deploy` publishes the app configuration, Railway deploys the code.

## Repo setup (always)

Every Supertext plugin repo has, and a new one gets from the start:

- `LICENSE` matching the license its manifest declares (`composer.json`, `package.json`, `pyproject.toml`, `.csproj`, plugin header).
- `SECURITY.md`: report vulnerabilities privately through GitHub's private vulnerability reporting or support@supertext.com, never in public issues.
- `.github/dependabot.yml`: weekly updates for its package ecosystem and GitHub Actions, minor and patch updates grouped into one pull request.
- `.github/workflows/checks.yml` (actionlint + zizmor on every push and PR, dependency review on PRs) and `.github/workflows/links.yml` (lychee weekly and on docs changes; broken links open the issue "Broken links in the docs"). Third-party actions are pinned to commit SHAs.
- On GitHub: the About box filled in (one-sentence description, website https://www.supertext.com, topics), `main` protected against force-pushes and deletion, Wiki and Projects off, Dependabot alerts and private vulnerability reporting on, secret scanning with push protection and CodeQL default setup on, and the Supertext social preview image.
- A row in the plugin list (see *Plugin list*) and in the org profile (`Supertext/.github` → `profile/README.md`).

Claude sessions can't change GitHub repo settings (HTTP 403): add a new repo to Remy's setup script (`set-github-about`) instead of trying.

## Checks and alerts (always)

Before starting work in a repo, look at its open findings and fix what the task touches or what is quick: code scanning alerts (`gh api 'repos/Supertext/Shopify-Supertext-Translation/code-scanning/alerts?state=open'`), secret scanning alerts (`…/secret-scanning/alerts?state=open`), open Dependabot PRs and the issue "Broken links in the docs". New workflows and workflow changes must pass actionlint and zizmor; PHP code must pass PHPStan at the repo's level. See `docs/DEVELOPER.md` → *Code quality and security checks*.

## Demo accounts rule (always)

The demo shop is a Shopify development store, so the CMS-style `DEMO_*` accounts are Shopify staff accounts and are set up by hand in the store (see `docs/DEVELOPER.md` → *Demo*). Values never go in the repo, in chat or in logs.

## Screenshots rule (always)

The user guide and installation guide include screenshots of the real UI, taken from the demo store by a committed script against a stand-in API that returns real translations, stored in `docs/images/`, small, with alt text, and regenerated whenever the UI they show changes. No secrets, no customer data, no local URLs.

Demo movie: `npm run docs:movie` (`test/docs/movie.mjs`, the app's own pages against the stand-ins in `test/docs/stand-in.mjs`, kit in `test/docs/movie/`) records `docs/images/demo.gif` (shown in the README) and an MP4 that isn't committed; `npm run docs:movie:install` (`test/docs/movie-install.mjs`) records the install and configuration movie (MP4 only). Both need `npm run build` and an empty `DATABASE_URL`; see `docs/DEVELOPER.md` → *Demo movie*.

## Shared Supertext protocol

AI file translation API v1, same as the WordPress plugin: POST HTML file → poll status → GET translation → DELETE. Details in `docs/DEVELOPER.md`.

All Supertext calls go through the **Supertext SDK** (TypeScript), bundled unchanged in `vendor/supertext-sdk/` (SDK commit in `COMMIT`, version in `VERSION`). Never edit those files: protocol fixes go into https://github.com/Supertext/Supertext-API-SDK-and-Guide, then `scripts/vendor-sdk.sh [ref]`. Version reports go through **Supertext Plugin Health** (TypeScript), bundled the same way in `vendor/supertext-plugin-health/`: never edit it either; fix it in https://github.com/Supertext/Commando-Center-Supertext-Translation (`plugin-health/`), then `scripts/vendor-plugin-health.sh <tag>`. The app's own code only maps SDK error codes to its messages (`app/supertext/client.server.ts`). Never commit API keys or the Shopify client secret; use environment variables (`SUPERTEXT_API_KEY`, `SHOPIFY_API_SECRET`) or the app's settings.

- **Auth header:** `Authorization: Supertext-Auth-Key <key>`. Strip a pasted `Supertext-Auth-Key ` prefix and always send exactly one.
- **Rate limit:** HTTP 429 `RATE_LIMIT_EXCEEDED`; retry up to 4 times (`Retry-After`, else 1/2/4/8 s with jitter). Translate languages one after the other.
- **Languages:** only the codes Supertext's `GET features` lists (the SDK's `Languages`, `vendor/supertext-sdk/v1`): bare sources (`en`); targets regional only for de/en/fr/it/pt (`de-CH`, `en-US`), `zh-Hans`/`zh-Hant`, `sr-Latn`/`sr-Cyrl`, `gsw-u-sd-chzh`/`chbe`, bare for the rest (`es`, `nl`, `sl`). **Defaults only where obvious:** the shop's mapping (Settings → Languages, a Polaris select per shop language with the SDK's `targetOptions()`, preselected with `suggestTarget`; `ShopSettings.languageCodes`), else an exact match, else the SDK default (de→de-DE, en→en-US, fr→fr-FR, it→it-IT, pt→pt-PT, zh-CN→zh-Hans, zh-TW→zh-Hant, es-ES→es, …), else the error `unsupported_language` (nothing sent; en-IE, de-LI, gsw, … need a mapping); formal/informal only where `Languages.supportsPoliteness()`. See `docs/DEVELOPER.md` → *Language codes*.
- **Rich text:** each element carrying `data-st-id` is translated on its own. Send a whole field (or paragraph) as **one** `data-st-id` element with formatting and links as inline tags; never one per formatted run.

**Translation review:** a checkbox per target language on Settings → Languages (`ShopSettings.reviewLocales`); those languages are translated through the review service (`SUPERTEXT_REVIEW_URL`, default `REVIEW_URL` in `app/supertext/client.server.ts`, `createClients().forReview()`); key check, reports and translation files never use it. See `docs/DEVELOPER.md` → *Supertext API protocol*.

**Commando Center:** version reports and the automatic API key check go through Plugin Health's `InstallationReporter` with the SDK's `checkApiKey()` (`app/reporting/reporting.ts`, wired in `app/reporting/index.server.ts`, state per shop in `ShopSettings.reporterState`; setting `versionReports`, `SUPERTEXT_VERSION_REPORTS=0` turns it off). Hosted app: site URL = the shop's myshopify.com address, no ping, no callback. See `docs/DEVELOPER.md` → *Commando Center*. Reporting must never break a save, a page or a translation; tests never reach the live center (`SUPERTEXT_REPORT_URL`).

## This repo

- End-to-end tests against the real Supertext API: `.github/workflows/e2e.yml` with `test/e2e/` (see "End-to-end tests" in `docs/DEVELOPER.md`): the Translate page's loader/action, the job runner, PostgreSQL and the SDK run for real, Shopify is the stand-in `test/e2e/shopify-stand-in.ts`. The key is only the GitHub secret `SUPERTEXT_API_KEY`, set by Remy; sessions don't use a live key. Behaviour changes need matching checks in `test/e2e/live.e2e.ts` (and the stand-in, if the app sends Shopify something new).

## Railway lessons

- Railway builds from a `git archive` snapshot: never `export-ignore` anything the Dockerfile copies.
- Railway's GitHub access: https://github.com/organizations/Supertext/settings/installations → Railway → Configure; after a change, reconnect the service's source once.
- Postgres is shared; this app uses its own database on it (`SHOPIFY_DB_NAME`, default `shopify_supertext`).
