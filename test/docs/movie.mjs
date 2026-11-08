// Records the README's demo movie (docs/images/demo.gif, plus a narrated MP4 that isn't committed) with the
// shared Supertext movie kit (movie/movie-kit.mjs): the app's Translate page, as the Shopify admin shows it,
// against the stand-in Shopify Admin API and Supertext API (movie/env.mjs, stand-in.mjs).
// See docs/DEVELOPER.md → Demo movie.
//
//   npm run build && DATABASE_URL=postgresql://… npm run docs:movie
//
// DATABASE_URL: an empty PostgreSQL database for the demo. MOVIE_OUT: where the MP4 goes (default
// test/docs/movie/out/Shopify-Supertext-Translation.mp4, git-ignored). MOVIE_PORT: the app's port (default
// 8796). CHROME=/path/to/chrome, else Playwright's own Chromium. Behind a proxy: NODE_USE_ENV_PROXY=1.
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { MovieKit } from './movie/movie-kit.mjs';
import { embeddedUrl, newDemoPage, startDemo } from './movie/env.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const mp4 = process.env.MOVIE_OUT ?? here('movie/out/Shopify-Supertext-Translation.mp4');
const gif = here('../../docs/images/demo.gif');
const workDir = mkdtempSync(join(tmpdir(), 'shopify-movie-'));
mkdirSync(dirname(gif), { recursive: true });

// The Supertext stand-in holds each status answer, so the waiting state is visible (the movie cuts it).
const demo = await startDemo({ statusDelayMs: 5000 });
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await newDemoPage(browser);
page.setDefaultTimeout(60_000);

// Set up (not recorded): a fake API key, saved in Settings.
await page.goto(embeddedUrl(demo.appUrl, '/app/settings'));
await page.fill('#apiKey', 'st-demo-0000-0000-0000');
await page.click('button[value="save"]');
await page.locator('s-banner[tone="success"]').waitFor();
await page.goto(embeddedUrl(demo.appUrl));
await page.locator('input[name="resource"]').first().waitFor();
await page.waitForTimeout(1200);

const scrollTo = async (locator, block = 'start') => {
  await locator.evaluate((el, block) => el.scrollIntoView({ block, behavior: 'smooth' }), block);
  await page.waitForTimeout(1300);
};
const product = page.locator('label').filter({ has: page.locator('input[name="resource"][value="gid://shopify/Product/8123456789"]') });

const kit = await MovieKit.start(page, { workDir, assets: here('movie/assets') });

// 1. The product in English.
await kit.say('Here is the Supertext app in the Shopify admin. Your products are in English.', {
  caption: 'A product in English',
  during: () => kit.moveTo(product.locator('input')),
});

// 2. Pick the product and the language.
await kit.say('Tick the product you want to translate: the linen apron.', {
  caption: 'Pick the product: <b>Linen apron</b>',
  during: () => kit.click(product.locator('input')),
});
await kit.say('Keep German ticked, and untick French for now.', {
  caption: 'Choose the language: <b>German</b>',
  during: async () => {
    await scrollTo(page.locator('input[name="locale"][value="de"]'), 'center');
    await kit.click(page.locator('input[name="locale"][value="fr"]'));
    await kit.moveTo(page.locator('input[name="locale"][value="de"]'));
  },
});

// 3. Translate.
const button = page.locator('button[type="submit"]').filter({ hasText: 'with Supertext' });
await kit.say('Then click Translate with Supertext.', {
  caption: 'Click <b>Translate 1 with Supertext</b>',
  during: () => kit.click(button),
});

// 4. Waiting.
// Polaris elements (s-section, s-box, s-paragraph) have no box of their own: scroll to the job's text.
const running = page.locator('s-box strong').filter({ hasText: 'Translating…' });
await kit.say('Supertext translates the content.', {
  caption: 'Supertext translates the content…',
  during: async () => {
    await running.waitFor();
    await scrollTo(running, 'center');
  },
});
// Keep the running job on screen a moment (frames arrive late on a busy machine), then cut the wait.
await kit.hold(400);
kit.pause();
await page.locator('s-box strong').filter({ hasText: /^Done$/ }).waitFor({ timeout: 60_000 });
await page.waitForTimeout(600);
kit.resume();

// 5. The result: the German translation in Shopify.
await kit.say('A few seconds later, the product is translated: title, description and SEO text, saved in Shopify as the German version.', {
  caption: 'Done: the product is translated into <b>German</b>',
  during: () => kit.moveTo(page.locator('s-box strong').filter({ hasText: /^Done$/ })),
});
await kit.say("Review it in Shopify's Translate and Adapt app, then publish German in your store.", {
  caption: 'Review it in <b>Translate & Adapt</b> and publish it',
});
// Let the caption fade out on screen before the outro (else the last picture is held too long).
await kit.caption('');
await kit.hold(600);

// The stand-in must now hold the product's German texts (the movie shows the job's result only).
const german = demo.shopify.translations.get('gid://shopify/Product/8123456789')?.get('de');
if (german?.get('title') !== 'Leinenschürze') throw new Error('the product was not translated into German');

await kit.finish(mp4, { system: 'Shopify', repo: 'Shopify-Supertext-Translation', gif });
await browser.close();
demo.close();
rmSync(workDir, { recursive: true, force: true });
console.log(`Saved ${mp4} and ${gif} (${(statSync(gif).size / 1e6).toFixed(2)} MB)`);
process.exit(0);
