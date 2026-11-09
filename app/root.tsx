import { Links, Meta, Outlet, Scripts, ScrollRestoration, useMatches } from "react-router";
import { DEFAULT_LOCALE } from "./i18n";

export default function App() {
  // The routes that know the merchant's language return it as `locale`.
  const locale =
    useMatches()
      .map((match) => (match.data as { locale?: string } | undefined)?.locale)
      .find(Boolean) ?? DEFAULT_LOCALE;
  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
