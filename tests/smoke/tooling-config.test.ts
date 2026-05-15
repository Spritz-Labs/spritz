import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const root = resolve(__dirname, "../..");

describe("ESLint config", () => {
    it("eslint.config.mjs exists and exports valid config", async () => {
        const content = readFileSync(resolve(root, "eslint.config.mjs"), "utf-8");
        expect(content).toContain("defineConfig");
        expect(content).toContain("nextVitals");
        expect(content).toContain("nextTs");
    });

    it("has no-explicit-any downgraded to warn", async () => {
        const content = readFileSync(resolve(root, "eslint.config.mjs"), "utf-8");
        expect(content).toContain('"@typescript-eslint/no-explicit-any": "warn"');
    });

    it("respects _ prefix convention for unused vars", async () => {
        const content = readFileSync(resolve(root, "eslint.config.mjs"), "utf-8");
        expect(content).toContain('varsIgnorePattern: "^_"');
        expect(content).toContain('argsIgnorePattern: "^_"');
    });
});

describe("Prettier config", () => {
    it(".prettierrc is valid JSON with expected settings", () => {
        const raw = readFileSync(resolve(root, ".prettierrc"), "utf-8");
        const config = JSON.parse(raw);
        expect(config.tabWidth).toBe(4);
        expect(config.semi).toBe(true);
        expect(config.singleQuote).toBe(false);
        expect(config.trailingComma).toBe("es5");
    });

    it(".prettierignore excludes node_modules and generated dirs", () => {
        const content = readFileSync(resolve(root, ".prettierignore"), "utf-8");
        expect(content).toContain("node_modules");
        expect(content).toContain(".next");
        expect(content).toContain("spritz-typescript-sdk");
    });
});

describe("Husky pre-commit hook", () => {
    it("runs lint-staged", () => {
        const content = readFileSync(resolve(root, ".husky/pre-commit"), "utf-8");
        expect(content).toContain("lint-staged");
    });
});

describe("GitHub Actions CI", () => {
    it("ci.yml runs on push and PR to main", () => {
        const content = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf-8");
        expect(content).toContain("push:");
        expect(content).toContain("pull_request:");
        expect(content).toContain("branches: [main]");
    });

    it("ci.yml uses Node 20", () => {
        const content = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf-8");
        expect(content).toContain("node-version: 20");
    });

    it("ci.yml runs ESLint and tests", () => {
        const content = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf-8");
        expect(content).toContain("eslint");
        expect(content).toContain("npm test");
    });
});

describe("package.json health", () => {
    it("does not declare packageManager (uses npm)", () => {
        const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));
        expect(pkg.packageManager).toBeUndefined();
    });

    it("has lint-staged config", () => {
        const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));
        expect(pkg["lint-staged"]).toBeDefined();
        expect(pkg["lint-staged"]["*.{ts,tsx}"]).toContain("prettier --write");
    });

    it("does not include dead three.js dependencies", () => {
        const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));
        expect(pkg.dependencies["three"]).toBeUndefined();
        expect(pkg.dependencies["@react-three/fiber"]).toBeUndefined();
        expect(pkg.dependencies["@react-three/drei"]).toBeUndefined();
    });

    it("uses maintained @ducanh2912/next-pwa instead of abandoned next-pwa", () => {
        const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));
        expect(pkg.dependencies["next-pwa"]).toBeUndefined();
        expect(pkg.dependencies["@ducanh2912/next-pwa"]).toBeDefined();
    });
});
