import { suite, assert, assertStatus, summary } from "../helpers/assert.js";
import { mintSessionToken } from "../helpers/auth.js";
import { api } from "../helpers/http.js";
import { env } from "../helpers/env.js";

async function run() {
    const token = await mintSessionToken(env.TEST_WALLET_ADDRESS, "wallet");

    // --- Public profile ---
    suite("Account: GET /api/public/user");

    const pubRes = await api(`/api/public/user?address=${env.TEST_WALLET_ADDRESS}`);
    assertStatus(pubRes.status, 200, "Public profile returns 200");

    // --- Session profile (includes private fields) ---
    suite("Account: GET /api/auth/session (user object)");

    const sessRes = await api("/api/auth/session", { token });
    assertStatus(sessRes.status, 200, "Session returns 200");
    const user = (sessRes.data as Record<string, unknown>).user as Record<string, unknown> | undefined;
    assert(user !== undefined, "Session contains user object");

    // --- Username lookup ---
    suite("Account: GET /api/username");

    const unRes = await api(`/api/username?address=${env.TEST_WALLET_ADDRESS}`);
    assertStatus(unRes.status, 200, "Username lookup returns 200");

    // --- Profile widgets ---
    suite("Account: GET /api/profile/widgets");

    const widgetsRes = await api(`/api/profile/widgets?address=${env.TEST_WALLET_ADDRESS}`, { token });
    assert(widgetsRes.status === 200 || widgetsRes.status === 404, "Widgets endpoint reachable");

    // --- Profile theme ---
    suite("Account: GET /api/profile/theme");

    const themeRes = await api(`/api/profile/theme?address=${env.TEST_WALLET_ADDRESS}`, { token });
    assert(themeRes.status === 200 || themeRes.status === 404, "Theme endpoint reachable");

    // --- Email updates opt-in (PATCH) ---
    suite("Account: PATCH /api/user/email-updates");

    const emailOptRes = await api("/api/user/email-updates", {
        method: "PATCH",
        token,
        body: { email_updates_opt_in: false },
    });
    assert(emailOptRes.status === 200 || emailOptRes.status === 401, "Email updates endpoint reachable");

    return summary();
}

run().then(({ failed }) => process.exit(failed > 0 ? 1 : 0));
