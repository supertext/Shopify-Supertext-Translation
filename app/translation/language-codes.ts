// Shopify locale codes → Supertext language codes. Shared by server and browser.
//
// Supertext SDK `Languages` (v1): the shop's own mapping (Settings → Languages,
// one combo box per shop language, one mapping for targets and the source)
// wins, else a Shopify locale that equals a Supertext code (apart from case and
// `_`/`-`), else the SDK default where one is obvious (de → de-DE, en → en-US,
// fr → fr-FR, it → it-IT, pt → pt-PT, zh-CN → zh-Hans, zh-TW → zh-Hant,
// es-ES → es, …), else the SDK error `unsupported_language` and nothing is sent.
import {
  Languages,
  TARGET_LANGUAGES,
  type LanguageMapping,
  type TargetLanguage,
} from "../../vendor/supertext-sdk/v1/index";

export { TARGET_LANGUAGES };
export type { LanguageMapping, TargetLanguage };

/** The target code to send for a Shopify locale; throws SupertextError("unsupported_language"). */
export const supertextTarget = (shopifyLocale: string, mapping: LanguageMapping): string =>
  Languages.target(shopifyLocale, mapping);

/** The source code to send for the shop's primary locale; throws SupertextError("unsupported_language"). */
export const supertextSource = (shopifyLocale: string, mapping: LanguageMapping): string =>
  Languages.source(shopifyLocale, mapping);

/** The target code for a locale, or null if it has no mapping, no match and no default (for display). */
export function resolvedTarget(shopifyLocale: string, mapping: LanguageMapping): string | null {
  try {
    return supertextTarget(shopifyLocale, mapping);
  } catch {
    return null;
  }
}

/** The source code for a locale, or null if Supertext can't translate from it (for display). */
export function resolvedSource(shopifyLocale: string, mapping: LanguageMapping): string | null {
  try {
    return supertextSource(shopifyLocale, mapping) || null;
  } catch {
    return null;
  }
}

/** Supertext's target languages for the combo box, sorted by English name. */
export const targetOptions = (): readonly TargetLanguage[] => Languages.targetOptions();

/** What the combo box preselects for a locale without a saved mapping: exact match, else default, else null. */
export const suggestTarget = (shopifyLocale: string): string | null => Languages.suggestTarget(shopifyLocale);

/**
 * A code chosen in the settings in Supertext's own spelling ("de_ch" → "de-CH"),
 * or null if Supertext doesn't offer it. The primary language also accepts a
 * bare source code ("en").
 */
export function canonicalCode(code: string, primary = false): string | null {
  const target = Languages.matchTarget(code);
  if (target) return target;
  if (primary && Languages.isSupportedSource(code)) return Languages.matchSource(code);
  return null;
}

/** Whether formal/informal can be sent for this target code (false for unknown codes). */
export const supportsPoliteness = (targetCode: string): boolean =>
  Languages.supportsPoliteness(targetCode) === true;

/** The formal/informal setting to send for a target: only where Supertext offers it, else the default. */
export const politenessFor = <P extends string>(politeness: P | "default", targetCode: string): P | "default" =>
  supportsPoliteness(targetCode) ? politeness : "default";

/**
 * A target's name in the admin language ("Deutsch (Schweiz)"), from the platform's
 * Intl.DisplayNames; Supertext's English name where that gives nothing better
 * (and for the Swiss German dialect codes, which it can't tell apart).
 */
export function targetName(language: TargetLanguage, uiLocale: string): string {
  if (language.code.includes("-u-")) return language.name;
  try {
    const name = new Intl.DisplayNames([uiLocale], { type: "language" }).of(language.code);
    return name && name !== language.code ? name : language.name;
  } catch {
    return language.name;
  }
}
