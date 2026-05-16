import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("next.config.mjs performance settings", () => {
    const configContent = readFileSync(resolve(__dirname, "../../next.config.mjs"), "utf-8");

    it("strips console.log in production builds", () => {
        expect(configContent).toContain("removeConsole");
        expect(configContent).toContain('exclude: ["error", "warn"]');
    });

    it("has runtime caching configured for PWA", () => {
        expect(configContent).toContain("runtimeCaching");
        expect(configContent).toContain("CacheFirst");
        expect(configContent).toContain("StaleWhileRevalidate");
    });

    it("has security headers configured", () => {
        expect(configContent).toContain("Strict-Transport-Security");
        expect(configContent).toContain("Content-Security-Policy");
    });
});

describe("Dashboard dynamic imports", () => {
    const dashboardContent = readFileSync(
        resolve(__dirname, "../../src/components/Dashboard.tsx"),
        "utf-8"
    );

    const dynamicImports = dashboardContent.match(/dynamic\(\(\) =>/g) || [];
    const staticModalImports = dashboardContent.match(/^import \{ \w+Modal/gm) || [];

    it("uses dynamic imports for heavy modals (at least 15)", () => {
        expect(dynamicImports.length).toBeGreaterThanOrEqual(15);
    });

    it("has more dynamic imports than static modal imports", () => {
        expect(dynamicImports.length).toBeGreaterThan(staticModalImports.length);
    });

    it("dynamically imports ChannelChatModal", () => {
        expect(dashboardContent).toContain('dynamic(() => import("./ChannelChatModal")');
    });

    it("dynamically imports GroupChatModal", () => {
        expect(dashboardContent).toContain('dynamic(() => import("./GroupChatModal")');
    });

    it("dynamically imports AlphaChatModal", () => {
        expect(dashboardContent).toContain('dynamic(() => import("./AlphaChatModal")');
    });
});
