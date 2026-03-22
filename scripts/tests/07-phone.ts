import { suite, assert, assertStatus, summary } from "../helpers/assert.js";
import { mintSessionToken } from "../helpers/auth.js";
import { api } from "../helpers/http.js";
import { env } from "../helpers/env.js";

async function run() {
    const token = await mintSessionToken(env.TEST_WALLET_ADDRESS, "wallet");

    // --- Phone status (authenticated) ---
    suite("Phone: GET /api/phone/status (authenticated)");

    const statusRes = await api("/api/phone/status", { token });
    if (statusRes.status === 404) {
        console.log("  SKIP  Route not deployed yet (404)");
    } else {
        assertStatus(statusRes.status, 200, "Phone status returns 200");
        const statusData = statusRes.data as Record<string, unknown>;
        assert(typeof statusData === "object" && statusData !== null, "Response is JSON object");
    }

    // --- Phone status without auth ---
    suite("Phone: GET /api/phone/status (no auth)");

    const noAuthRes = await api("/api/phone/status");
    if (noAuthRes.status === 404) {
        console.log("  SKIP  Route not deployed yet (404)");
    } else {
        assertStatus(noAuthRes.status, 401, "Phone status requires auth");
    }

    return summary();
}

run().then(({ failed }) => process.exit(failed > 0 ? 1 : 0));
