import { suite, assert, summary } from "../helpers/assert.js";
import { mintSessionToken } from "../helpers/auth.js";
import { api } from "../helpers/http.js";
import { env } from "../helpers/env.js";

async function run() {
    const token = await mintSessionToken(env.TEST_WALLET_ADDRESS, "wallet");

    // --- List agents ---
    suite("Agents: GET /api/agents");

    const listRes = await api("/api/agents", { token });
    assert([200, 400, 404].includes(listRes.status), `List agents (HTTP ${listRes.status})`);

    // --- Discover agents ---
    suite("Agents: GET /api/agents/discover");

    const discoverRes = await api("/api/agents/discover", { token });
    assert([200, 400, 404].includes(discoverRes.status), `Discover agents (HTTP ${discoverRes.status})`);

    // --- Favorites ---
    suite("Agents: GET /api/agents/favorites");

    const favRes = await api("/api/agents/favorites", { token });
    assert([200, 400, 404].includes(favRes.status), `Favorites (HTTP ${favRes.status})`);

    return summary();
}

run().then(({ failed }) => process.exit(failed > 0 ? 1 : 0));
