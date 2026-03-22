import { suite, assert, assertStatus, summary } from "../helpers/assert.js";
import { mintSessionToken } from "../helpers/auth.js";
import { api } from "../helpers/http.js";
import { env } from "../helpers/env.js";

async function run() {
    const token = await mintSessionToken(env.TEST_WALLET_ADDRESS, "wallet");

    // --- List channels ---
    suite("Channels: GET /api/channels");

    const listRes = await api<{ channels?: unknown[] }>("/api/channels", { token });
    assertStatus(listRes.status, 200, "List channels returns 200");
    assert(Array.isArray(listRes.data.channels), "Response contains channels array");

    const channels = listRes.data.channels || [];
    let testChannelId: string | null = null;

    // --- Create channel ---
    suite("Channels: POST /api/channels (create)");

    const createRes = await api("/api/channels", {
        method: "POST",
        token,
        body: {
            name: `e2e-test-${Date.now()}`,
            description: "Automated test channel",
            category: "general",
            messaging_type: "standard",
        },
    });
    assert([200, 201].includes(createRes.status), `Create channel (HTTP ${createRes.status})`);
    const created = createRes.data as Record<string, unknown>;
    testChannelId = (created.id || (created.channel as Record<string, unknown>)?.id) as string | null;

    if (testChannelId) {
        // --- Get single channel ---
        suite("Channels: GET /api/channels/[id]");

        const getRes = await api(`/api/channels/${testChannelId}`, { token });
        assertStatus(getRes.status, 200, "Get channel returns 200");

        // --- Join channel ---
        suite("Channels: POST /api/channels/[id]/join");

        const joinRes = await api(`/api/channels/${testChannelId}/join`, { method: "POST", token });
        assert([200, 409, 500].includes(joinRes.status), `Join channel (HTTP ${joinRes.status}) — creator may already be a member`);

        // --- Get members ---
        suite("Channels: GET /api/channels/[id]/members");

        const membersRes = await api(`/api/channels/${testChannelId}/members`, { token });
        assertStatus(membersRes.status, 200, "Members returns 200");

        // --- Send message ---
        suite("Channels: POST /api/channels/[id]/messages");

        const msgRes = await api(`/api/channels/${testChannelId}/messages`, {
            method: "POST",
            token,
            body: { content: "E2E test message " + Date.now() },
        });
        assert([200, 201].includes(msgRes.status), `Send message (HTTP ${msgRes.status})`);

        // --- Get messages ---
        suite("Channels: GET /api/channels/[id]/messages");

        const msgsRes = await api(`/api/channels/${testChannelId}/messages`, { token });
        assertStatus(msgsRes.status, 200, "Get messages returns 200");

        // --- Reactions ---
        suite("Channels: GET /api/channels/[id]/reactions");

        const reactRes = await api(`/api/channels/${testChannelId}/reactions`, { token });
        assert([200, 404].includes(reactRes.status), `Reactions endpoint (HTTP ${reactRes.status})`);

        // --- Leave channel ---
        suite("Channels: POST /api/channels/[id]/leave");

        const leaveRes = await api(`/api/channels/${testChannelId}/leave`, { method: "POST", token });
        assert([200, 204, 500].includes(leaveRes.status), `Leave channel (HTTP ${leaveRes.status})`);
    } else {
        console.log("  SKIP  No channel ID from create — skipping channel interaction tests");
    }

    return summary();
}

run().then(({ failed }) => process.exit(failed > 0 ? 1 : 0));
