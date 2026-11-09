// English: the source language and the fallback for missing keys.
// Placeholders in braces ({count}, {settings}) are filled in by the code;
// never translate them. Keys ending in .one / .other are plural forms.

export const en = {
  // Navigation
  "nav.translate": "Translate",
  "nav.settings": "Settings",

  // API key help (shown wherever the key is mentioned)
  "apiKeyHelp.text":
    "No Supertext account yet? {signup}. Generate your API key at {apiKey} (requires the Admin role).",
  "apiKeyHelp.signup": "Create one at supertext.com",
  "apiKeyHelp.apiKey": "supertext.com → Integrations → API",

  // Translate page
  "translate.heading": "Translate with Supertext",
  "translate.settingsLink": "⚙ Settings: API key and languages",
  "translate.started":
    "Translation started. Progress shows under Recent translations; you can leave this page meanwhile.",
  "translate.noKey.heading": "Add your Supertext API key",
  "translate.noKey.text":
    "The app needs a Supertext API key before it can translate. Enter it under {settings}.",
  "translate.noKey.settings": "Settings",
  "translate.oneLanguage.heading": "Add a second language",
  "translate.oneLanguage.text":
    "Your shop has only one language. Add languages under Settings → Languages in the Shopify admin, then come back here.",
  "translate.step1": "1. Choose what to translate",
  "translate.empty": "Nothing of this type yet.",
  "translate.selectAll": "Select all on this page ({count})",
  "translate.firstPage": "First page",
  "translate.nextPage": "Next page",
  "translate.step2": "2. Choose the languages",
  "translate.codesHint":
    "The Supertext code next to each language is the variant it is translated into. Change it under {settings}.",
  "translate.codesHint.settings": "Settings → Languages",
  "translate.unmapped": "no Supertext language, choose one under {settings}",
  "translate.from": "Translating from {language}, your shop's default language.",
  "translate.notPublished": ", not published yet",
  "translate.overwrite": "Overwrite existing translations",
  "translate.overwriteHint":
    "Without this option, fields that already have a current translation are kept. Outdated ones (the original changed since) are always translated again.",
  "translate.starting": "Starting…",
  "translate.submit": "Translate with Supertext",
  "translate.submitCount.one": "Translate {count} with Supertext",
  "translate.submitCount.other": "Translate {count} with Supertext",
  "translate.selectSomething": "Select at least one item and one language.",
  "translate.noApiKey":
    "No Supertext API key yet. Add it under Settings (create an account at https://www.supertext.com/person/en/account/signin, generate the key at https://www.supertext.com/en/integrations/api; requires the Admin role).",

  // What can be translated
  "resource.PRODUCT": "Products",
  "resource.COLLECTION": "Collections",
  "resource.PAGE": "Pages",
  "resource.ARTICLE": "Blog posts",
  "resource.BLOG": "Blogs",

  // Recent translations
  "jobs.heading": "Recent translations",
  "jobs.none": "No translations yet.",
  "job.running": "Translating… {completed} of {total}",
  "job.failed": "Failed",
  "job.doneWithErrors": "Done, with errors",
  "job.done": "Done",
  "job.written.one": "{count} field translated",
  "job.written.other": "{count} fields translated",
  "job.kept": "{count} kept",

  // Translation files (export for translation, import translation)
  "files.export.heading": "Export for translation",
  "files.export.text": "Download the item selected above as a file for a translator, a translation tool or Supertext's web app, and import the translated file below.",
  "files.export.selectOne": "Select exactly one item above to export it.",
  "files.format": "File format",
  "files.format.xliff": "XLIFF 1.2 (for translation tools)",
  "files.format.html": "HTML (one language per file)",
  "files.languages": "Target languages",
  "files.download": "Download file",
  "files.import.heading": "Import translation",
  "files.import.text": "Upload a file exported here and translated. Its translations are written to Shopify like Supertext's own.",
  "files.file": "Translated file (XLIFF or HTML)",
  "files.includeChanged": "Also import texts whose source changed since the export",
  "files.import.submit": "Import translation",
  "files.importing": "Importing…",
  "files.summary.ok": "Imported: {count}",
  "files.summary.changed": "Skipped, source changed since the export: {count}",
  "files.summary.untranslated": "Not translated in the file: {count}",
  "files.summary.invalid": "Formatting changed, not imported: {count}",
  "files.summary.missing": "Not in the file: {count}",
  "files.summary.kept": "Kept, already translated: {count}",

  // Settings page
  "settings.heading": "Supertext settings",
  "settings.keyUnreadable.heading": "Enter your API key again",
  "settings.keyUnreadable.text": "The saved Supertext API key can no longer be read. Paste it again below and save.",
  "settings.encryptionMissing": "The API key could not be saved because the app's server isn't fully set up. Please contact Supertext support.",
  "settings.removed": "The API key was removed.",
  "settings.invalidCodes": "Saved, except these language codes, which Supertext doesn't offer: {codes}. Choose one from the list.",
  "settings.saved": "Settings saved.",
  "settings.apiKey.heading": "Supertext API key",
  "settings.apiKey.label": "API key",
  "settings.apiKey.placeholderSaved": "A key is saved. Enter a new one to replace it.",
  "settings.apiKey.placeholderServer": "Using the key set on the server.",
  "settings.apiKey.placeholder": "Paste your Supertext API key",
  "settings.languages.heading": "Languages",
  "settings.languages.text": "Choose the Supertext language for each of your shop's languages. Each list starts with Supertext's suggestion: the same code where Supertext offers it (es, nl, pt-BR, …), else the obvious default (de → German (Germany) de-DE, en → English (United States) en-US, fr → fr-FR, it → it-IT, pt → pt-PT, zh-CN → zh-Hans, zh-TW → zh-Hant). Pick another one, for example de-CH for Swiss German, if you prefer. A language without a suggestion (such as en-IE or de-LI) shows \"— choose —\" and can't be translated until you choose one. Your default language is translated from.",
  "settings.languages.default": ", default language",
  "settings.style.heading": "Translation style",
  "settings.style.label": "Form of address",
  "settings.style.default": "Let Supertext decide",
  "settings.style.more": "Formal (e.g. German “Sie”)",
  "settings.style.less": "Informal (e.g. German “du”)",
  "settings.languages.choose": "— choose —",
  "settings.languages.sentAs": "Sent to Supertext as {code}.",
  "settings.languages.unmapped": "No Supertext language: choose one in the list, otherwise this language can't be translated.",
  "settings.languages.noPoliteness": "No formal or informal form in this language; Supertext decides.",
  "settings.languages.review": "Translation review",
  "settings.languages.reviewHelp":
    "Translations into this language go through Supertext's review service, so reviewers can check and correct them on your online store with the Supertext Localization Review extension. Their corrections are used the next time the item is translated (with \"Overwrite existing translations\").",
  "settings.languages.reviewOffOnServer": "Translation review is turned off on this server.",
  "settings.reports.heading": "Version information",
  "settings.reports.label": "Send version information to Supertext",
  "settings.reports.help": "Sends the shop's address and the versions of this app, the Shopify API and the runtime to Supertext when you save these settings and after an update, so Supertext support can see which version you run. No content, no API key and no personal data are sent.",
  "settings.reports.offOnServer": "Turned off for all shops on the app's server.",
  "settings.test": "Test connection",
  "settings.save": "Save",
  "settings.removeKey": "Remove API key",
  "keycheck.heading": "API key check",
  "keycheck.none": "Not checked yet. Save the settings or test the connection.",
  "keycheck.checkedAt": "Last checked: {time}",
  "keycheck.ok": "API key checked: the connection to Supertext works.",
  "keycheck.invalid": "Supertext rejected the API key. Check that you copied the whole key, or generate a new one at {apiKey} (requires the Admin role). No Supertext account yet? Create one at {signup}.",
  "keycheck.missing": "No API key is set yet. No Supertext account yet? Create one at {signup}. Generate your API key at {apiKey} (requires the Admin role).",
  "keycheck.unreachable": "The API key couldn't be checked because Supertext can't be reached. The settings are saved; check again later.",
  "keycheck.error": "The API key couldn't be checked: Supertext answered with an error ({status}). The settings are saved; check again later.",
  "keycheck.signupLink": "supertext.com",
  "keycheck.apiKeyLink": "supertext.com → Integrations → API",
  "settings.about.heading": "About",
  "settings.about.version": "version {version}",
  "settings.about.versionUnknown": "(version unknown)",
  "settings.about.text":
    "Translations are written to Shopify's own translation store, so you can review and edit them in Shopify's Translate & Adapt app.",

  // Errors from Supertext and Shopify (codes set by LocalizedError)
  "error.noApiKey": "No Supertext API key configured.",
  "error.noFileId": "Supertext did not return a file id.",
  "error.translationFailed": "Supertext failed to translate the document.",
  "error.limitExceeded": "Your Supertext translation limit is exceeded.",
  "error.fileDeleted": "The Supertext file was deleted before it could be downloaded.",
  "error.timeout": "Timed out waiting for the Supertext translation.",
  "error.emptyTranslation": "The translated document was empty.",
  "error.unreachable": "Could not reach Supertext: {reason}",
  "error.auth":
    "Authentication failed. Please check the Supertext API key. No Supertext account yet? Create one at https://www.supertext.com/person/en/account/signin. Generate your API key at https://www.supertext.com/en/integrations/api (requires the Admin role).",
  "error.notFound": "The requested Supertext resource was not found.",
  "error.tooLarge": "The content is too large for Supertext to translate in one go.",
  "error.rateLimited": "Too many requests to Supertext. Please try again shortly.",
  "error.unavailable": "The Supertext service is currently unavailable.",
  "error.http": "Supertext answered with HTTP {status}.",
  "error.languagePair": "Supertext doesn't translate from \"{source}\" into \"{target}\". Choose another Supertext language for it under Settings → Languages.",
  "error.languagePairUnknown": "Supertext doesn't translate into this language. Choose another Supertext language for it under Settings → Languages.",
  "error.unsupportedLanguage": "\"{language}\" has no Supertext language, so nothing was sent. Choose its Supertext language in the list next to it in this app under Settings → Languages (an administrator can do this), then translate again.",
  "error.unsupportedFeature": "Supertext offers no formal or informal form for \"{target}\". Choose \"Let Supertext decide\" under Settings → Translation style.",
  "error.interrupted": "Interrupted by an app update. Please start the translation again; finished items are kept.",
  "error.incompleteResponse": "The Supertext translation is incomplete.",
  "error.itemGone": "The item no longer exists.",
  "error.incomplete": "Supertext returned {returned} of {expected} fields.",
  "error.shopify": "Shopify: {reason}",
  "error.shopifyNoData": "Shopify returned no data.",
  "error.shopifyRejected": "Shopify rejected the translation: {reason}",
  "error.nothingToTranslate": "Nothing to translate.",
  "error.fileInvalid": "This file isn't a valid XLIFF or HTML translation file.",
  "error.fileMissingMetadata": "This file wasn't exported by the Supertext app, or its header was removed.",
  "error.fileTooLarge": "The file is too large (at most 10 MB).",
  "error.fileOtherSystem": "This file belongs to another system ({plugin}).",
  "error.fileItemGone": "The item this file was exported from no longer exists.",
  "error.fileNoLanguage": "The shop has no language {language}.",
  "error.fileSelectOne": "Select exactly one item to export.",
  "error.fileSelectLanguage": "Select at least one language.",
  "error.fileHtmlOneLanguage": "An HTML file holds exactly one language. Choose one language, or XLIFF.",
  "error.fileChoose": "Choose a file.",

  // Start page and login (outside the Shopify admin)
  "landing.heading": "Supertext Translation for Shopify",
  "landing.intro":
    "Translate your products, collections, pages and blog posts with Supertext AI, right from the Shopify admin.",
  "landing.feature1.title": "All your languages at once",
  "landing.feature1.text":
    "Pick the items and the languages, and Supertext translates them in the background.",
  "landing.feature2.title": "Formatting kept",
  "landing.feature2.text":
    "Product descriptions keep their headings, lists, bold text and links.",
  "landing.feature3.title": "Review in Shopify",
  "landing.feature3.text":
    "Translations land in Shopify's own translation store, so you can check and edit them in Translate & Adapt.",
  "login.heading": "Log in",
  "login.shopDomain": "Shop domain",
  "login.example": "e.g. my-shop-domain.myshopify.com",
  "login.submit": "Log in",
  "login.missingShop": "Please enter your shop domain to log in",
  "login.invalidShop": "Please enter a valid shop domain to log in",
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
