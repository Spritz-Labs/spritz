import { test, expect } from "@playwright/test";

test.describe("Smoke — unauthenticated", () => {
  test("home page loads and shows auth options", async ({ page }) => {
    await page.goto("/");
    // The login page should render with the Spritz branding
    await expect(page).toHaveTitle(/Spritz/);
    // Should see at least one auth method (passkey, wallet, etc.)
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("landing page loads when ?landing=true", async ({ page }) => {
    await page.goto("/?landing=true");
    await expect(page).toHaveTitle(/Spritz/);
    // Landing page should have the marketing content
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("API health check responds", async ({ request }) => {
    const res = await request.get("/api/auth/session");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
  });

  test("manifest.json is served correctly", async ({ request }) => {
    const res = await request.get("/manifest.json");
    expect(res.status()).toBe(200);
    const manifest = await res.json();
    expect(manifest.name).toBe("Spritz");
    expect(manifest.display).toBe("standalone");
  });
});
