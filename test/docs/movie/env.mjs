// The demo for the movies: the app's production build (npm run build) served in this process, with
// every request it makes to Shopify and Supertext answered in-process by the stand-ins
// (../stand-in.mjs: the sample shop, real translations of its products). Nothing reaches Shopify,
// Supertext or the Commando Center; any other outgoing request fails.
//
// Outside the Shopify admin, App Bridge has no admin frame to get session tokens from, so the browser
// gets a small stand-in for it (appBridgeStandin): `shopify.idToken()` and the session token on the
// app's own fetch requests, which is what the real App Bridge does inside the admin. The token is a
// real Shopify session token (HS256 with the demo's own app secret), so the app's authenticate.admin()
// checks it as it would in production. Polaris (cdn.shopify.com) is Shopify's real script.
//
// Needs DATABASE_URL: an empty PostgreSQL database for the demo (its tables are migrated and the demo
// shop's rows are reset on every start).
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createShopifyStandin, createSupertextStandin } from '../stand-in.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
export const SHOP = 'supertext-demo.myshopify.com';
const API_KEY = 'supertext-movie-client-id';
const API_SECRET = randomBytes(24).toString('hex');
const SCOPES = 'read_products,read_content,read_locales,read_translations,write_translations';

const b64url = (value) => Buffer.from(value).toString('base64url');
/** A Shopify session token (what App Bridge gets from the admin), valid for 4 hours. */
export function sessionToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: `https://${SHOP}/admin`, dest: `https://${SHOP}`, aud: API_KEY, sub: '1',
    exp: now + 4 * 3600, nbf: now - 60, iat: now - 60, jti: randomUUID(), sid: 'movie',
  }));
  const signature = createHmac('sha256', API_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

/** The URL Shopify's admin loads the app with (embedded, with a session token and the admin language). */
export const embeddedUrl = (appUrl, route = '/app', params = {}) => {
  const host = b64url(`admin.shopify.com/store/${SHOP.split('.')[0]}`);
  const query = new URLSearchParams({ embedded: '1', shop: SHOP, host, locale: 'en', id_token: sessionToken(), ...params });
  return `${appUrl}${route}?${query}`;
};

/** App Bridge for a page outside the admin: session tokens for the app's own requests (see above). */
export const appBridgeStandin = () => `(() => {
  const token = ${JSON.stringify(sessionToken())};
  const own = (input) => new URL(input instanceof Request ? input.url : String(input), location.href).origin === location.origin;
  const fetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    if (!own(input)) return fetch(input, init);
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('Authorization', 'Bearer ' + token);
    return fetch(input, { ...init, headers });
  };
  window.shopify = { idToken: async () => token, config: { apiKey: ${JSON.stringify(API_KEY)}, shop: ${JSON.stringify(SHOP)} },
    toast: { show() {} }, loading() {} };
})();`;

const realFetch = globalThis.fetch;

/**
 * A browser page for the demo: Shopify's own scripts and fonts from cdn.shopify.com (fetched by Node,
 * so HTTPS_PROXY applies with NODE_USE_ENV_PROXY=1), App Bridge replaced by appBridgeStandin(), and a
 * normal Chrome user agent (the app turns away bots, and Headless Chrome counts as one).
 */
export async function newDemoPage(browser, options = {}) {
  const probe = await browser.newPage();
  const userAgent = (await probe.evaluate(() => navigator.userAgent)).replace('HeadlessChrome', 'Chrome');
  await probe.close();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'en-US', userAgent, ...options });
  // Playwright tries the routes added last first. Nothing but the app and cdn.shopify.com is loaded.
  await page.route('**', (route) => (new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()));
  await page.route('https://cdn.shopify.com/**', async (route) => {
    const response = await realFetch(route.request().url()).catch(() => null);
    if (!response) return route.abort();
    const headers = Object.fromEntries([...response.headers].filter(([name]) => !/^(content-encoding|content-length|transfer-encoding)$/i.test(name)));
    return route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
  });
  await page.route('https://cdn.shopify.com/shopifycloud/app-bridge.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: appBridgeStandin() }));
  // Inside the admin, the app's navigation (s-app-nav) is shown in Shopify's sidebar, not in the
  // app's frame, and the frame sits on the admin's grey background.
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = 's-app-nav{display:none!important}html,body{background:#f1f1f1}body{padding-bottom:160px}';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
  });
  return page;
}

/**
 * Starts the demo on MOVIE_PORT (default 8796) and returns its URL and the stand-ins.
 * `statusDelayMs` holds every Supertext status answer, so the waiting state is visible.
 */
export async function startDemo({ statusDelayMs = 0 } = {}) {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to an empty PostgreSQL database for the demo.');
  const port = Number(process.env.MOVIE_PORT || 8796);
  const appUrl = `http://127.0.0.1:${port}`;
  Object.assign(process.env, {
    NODE_ENV: 'production',
    SHOPIFY_API_KEY: API_KEY,
    SHOPIFY_API_SECRET: API_SECRET,
    SHOPIFY_APP_URL: appUrl,
    SCOPES,
    SUPERTEXT_KEY_ENCRYPTION_KEY: randomBytes(48).toString('base64'),
    // The live addresses: requests to them are answered by the stand-in below.
    SUPERTEXT_API_ENDPOINT: 'https://api.supertext.com/v1/',
    SUPERTEXT_REVIEW_URL: 'https://localizationreview-production.up.railway.app/v1/',
  });
  delete process.env.SUPERTEXT_API_KEY;

  const shopify = createShopifyStandin();
  const supertext = createSupertextStandin({ statusDelayMs });
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const { hostname } = new URL(request.url);
    if (hostname === SHOP) return shopify.handle(request);
    if (hostname === 'api.supertext.com' || hostname === 'localizationreview-production.up.railway.app') return supertext.handle(request);
    if (hostname === '127.0.0.1' || hostname === 'localhost') return realFetch(input, init);
    // Version reports and anything else: refused (the app never lets reporting break a request).
    throw new TypeError(`The movie demo makes no requests to ${hostname}`);
  };

  const migrate = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: root, stdio: 'ignore' });
  if (migrate.status !== 0) throw new Error('prisma migrate deploy failed (DATABASE_URL?)');
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  await prisma.translationJob.deleteMany({ where: { shop: SHOP } });
  await prisma.shopSettings.deleteMany({ where: { shop: SHOP } });
  await prisma.session.deleteMany({ where: { shop: SHOP } });
  // The offline session Shopify's token exchange would have created when the app was installed.
  await prisma.session.create({
    data: {
      id: `offline_${SHOP}`, shop: SHOP, state: '', isOnline: false, scope: SCOPES,
      accessToken: 'shpat_movie', expires: new Date(Date.now() + 24 * 3600 * 1000),
      refreshToken: 'shprt_movie', refreshTokenExpires: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    },
  });
  await prisma.$disconnect();

  // Served like react-router-serve does it (assets, public/, then the app).
  const { default: express } = await import('express');
  const { createRequestHandler } = await import('@react-router/express');
  const build = await import(path.join(root, 'build/server/index.js'));
  const app = express();
  app.disable('x-powered-by');
  app.use('/assets', express.static(path.join(root, 'build/client/assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(path.join(root, 'build/client')));
  app.use(express.static(path.join(root, 'public')));
  app.all('*', createRequestHandler({ build, mode: 'production' }));
  const server = await new Promise((resolve) => { const s = app.listen(port, '127.0.0.1', () => resolve(s)); });
  return { appUrl, shopify, supertext, close: () => server.close() };
}
