import { suite, assert, assertStatus, summary } from "../helpers/assert.js";
import { mintSessionToken } from "../helpers/auth.js";
import { api } from "../helpers/http.js";
import { env } from "../helpers/env.js";

async function run() {
    const token = await mintSessionToken(env.TEST_WALLET_ADDRESS, "wallet");

    // --- Messaging keys (authenticated) ---
    suite("MessagingKeys: GET /api/user/messaging-keys (authenticated)");

    const keysRes = await api("/api/user/messaging-keys", { token });
    if (keysRes.status === 404) {
        console.log("  SKIP  Route not deployed yet (404)");
    } else {
        assertStatus(keysRes.status, 200, "Messaging keys returns 200");
        const keysData = keysRes.data as Record<string, unknown>;
        assert(typeof keysData === "object" && keysData !== null, "Response is JSON object");
    }

    // --- Messaging keys without auth ---
    suite("MessagingKeys: GET /api/user/messaging-keys (no auth)");

    const noAuthRes = await api("/api/user/messaging-keys");
    if (noAuthRes.status === 404) {
        console.log("  SKIP  Route not deployed yet (404)");
    } else {
        assertStatus(noAuthRes.status, 401, "Messaging keys requires auth");
    }

    return summary();
}

run().then(({ failed }) => process.exit(failed > 0 ? 1 : 0));
