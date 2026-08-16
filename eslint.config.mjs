// @ts-check
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default defineConfig(globalIgnores(["**/dist/", "**/generated/"]), {
  files: ["**/*.{js,ts}"],
  extends: [
    js.configs.recommended,
    tseslint.configs.recommended,
    eslintConfigPrettier,
  ],
});
