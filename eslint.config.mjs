import { globalIgnores } from "eslint/config";
import jseslint from "@eslint/js";
import tseslint from "typescript-eslint";
import astroPlugin from "eslint-plugin-astro";

export default tseslint.config(
  globalIgnores( [ "dist/**", "node_modules/**", "studio/**", ".astro/**" ] ),
  jseslint.configs.recommended,
  tseslint.configs.recommended,
  ...astroPlugin.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [ "error", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_",
      } ],
      "indent": [ "error", 2 ],
      "array-bracket-spacing": [ 2, "always" ],
      "arrow-parens": [ 2, "as-needed" ],
      "comma-dangle": [ "error", "always-multiline" ],
      "keyword-spacing": [ 2, {
        after: true,
        overrides: {
          if: { after: false },
          for: { after: false },
        },
      } ],
      "no-multi-spaces": [ 2 ],
      "object-curly-spacing": [ 2, "always" ],
      "quotes": [ 2, "double", {
        avoidEscape: true,
        allowTemplateLiterals: true,
      } ],
      "semi": [ 2, "always" ],
      "space-in-parens": [ 2, "always", {
        exceptions: [ "{}" ],
      } ],
      "space-before-blocks": [ 2, "always" ],
    },
  },
  // The Google Analytics loader in BaseHead.astro is a vendor snippet copied
  // verbatim from Google, and prefer-rest-params is wrong about it. gtag.js only
  // treats a dataLayer entry as a command when that entry is an `arguments`
  // object; rest params push a plain Array, which it silently ignores, so
  // "modernising" the snippet stops analytics recording anything at all.
  //
  // This is scoped config rather than an inline eslint-disable on purpose: the
  // rule is not merely inconvenient here, it is incorrect for this file, and a
  // decision like that belongs somewhere a reviewer sees it. Taking the rule's
  // advice is what broke analytics for three months in c154186 — the rule is
  // not auto-fixable, so a human had to resolve the error by hand, and did.
  // scripts/check-analytics-snippet.sh fails the build if it regresses again.
  //
  // The second pattern is the one that actually does the work, and it is not
  // guessable: eslint-plugin-astro runs client-side <script> blocks through its
  // `astro/client-side-ts` processor, which lints them as virtual TypeScript
  // files named `<file>.astro/<block>_<index>.ts` — here BaseHead.astro/1_1.ts.
  // Scoping the override to the .astro path alone silently does nothing, and
  // `eslint --print-config src/components/BaseHead.astro` reports the rule as
  // off while `eslint src/components/BaseHead.astro` still errors, because the
  // two resolve different files. `eslint --debug` prints the real block name.
  {
    files: [ "src/components/BaseHead.astro", "src/components/BaseHead.astro/**" ],
    rules: {
      "prefer-rest-params": "off",
    },
  },
);
