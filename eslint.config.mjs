import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // SRE-010 FIX: Warn on console.log usage in production code
  // Use the logger utility from @/lib/logger instead
  {
    rules: {
      // Warn on console.log/info/debug, but allow warn/error
      // This encourages using the proper logger utility
      "no-console": ["warn", { 
        allow: ["warn", "error"] 
      }],
    },
  },
]);

export default eslintConfig;
