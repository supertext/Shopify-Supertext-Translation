# User guide — Supertext Translation for Shopify

How to translate your shop's texts with Supertext AI. You need an administrator to have installed the app and entered the Supertext API key (see the [installation guide](INSTALLATION.md)).

## Translate

1. In the Shopify admin, open **Apps → Supertext Translation**. The app has two pages, **Translate** and **Settings**: on a computer they are listed under the app in the left sidebar; on a phone, use the **Settings** link at the top of the translate page.
2. **Choose what to translate:** click **Products**, **Collections**, **Pages**, **Blog posts** or **Blogs**, then tick the items. **Select all on this page** ticks the 50 items shown; use **Next page** for more. Only the items on the current page are translated at once.
3. **Choose the languages:** all your shop's other languages are ticked; untick the ones you don't want. Next to each language you see the variant Supertext translates into, for example *→ Supertext de-CH* (an administrator sets it under Settings → Languages). Languages without a choice use Supertext's suggestion (for example `de` → `de-DE`). A language marked *no Supertext language* (for example `en-IE`) can't be ticked until an administrator chooses one there.
4. Leave **Overwrite existing translations** off unless you want to replace translations made earlier (see below).
5. Click **Translate … with Supertext**.

The translation runs in the background. **Recent translations** shows *Translating… 3 of 10* and updates itself; you can leave the page and come back. When it says **Done**, the translations are saved in Shopify.

Each item is translated into one language after the other, so a large selection takes a few minutes.

The app's screens are shown in your Shopify admin language (English, German, French or Italian; English for other languages).

## Review and edit

The translations are saved in Shopify's own translation store, the same place Shopify's free **Translate & Adapt** app uses. To check or correct them:

1. Install Shopify's Translate & Adapt app if you haven't (Apps → search "Translate & Adapt").
2. Open it, pick the language and the item, and edit any field. Your edits are kept until you translate that item again with *Overwrite existing translations*.

Customers see a language only once it is published under **Settings → Languages**.

## Translating again

- **Without** *Overwrite existing translations*, fields that already have a translation are kept. Recent translations shows them as *kept*.
- Fields whose original text changed after they were translated are marked outdated by Shopify. These are always translated again, so a run without overwrite brings your translations up to date.
- **With** *Overwrite existing translations*, every selected field is translated again, replacing edits you made in Translate & Adapt.
- **Translation review:** if your administrator turned on *Translation review* for a language (Settings → Languages), reviewers (your colleagues or Supertext linguists) check and correct the translations on your online store. Their corrections come into Shopify the next time you translate the items into that language with *Overwrite existing translations*: after a review, translate them again. Texts reviewed once keep their corrected wording in later translations.

## Translation files: export for translation, import translation

Instead of Supertext AI, you can have an item translated by someone else: a translator, a translation tool (Trados, memoQ, Phrase and other CAT tools) or Supertext's web app. The app exports the item's texts as a file and imports the translated file again. Both are on the **Translate** page, below the translate button.

**Export for translation**

1. Under *1. Choose what to translate*, tick exactly **one** item.
2. Under **Export for translation**, choose the **File format**:
   - **XLIFF 1.2 (for translation tools)**: the better choice for translators and translation tools. Formatting (bold, links, …) shows as tags they can move but not break. One file can hold several languages.
   - **HTML (one language per file)**: for Supertext's web app or anyone who translates HTML files.
3. Choose the target languages (HTML: one). Every shop language is offered, also one without a Supertext language: the file then names the Shopify code (for example `en-IE`).
4. Click **Download file**. The file is called like `shopify-8123456789-fr-FR.xlf` (item number and target language; `shopify-8123456789.xlf` for several languages).

The file holds the same fields Supertext AI would translate (see below), also those that already have a translation. Send it to the translator or upload it to Supertext's web app. Translators must keep the file's structure: in an HTML file, leave the head (the `supertext:` lines) and the `data-st-id` attributes alone.

