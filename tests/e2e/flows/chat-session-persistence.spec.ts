/**
 * Regression test: Chat session persistence across transient auth failures.
 *
 * Previously, tab-visibility changes triggered `POST /api/auth/session` and
 * any 401 response (even a transient one from a server cold-start, clock
 * skew, or concurrent-refresh race) immediately cleared client auth state.
 * That caused `Dashboard` to unmount and the user to be redirected to the
 * marketing/landing page while they were in the middle of a chat.
 *
 * The fix: `refreshSessionSafely()` now verifies a POST 401 with a
 * follow-up GET before dropping auth. Only a confirmed-expired session
 * clears client state. Transient errors / network failures keep the user
 * where they are.
 *
 * This spec drives that flow end-to-end:
 *   1. Log in and open a chat room.
 *   2. Simulate a token expiry / transient 401.
 *   3. Assert the user remains on the chat page.
 *   4. Assert the user is NOT redirected to the dashboard/landing.
 *
 * HOW TO RUN
 * ----------
 * This file is ready for Playwright, but the project does not yet wire up
 * Playwright. To run this test:
 *   1. `npm i -D @playwright/test && npx playwright install`
 *   2. Create a top-level `playwright.config.ts` pointing `testDir` at
 *      `./tests/e2e` and `baseURL` at your local dev server.
 *   3. Provide an authenticated storage-state fixture (see the
 *      `storageState` arg to `test.use` below) — e.g. generated via a
 *      one-time `auth.setup.ts` that signs in with SIWE against a dev
 *      wallet and saves the HttpOnly session cookie into a JSON file.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { test, expect, type Route } from "@playwright/test";

// --- Fixtures -----------------------------------------------------------

// Path to a Playwright storage-state JSON file that represents an
// authenticated session. Generate once via an `auth.setup.ts` fixture and
// commit the path (not the file). Override via env for CI.
const AUTH_STATE =
    process.env.PLAYWRIGHT_AUTH_STATE ?? "tests/e2e/.auth/user.json";

// A DM / channel / group id that the authenticated fixture user is a
// member of. Override via env or hard-code a known-fixture id.
const CHAT_URL = process.env.PLAYWRIGHT_TEST_CHAT_URL ?? "/";
const CHAT_OPEN_QUERY =
    process.env.PLAYWRIGHT_TEST_CHAT_OPEN_QUERY ??
    "dm=0x0000000000000000000000000000000000000001";

// Selectors — adjust if the DOM changes.
const CHAT_INPUT_SELECTOR = '[data-testid="chat-message-input"], textarea[placeholder*="Message"]';
const DASHBOARD_SIGNED_OUT_SELECTOR = 'text=Sign Message, text=Connect Wallet';

// --- Tests --------------------------------------------------------------

test.use({ storageState: AUTH_STATE });

test.describe("Chat session persistence", () => {
    test("stays in chat when a transient session 401 is simulated", async ({ page }) => {
        // Open the app with the chat auto-open query (Dashboard reads this
        // and opens the corresponding chat modal).
        await page.goto(`${CHAT_URL}?${CHAT_OPEN_QUERY}`);

        // Wait for the chat composer to be visible, confirming the chat
        // surface actually rendered.
        await expect(page.locator(CHAT_INPUT_SELECTOR).first()).toBeVisible({
            timeout: 15_000,
        });

        // Record the URL we're on now so we can assert we stay here.
        const urlBefore = new URL(page.url());

        // ---- Simulate a transient 401 on POST /api/auth/session ----
        //
        // Real-world trigger: visibilitychange fires when the tab is shown
        // after being hidden, and the POST extend-session endpoint returns
        // 401 (e.g. server was just redeployed and lost its in-memory
        // token cache for a few ms).
        //
        // We flip POST responses to 401 but keep GET returning an
        // authenticated body, mirroring the transient case. After the
        // helper verifies the GET, the client must KEEP the user
        // authenticated.
        let postCalls = 0;
        let getCalls = 0;
        await page.route("**/api/auth/session", async (route: Route) => {
            const method = route.request().method();
            if (method === "POST") {
                postCalls += 1;
                await route.fulfill({
                    status: 401,
                    contentType: "application/json",
                    body: JSON.stringify({ error: "Unauthorized" }),
                });
                return;
            }
            // GET — still valid (the cookie actually works).
            getCalls += 1;
            await route.continue();
        });

        // Simulate hiding and re-showing the tab so visibilitychange
        // handlers in the auth providers fire.
        await page.evaluate(() => {
            Object.defineProperty(document, "visibilityState", {
                configurable: true,
                get: () => "hidden",
            });
            document.dispatchEvent(new Event("visibilitychange"));
        });
        await page.waitForTimeout(50);
        await page.evaluate(() => {
            Object.defineProperty(document, "visibilityState", {
                configurable: true,
                get: () => "visible",
            });
            document.dispatchEvent(new Event("visibilitychange"));
        });

        // Give the refresh handler time to run POST -> GET -> "ok".
        await page.waitForTimeout(1_000);

        // ---- Assertions ----

        // The visibility handler actually ran and hit POST.
        expect(postCalls).toBeGreaterThan(0);
        // And followed up with a GET to verify before dropping auth.
        expect(getCalls).toBeGreaterThan(0);

        // The chat composer must still be mounted — user was NOT kicked
        // back to the dashboard/marketing page.
        await expect(page.locator(CHAT_INPUT_SELECTOR).first()).toBeVisible();

        // We must not have been redirected away. URL pathname and the
        // chat query should be intact.
        const urlAfter = new URL(page.url());
        expect(urlAfter.pathname).toBe(urlBefore.pathname);
        expect(urlAfter.search).toBe(urlBefore.search);

        // No "Sign Message" / "Connect Wallet" CTAs should be visible —
        // those render only when the user is signed out.
        await expect(page.locator(DASHBOARD_SIGNED_OUT_SELECTOR)).toHaveCount(0);
    });

    test("redirects to sign-in only when GET also confirms expiry", async ({ page }) => {
        await page.goto(`${CHAT_URL}?${CHAT_OPEN_QUERY}`);
        await expect(page.locator(CHAT_INPUT_SELECTOR).first()).toBeVisible({
            timeout: 15_000,
        });

        // Both POST and GET return 401 — genuinely expired session.
        await page.route("**/api/auth/session", async (route: Route) => {
            await route.fulfill({
                status: 401,
                contentType: "application/json",
                body: JSON.stringify({ authenticated: false }),
            });
        });

        await page.evaluate(() => {
            Object.defineProperty(document, "visibilityState", {
                configurable: true,
                get: () => "visible",
            });
            document.dispatchEvent(new Event("visibilitychange"));
        });

        // Client should eventually show the signed-out landing UI.
        await expect(
            page.locator(DASHBOARD_SIGNED_OUT_SELECTOR).first()
        ).toBeVisible({ timeout: 10_000 });
    });
});
