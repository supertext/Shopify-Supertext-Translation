// Translation files: "Export for translation" and "Import translation" (XLIFF 1.2 or HTML).
//
// The Supertext SDK's TranslationFiles (vendor/supertext-sdk/translation-file.ts) does
// the file formats; this glue picks the fields exactly like the API translation
// (selectFields), finds the resource again from the job's reference and writes the
// imported texts back like API results (translationsRegister with the field digests).
import {
  TranslationFileError,
  TranslationFiles,
  type FileFormat,
  type FileJob,
  type FileSegment,
  type ImportStatus,
} from "../../vendor/supertext-sdk/index";
import { errorInfo, LocalizedError, type ErrorInfo } from "../i18n/error";
import { selectFields, titleOf, type TranslationInput } from "./fields.server";
import { resolvedSource, resolvedTarget, type LanguageMapping } from "./language-codes";
import { registerTranslations, resourceForLocale, type AdminClient } from "./shopify.server";

/** The `plugin` written into every file: the repository name. */
export const PLUGIN = "Shopify-Supertext-Translation";

/** Uploads larger than this are refused before they are read. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Throws `fileTooLarge` for an upload over MAX_UPLOAD_BYTES: first by the request's
 * Content-Length (before the body is read; 64 KB for the rest of the form), then by the file.
 */
