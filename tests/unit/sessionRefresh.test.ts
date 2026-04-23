/**
 * Unit tests for `refreshSessionSafely()` — the helper behind the chat
 * session persistence fix.
 *
 * This file is runnable with no extra dependencies:
 *
 *   npx tsx tests/unit/sessionRefresh.test.ts
 *
 * It exits with non-zero on any failure, so it can drop into CI as-is.
 */

import { refreshSessionSafely } from "../../src/lib/sessionRefresh";

type FetchStub = (url: string, init?: RequestInit) => Promise<Response>;

function installFetch(stub: FetchStub): void {
    (globalThis as unknown as { fetch: FetchStub }).fetch = stub;
}

function mockResponse(status: number, body: unknown = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

type Case = {
    name: string;
    run: () => Promise<void>;
};

const cases: Case[] = [
    {
        name: "returns 'ok' when POST succeeds",
        async run() {
            const calls: Array<{ method?: string }> = [];
            installFetch(async (_url, init) => {
                calls.push({ method: init?.method });
                return mockResponse(200, { ok: true });
            });

            const result = await refreshSessionSafely();
            assert(result === "ok", `expected 'ok', got '${result}'`);
            assert(calls.length === 1, `expected 1 call, got ${calls.length}`);
            assert(calls[0].method === "POST", "first call must be POST");
        },
    },
    {
        name: "returns 'ok' when POST is 401 but GET confirms authenticated",
        async run() {
            const methods: string[] = [];
            installFetch(async (_url, init) => {
                const method = init?.method ?? "GET";
                methods.push(method);
                if (method === "POST") {
                    return mockResponse(401, { error: "Unauthorized" });
                }
                return mockResponse(200, { authenticated: true });
            });

            const result = await refreshSessionSafely();
            assert(result === "ok", `expected 'ok', got '${result}'`);
            assert(
                methods.join(",") === "POST,GET",
                `expected POST,GET, got ${methods.join(",")}`,
            );
        },
    },
    {
        name: "returns 'expired' when POST and GET both 401",
        async run() {
            installFetch(async (_url, init) => {
                return mockResponse(401, { authenticated: false });
            });

            const result = await refreshSessionSafely();
            assert(result === "expired", `expected 'expired', got '${result}'`);
        },
    },
    {
        name: "returns 'expired' when POST 401 and GET returns authenticated=false",
        async run() {
            installFetch(async (_url, init) => {
                if (init?.method === "POST") return mockResponse(401);
                return mockResponse(200, { authenticated: false });
            });

            const result = await refreshSessionSafely();
            assert(result === "expired", `expected 'expired', got '${result}'`);
        },
    },
    {
        name: "returns 'network' when POST throws",
        async run() {
            installFetch(async () => {
                throw new TypeError("Failed to fetch");
            });

            const result = await refreshSessionSafely();
            assert(result === "network", `expected 'network', got '${result}'`);
        },
    },
    {
        name: "returns 'network' when POST 401 and GET throws",
        async run() {
            installFetch(async (_url, init) => {
                if (init?.method === "POST") return mockResponse(401);
                throw new TypeError("Failed to fetch");
            });

            const result = await refreshSessionSafely();
            assert(result === "network", `expected 'network', got '${result}'`);
        },
    },
    {
        name: "returns 'unknown' on non-401 non-OK response (e.g. 500)",
        async run() {
            installFetch(async () => mockResponse(500, { error: "boom" }));

            const result = await refreshSessionSafely();
            assert(result === "unknown", `expected 'unknown', got '${result}'`);
        },
    },
];

function assert(cond: boolean, msg: string): asserts cond {
    if (!cond) throw new Error(msg);
}

async function main() {
    let passed = 0;
    let failed = 0;

    for (const c of cases) {
        try {
            await c.run();
            console.log(`\u2713 ${c.name}`);
            passed += 1;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`\u2717 ${c.name}\n    ${msg}`);
            failed += 1;
        }
    }

    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
