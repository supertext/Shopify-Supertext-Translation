import { useState, type FormEvent } from "react";
import type { ErrorInfo } from "../i18n";
import { useI18n } from "../i18n/react";

/** What /app/files/import returns per job (see ImportSummary in app/translation/files.server.ts). */
interface Summary {
  reference: string;
  title: string | null;
  locale: string | null;
  counts: Record<"ok" | "source_changed" | "untranslated" | "invalid_markup" | "missing", number>;
  written: number;
  skippedChanged: number;
  kept: number;
  error?: ErrorInfo;
}

interface Target {
  locale: string;
  name: string;
  code: string | null;
}

/**
 * "Export for translation" (the item selected above, as XLIFF or HTML) and
 * "Import translation" (upload, then a summary per item and language). Both talk
 * to resource routes with fetch, which App Bridge authenticates with the session token.
 */
export function TranslationFiles({ selected, targets }: { selected: string[]; targets: Target[] }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [format, setFormat] = useState<"xliff" | "html">("xliff");
  const [locales, setLocales] = useState<string[]>(() => targets.map((l) => l.locale));
  const [htmlLocale, setHtmlLocale] = useState<string>(targets[0]?.locale ?? "");
  const [exportError, setExportError] = useState<ErrorInfo | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<ErrorInfo | null>(null);
  const [summaries, setSummaries] = useState<Summary[] | null>(null);

  const chosen = format === "html" ? (htmlLocale ? [htmlLocale] : []) : locales;

  async function download() {
    setExportError(null);
    setExporting(true);
    try {
      const body = new FormData();
      for (const id of selected) body.append("resource", id);
      for (const locale of chosen) body.append("locale", locale);
      body.append("format", format);
      const response = await fetch("/app/files/export", { method: "POST", body });
      if (!response.ok) {
        setExportError(await errorOf(response));
        return;
      }
      const blob = await response.blob();
      const name =
        /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ??
        (format === "html" ? "shopify.html" : "shopify.xlf");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) {
      setExportError({ message: String(error) });
    } finally {
      setExporting(false);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setImportError(null);
    setSummaries(null);
    const body = new FormData(event.currentTarget);
    const file = body.get("file");
    if (file instanceof File && file.size > 10 * 1024 * 1024) {
      setImportError({ message: "", code: "fileTooLarge" });
      return;
    }
    setImporting(true);
    try {
      const response = await fetch("/app/files/import", { method: "POST", body });
      if (!response.ok) {
        setImportError(await errorOf(response));
        return;
      }
      setSummaries(((await response.json()) as { summaries: Summary[] }).summaries);
    } catch (error) {
      setImportError({ message: String(error) });
    } finally {
      setImporting(false);
    }
  }

  const code = (l: Target) => l.code ?? l.locale.replace(/_/g, "-");
  const languageName = (locale: string | null) =>
    targets.find((l) => l.locale === locale)?.name ?? locale ?? "";

  return (
    <>
      <s-section heading={t("files.export.heading")}>
        <s-paragraph>{t("files.export.text")}</s-paragraph>
        {exportError && (
          <s-banner tone="critical">
            <s-paragraph>{i18n.error(exportError)}</s-paragraph>
          </s-banner>
        )}
        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>{t("files.format")}</legend>
          <label style={rowStyle}>
            <input type="radio" name="format" checked={format === "xliff"} onChange={() => setFormat("xliff")} />
            {t("files.format.xliff")}
          </label>
          <label style={rowStyle}>
            <input type="radio" name="format" checked={format === "html"} onChange={() => setFormat("html")} />
            {t("files.format.html")}
          </label>
        </fieldset>
        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>{t("files.languages")}</legend>
          {targets.map((l) =>
            format === "html" ? (
              <label key={l.locale} style={rowStyle}>
                <input
                  type="radio"
                  name="htmlLocale"
                  checked={htmlLocale === l.locale}
                  onChange={() => setHtmlLocale(l.locale)}
                />
                {l.name} ({l.locale}) <span style={{ color: "#6d7175" }}>→ {code(l)}</span>
              </label>
            ) : (
              <label key={l.locale} style={rowStyle}>
                <input
                  type="checkbox"
                  checked={locales.includes(l.locale)}
                  onChange={() =>
                    setLocales((current) =>
                      current.includes(l.locale) ? current.filter((x) => x !== l.locale) : [...current, l.locale],
                    )
                  }
                />
                {l.name} ({l.locale}) <span style={{ color: "#6d7175" }}>→ {code(l)}</span>
              </label>
            ),
          )}
        </fieldset>
        <button
          type="button"
          style={buttonStyle}
          disabled={exporting || selected.length !== 1 || chosen.length === 0}
          onClick={download}
        >
          {t("files.download")}
        </button>
        {selected.length !== 1 && <s-paragraph>{t("files.export.selectOne")}</s-paragraph>}
      </s-section>

      <s-section heading={t("files.import.heading")}>
        <s-paragraph>{t("files.import.text")}</s-paragraph>
        <form onSubmit={upload} encType="multipart/form-data">
          <label style={{ ...rowStyle, flexDirection: "column", alignItems: "flex-start" }}>
            {t("files.file")}
            <input type="file" name="file" accept=".xlf,.xliff,.html,.htm" required />
          </label>
          <label style={rowStyle}>
            <input type="checkbox" name="includeChanged" />
            {t("files.includeChanged")}
          </label>
          <label style={rowStyle}>
            <input type="checkbox" name="overwrite" />
            {t("translate.overwrite")}
          </label>
          <button type="submit" style={buttonStyle} disabled={importing}>
            {importing ? t("files.importing") : t("files.import.submit")}
          </button>
        </form>
        {importError && (
          <s-banner tone="critical">
            <s-paragraph>{i18n.error(importError)}</s-paragraph>
          </s-banner>
        )}
        {summaries?.map((s, index) => (
          <s-box key={index} padding="small" borderWidth="base" borderRadius="base">
            <s-paragraph>
              <strong>{s.title ?? s.reference}</strong>
              {s.locale ? ` · ${languageName(s.locale)} (${s.locale})` : ""}
            </s-paragraph>
            {s.error ? (
              <s-paragraph>
                <s-text tone="critical">{i18n.error(s.error)}</s-text>
              </s-paragraph>
            ) : (
              <s-paragraph>
                {[
                  t("files.summary.ok", { count: s.written }),
                  s.skippedChanged ? t("files.summary.changed", { count: s.skippedChanged }) : "",
                  s.counts.untranslated ? t("files.summary.untranslated", { count: s.counts.untranslated }) : "",
                  s.counts.invalid_markup ? t("files.summary.invalid", { count: s.counts.invalid_markup }) : "",
                  s.counts.missing ? t("files.summary.missing", { count: s.counts.missing }) : "",
                  s.kept ? t("files.summary.kept", { count: s.kept }) : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </s-paragraph>
            )}
          </s-box>
        ))}
      </s-section>
    </>
  );
}

async function errorOf(response: Response): Promise<ErrorInfo> {
  try {
    const json = (await response.json()) as { error?: ErrorInfo };
    if (json.error) return json.error;
  } catch {
    // not JSON (e.g. the session expired): fall through
  }
  return { message: `HTTP ${response.status}` };
}

const rowStyle = { display: "flex", gap: 8, alignItems: "center", padding: "6px 0" } as const;
const fieldsetStyle = { border: 0, padding: 0, margin: "8px 0" } as const;
const legendStyle = { fontWeight: 600, padding: 0 } as const;
const buttonStyle = {
  background: "#303030",
  color: "#fff",
  border: 0,
  borderRadius: 8,
  padding: "8px 14px",
  font: "inherit",
  fontWeight: 600,
  cursor: "pointer",
  marginTop: 8,
} as const;
