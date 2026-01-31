const js = require("@eslint/js");
const security = require("eslint-plugin-security");
const nodePlugin = require("eslint-plugin-n");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  security.configs.recommended,
  {
    plugins: {
      n: nodePlugin
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      "no-unused-vars": ["error", { 
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_"
      }],
      "no-undef": "error",
      "no-duplicate-case": "error",
      "no-empty": "warn",
      "no-extra-semi": "warn",
      "no-unreachable": "error",
      "no-constant-condition": "warn",
      "eqeqeq": ["error", "always", { "null": "ignore" }],
      "no-var": "error",
      "prefer-const": "error",

      "curly": ["error", "all"],
      "default-case": "error",
      "default-case-last": "error",
      "dot-notation": "error",
      "grouped-accessor-pairs": ["error", "getBeforeSet"],
      "guard-for-in": "error",
      "no-alert": "error",
      "no-caller": "error",
      "no-constructor-return": "error",
      "no-div-regex": "error",
      "no-else-return": ["error", { "allowElseIf": false }],
      "no-empty-function": "warn",
      "no-eq-null": "off",
      "no-eval": "error",
      "no-extend-native": "error",
      "no-extra-bind": "error",
      "no-extra-label": "error",
      "no-floating-decimal": "error",
      "no-implicit-coercion": ["error", { "allow": ["!!"] }],
      "no-implicit-globals": "error",
      "no-implied-eval": "error",
      "no-invalid-this": "error",
      "no-iterator": "error",
      "no-labels": "error",
      "no-lone-blocks": "error",
      "no-loop-func": "error",
      "no-multi-str": "error",
      "no-new": "error",
      "no-new-func": "error",
      "no-new-wrappers": "error",
      "no-octal-escape": "error",
      "no-param-reassign": ["error", { "props": false }],
      "no-proto": "error",
      "no-return-assign": ["error", "always"],
      "no-script-url": "error",
      "no-self-compare": "error",
      "no-sequences": "error",
      "no-throw-literal": "error",
      "no-unmodified-loop-condition": "error",
      "no-unused-expressions": ["error", { "allowShortCircuit": true, "allowTernary": true }],
      "no-useless-call": "error",
      "no-useless-concat": "error",
      "no-useless-return": "error",
      "no-void": "error",
      "prefer-promise-reject-errors": "error",
      "prefer-regex-literals": "error",
      "radix": "error",
      "require-await": "error",
      "yoda": "error",

      "no-shadow": "error",
      "no-shadow-restricted-names": "error",
      "no-use-before-define": ["error", { "functions": false, "classes": true, "variables": true }],

      "array-callback-return": ["error", { "checkForEach": true }],
      "no-await-in-loop": "warn",
      "no-promise-executor-return": "error",
      "no-template-curly-in-string": "warn",
      "require-atomic-updates": "error",

      "arrow-body-style": ["error", "as-needed"],
      "no-confusing-arrow": ["error", { "allowParens": true }],
      "no-duplicate-imports": "error",
      "no-useless-computed-key": "error",
      "no-useless-constructor": "error",
      "no-useless-rename": "error",
      "object-shorthand": ["error", "always"],
      "prefer-arrow-callback": "error",
      "prefer-destructuring": ["warn", { "array": false, "object": true }],
      "prefer-rest-params": "error",
      "prefer-spread": "error",
      "prefer-template": "error",
      "symbol-description": "error",

      "n/no-deprecated-api": "error",
      "n/no-missing-require": "off",
      "n/no-unpublished-require": "off",
      "n/no-extraneous-require": "error",
      "n/process-exit-as-throw": "error",
      "n/no-path-concat": "error",

      "security/detect-buffer-noassert": "error",
      "security/detect-child-process": "warn",
      "security/detect-disable-mustache-escape": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-new-buffer": "error",
      "security/detect-no-csrf-before-method-override": "error",
      "security/detect-non-literal-fs-filename": "off",
      "security/detect-non-literal-regexp": "warn",
      "security/detect-non-literal-require": "warn",
      "security/detect-object-injection": "off",
      "security/detect-possible-timing-attacks": "warn",
      "security/detect-pseudoRandomBytes": "error",
      "security/detect-unsafe-regex": "error"
    }
  },
  {
    files: ["public/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.es2021
      }
    },
    rules: {
      "no-alert": "off",
      "n/no-deprecated-api": "off",
      "n/process-exit-as-throw": "off",
      "n/no-path-concat": "off",
      "n/no-extraneous-require": "off",
      "no-invalid-this": "off"
    }
  }
];
