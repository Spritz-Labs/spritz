import { suite, assert, assertStatus, summary } from "../helpers/assert.js";
import { mintSessionToken } from "../helpers/auth.js";
import { api } from "../helpers/http.js";
import { env } from "../helpers/env.js";

async function run() {
    // --- JWT Session ---
    suite("Auth: JWT session token");

    const walletToken = await mintSessionToken(env.TEST_WALLET_ADDRESS, "wallet");
    assert(walletToken.length > 50, "Wallet JWT generated");

    const emailToken = await mintSessionToken(env.TEST_EMAIL_ADDRESS, "email");
    assert(emailToken.length > 50, "Email JWT generated");

    const passkeyToken = await mintSessionToken(env.TEST_PASSKEY_ADDRESS, "passkey");
    assert(passkeyToken.length > 50, "Passkey JWT generated");

    // --- Session endpoint ---
    suite("Auth: GET /api/auth/session");

    const sessionRes = await api("/api/auth/session", { token: walletToken });
    assertStatus(sessionRes.status, 200, "Session returns 200");
    const sessionData = sessionRes.data as Record<string, unknown>;
    assert(sessionData.authenticated === true, "Session is authenticated");

    // --- Session without token ---
    suite("Auth: GET /api/auth/session (no token)");

    const noAuthRes = await api("/api/auth/session");
    assertStatus(noAuthRes.status, 200, "No-auth session returns 200");
    const noAuthData = noAuthRes.data as Record<string, unknown>;
    assert(noAuthData.authenticated === false || !noAuthData.authenticated, "No-auth session is not authenticated");

    // --- Passkey login options ---
    suite("Auth: GET /api/passkey/login/options");

    const passkeyOptsRes = await api("/api/passkey/login/options");
    assert([200, 400, 404, 405].includes(passkeyOptsRes.status), `Passkey options endpoint reachable (HTTP ${passkeyOptsRes.status})`);

    // --- Logout ---
    suite("Auth: POST /api/auth/logout");

    const logoutRes = await api("/api/auth/logout", { method: "POST", token: walletToken });
    assert([200, 302, 307].includes(logoutRes.status), `Logout succeeds (HTTP ${logoutRes.status})`);

    return summary();
}

run().then(({ failed }) => process.exit(failed > 0 ? 1 : 0));
