// Records the install and configuration movie (a narrated MP4, not committed) with the shared Supertext movie
// kit (movie/movie-kit.mjs) and the same demo as the demo movie (movie/env.mjs). The app is hosted, so there is
// nothing to install on a server: installing it is Shopify's own screens (one spoken line, not shown), then the
// app's Settings. See docs/DEVELOPER.md → Demo movie.
//
//   npm run build && DATABASE_URL=postgresql://… npm run docs:movie:install
//
// Same variables as movie.mjs; MOVIE_OUT default test/docs/movie/out/Shopify-Supertext-Translation-install.mp4.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { MovieKit } from './movie/movie-kit.mjs';
import { embeddedUrl, newDemoPage, startDemo } from './movie/env.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const mp4 = process.env.MOVIE_OUT ?? here('movie/out/Shopify-Supertext-Translation-install.mp4');
const workDir = mkdtempSync(join(tmpdir(), 'shopify-install-movie-'));

const demo = await startDemo();
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await newDemoPage(browser);
page.setDefaultTimeout(60_000);

// The app as it first opens after the install: no API key yet.
await page.goto(embeddedUrl(demo.appUrl));
await page.locator('input[name="resource"]').first().waitFor();
await page.waitForTimeout(1200);

const scrollTo = async (locator, block = 'start') => {
  await locator.evaluate((el, block) => el.scrollIntoView({ block, behavior: 'smooth' }), block);
  await page.waitForTimeout(1300);
};

const kit = await MovieKit.start(page, { workDir, assets: here('movie/assets') });

// 1. Install (Shopify's screens) and the first start.
await kit.say('Supertext Translation is a Shopify app. Install it from the Shopify App Store and approve its access: it then opens in your Shopify admin.', {
  caption: 'Install the app in Shopify: it opens in your admin',
  during: async () => {
    await kit.hold(1500);
    await kit.moveTo(page.locator('s-banner[tone="warning"] div.icon'));
  },
});

// 2. Settings.
const settingsLink = page.locator('s-page s-link[href="/app/settings"]').first();
await kit.say('Open the app’s settings.', {
  caption: 'Open <b>Settings</b>',
  during: async () => {
    await kit.click(settingsLink);
    await page.locator('#apiKey').waitFor();
    await page.waitForTimeout(600);
  },
});

// 3. The API key.
await kit.say('Paste your Supertext API key.', {
  caption: 'Paste your <b>Supertext API key</b>',
  during: () => kit.type(page.locator('#apiKey'), 'st-demo-0000-0000-0000'),
});
await kit.say('Generate it at supertext.com, Integrations, API. No account yet? Create one at supertext.com.', {
  caption: 'Generate your API key at <b>supertext.com → Integrations → API</b>. No account yet? Create one at supertext.com.',
  during: () => kit.moveTo(page.locator('s-section').first().locator('a').last()),
});

// 4. Languages: one Supertext code per shop language.
// The visible box of a Polaris select (in its shadow DOM; the s-select element itself has no box).
const box = (name) => page.locator(`s-select[name="${name}"] .select`);
const german = box('code:de');
await kit.say('Under Languages, every language of your shop gets a Supertext code. The languages themselves come from Shopify, under Settings, Languages.', {
  caption: '<b>Languages</b>: your shop’s languages, from Shopify’s <b>Settings → Languages</b>',
  during: async () => {
    await scrollTo(box('code:en'), 'center');
    await kit.moveTo(box('code:en'));
  },
});
await kit.say('For German, the app suggests German, Germany. For a Swiss shop, choose Swiss German instead.', {
  caption: 'German → <b>Swiss German (de-CH)</b>',
  during: async () => {
    await kit.click(german);
    await page.keyboard.press('Escape');
    await page.locator('s-select[name="code:de"] select').selectOption('de-CH');
    await page.waitForTimeout(700);
  },
});
await kit.say('Translation review can be turned on for each language. Leave it off for now.', {
  caption: '<b>Translation review</b>: optional, per language',
  during: () => kit.moveTo(page.getByText('Translation review', { exact: true }).first()),
});

// 5. Save: the app checks the key.
const save = page.locator('button[value="save"]');
await kit.say('Click Save. The app checks the API key right away: the connection to Supertext works.', {
  caption: 'Click <b>Save</b>: the API key works',
  during: async () => {
    await scrollTo(save, 'center');
    await kit.click(save);
    await page.locator('s-banner[tone="success"]').waitFor();
    await scrollTo(page.locator('s-page'), 'start');
    await kit.moveTo(page.locator('s-banner[tone="success"] div.icon'));
  },
});
await kit.say('German is now translated into Swiss German.', {
  caption: 'German → <b>de-CH</b> is saved',
  during: async () => {
    await scrollTo(german, 'center');
    await kit.moveTo(german);
  },
});
if (!(await page.getByText('Sent to Supertext as de-CH.').isVisible())) {
  throw new Error('German was not saved as de-CH');
}

// 6. Where editors translate (the app's Translate page, opened from Shopify's sidebar: the page load is cut).
kit.pause();
await page.goto(embeddedUrl(demo.appUrl));
await page.locator('input[name="resource"]').first().waitFor();
await page.waitForTimeout(800);
kit.resume();
await kit.say('Done. Editors now translate products, collections, pages and blog posts on the app’s Translate page.', {
  caption: 'Editors translate on the <b>Translate</b> page',
  during: () => kit.moveTo(page.locator('button[type="submit"]').filter({ hasText: 'with Supertext' })),
});
await kit.caption('');
await kit.hold(600);

await kit.finish(mp4, { system: 'Shopify', repo: 'Shopify-Supertext-Translation', kind: 'install' });
await browser.close();
demo.close();
rmSync(workDir, { recursive: true, force: true });
console.log(`Saved ${mp4}`);
process.exit(0);
