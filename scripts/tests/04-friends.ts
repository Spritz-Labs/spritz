import { suite, assert, assertStatus, summary } from "../helpers/assert.js";
import { mintSessionToken } from "../helpers/auth.js";
import { api } from "../helpers/http.js";
import { env } from "../helpers/env.js";

async function run() {
    const walletToken = await mintSessionToken(env.TEST_WALLET_ADDRESS, "wallet");
    const emailToken = await mintSessionToken(env.TEST_EMAIL_ADDRESS, "email");

    // --- List friends ---
    suite("Friends: GET /api/friends");

    const listRes = await api<{ friends?: unknown[] }>("/api/friends", { token: walletToken });
    if (listRes.status === 404) {
        console.log("  SKIP  Friends routes not deployed yet (404)");
        return summary();
    }
    assertStatus(listRes.status, 200, "List friends returns 200");
    assert(Array.isArray(listRes.data.friends), "Response contains friends array");

    // --- Send friend request ---
    suite("Friends: POST /api/friend-requests (send)");

    const sendRes = await api("/api/friend-requests", {
        method: "POST",
        token: walletToken,
        body: { toAddress: env.TEST_EMAIL_ADDRESS, memo: "E2E test request" },
    });
    assert(sendRes.status === 200 || sendRes.status === 400 || sendRes.status === 404, `Send request (HTTP ${sendRes.status})`);
    const sendData = sendRes.data as Record<string, unknown>;
    const requestObj = sendData.request as Record<string, unknown> | undefined;
    const requestId = requestObj?.id as string | undefined;

    // --- List requests (outgoing) ---
    suite("Friends: GET /api/friend-requests?type=outgoing");

    const outRes = await api<{ outgoing?: unknown[] }>("/api/friend-requests?type=outgoing", { token: walletToken });
    assert(outRes.status === 200 || outRes.status === 404, `Outgoing requests (HTTP ${outRes.status})`);

    // --- List requests (incoming for other user) ---
    suite("Friends: GET /api/friend-requests?type=incoming");

    const inRes = await api<{ incoming?: unknown[] }>("/api/friend-requests?type=incoming", { token: emailToken });
    assert(inRes.status === 200 || inRes.status === 404, `Incoming requests (HTTP ${inRes.status})`);

    if (requestId) {
        // --- Accept request ---
        suite("Friends: POST /api/friend-requests/[id]/accept");

        const acceptRes = await api(`/api/friend-requests/${requestId}/accept`, { method: "POST", token: emailToken });
        assert(acceptRes.status === 200 || acceptRes.status === 404, `Accept request (HTTP ${acceptRes.status})`);

        // --- List friends after accept ---
        suite("Friends: GET /api/friends (after accept)");

        const friendsRes = await api<{ friends?: unknown[] }>("/api/friends", { token: walletToken });
        assertStatus(friendsRes.status, 200, "Friends list returns 200 after accept");
        const friends = friendsRes.data.friends || [];

        if (friends.length > 0) {
            const friendId = (friends[0] as Record<string, unknown>).id as string;

            suite("Friends: PATCH /api/friends/[id] (nickname)");
            const nickRes = await api(`/api/friends/${friendId}`, {
                method: "PATCH",
                token: walletToken,
                body: { nickname: "Test Buddy" },
            });
            assert(nickRes.status === 200, `Update nickname (HTTP ${nickRes.status})`);

            suite("Friends: DELETE /api/friends/[id]");
            const removeRes = await api(`/api/friends/${friendId}`, { method: "DELETE", token: walletToken });
            assert(removeRes.status === 200, `Remove friend (HTTP ${removeRes.status})`);
        }
    } else if (sendRes.status === 400) {
        suite("Friends: GET /api/friend-requests (check existing)");
        const allRes = await api<{ outgoing?: Array<Record<string, unknown>> }>("/api/friend-requests?type=outgoing", { token: walletToken });
        const existing = allRes.data.outgoing?.[0];
        if (existing?.id) {
            const cancelRes = await api(`/api/friend-requests/${existing.id}`, { method: "DELETE", token: walletToken });
            assert(cancelRes.status === 200, `Cancel existing request (HTTP ${cancelRes.status})`);
        } else {
            console.log("  SKIP  No request to cancel");
        }
    }

    return summary();
}

run().then(({ failed }) => process.exit(failed > 0 ? 1 : 0));
