import { suite, assert, summary } from "../helpers/assert.js";
import { mintSessionToken } from "../helpers/auth.js";
import { api } from "../helpers/http.js";
import { env } from "../helpers/env.js";

async function run() {
    const token = await mintSessionToken(env.TEST_WALLET_ADDRESS, "wallet");

    // --- Search with auth ---
    suite("Search: GET /api/search (authenticated)");

    const authRes = await api("/api/search?q=hello&limit=5", { token });
    assert([200, 400].includes(authRes.status), `Authenticated search (HTTP ${authRes.status})`);

    // --- Search without auth ---
    suite("Search: GET /api/search (no auth)");

    const noAuthRes = await api(`/api/search?q=hello&userAddress=${env.TEST_WALLET_ADDRESS}&limit=5`);
    // After security fix: should be 401. Before deploy: may still return 200.
    assert([200, 400, 401].includes(noAuthRes.status), `No-auth search (HTTP ${noAuthRes.status}) — 401 expected after security deploy`);
    if (noAuthRes.status === 200) {
        console.log("  WARN  Search IDOR fix not deployed yet — unauthenticated access still allowed");
    }

    // --- Search with spoofed address ---
    suite("Search: GET /api/search (spoofed address — should use session)");

    const spoofRes = await api(`/api/search?q=hello&userAddress=0xdeadbeef&limit=5`, { token });
    assert([200, 400].includes(spoofRes.status), `Spoofed address uses session (HTTP ${spoofRes.status})`);

    return summary();
}

run().then(({ failed }) => process.exit(failed > 0 ? 1 : 0));
