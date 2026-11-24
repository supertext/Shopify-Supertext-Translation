/**
 * Version reports to the Supertext Commando Center and the automatic API key
 * check (Commando-Center-Supertext-Translation → docs/DEVELOPER.md → Report
 * protocol). The protocol is Supertext Plugin Health's (`InstallationReporter`,
 * vendor/supertext-plugin-health); the key check is the Supertext SDK's
 * (`checkApiKey()`). This file only gives them what the app knows about one
 * shop: its address, the app and Shopify API versions, the key in use and a
 * place for the reporter's state (`ShopSettings.reporterState`, see
 * index.server.ts).
 *
 * A hosted app: no ping endpoint, no callback URL. Nothing here ever throws
 * into a request, a save or a translation, and the API key is never logged.
 *
 * No database or Shopify imports, so the tests run it with fakes.
 */
import {
  InstallationReporter,
  reporterState,
  reportsEnabled,
  type KeyCheck,
  type KeyChecker,
  type LanguageMapping,
  type ReporterOptions,
  type ReporterResult,
  type ReporterState,
} from "../../vendor/supertext-plugin-health/index";
import { SDK_VERSION } from "../../vendor/supertext-sdk/index";
import { apiKeyFingerprint, SupertextClient, type SupertextClientOptions } from "../../vendor/supertext-sdk/v1/index";

/** The latest key check as Plugin Health stores it (the fields of the SDK's ApiKeyCheck). */
export type ApiKeyCheck = KeyCheck;
export type { ReporterResult, ReporterState };

/** The GitHub repository name: the center reads the latest release from it. */
export const PLUGIN_NAME = "Shopify-Supertext-Translation";

export interface ShopReportingDeps {
  /** The app version (package.json). */
  appVersion: string;
  /** The Shopify Admin API version the app uses (e.g. "2026-10"). */
  shopifyApiVersion: string;
  /** The shop's key in use and its "Send version information to Supertext" setting. */
  settings(shop: string): Promise<{ apiKey: string; versionReports: boolean }>;
  /** The stored reporter state (JSON text or anything; broken values count as empty). */
  loadState(shop: string): Promise<unknown>;
  saveState(shop: string, state: ReporterState): Promise<void>;
  /** The stand-in API for the key check (SUPERTEXT_API_ENDPOINT); the live API otherwise. */
  supertextBaseUrl?: string;
  log?: (message: string) => void;
  /** Tests: fetch, report URL and clock for the Plugin Health reporter. */
  reporterOverrides?: Partial<ReporterOptions>;
  /** Tests: options for the SDK client that checks the key (fetch, base URL, clock). */
  clientOverrides?: SupertextClientOptions;
}

type Action =
  | { kind: "afterSettingsSaved" }
  | { kind: "testConnection" }
  | { kind: "onRequest" }
  | { kind: "authenticationFailed"; httpStatus: number }
  | { kind: "sendConfiguration"; languages: LanguageMapping[] };

/** The shop's address as the center identifies the installation: https://<shop>.myshopify.com. */
export const siteUrl = (shop: string): string => `https://${shop.trim().toLowerCase()}`;

export class ShopReporting {
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly background = new Set<Promise<unknown>>();

  constructor(private readonly deps: ShopReportingDeps) {}

  /** Whether reports are on for these settings (SUPERTEXT_VERSION_REPORTS wins). */
  static enabled(setting: boolean): boolean {
    return reportsEnabled(setting);
  }

  /** After a settings save: checks the key, reports `installed` or `settings_saved`. */
  afterSettingsSaved(shop: string): Promise<ReporterResult | null> {
    return this.run(shop, { kind: "afterSettingsSaved" });
  }

  /** "Test connection": checks the key, reports a changed status. */
  testConnection(shop: string): Promise<ReporterResult | null> {
    return this.run(shop, { kind: "testConnection" });
  }

  /** A translation was rejected with 401/403: the key is invalid (reported once). */
  authenticationFailed(shop: string, httpStatus = 401): Promise<ReporterResult | null> {
    return this.run(shop, { kind: "authenticationFailed", httpStatus });
  }

