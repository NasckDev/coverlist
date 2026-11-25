import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "playwright-report/", "test-results/", "coverage/"] },
  {
    files: ["**/*.{js,ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    extends: [jsxA11y.flatConfigs.recommended],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    files: ["server/**/*.ts", "scripts/**/*.{js,ts,mjs}", "e2e/**/*.ts", "*.config.{js,ts}"],
    languageOptions: { globals: { ...globals.node } },
  },
);
