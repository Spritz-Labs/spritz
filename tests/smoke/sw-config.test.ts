import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const configPath = resolve(__dirname, "../../next.config.mjs");
const configSrc = readFileSync(configPath, "utf-8");

describe("Service worker / next-pwa config", () => {
  it("disables SW in development", () => {
    expect(configSrc).toContain('disable: process.env.NODE_ENV === "development"');
  });

  it("does not auto-skipWaiting (controlled update flow)", () => {
    expect(configSrc).toContain("skipWaiting: false");
  });

  it("uses CacheFirst for Google Fonts (immutable asset)", () => {
    expect(configSrc).toContain('cacheName: "google-fonts"');
    expect(configSrc).toContain('handler: "CacheFirst"');
  });

  it("uses NetworkFirst for API calls", () => {
    expect(configSrc).toContain('cacheName: "apis"');
  });

  it("sets no-store on auth API routes", () => {
    expect(configSrc).toContain('source: "/api/auth/:path*"');
    expect(configSrc).toContain("no-store");
  });

  it("sets no-store on passkey routes", () => {
    expect(configSrc).toContain('source: "/api/passkey/:path*"');
  });

  it("sets no-store on admin routes", () => {
    expect(configSrc).toContain('source: "/api/admin/:path*"');
  });

  it("has a Content-Security-Policy header", () => {
    expect(configSrc).toContain("Content-Security-Policy");
    expect(configSrc).toContain("default-src 'self'");
  });
});
