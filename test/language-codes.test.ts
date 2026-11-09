import { describe, expect, it } from "vitest";
import {
  canonicalCode,
  resolvedSource,
  resolvedTarget,
  suggestTarget,
  supertextSource,
  targetName,
  targetOptions,
  supertextTarget,
  politenessFor,
  supportsPoliteness,
} from "../app/translation/language-codes";
import { localizeError, REFUSED_CODES, SupertextError } from "../app/supertext/client.server";
import { fakeSupertext } from "./fake-supertext";

describe("language codes (mapping, exact match, SDK default)", () => {
  it("uses the shop's mapping first, for targets and the source", () => {
    expect(supertextTarget("de", { de: "de-CH" })).toBe("de-CH");
    expect(supertextSource("en", { en: "en-US" })).toBe("en");
    expect(supertextSource("de", { de: "de-CH" })).toBe("de");
  });

  it("uses a Shopify locale that is a Supertext code as it is", () => {
    expect(supertextTarget("pt-BR", {})).toBe("pt-BR");
    expect(supertextTarget("es", {})).toBe("es");
    expect(supertextTarget("de_ch", {})).toBe("de-CH");
    expect(supertextSource("en", {})).toBe("en");
  });

  it("uses the SDK default where one is obvious (de → de-DE, zh-TW → zh-Hant, es-ES → es)", () => {
    expect(supertextTarget("de", {})).toBe("de-DE");
    expect(supertextTarget("en", {})).toBe("en-US");
    expect(supertextTarget("fr", {})).toBe("fr-FR");
    expect(supertextTarget("it", {})).toBe("it-IT");
    expect(supertextTarget("pt", {})).toBe("pt-PT");
    expect(supertextTarget("zh-CN", {})).toBe("zh-Hans");
    expect(supertextTarget("zh-TW", {})).toBe("zh-Hant");
    expect(supertextTarget("es-ES", {})).toBe("es");
    expect(supertextTarget("de", { de: "de-CH" })).toBe("de-CH");
    expect(suggestTarget("de")).toBe("de-DE");
    expect(suggestTarget("pt-BR")).toBe("pt-BR");
  });

  it("refuses languages without mapping, match or default", () => {
    for (const locale of ["en-IE", "de-LI", "gsw", "sr-RS", "xx"]) {
      expect(() => supertextTarget(locale, {}), locale).toThrow(SupertextError);
      expect(resolvedTarget(locale, {}), locale).toBeNull();
      expect(suggestTarget(locale), locale).toBeNull();
    }
    const error = (() => {
      try {
        supertextTarget("en-IE", { fr: "fr-CH" });
      } catch (e) {
        return e as SupertextError;
      }
    })();
    expect(error?.code).toBe("unsupported_language");
    expect(error?.targetLang).toBe("en-IE");
    expect(resolvedSource("xx", {})).toBeNull();
  });

  it("offers Supertext's targets for the combo box, with names in the admin language", () => {
    const options = targetOptions();
    expect(options.map((o) => o.code)).toContain("de-CH");
    expect(options.map((o) => o.code)).not.toContain("de");
    const deCH = options.find((o) => o.code === "de-CH")!;
    expect(targetName(deCH, "de")).toMatch(/[Dd]eutsch/);
    const zurich = options.find((o) => o.code === "gsw-u-sd-chzh")!;
    expect(targetName(zurich, "de")).toBe(zurich.name);
  });

  it("accepts only codes Supertext offers in the settings, in its spelling", () => {
    expect(canonicalCode("de_ch")).toBe("de-CH");
    expect(canonicalCode("zh-hans")).toBe("zh-Hans");
    expect(canonicalCode("de")).toBeNull();
    expect(canonicalCode("German")).toBeNull();
    expect(canonicalCode("en", true)).toBe("en");
    expect(canonicalCode("en-US", true)).toBe("en-US");
  });

  it("sends formal/informal only where the target offers it", () => {
    expect(supportsPoliteness("de-CH")).toBe(true);
    expect(supportsPoliteness("en-US")).toBe(false);
    expect(supportsPoliteness("xx")).toBe(false);
    expect(politenessFor("more", "de-CH")).toBe("more");
    expect(politenessFor("less", "en-US")).toBe("default");
  });
});

describe("unsupported_language and unsupported_feature", () => {
  it("names the language and where to map it, and skips the language for the job", () => {
    const mapped = localizeError(new SupertextError("unsupported_language", { targetLang: "de" })) as {
      code: string;
      params: Record<string, string>;
      message: string;
    };
    expect(mapped.code).toBe("unsupportedLanguage");
    expect(mapped.params).toEqual({ language: "de" });
    expect(mapped.message).toContain("Settings → Languages");
    expect(REFUSED_CODES.has("unsupportedLanguage")).toBe(true);

    const source = localizeError(new SupertextError("unsupported_language", { sourceLang: "xx" })) as { params: Record<string, string> };
    expect(source.params).toEqual({ language: "xx" });

    const feature = localizeError(new SupertextError("unsupported_feature", { targetLang: "en-US", status: 400 })) as { code: string };
    expect(feature.code).toBe("unsupportedFeature");
    expect(REFUSED_CODES.has("unsupportedFeature")).toBe(true);
  });
});

describe("Supertext errors from the SDK", () => {
  it("explains INVALID_LANGUAGE_PAIR and points to the setting", async () => {
    const { client } = fakeSupertext(undefined, {
      status: 400,
      body: '{"error_code":"INVALID_LANGUAGE_PAIR","message":"…","source_lang":"en","target_lang":"de","politeness":null}',
    });
    const error = localizeError(await client.translateHtml("<p>x</p>", "de").catch((e: unknown) => e)) as {
      message: string;
      code: string;
      params: Record<string, string>;
      detail?: string;
    };
    expect(error.code).toBe("languagePair");
    expect(error.params).toEqual({ source: "en", target: "de" });
    expect(error.message).toContain("Settings → Languages");
    expect(error.detail).toBeUndefined();
  });

  it("reports an unknown target language (HTTP 404 INVALID_LANGUAGE_PAIR) as a language pair, not as not found", async () => {
    const { client } = fakeSupertext(undefined, {
      status: 404,
      body: '{"error_code":"INVALID_LANGUAGE_PAIR","message":"…","source_lang":"en","target_lang":"xx-XX","politeness":null}',
    });
    const error = localizeError(await client.translateHtml("<p>x</p>", "xx-XX").catch((e: unknown) => e)) as {
      code: string;
      params: Record<string, string>;
    };
    expect(error.code).toBe("languagePair");
    expect(error.params).toEqual({ source: "en", target: "xx-XX" });
  });

  it("maps every SDK error code to a message the app has", async () => {
    const { en } = await import("../app/i18n/en");
    const { ErrorCode } = await import("../vendor/supertext-sdk/v1/index");
    for (const code of Object.values(ErrorCode)) {
      const mapped = localizeError(new SupertextError(code)) as { code: string };
      expect(`error.${mapped.code}` in en, code).toBe(true);
    }
  });

  it("adds the account and API key links to authentication errors", () => {
    const mapped = localizeError(new SupertextError("authentication_failure", { status: 401 })) as Error;
    expect(mapped.message).toContain("https://www.supertext.com/en/integrations/api");
  });
});