  /**
   * "Send configuration to Supertext" (Settings): the shop's language mapping in one `extensions`
   * report (a hosted app has no plugins of its own to list, so the list is empty), sent now (also
   * within the hour after a failed report). Null while version reports are off. Never throws.
   */
  sendConfiguration(shop: string, languages: LanguageMapping[]): Promise<ReporterResult | null> {
    return this.run(shop, { kind: "sendConfiguration", languages });
  }

  /** On the app's admin pages and after jobs: in the background, never awaited by the page. */
  onRequestInBackground(shop: string): void {
    const task = this.run(shop, { kind: "onRequest" });
    this.background.add(task);
    void task.finally(() => this.background.delete(task));
  }

  /** The latest key check of a shop, for the settings page (null if none yet). */
  async lastCheck(shop: string): Promise<ApiKeyCheck | null> {
    try {
      return reporterState(await this.deps.loadState(shop)).keyCheck;
    } catch {
      return null;
    }
  }

  /** Tests: waits for background runs. */
  async idle(): Promise<void> {
    while (this.background.size) await Promise.all([...this.background]);
  }

  reporter(enabled: boolean, shop: string, languages?: LanguageMapping[]): InstallationReporter {
    return new InstallationReporter({
      enabled,
      siteUrl: siteUrl(shop),
      plugin: { name: PLUGIN_NAME, version: this.deps.appVersion },
      system: { name: "Shopify", version: this.deps.shopifyApiVersion },
      sdkVersion: SDK_VERSION,
      callbackUrl: null,
      keyChecker: this.keyChecker(),
      ...(languages ? { languages: () => languages } : {}),
      ...this.deps.reporterOverrides,
    });
  }

  /** The SDK's key check (`GET features`), against the stand-in API if one is configured. */
  keyChecker(): KeyChecker {
    const options: SupertextClientOptions = {
      ...(this.deps.supertextBaseUrl ? { baseUrl: this.deps.supertextBaseUrl } : {}),
      userAgent: `${PLUGIN_NAME}/${this.deps.appVersion}`,
      ...this.deps.clientOverrides,
    };
    return { check: (key) => new SupertextClient(key, options).checkApiKey(), fingerprint: apiKeyFingerprint };
  }

  /** One action per shop at a time, so two requests don't report twice. Never throws. */
  private run(shop: string, action: Action): Promise<ReporterResult | null> {
    const previous = this.queues.get(shop) ?? Promise.resolve();
    const task = previous.then(() => this.execute(shop, action));
    const settled = task.catch(() => null);
    this.queues.set(shop, settled);
    void settled.finally(() => {
      if (this.queues.get(shop) === settled) this.queues.delete(shop);
    });
    return settled;
  }

  private async execute(shop: string, action: Action): Promise<ReporterResult | null> {
    try {
      const settings = await this.deps.settings(shop);
      const enabled = ShopReporting.enabled(settings.versionReports);
      if (action.kind === "sendConfiguration" && !enabled) return null;
      const reporter = this.reporter(enabled, shop, action.kind === "sendConfiguration" ? action.languages : undefined);
      const stored = await this.deps.loadState(shop);
      const state = reporterState(stored);
      const key = settings.apiKey;
      let result: ReporterResult;
      switch (action.kind) {
        case "afterSettingsSaved":
          result = await reporter.afterSettingsSaved(state, key);
          break;
        case "testConnection":
          result = await reporter.testConnection(state, key);
          break;
        case "authenticationFailed":
          result = await reporter.authenticationFailed(state, key, action.httpStatus);
          break;
        case "sendConfiguration":
          result = await reporter.sendExtensions(state, []);
          break;
        default:
          result = await reporter.onRequest(state, key);
      }
      if (JSON.stringify(result.state) !== JSON.stringify(state) || typeof stored !== "string" || stored === "") {
        await this.deps.saveState(shop, result.state);
      }
      return result;
    } catch (error) {
      this.deps.log?.(`[supertext] version report for ${shop} skipped: ${(error as Error).message}`);
      return null;
    }
  }
}
