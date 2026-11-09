import type { LinksFunction, MetaFunction } from "react-router";

import { PublicPage, publicLinks } from "../components/PublicPage";

/**
 * Public privacy policy of the Shopify app (linked from the App Store
 * listing). Keep it in step with what the code actually stores and sends;
 * see docs/APP_STORE.md. Draft: to be reviewed by Supertext before submission.
 */

export const links: LinksFunction = publicLinks;

export const meta: MetaFunction = () => [
  { title: "Privacy policy – Supertext Translation for Shopify" },
];

const UPDATED = "9 October 2026";

export default function Privacy() {
  return (
    <PublicPage narrow>
      <h1>Privacy policy: Supertext Translation for Shopify</h1>
      <p className="st-muted">Last updated {UPDATED}</p>

      <p>
        This policy explains what the Shopify app <strong>Supertext Translation</strong>{" "}
        (the &quot;app&quot;) does with data when a merchant installs it. The app is
        provided by Supertext (see the{" "}
        <a href="https://www.supertext.com/en/imprint">imprint</a>). The{" "}
        <a href="https://www.supertext.com/en/privacy">Supertext privacy policy</a>{" "}
        applies to the Supertext translation service itself.
      </p>

      <h2>What the app accesses</h2>
      <p>
        With the permissions the merchant approves at installation, the app
        reads the texts of products, collections, pages, blogs and blog posts,
        the shop&apos;s languages, and existing translations, and it writes
        translations. It has no access to customers, orders or payments, and it
        doesn&apos;t collect personal data of the shop&apos;s customers.
      </p>

      <h2>What the app stores</h2>
      <ul>
        <li>The shop&apos;s domain and the access token Shopify issues to the app.</li>
        <li>
          The merchant&apos;s Supertext API key, encrypted (AES-256-GCM), and the
          app settings (form of address, language codes, version information
          on or off) and the result of the last API key check (status and time;
          a SHA-256 fingerprint of the key, never the key).
        </li>
        <li>
          A list of recent translation runs: which items and languages were
          translated, counts and error messages. Not the texts themselves.
        </li>
      </ul>

      <h2>What the app sends to Supertext</h2>
      <p>
        When a merchant starts a translation, the texts of the selected items
        are sent to the Supertext AI translation API, authenticated with the
        merchant&apos;s own API key. The app deletes each file from Supertext as
        soon as the translation is downloaded. The translations are saved in
        the shop through Shopify&apos;s translation API.
      </p>
      <p>
        To check the API key, the app asks Supertext for its list of languages
        with the key (nothing is translated or billed). Unless the merchant
        turns off <em>Send version information to Supertext</em> in the
        app&apos;s settings, the app also sends Supertext&apos;s support
        service the shop&apos;s myshopify.com address, the versions of the app,
        the Shopify API and the server runtime, whether a key is set and the
        result of the key check: when the settings are saved and after an
        update. No content, no API key and no personal data.
      </p>

      <h2>Where the data is processed</h2>
      <p>
        The app and its database run on servers in the European Union
        (Amsterdam, Netherlands), operated by the hosting provider Railway
        Corp. Supertext processes translations as described in its privacy
        policy.
      </p>

      <h2>How long data is kept, and deletion</h2>
      <p>
        When the app is uninstalled, its access token is removed right away.
        48 hours later, Shopify asks the app to delete the shop&apos;s data, and the
        app deletes the API key, the settings and the list of translation runs.
        Translations already written to the shop stay in the shop.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about privacy or this app:{" "}
        <a href="mailto:hello@supertext.com">hello@supertext.com</a> or{" "}
        <a href="https://www.supertext.com/en/contact">supertext.com/en/contact</a>.
      </p>
    </PublicPage>
  );
}
