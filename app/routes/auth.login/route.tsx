import { useState } from "react";
import type {
  ActionFunctionArgs,
  LinksFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";
import { localeFromRequest, translator } from "../../i18n";
import { PublicPage, publicLinks } from "../../components/PublicPage";

export const links: LinksFunction = publicLinks;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return { errors, locale: localeFromRequest(request) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return {
    errors,
    locale: localeFromRequest(request),
  };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const { errors, locale } = actionData || loaderData;
  const { t } = translator(locale);

  const error = errors.shop ? t(errors.shop) : undefined;

  return (
    <PublicPage narrow>
      <div className="st-card st-login">
        <h1>{t("login.heading")}</h1>
        <Form method="post">
          <label className="st-field">
            <span>{t("login.shopDomain")}</span>
            <input
              className="st-input"
              type="text"
              name="shop"
              value={shop}
              onChange={(e) => setShop(e.currentTarget.value)}
              autoComplete="on"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "shop-help shop-error" : "shop-help"}
            />
            <span id="shop-help" className="st-help">
              example.myshopify.com
            </span>
            {error && (
              <span id="shop-error" className="st-error" role="alert">
                {error}
              </span>
            )}
          </label>
          <button className="st-button" type="submit">
            {t("login.submit")}
          </button>
        </Form>
      </div>
    </PublicPage>
  );
}
