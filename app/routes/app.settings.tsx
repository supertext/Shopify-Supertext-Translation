import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  effectiveApiKey,
  getSettings,
  removeApiKey,
  saveSettings,
  toPoliteness,
} from "../settings.server";
import { appVersion, releaseUrl } from "../version.server";
import { reviewUrl } from "../supertext/client.server";
import { EncryptionKeyMissing } from "../crypto.server";
import { shopLocales } from "../translation/shopify.server";
import {
  canonicalCode,
  resolvedSource,
  resolvedTarget,
  suggestTarget,
  supportsPoliteness,
  targetName,
  targetOptions,
} from "../translation/language-codes";
import { localeFromRequest } from "../i18n";
import { reporting, ShopReporting, type ApiKeyCheck } from "../reporting/index.server";
import type { MessageKey, MessageParams } from "../i18n";
import { ApiKeyHelp, rich, useI18n } from "../i18n/react";

/** The key check as the page shows it (no fingerprint). */
type KeyCheck = Pick<ApiKeyCheck, "status" | "checkedAt" | "httpStatus">;

const keyCheckView = (check: ApiKeyCheck | null | undefined): KeyCheck | null =>
  check ? { status: check.status, checkedAt: check.checkedAt, httpStatus: check.httpStatus } : null;

/** What the action reports: a UI message key, and the API key check where one ran. */
type Result = { ok: boolean; key: MessageKey; params?: MessageParams; check?: KeyCheck | null };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [settings, locales, check] = await Promise.all([
    getSettings(session.shop),
    shopLocales(admin),
    reporting.lastCheck(session.shop),
  ]);
  // Notices app/Shopify updates and a key from the environment; never delays the page.
  reporting.onRequestInBackground(session.shop);
  const version = appVersion();
  const uiLocale = localeFromRequest(request);
  const options = targetOptions();
  const isOption = (code: string) => options.some((o) => o.code === code);
  return {
    languages: locales.map((l) => {
      const code = l.primary
        ? resolvedSource(l.locale, settings.languageCodes)
        : resolvedTarget(l.locale, settings.languageCodes);
      const saved = settings.languageCodes[l.locale] ?? "";
      // The combo box: the saved code; a saved bare source code from before 0.4.0
      // (primary "en") shows as its target (en-US), which is sent as "en" again;
      // else what the SDK suggests for the locale; else "— choose —".
      const selected = saved
        ? isOption(saved)
          ? saved
          : (suggestTarget(saved) ?? saved)
        : (suggestTarget(l.locale) ?? "");
      return {
        locale: l.locale,
        name: l.name,
        primary: l.primary,
        selected,
        // A saved code the list doesn't offer stays selectable, so nothing is lost.
        extra: selected && !isOption(selected) ? selected : null,
        code,
        // Translation review applies to translations into a language, so not to the default language.
        review: !l.primary && settings.reviewLocales.includes(l.locale),
        noPoliteness: !l.primary && code !== null && !supportsPoliteness(code),
      };
    }),
    targets: options.map((l) => ({ code: l.code, name: targetName(l, uiLocale) })),
    // SUPERTEXT_REVIEW_URL="" on the server: review is off for every language.
    reviewOffOnServer: reviewUrl() === "",
    hasShopKey: settings.apiKey !== "" || settings.apiKeyUnreadable,
    apiKeyUnreadable: settings.apiKeyUnreadable,
    usesEnvironmentKey: settings.apiKey === "" && effectiveApiKey(settings) !== "",
    politeness: settings.politeness,
    versionReports: settings.versionReports,
    versionReportsOffOnServer: !ShopReporting.enabled(true),
    keyCheck: keyCheckView(check),
    version,
    releaseUrl: releaseUrl(version),
  };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<Result> => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "test") {
    const result = await reporting.testConnection(shop);
    return { ok: result?.check?.status === "ok", key: "keycheck.heading", check: keyCheckView(result?.check) };
  }

  if (intent === "remove") {
    await removeApiKey(shop);
    const result = await reporting.afterSettingsSaved(shop);
    return { ok: true, key: "settings.removed", check: keyCheckView(result?.check) };
  }

  // Language mapping from the combo boxes: only codes Supertext offers, in its own
  // spelling; "— choose —" (empty) = not mapped (the SDK default, if any, applies).
  const primaryLocale = String(form.get("primaryLocale") ?? "");
  const languageCodes: Record<string, string> = {};
  const invalid: string[] = [];
  // Translation review per target language (checkbox "review:<locale>"; never the default language).
  const reviewLocales: string[] = [];
  for (const [name, value] of form.entries()) {
    if (name.startsWith("review:")) {
      const locale = name.slice(7);
      if (value === "on" && locale && locale !== primaryLocale) reviewLocales.push(locale);
      continue;
    }
    if (!name.startsWith("code:")) continue;
    const locale = name.slice(5);
    const typed = String(value).trim();
    if (!typed) continue;
    const code = canonicalCode(typed, locale === primaryLocale);
    if (!code) {
      invalid.push(`${locale}: "${typed}"`);
      continue;
    }
    languageCodes[locale] = code;
  }

  try {
    await saveSettings(shop, {
      apiKey: String(form.get("apiKey") ?? ""),
      politeness: toPoliteness(form.get("politeness")),
      languageCodes,
      // With review off on the server the checkboxes are disabled (not submitted): keep the saved choice.
      reviewLocales: reviewUrl() === "" ? undefined : reviewLocales,
      versionReports: form.get("versionReports") === "on",
    });
  } catch (error) {
    if (error instanceof EncryptionKeyMissing) {
      console.error(`[supertext] ${error.message}`);
      return { ok: false, key: "settings.encryptionMissing" };
    }
    throw error;
  }
  // The automatic API key check, and the settings_saved report (never blocks the save).
  const result = await reporting.afterSettingsSaved(shop);
  const check = keyCheckView(result?.check);
  if (invalid.length) {
    return { ok: false, key: "settings.invalidCodes", params: { codes: invalid.join(", ") }, check };
  }
  return { ok: true, key: "settings.saved", check };
};

