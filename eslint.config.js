import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["app/src/vendor/**", "target/**", "app/src-tauri/target/**"],
  },
  js.configs.recommended,
  {
    files: ["app/src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        FitAddon: "readonly",
        Terminal: "readonly",
        WebglAddon: "readonly",
      },
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["app/tests/**/*.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
  },
];
