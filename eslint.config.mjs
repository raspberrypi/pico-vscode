import globals from "globals";

import tseslint from "typescript-eslint";

import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintConfigPrettier,
  {
    languageOptions: {
      ecmaVersion: 14,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es6,
        ...globals.commonjs
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    files: ["src/**/*.mts"],
    rules: {
      "@typescript-eslint/naming-convention": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/array-type": ["error", { default: "array-simple" }],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/explicit-function-return-type": ["error", { allowExpressions: true }],
      "@typescript-eslint/consistent-type-exports": "error",
      "semi": "warn",
      curly: "warn",
      eqeqeq: "warn",
      "no-throw-literal": "warn",
      semi: "off",
      "no-mixed-requires": "error",
      "no-this-before-super": "warn",
      "no-unreachable": "warn",
      "no-unused-vars": "off",
      "max-len": ["warn", { code: 80, comments: 100, ignoreComments: false }],
      "no-fallthrough": "warn",
      "newline-before-return": "warn",
      "no-return-await": "warn",
      "arrow-body-style": ["error", "as-needed"],
      "no-unexpected-multiline": "error"
    },
    ignores: [
      "out/",
      "dist/",
      "**/*.d.ts",
      "web/**/*.js",
    ]
  }
);
