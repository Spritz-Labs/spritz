import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const manifestPath = resolve(__dirname, "../../public/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

describe("PWA manifest", () => {
  it("has required fields for installability", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBe("standalone");
  });

  it("includes at least a 192px and 512px icon", () => {
    const sizes = manifest.icons.map(
      (i: { sizes: string }) => i.sizes,
    );
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("sets theme and background colors", () => {
    expect(manifest.theme_color).toBeTruthy();
    expect(manifest.background_color).toBeTruthy();
  });

  it("icons declare proper type and purpose", () => {
    for (const icon of manifest.icons) {
      expect(icon.type).toBe("image/png");
      expect(icon.purpose).toMatch(/maskable|any/);
    }
  });

  it("has a meaningful description", () => {
    expect(manifest.description).toBeTruthy();
    expect(manifest.description.length).toBeGreaterThan(10);
  });
});
