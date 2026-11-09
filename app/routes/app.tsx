import type {
  HeadersFunction,
  LinksFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { localeFromRequest } from "../i18n";
import { I18nProvider, useI18n } from "../i18n/react";

// Shopify's Inter for the embedded admin pages (Polaris look). The public
// pages bundle their own Inter instead (app/components/PublicPage.tsx).
export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://cdn.shopify.com/" },
  {
    rel: "stylesheet",
    href: "https://cdn.shopify.com/static/fonts/inter/v4/styles.css",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return {
    // eslint-disable-next-line no-undef
    apiKey: process.env.SHOPIFY_API_KEY || "",
    // The admin language: Shopify adds ?locale= when it loads the app.
    locale: localeFromRequest(request),
  };
};

// Later requests from inside the app (navigation, form posts) don't carry
// Shopify's ?locale=, so keep the language of the first load.
export const shouldRevalidate = () => false;

export default function App() {
  const { apiKey, locale } = useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey}>
      <I18nProvider locale={locale}>
        <AppNav />
        <Outlet />
      </I18nProvider>
    </AppProvider>
  );
}

function AppNav() {
  const { t } = useI18n();
  return (
    <s-app-nav>
      <s-link href="/app">{t("nav.translate")}</s-link>
      <s-link href="/app/settings">{t("nav.settings")}</s-link>
    </s-app-nav>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
