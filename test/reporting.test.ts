import { describe, expect, it } from "vitest";
import { PLUGIN_NAME, ShopReporting, siteUrl, type ReporterState } from "../app/reporting/reporting";
import { SDK_VERSION } from "../vendor/supertext-sdk/index";

const KEY = "secret-key-123";
const SHOP = "demo-shop.myshopify.com";

/** A shop with settings and stored state, a fake Supertext (`GET features`) and a fake center. */
function setup(options: { keyStatus?: number; centerStatus?: number; versionReports?: boolean; apiKey?: string } = {}) {
  const stored = new Map<string, string>();
  const reports: Record<string, unknown>[] = [];
  const keyChecks: string[] = [];
  let now = Date.parse("2026-10-14T08:00:00Z");
  const settings = { apiKey: options.apiKey ?? KEY, versionReports: options.versionReports ?? true };
  const reporting = new ShopReporting({
    appVersion: "0.2.0",
    shopifyApiVersion: "2026-10",
    settings: async () => settings,
    loadState: async (shop) => stored.get(shop) ?? "",
    saveState: async (shop, state: ReporterState) => {
      stored.set(shop, JSON.stringify(state));
    },
    reporterOverrides: {
      reportUrl: "http://center.test/api/v1/report",
      now: () => now,
      runtime: { name: "Node.js", version: "22.12.0" },
      fetch: async (_url, init) => {
        reports.push(JSON.parse(String(init?.body)));
        return new Response('{"ok":true}', { status: options.centerStatus ?? 202 });
      },
    },
    clientOverrides: {
      baseUrl: "https://api.test/v1/",
      now: () => now,
      sleep: async () => undefined,
      fetch: async (url: string, init: RequestInit) => {
        keyChecks.push(`${init.method ?? "GET"} ${url} ${new Headers(init.headers).get("authorization")}`);
        const status = options.keyStatus ?? 200;
        return new Response(status === 200 ? "[]" : '{"error_code":"UNAUTHORIZED"}', { status });
      },
    },
  });
  return { reporting, stored, reports, keyChecks, settings, tick: (ms: number) => (now += ms) };
}

