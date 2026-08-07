import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import routecraftPlugin from "@routecraft/eslint-plugin-routecraft";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**"],
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // routes/ and lib/ are in scope on purpose: they are where principals get
    // minted and where authority is decided, which is precisely what these
    // rules exist to watch.
    files: [
      "capabilities/**/*.{ts,js}",
      "routes/**/*.{ts,js}",
      "lib/**/*.{ts,js}",
      "adapters/**/*.{ts,js}",
      "plugins/**/*.{ts,js}",
      "index.{ts,js}",
    ],
    plugins: { "@routecraft/routecraft": routecraftPlugin },
    ...routecraftPlugin.configs.recommended,
  },
  {
    // Tests mint principals on purpose: a capability that declares
    // `.authorize()` cannot be exercised without one, and building it the way
    // the framework does is what keeps the test honest. The rule guards
    // production channel boundaries, and a test file is not one.
    files: ["**/*.test.{ts,js}"],
    rules: { "@routecraft/routecraft/restrict-principal-minting": "off" },
  },
];
