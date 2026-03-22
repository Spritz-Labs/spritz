import { suite, assert, assertStatus, summary } from "../helpers/assert.js";
import { mintSessionToken } from "../helpers/auth.js";
import { api } from "../helpers/http.js";
import { env } from "../helpers/env.js";

async function run() {
    const token = await mintSessionToken(env.TEST_WALLET_ADDRESS, "wallet");

    // --- List developer keys ---
    suite("DevKeys: GET /api/developer/keys");

    const listRes = await api<{ keys?: unknown[] }>("/api/developer/keys", { token });
    assertStatus(listRes.status, 200, "List keys returns 200");
    assert(Array.isArray(listRes.data.keys), "Response contains keys array");

    // --- Create a new key (non-admin, should be pending) ---
    suite("DevKeys: POST /api/developer/keys (create)");

    const createRes = await api("/api/developer/keys", {
        method: "POST",
        token,
        body: { name: `e2e-key-${Date.now()}` },
    });
    assert(createRes.status === 200 || createRes.status === 201, `Create key (HTTP ${createRes.status})`);
    const createData = createRes.data as Record<string, unknown>;
    const newKeyId = createData.id as string | undefined;
    assert(!!createData.api_key || !!createData.key, "Response contains the API key");

    // --- Revoke key ---
    if (newKeyId) {
        suite("DevKeys: DELETE /api/developer/keys/[id] (revoke)");

        const revokeRes = await api(`/api/developer/keys/${newKeyId}`, { method: "DELETE", token });
        assert(revokeRes.status === 200, `Revoke key (HTTP ${revokeRes.status})`);
    }

    // --- Use pre-provisioned test API key ---
    suite("DevKeys: Use API key with session");

    const apiKeyRes = await api("/api/auth/session", { token, apiKey: env.TEST_API_KEY });
    assertStatus(apiKeyRes.status, 200, "Session with API key returns 200");

    return summary();
}

run().then(({ failed }) => process.exit(failed > 0 ? 1 : 0));
