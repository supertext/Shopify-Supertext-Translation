import type { LinksFunction, LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { localeFromRequest, translator } from "../../i18n";
import { PublicPage, publicLinks } from "../../components/PublicPage";

import styles from "./styles.module.css";

export const links: LinksFunction = publicLinks;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  // App Store rule 2.3.1: never ask merchants to type their shop domain.
  // Installs start from the Shopify App Store or the admin instead.
  return { showForm: false, locale: localeFromRequest(request) };
};

export default function App() {
  const { showForm, locale } = useLoaderData<typeof loader>();
  const { t } = translator(locale);

  return (
    <PublicPage>
      <div className={styles.content}>
        <h1 className={styles.heading}>{t("landing.heading")}</h1>
        <p className={styles.text}>{t("landing.intro")}</p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>{t("login.shopDomain")}</span>
              <input className="st-input" type="text" name="shop" />
              <span className="st-help">{t("login.example")}</span>
            </label>
            <button className="st-button" type="submit">
              {t("login.submit")}
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          {([1, 2, 3] as const).map((n) => (
            <li key={n}>
              <strong>{t(`landing.feature${n}.title`)}</strong>.{" "}
              {t(`landing.feature${n}.text`)}
            </li>
          ))}
        </ul>
      </div>
    </PublicPage>
  );
}
