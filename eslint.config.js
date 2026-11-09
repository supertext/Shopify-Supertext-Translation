// ESLint flat config (ESLint 9). Same rules as Shopify's app template.
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import importPlugin from "eslint-plugin-import";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: [
      "node_modules/",
      "build/",
      "public/build/",
      ".react-router/",
      ".shopify/",
      ".cache/",
      "vendor/",
      "test/docs/node_modules/",
      "test/docs/movie/out/",
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.commonjs, ...globals.es2021, shopify: "readonly" },
    },
  },

  // React
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    ...react.configs.flat.recommended,
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    ...react.configs.flat["jsx-runtime"],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    ...jsxA11y.flatConfigs.recommended,
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    settings: {
      react: { version: "detect" },
      formComponents: ["Form"],
      linkComponents: [
        { name: "Link", linkAttribute: "to" },
        { name: "NavLink", linkAttribute: "to" },
      ],
      "import/resolver": { typescript: {} },
    },
    rules: {
      "react/no-unknown-property": ["error", { ignore: ["variant"] }],
    },
  },

  // TypeScript
  ...tsPlugin.configs["flat/recommended"],
  {
    files: ["**/*.{ts,tsx}"],
    ...importPlugin.flatConfigs.recommended,
  },
  {
    files: ["**/*.{ts,tsx}"],
    ...importPlugin.flatConfigs.typescript,
  },
  {
    files: ["**/*.{ts,tsx}"],
    settings: {
      "import/internal-regex": "^~/",
      "import/resolver": {
        node: { extensions: [".ts", ".tsx"] },
        typescript: { alwaysTryTypes: true },
      },
    },
  },

  // Node
  {
    files: [
      "eslint.config.js",
      "vite.config.{js,ts}",
      ".graphqlrc.{js,ts}",
      "shopify.server.{js,ts}",
      "**/*.server.{js,ts}",
      "scripts/**",
      "test/**",
      "*.config.{js,ts,mjs}",
    ],
    languageOptions: { globals: { ...globals.node } },
  },
];