**Import translation**

1. Under **Import translation**, choose the translated file (**Translated file (XLIFF or HTML)**, at most 10 MB).
2. Leave **Also import texts whose source changed since the export** off unless you want translations of texts that were edited in the meantime (they then translate the old text).
3. **Overwrite existing translations** works as for Supertext AI: off, fields that already have a current translation are kept.
4. Click **Import translation**. The translations are saved in Shopify straight away, like Supertext's (you can review them in Translate & Adapt).

The app then shows, per item and language:

| Line | Meaning |
| --- | --- |
| *Imported: 3* | Fields saved in Shopify. |
| *Skipped, source changed since the export: 1* | The field's original text was edited after the export, so the translation may be out of date. Import again with *Also import texts whose source changed since the export* to save it anyway, or export again. |
| *Not translated in the file: 1* | The file has no translation for it (XLIFF only). |
| *Formatting changed, not imported: 1* | The translation breaks or adds formatting (tags, links) that the original doesn't have. Fix it in the file and import again. |
| *Not in the file: 1* | The field was added or filled after the export. |
| *Kept, already translated: 1* | The field has a current translation and *Overwrite existing translations* was off. |

An HTML file can't mark a text as untranslated: imported unchanged, it saves the original text as the translation.

Messages: *This file isn't a valid XLIFF or HTML translation file* (damaged, or another kind of file), *This file wasn't exported by the Supertext app, or its header was removed* (the metadata is missing), *This file belongs to another system* (exported from another Supertext plugin), *The item this file was exported from no longer exists*, *The shop has no language …* (the language was removed since), *The file is too large (at most 10 MB)*, *Nothing to translate* (the item has no text fields to export).

## What gets translated

For products, collections, pages, blog posts and blogs, every text field Shopify offers for translation, for example:

- Title and description (the description keeps its headings, lists, bold text, links and images)
- SEO title and SEO description
- Product type, blog post summary and other plain-text fields

## What is not translated

- **URL handles** (the part of the address like `/products/swiss-chocolate`). Set them per language in Translate & Adapt if you want translated addresses.
- Product options and variants, metafields, menus, theme texts, notifications, policies and checkout texts (planned for later versions).
- Images and their alt texts.
- Fields that are empty in the default language.

## Formal and informal language

An administrator chooses under **Settings → Form of address** whether Supertext uses the formal ("Sie") or informal ("du") form. It is applied only to languages that have one; English, for example, is translated without a preference.

## When something goes wrong

Errors appear in red under the translation in **Recent translations**, with the language they concern. One failed item doesn't stop the others.

| Message | Meaning |
| --- | --- |
| *Done, with errors* | Some items were translated, others not. The red lines say why; translate those again. |
| *"en-IE" has no Supertext language, so nothing was sent* | The language has no Supertext language and no default. Ask your administrator to choose one in its list in this app under Settings → Languages (e.g. `en-GB` for `en-IE`), then translate again. Other languages of the same run are translated. |
| *Supertext doesn't translate from "en" into "…"* | Supertext refuses this language pair. Ask your administrator to choose another Supertext language under Settings → Languages. |
| *Interrupted by an app update* | The app was updated while your translation ran. Start it again; finished items are kept. |
| *The item no longer exists* | It was deleted after you selected it. |
| *Supertext returned 2 of 3 fields* | Supertext's answer was incomplete, so nothing was saved for that item. Translate it again. |
| *Authentication failed …* | The API key is wrong. Ask your administrator to check Settings. |
| *Your Supertext translation limit is exceeded* | The Supertext plan's limit is used up. Ask your administrator. |
| *No Supertext API key yet* | Ask your administrator to add it under Settings. |

## Support

Questions, problems or ideas: use the [Supertext support form](https://integrations.supertext.com/en/support?platform=shopify). Mention the version of Shopify and of the plugin, what you did and what you expected; an error message helps a lot. You get an answer by email, in your language.
