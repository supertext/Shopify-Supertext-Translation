import type { LinksFunction } from "react-router";
import type { ReactNode } from "react";

import publicStyles from "../styles/public.css?url";

/**
 * Frame of the pages outside the Shopify admin (landing, login, privacy):
 * Supertext's look with the deep-green header bar and the mint logo.
 * The embedded admin pages (app.*) stay in Shopify's Polaris style and don't
 * use this. See docs/DEVELOPER.md → Look and feel.
 */
export const publicLinks: LinksFunction = () => [
  {
    rel: "preload",
    href: "/fonts/inter-latin-wght-normal.woff2",
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  },
  { rel: "stylesheet", href: publicStyles },
];

export function PublicPage({
  children,
  narrow = false,
}: {
  children: ReactNode;
  narrow?: boolean;
}) {
  return (
    <>
      <header className="st-topbar">
        <a className="st-brand" href="https://www.supertext.com">
          <img src="/supertext-logo.svg" alt="Supertext" width={122} height={22} />
        </a>
      </header>
      <main className={narrow ? "st-page st-narrow" : "st-page"}>{children}</main>
    </>
  );
}