export function refuseLargeUpload(contentLength: string | null, file?: { size: number }): void {
  const tooLarge = Number(contentLength ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024 || (file !== undefined && file.size > MAX_UPLOAD_BYTES);
  if (tooLarge) throw new LocalizedError("The file is too large (at most 10 MB).", "fileTooLarge");
}

const GID = /^gid:\/\/shopify\/([A-Za-z]+)\/(\d+)$/;
const REFERENCE = /^([A-Za-z]+):(\d+):([A-Za-z0-9_-]+)$/;

/**
 * The job's reference: the resource's GraphQL type and id plus the Shopify target
 * locale, e.g. `Product:8123456789:fr` for gid://shopify/Product/8123456789 in French.
 */
export function fileReference(resourceId: string, locale: string): string {
  const match = GID.exec(resourceId);
  if (!match) throw new LocalizedError(`Not a Shopify resource id: ${resourceId}`, "itemGone");
  return `${match[1]}:${match[2]}:${locale}`;
}

/** The resource id and Shopify locale of a reference, or null if it isn't one of ours. */
export function parseReference(reference: string): { resourceId: string; locale: string } | null {
  const match = REFERENCE.exec(reference.trim());
  return match ? { resourceId: `gid://shopify/${match[1]}/${match[2]}`, locale: match[3] } : null;
}

/** A Supertext code for the file: the mapping (or exact match, or default), else the Shopify code with `-`. */
const targetCode = (locale: string, mapping: LanguageMapping) =>
  resolvedTarget(locale, mapping) ?? locale.replace(/_/g, "-");
const sourceCode = (locale: string, mapping: LanguageMapping) =>
  resolvedSource(locale, mapping) ?? locale.replace(/_/g, "-");

/** The resource's translatable fields as file segments, keyed by Shopify's field key (`title`, `body_html`). */
export function fileSegments(selection: ReturnType<typeof selectFields>): FileSegment[] {
  return selection.fields.map((field, index) => ({
    key: field.key,
    text: selection.segments[index].text,
    html: selection.segments[index].html === true,
  }));
}

export interface ExportRequest {
  resourceId: string;
  /** Shopify locales of the target languages (HTML: exactly one). */
  locales: string[];
  format: FileFormat;
  /** The shop's primary locale (the source). */
  primaryLocale: string;
  mapping: LanguageMapping;
}

export interface ExportedFile {
  filename: string;
  contentType: string;
  content: string;
}

/** Builds the file for one resource; throws LocalizedError (`selectSomething`, `htmlOneLanguage`, `itemGone`, `nothingToTranslate`). */
export async function exportFile(admin: AdminClient, request: ExportRequest): Promise<ExportedFile> {
  const locales = [...new Set(request.locales)];
  if (locales.length === 0) throw new LocalizedError("Select at least one language.", "fileSelectLanguage");
  if (request.format === "html" && locales.length !== 1) {
    throw new LocalizedError("An HTML file holds exactly one language.", "fileHtmlOneLanguage");
  }
  const resource = await resourceForLocale(admin, request.resourceId, locales[0]);
  if (!resource) throw new LocalizedError("The item no longer exists.", "itemGone");
  // Everything translatable, also fields that already have a translation:
  // whether those are replaced is decided on import (Overwrite existing translations).
  const segments = fileSegments(selectFields(resource.content, [], true));
  if (segments.length === 0) throw new LocalizedError("Nothing to translate.", "nothingToTranslate");

  const jobs: FileJob[] = locales.map((locale) => ({
    plugin: PLUGIN,
    reference: fileReference(request.resourceId, locale),
    sourceLanguage: sourceCode(request.primaryLocale, request.mapping),
    targetLanguage: targetCode(locale, request.mapping),
    segments,
  }));
  const id = GID.exec(request.resourceId)![2];
  const name = locales.length === 1 ? `shopify-${id}-${jobs[0].targetLanguage}` : `shopify-${id}`;
  return request.format === "html"
    ? { filename: `${name}.html`, contentType: "text/html; charset=utf-8", content: TranslationFiles.exportHtml(jobs[0]) }
    : { filename: `${name}.xlf`, contentType: "application/x-xliff+xml", content: TranslationFiles.exportXliff(jobs) };
}

export interface ImportOptions {
  /** Also write texts whose source changed since the export (off by default). */
  includeChanged: boolean;
  /** Replace current translations (as on the translate page); otherwise they are kept. */
  overwrite: boolean;
  /** The shop's target locales (not the primary one). */
  locales: string[];
}

export type ImportCounts = Record<ImportStatus, number>;

/** What happened to one job (one resource in one language) of the file. */
export interface ImportSummary {
  reference: string;
  title: string | null;
  locale: string | null;
  /** Results per status, as the SDK reported them. */
  counts: ImportCounts;
  /** Fields written to Shopify. */
  written: number;
  /** Translated, but the source changed since the export, and not written (Also import … not ticked). */
  skippedChanged: number;
  /** Fields left alone because they have a current translation and Overwrite wasn't ticked. */
  kept: number;
  error?: ErrorInfo;
}

const emptyCounts = (): ImportCounts => ({ ok: 0, source_changed: 0, untranslated: 0, invalid_markup: 0, missing: 0 });

/** The SDK's file errors as messages the merchant can read in their language. */
export function fileError(error: unknown): LocalizedError {
  if (error instanceof TranslationFileError) {
    const code =
      error.code === "too_large" ? "fileTooLarge" : error.code === "missing_metadata" ? "fileMissingMetadata" : "fileInvalid";
    return new LocalizedError(error.message, code);
  }
  return error instanceof LocalizedError ? error : new LocalizedError(String(error), "fileInvalid");
}

/**
 * Reads an uploaded file and writes its translations back, job by job. A file
 * error (not XLIFF/HTML, no metadata, too large) is thrown as LocalizedError; a
 * job that can't be imported (other system, unknown item or language) gets an
 * `error` in its summary and the others go on.
 */
export async function importFile(admin: AdminClient, content: string, options: ImportOptions): Promise<ImportSummary[]> {
  let files;
  try {
    files = TranslationFiles.read(content);
  } catch (error) {
    throw fileError(error);
  }
  const summaries: ImportSummary[] = [];
  for (const file of files) {
    const summary: ImportSummary = { reference: file.reference, title: null, locale: null, counts: emptyCounts(), written: 0, skippedChanged: 0, kept: 0 };
    summaries.push(summary);
    try {
      if (file.plugin !== PLUGIN) {
        throw new LocalizedError(`This file belongs to another system (${file.plugin}).`, "fileOtherSystem", { plugin: file.plugin });
      }
      const ref = parseReference(file.reference);
      if (!ref) throw new LocalizedError("The item this file was exported from no longer exists.", "fileItemGone");
      summary.locale = ref.locale;
      if (!options.locales.includes(ref.locale)) {
        throw new LocalizedError(`The shop has no language ${ref.locale}.`, "fileNoLanguage", { language: ref.locale });
      }
      const resource = await resourceForLocale(admin, ref.resourceId, ref.locale);
      if (!resource) throw new LocalizedError("The item this file was exported from no longer exists.", "fileItemGone");
      summary.title = titleOf(resource.content);

      // The same fields the API translation would send: current translations stay unless Overwrite.
      const selection = selectFields(resource.content, resource.translations, options.overwrite);
      summary.kept = selection.skipped;
      const digests = new Map(selection.fields.map((f) => [f.key, f.digest]));
      const inputs: TranslationInput[] = [];
      for (const result of TranslationFiles.importTranslations(file, fileSegments(selection))) {
        summary.counts[result.status]++;
        const write = result.status === "ok" || (result.status === "source_changed" && options.includeChanged);
        if (!write || result.text === null || result.text.trim() === "") continue;
        inputs.push({ key: result.key, value: result.text, locale: ref.locale, translatableContentDigest: digests.get(result.key)! });
      }
      summary.skippedChanged = options.includeChanged ? 0 : summary.counts.source_changed;
      if (inputs.length) await registerTranslations(admin, ref.resourceId, inputs);
      summary.written = inputs.length;
    } catch (error) {
      summary.error = errorInfo(error);
    }
  }
  return summaries;
}