/** The key check's message with both Supertext links (new tab). */
function KeyCheckMessage({ check }: { check: KeyCheck }) {
  const i18n = useI18n();
  const link = (href: string, key: MessageKey) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {i18n.t(key)}
    </a>
  );
  return (
    <>
      {rich(i18n, `keycheck.${check.status}` as MessageKey, {
        signup: link("https://www.supertext.com/person/en/account/signin", "keycheck.signupLink"),
        apiKey: link("https://www.supertext.com/en/integrations/api", "keycheck.apiKeyLink"),
      }, { status: check.httpStatus ?? "–" })}
    </>
  );
}

export default function Settings() {
  const i18n = useI18n();
  const { t } = i18n;
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state === "submitting";

  return (
    <s-page heading={t("settings.heading")}>
      {data.apiKeyUnreadable && (
        <s-banner tone="warning" heading={t("settings.keyUnreadable.heading")}>
          <s-paragraph>{t("settings.keyUnreadable.text")}</s-paragraph>
        </s-banner>
      )}
      {result && (
        <s-banner
          tone={
            !result.ok && result.key !== "keycheck.heading"
              ? "critical"
              : result.check && result.check.status !== "ok"
                ? "warning"
                : "success"
          }
        >
          {result.key !== "keycheck.heading" && (
            <s-paragraph>{t(result.key, result.params)}</s-paragraph>
          )}
          {result.check && (
            <s-paragraph>
              <KeyCheckMessage check={result.check} />
            </s-paragraph>
          )}
        </s-banner>
      )}

      <Form method="post">
        <s-section heading={t("settings.apiKey.heading")}>
          <label htmlFor="apiKey" style={{ display: "block", fontWeight: 600 }}>
            {t("settings.apiKey.label")}
          </label>
          <input
            id="apiKey"
            name="apiKey"
            type="password"
            autoComplete="off"
            placeholder={
              data.hasShopKey
                ? t("settings.apiKey.placeholderSaved")
                : data.usesEnvironmentKey
                  ? t("settings.apiKey.placeholderServer")
                  : t("settings.apiKey.placeholder")
            }
            style={inputStyle}
          />
          <s-paragraph>
            <ApiKeyHelp />
          </s-paragraph>
        </s-section>

        <s-section heading={t("settings.languages.heading")}>
          <s-paragraph>{t("settings.languages.text")}</s-paragraph>
          {data.languages.map((l) => (
            <div key={l.locale} style={{ margin: "12px 0", maxWidth: 480 }}>
              {l.primary && <input type="hidden" name="primaryLocale" value={l.locale} />}
              <s-select
                id={`code-${l.locale}`}
                name={`code:${l.locale}`}
                label={`${l.name} (${l.locale})${l.primary ? t("settings.languages.default") : ""}`}
                value={l.selected}
              >
                <s-option value="">{t("settings.languages.choose")}</s-option>
                {l.extra && <s-option value={l.extra}>{l.extra}</s-option>}
                {data.targets.map((o) => (
                  <s-option key={o.code} value={o.code}>
                    {`${o.name} (${o.code})`}
                  </s-option>
                ))}
              </s-select>
              <div style={{ fontSize: "0.9em", marginTop: 4, color: l.code === null ? "#8e1f0b" : "#6d7175" }}>
                {l.code === null
                  ? t("settings.languages.unmapped")
                  : t("settings.languages.sentAs", { code: l.code })}
                {l.noPoliteness && ` ${t("settings.languages.noPoliteness")}`}
              </div>
              {!l.primary && (
                <div style={{ marginTop: 8 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      name={`review:${l.locale}`}
                      defaultChecked={l.review}
                      disabled={data.reviewOffOnServer}
                    />
                    {t("settings.languages.review")}
                  </label>
                  <div style={{ fontSize: "0.9em", marginTop: 4, color: "#6d7175" }}>
                    {t("settings.languages.reviewHelp")}
                    {data.reviewOffOnServer && ` ${t("settings.languages.reviewOffOnServer")}`}
                  </div>
                </div>
              )}
            </div>
          ))}
        </s-section>

        <s-section heading={t("settings.style.heading")}>
          <label htmlFor="politeness" style={{ display: "block", fontWeight: 600 }}>
            {t("settings.style.label")}
          </label>
          <select
            id="politeness"
            name="politeness"
            defaultValue={data.politeness}
            style={inputStyle}
          >
            <option value="default">{t("settings.style.default")}</option>
            <option value="more">{t("settings.style.more")}</option>
            <option value="less">{t("settings.style.less")}</option>
          </select>
        </s-section>

        <s-section heading={t("settings.reports.heading")}>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontWeight: 600 }}>
            <input
              type="checkbox"
              name="versionReports"
              defaultChecked={data.versionReports}
              disabled={data.versionReportsOffOnServer}
            />
            {t("settings.reports.label")}
          </label>
          <s-paragraph>{t("settings.reports.help")}</s-paragraph>
          {data.versionReportsOffOnServer && (
            <s-paragraph>{t("settings.reports.offOnServer")}</s-paragraph>
          )}
        </s-section>

        <s-section>
          <s-stack direction="inline" gap="base">
            <button type="submit" name="intent" value="save" disabled={busy} style={primary}>
              {t("settings.save")}
            </button>
            {data.hasShopKey && (
              <button type="submit" name="intent" value="remove" disabled={busy} style={secondary}>
                {t("settings.removeKey")}
              </button>
            )}
          </s-stack>
        </s-section>
      </Form>

      <s-section slot="aside" heading={t("keycheck.heading")}>
        <s-paragraph>
          {data.keyCheck ? <KeyCheckMessage check={data.keyCheck} /> : t("keycheck.none")}
        </s-paragraph>
        {data.keyCheck && (
          <s-paragraph>
            <span suppressHydrationWarning>
              {t("keycheck.checkedAt", {
                time: new Date(data.keyCheck.checkedAt).toLocaleString(i18n.locale),
              })}
            </span>
          </s-paragraph>
        )}
        <Form method="post">
          <button type="submit" name="intent" value="test" disabled={busy} style={secondary}>
            {t("settings.test")}
          </button>
        </Form>
      </s-section>

      <s-section slot="aside" heading={t("settings.about.heading")}>
        <s-paragraph>
          Supertext Translation{" "}
          {data.version ? (
            data.releaseUrl ? (
              <a href={data.releaseUrl} target="_blank" rel="noopener noreferrer">
                {t("settings.about.version", { version: data.version })}
              </a>
            ) : (
              t("settings.about.version", { version: data.version })
            )
          ) : (
            t("settings.about.versionUnknown")
          )}
        </s-paragraph>
        <s-paragraph>{t("settings.about.text")}</s-paragraph>
      </s-section>
    </s-page>
  );
}

const inputStyle = {
  display: "block",
  width: "100%",
  maxWidth: 480,
  boxSizing: "border-box",
  margin: "6px 0 10px",
  padding: "8px 10px",
  border: "1px solid #8a8a8a",
  borderRadius: 8,
  font: "inherit",
} as const;

const primary = {
  background: "#303030",
  color: "#fff",
  border: 0,
  borderRadius: 8,
  padding: "8px 14px",
  font: "inherit",
  fontWeight: 600,
  cursor: "pointer",
} as const;

const secondary = {
  ...primary,
  background: "#fff",
  color: "#303030",
  border: "1px solid #8a8a8a",
} as const;

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
