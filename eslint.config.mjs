import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "node_modules/**", "data/**", "next-env.d.ts"]),
  {
    rules: {
      // Store and avatar images are remote URLs we don't proxy; plain <img> is intended.
      "@next/next/no-img-element": "off",
    },
  },
]);