describe("Commando Center glue", () => {
  it("reports installed after the first save, with the shop as site and no callback", async () => {
    const { reporting, reports, keyChecks, stored } = setup();
    const result = await reporting.afterSettingsSaved(SHOP);
    expect(result?.check?.status).toBe("ok");
    expect(keyChecks).toHaveLength(1);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      schema: 1,
      event: "installed",
      site_url: "https://demo-shop.myshopify.com",
      plugin: { name: "Shopify-Supertext-Translation", version: "0.2.0" },
      system: { name: "Shopify", version: "2026-10" },
      api_key_configured: true,
      api_key_check: { status: "ok", http_status: 200 },
      sdk_version: SDK_VERSION,
    });
    expect(reports[0]).not.toHaveProperty("callback");
    expect(JSON.stringify(reports)).not.toContain(KEY);
    expect(stored.get(SHOP)).not.toContain(KEY);
    expect(PLUGIN_NAME).toBe("Shopify-Supertext-Translation");
    expect(siteUrl("Demo-Shop.myshopify.com")).toBe("https://demo-shop.myshopify.com");

    await reporting.afterSettingsSaved(SHOP);
    expect(reports[1]?.event).toBe("settings_saved");
  });

  it("reports nothing on requests until something changed, then upgraded", async () => {
    const { reporting, reports, keyChecks } = setup();
    await reporting.afterSettingsSaved(SHOP);
    reporting.onRequestInBackground(SHOP);
    reporting.onRequestInBackground(SHOP);
    await reporting.idle();
    expect(reports).toHaveLength(1);
    expect(keyChecks).toHaveLength(1); // same key: no new check

    const upgraded = setup();
    upgraded.stored.set(SHOP, JSON.stringify({ reportedVersions: "0.1.0|2026-07|22.12.0", reportedKeyStatus: "ok", lastFailureAt: null, keyCheck: null }));
    upgraded.reporting.onRequestInBackground(SHOP);
    await upgraded.reporting.idle();
    expect(upgraded.reports.map((r) => r.event)).toEqual(["upgraded"]);
  });

  it("marks the key invalid after a translation 401, reported once", async () => {
    const { reporting, reports } = setup();
    await reporting.afterSettingsSaved(SHOP);
    const result = await reporting.authenticationFailed(SHOP, 401);
    expect(result?.check?.status).toBe("invalid");
    await reporting.authenticationFailed(SHOP, 401);
    expect(reports.map((r) => r.event)).toEqual(["installed", "api_key_check"]);
    expect(reports[1]?.api_key_check).toMatchObject({ status: "invalid", http_status: 401 });
  });

  it("Test connection checks the key again and reports a changed status", async () => {
    const env = setup({ keyStatus: 401 });
    const first = await env.reporting.afterSettingsSaved(SHOP);
    expect(first?.check?.status).toBe("invalid");
    const tested = await env.reporting.testConnection(SHOP);
    expect(tested?.check?.status).toBe("invalid");
    expect(env.keyChecks).toHaveLength(2);
    expect(env.reports).toHaveLength(1);
    expect(await env.reporting.lastCheck(SHOP)).toMatchObject({ status: "invalid", httpStatus: 401 });
  });

  it("checks a missing key without calling Supertext", async () => {
    const { reporting, keyChecks, reports } = setup({ apiKey: "" });
    const result = await reporting.afterSettingsSaved(SHOP);
    expect(result?.check?.status).toBe("missing");
    expect(keyChecks).toHaveLength(0);
    expect(reports[0]).toMatchObject({ api_key_configured: false, api_key_check: { status: "missing" } });
  });

  it("sends nothing when the setting is off, but still checks the key", async () => {
    const { reporting, reports, keyChecks } = setup({ versionReports: false });
    const result = await reporting.afterSettingsSaved(SHOP);
    expect(result?.check?.status).toBe("ok");
    expect(keyChecks).toHaveLength(1);
    expect(reports).toHaveLength(0);
  });

  it("SUPERTEXT_VERSION_REPORTS=0 wins over the setting", () => {
    const before = process.env.SUPERTEXT_VERSION_REPORTS;
    process.env.SUPERTEXT_VERSION_REPORTS = "0";
    try {
      expect(ShopReporting.enabled(true)).toBe(false);
    } finally {
      process.env.SUPERTEXT_VERSION_REPORTS = before;
    }
    expect(ShopReporting.enabled(true)).toBe(true);
    expect(ShopReporting.enabled(false)).toBe(false);
  });

  it("never throws: a failing center or store only skips the report, and failures wait an hour", async () => {
    const env = setup({ centerStatus: 503 });
    const result = await env.reporting.afterSettingsSaved(SHOP);
    expect(result?.sent).toBe(false);
    env.reporting.onRequestInBackground(SHOP);
    await env.reporting.idle();
    expect(env.reports).toHaveLength(1); // no second try within the hour

    const broken = new ShopReporting({
      appVersion: "0.2.0",
      shopifyApiVersion: "2026-10",
      settings: async () => {
        throw new Error("database down");
      },
      loadState: async () => "",
      saveState: async () => undefined,
    });
    await expect(broken.afterSettingsSaved(SHOP)).resolves.toBeNull();
    broken.onRequestInBackground(SHOP);
    await broken.idle();
  });

  it("Send configuration: the language mapping in one extensions report (no plugins), nothing when off", async () => {
    const languages = [
      { code: "en", supertext: "en" },
      { code: "de", supertext: "de-DE" },
      { code: "en-IE", supertext: null },
    ];
    const { reporting, reports } = setup();
    const result = await reporting.sendConfiguration(SHOP, languages);
    expect(result).toMatchObject({ event: "extensions", sent: true });
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ event: "extensions", extensions: [], languages, site_url: "https://demo-shop.myshopify.com" });
    expect(JSON.stringify(reports[0])).not.toContain(KEY);

    const off = setup({ versionReports: false });
    expect(await off.reporting.sendConfiguration(SHOP, languages)).toBeNull();
    expect(off.reports).toHaveLength(0);
  });
});
