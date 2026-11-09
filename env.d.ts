/// <reference types="vite/client" />
/// <reference types="@react-router/node" />

// React 19 reads JSX element types from the `react` module, while
// @shopify/app-bridge-types still declares its elements (<s-app-nav>,
// <ui-modal>, …) in the global JSX namespace: make them known to React too.
declare module "react" {
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface IntrinsicElements extends globalThis.JSX.IntrinsicElements {}
  }
}

export {};
