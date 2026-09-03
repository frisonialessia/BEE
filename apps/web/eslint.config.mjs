import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Accessibility — eslint-config-next only turns on 6 jsx-a11y rules
  // (alt-text/aria-*), all at "warn" (see nextVitals above, via
  // eslint-plugin-jsx-a11y already registered there under the
  // "jsx-a11y" plugin key). This block promotes those to blocking
  // errors and adds the handful more that catch real, unambiguous a11y
  // bugs in a React/Next codebase — see each rule's own comment for why
  // it's in one bucket and not the other. Deliberately not the *entire*
  // jsx-a11y "recommended" preset: several of its rules (no-static-element
  // -interactions, click-events-have-key-events, ...) are noisy against
  // this codebase's existing div-based interactive patterns (bee-bento
  // cards, custom dropdowns) and would need a broader interaction-pattern
  // refactor to enforce as errors — those stay "warn" so they're visible
  // without blocking every future change on a pre-existing pattern.
  {
    rules: {
      // Promoted from Next's default "warn" — these have no legitimate
      // exception in this codebase, a violation is always a real bug.
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",

      // New, low-noise, high-signal rules.
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/heading-has-content": "error",
      "jsx-a11y/img-redundant-alt": "error",
      "jsx-a11y/iframe-has-title": "error",
      "jsx-a11y/no-autofocus": "warn",
      // A <label> with no associated control is invisible to a screen
      // reader as a label at all — every occurrence is a real bug, never
      // a deliberate choice.
      "jsx-a11y/label-has-associated-control": "error",
      // next/link renders an <a> itself — configured so this rule
      // checks the underlying href the same way it would a plain <a>,
      // rather than either ignoring <Link> entirely or false-positiving
      // on every one of them.
      "jsx-a11y/anchor-is-valid": [
        "error",
        { components: ["Link"], specialLink: ["hrefLeft", "hrefRight"] },
      ],

      // New rules kept at "warn": real findings, but fixing every one
      // means auditing this codebase's custom-interactive div patterns
      // (bee-bento cards, dropdowns, the resilience/network canvases)
      // one at a time rather than a mechanical rule flip — tracked as
      // follow-up, not blocking every future PR in the meantime.
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "jsx-a11y/interactive-supports-focus": "warn",
      "jsx-a11y/mouse-events-have-key-events": "warn",
      "jsx-a11y/tabindex-no-positive": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
