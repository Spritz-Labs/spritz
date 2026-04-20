import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Health endpoint — never cached.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// -----------------------------------------------------------------------------
// Admin auth (same pattern as other /api/admin/* endpoints)
// -----------------------------------------------------------------------------
async function verifyAdmin(
    request: NextRequest,
): Promise<{ isAdmin: boolean; address: string | null }> {
    const address = request.headers.get("x-admin-address");
    const signature = request.headers.get("x-admin-signature");
    const encodedMessage = request.headers.get("x-admin-message");

    if (!address || !signature || !encodedMessage || !supabase) {
        return { isAdmin: false, address: null };
    }

    try {
        const message = decodeURIComponent(atob(encodedMessage));
        const isValidSignature = await verifyMessage({
            address: address as `0x${string}`,
            message,
            signature: signature as `0x${string}`,
        });
        if (!isValidSignature) return { isAdmin: false, address: null };

        const { data: admin } = await supabase
            .from("shout_admins")
            .select("wallet_address")
            .eq("wallet_address", address.toLowerCase())
            .single();

        return { isAdmin: !!admin, address: address.toLowerCase() };
    } catch {
        return { isAdmin: false, address: null };
    }
}

// -----------------------------------------------------------------------------
// Probe primitives
// -----------------------------------------------------------------------------
type Status = "up" | "degraded" | "down" | "unknown" | "unconfigured";

type ProbeResult = {
    id: string;
    name: string;
    category: string;
    status: Status;
    latencyMs: number | null;
    httpStatus: number | null;
    message: string;
    critical: boolean;
    docUrl?: string;
    probedUrl?: string;
    skipped?: boolean;
};

type ProbeRunner = () => Promise<
    Omit<ProbeResult, "id" | "name" | "category" | "critical" | "docUrl">
>;

type ProbeDef = {
    id: string;
    name: string;
    category: string;
    critical: boolean;
    docUrl?: string;
    /**
     * If returns null, service is considered "unconfigured" and skipped.
     * Otherwise returns the probe function to execute.
     */
    run: () => ProbeRunner | null;
};

/** Perform a fetch with a timeout; always returns timing info. */
async function timedFetch(
    url: string,
    init: RequestInit & { timeoutMs?: number } = {},
): Promise<{
    ok: boolean;
    status: number | null;
    latencyMs: number;
    error: string | null;
    bodyText?: string;
}> {
    const timeoutMs = init.timeoutMs ?? 5000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
    const start = performance.now();
    try {
        const res = await fetch(url, {
            ...init,
            signal: controller.signal,
            // Never cache probes.
            cache: "no-store",
            headers: {
                "user-agent": "Spritz-Healthcheck/1.0",
                ...(init.headers || {}),
            },
        });
        const latencyMs = Math.round(performance.now() - start);
        // For ping-style probes we only need status; avoid reading huge bodies.
        let bodyText: string | undefined;
        try {
            if (res.headers.get("content-length") !== "0") {
                bodyText = await res.text();
                if (bodyText.length > 500) bodyText = bodyText.slice(0, 500);
            }
        } catch {
            // ignore
        }
        return {
            ok: res.ok,
            status: res.status,
            latencyMs,
            error: null,
            bodyText,
        };
    } catch (err) {
        const latencyMs = Math.round(performance.now() - start);
        const aborted = (err as Error | null)?.name === "AbortError";
        return {
            ok: false,
            status: null,
            latencyMs,
            error: aborted ? `timeout (${timeoutMs}ms)` : String((err as Error)?.message || err),
        };
    } finally {
        clearTimeout(timer);
    }
}

/** Convert a fetch-style result into a probe status using conventional thresholds. */
function classify(
    ok: boolean,
    latencyMs: number,
    status: number | null,
    thresholds: { degradedMs?: number } = {},
): Status {
    const degradedMs = thresholds.degradedMs ?? 1500;
    if (!ok) return "down";
    if (latencyMs >= degradedMs) return "degraded";
    if (status !== null && status >= 400) return "degraded";
    return "up";
}

// -----------------------------------------------------------------------------
// Concrete probes
// -----------------------------------------------------------------------------

function rpcProbe(
    url: string,
    method: string = "eth_chainId",
    params: unknown[] = [],
) {
    return async () => {
        const res = await timedFetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method,
                params,
            }),
            timeoutMs: 5000,
        });
        // Accept both HTTP success AND a JSON-RPC payload with no `error` field.
        let rpcOk = res.ok;
        if (res.ok && res.bodyText) {
            try {
                const json = JSON.parse(res.bodyText);
                if (json.error) rpcOk = false;
            } catch {
                rpcOk = false;
            }
        }
        return {
            status: classify(rpcOk, res.latencyMs, res.status),
            latencyMs: res.latencyMs,
            httpStatus: res.status,
            message: rpcOk
                ? `${method} ok`
                : res.error || `rpc error (${res.status})`,
            probedUrl: url,
        };
    };
}

function simpleHttpProbe(
    url: string,
    opts: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
        degradedMs?: number;
        treatStatus?: (status: number) => boolean;
        timeoutMs?: number;
    } = {},
) {
    return async () => {
        const res = await timedFetch(url, {
            method: opts.method ?? "GET",
            headers: opts.headers,
            body: opts.body,
            timeoutMs: opts.timeoutMs ?? 5000,
        });
        const acceptedByTreat =
            res.status !== null && (opts.treatStatus?.(res.status) ?? false);
        const statusOk = res.ok || acceptedByTreat;
        // When treatStatus explicitly accepted a 4xx (e.g. Huddle01's 401
        // liveness ping), don't let classify() downgrade the result to
        // "degraded" just because the HTTP code is ≥ 400. The probe author
        // has declared that status code means "service alive", so we pass
        // a synthetic 200 to classify and keep the real code on the result
        // (via httpStatus) for display / debugging.
        const statusForClassify =
            acceptedByTreat && !res.ok ? 200 : res.status;
        return {
            status: classify(statusOk, res.latencyMs, statusForClassify, {
                degradedMs: opts.degradedMs,
            }),
            latencyMs: res.latencyMs,
            httpStatus: res.status,
            message: statusOk
                ? `HTTP ${res.status}`
                : res.error || `HTTP ${res.status}`,
            probedUrl: url,
        };
    };
}

// -----------------------------------------------------------------------------
// Probe registry
// -----------------------------------------------------------------------------
const PROBES: ProbeDef[] = [
    // ---------- Core infra ----------
    {
        id: "supabase-rest",
        name: "Supabase (REST)",
        category: "Database",
        critical: true,
        docUrl: "https://supabase.com/dashboard",
        run: () => {
            if (!supabaseUrl || !supabaseKey) return null;
            return async () => {
                const start = performance.now();
                try {
                    if (!supabase) throw new Error("client unavailable");
                    // Cheapest possible query: head+count on shout_admins.
                    const { error, status } = await supabase
                        .from("shout_admins")
                        .select("wallet_address", { count: "exact", head: true });
                    const latencyMs = Math.round(performance.now() - start);
                    if (error) {
                        return {
                            status: "down" as Status,
                            latencyMs,
                            httpStatus: status ?? null,
                            message: error.message,
                            probedUrl: supabaseUrl,
                        };
                    }
                    return {
                        status: classify(true, latencyMs, status ?? 200),
                        latencyMs,
                        httpStatus: status ?? 200,
                        message: "head select ok",
                        probedUrl: supabaseUrl,
                    };
                } catch (err) {
                    return {
                        status: "down" as Status,
                        latencyMs: Math.round(performance.now() - start),
                        httpStatus: null,
                        message: (err as Error).message,
                        probedUrl: supabaseUrl,
                    };
                }
            };
        },
    },
    {
        id: "supabase-auth",
        name: "Supabase (Auth)",
        category: "Database",
        critical: true,
        run: () => {
            if (!supabaseUrl) return null;
            const url = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/health`;
            return simpleHttpProbe(url, {
                headers: {
                    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
                },
            });
        },
    },
    {
        id: "upstash-redis",
        name: "Upstash Redis (rate limit)",
        category: "Infrastructure",
        critical: true,
        docUrl: "https://console.upstash.com",
        run: () => {
            const url = process.env.UPSTASH_REDIS_REST_URL;
            const token = process.env.UPSTASH_REDIS_REST_TOKEN;
            if (!url || !token) return null;
            return simpleHttpProbe(`${url.replace(/\/+$/, "")}/ping`, {
                headers: { authorization: `Bearer ${token}` },
            });
        },
    },

    // ---------- Blockchain RPC ----------
    {
        id: "drpc-eth",
        name: "dRPC (Ethereum)",
        category: "Blockchain",
        critical: true,
        run: () => {
            const key = process.env.NEXT_PUBLIC_DRPC_API_KEY || process.env.DRPC_API_KEY;
            if (!key) return null;
            return rpcProbe(
                `https://lb.drpc.org/ogrpc?network=ethereum&dkey=${key}`,
                "eth_blockNumber",
            );
        },
    },
    {
        id: "alchemy-eth",
        name: "Alchemy (Ethereum)",
        category: "Blockchain",
        critical: false,
        run: () => {
            const key = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
            if (!key) return null;
            return rpcProbe(
                `https://eth-mainnet.g.alchemy.com/v2/${key}`,
                "eth_blockNumber",
            );
        },
    },
    {
        id: "helius-sol",
        name: "Helius (Solana)",
        category: "Blockchain",
        critical: false,
        run: () => {
            const key = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
            if (!key) return null;
            return rpcProbe(
                `https://mainnet.helius-rpc.com/?api-key=${key}`,
                "getVersion",
                [],
            );
        },
    },
    {
        id: "solana-public",
        name: "Solana (public RPC)",
        category: "Blockchain",
        critical: false,
        run: () => {
            const url =
                process.env.SOLANA_RPC_URL ||
                "https://api.mainnet-beta.solana.com";
            return rpcProbe(url, "getVersion", []);
        },
    },
    {
        id: "pimlico-bundler",
        name: "Pimlico (ERC-4337)",
        category: "Blockchain",
        critical: false,
        run: () => {
            const key =
                process.env.NEXT_PUBLIC_PIMLICO_API_KEY ||
                process.env.PIMLICO_API_KEY;
            if (!key) return null;
            return rpcProbe(
                `https://api.pimlico.io/v2/1/rpc?apikey=${key}`,
                "pimlico_getUserOperationGasPrice",
                [],
            );
        },
    },

    // ---------- AI / Agents ----------
    {
        id: "google-gemini",
        name: "Google Gemini",
        category: "AI",
        critical: false,
        run: () => {
            const key = process.env.GOOGLE_GEMINI_API_KEY;
            if (!key) return null;
            return simpleHttpProbe(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
                { degradedMs: 2000 },
            );
        },
    },
    {
        id: "grid-graphql",
        name: "The Grid (GraphQL)",
        category: "AI",
        critical: false,
        run: () => {
            const url = process.env.GRID_GRAPHQL_URL;
            const key = process.env.GRID_API_KEY;
            if (!url) return null;
            return simpleHttpProbe(url, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    ...(key ? { authorization: `Bearer ${key}` } : {}),
                },
                body: JSON.stringify({ query: "{ __typename }" }),
                // Grid sometimes returns 400 on bare __typename; treat 2xx/4xx<500 as alive.
                treatStatus: (s) => s < 500,
            });
        },
    },
    {
        id: "firecrawl",
        name: "Firecrawl",
        category: "AI",
        critical: false,
        run: () => {
            const key = process.env.FIRECRAWL_API_KEY;
            if (!key) return null;
            return simpleHttpProbe("https://api.firecrawl.dev/v1/team/credit-usage", {
                headers: { authorization: `Bearer ${key}` },
                // 401/403 also means "service reachable".
                treatStatus: (s) => s === 401 || s === 403,
            });
        },
    },

    // ---------- Media / Calls ----------
    {
        id: "agora",
        name: "Agora (voice/video)",
        category: "Media",
        critical: false,
        docUrl: "https://status.agora.io",
        run: () => {
            const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
            if (!appId) return null;
            // Agora's WebRTC gateway hostnames (webrtc2-ap-web-*.agoraio.net)
            // are chosen dynamically by their SDK and do NOT resolve from a
            // generic DNS lookup — probing them always fails. Use the public
            // REST API root instead; it returns 404 for GET / which is a
            // good liveness signal (the Cloudflare edge is up and the
            // origin is responding).
            return simpleHttpProbe(`https://api.agora.io/`, {
                treatStatus: (s) => s < 500,
                degradedMs: 3000,
            });
        },
    },
    {
        id: "huddle01",
        name: "Huddle01 (rooms)",
        category: "Media",
        critical: false,
        docUrl: "https://docs.huddle01.com",
        run: () => {
            const key = process.env.HUDDLE01_API_KEY;
            if (!key) return null;
            // /api/v1/healthCheck was removed and now returns Cloudflare 521
            // (origin has no route). Probe the v2 create-room endpoint with
            // an obviously-invalid key: a 401 confirms the service is alive
            // and rejecting auth — same pattern as /api/huddle01/health.
            // Never uses the real key so no rooms are actually created.
            return simpleHttpProbe(
                "https://api.huddle01.com/api/v2/sdk/rooms/create-room",
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "x-api-key": "spritz-health-probe-invalid-key",
                    },
                    body: JSON.stringify({
                        roomLocked: false,
                        metadata: { title: "probe" },
                    }),
                    treatStatus: (s) => s === 401 || s === 403 || s < 500,
                    timeoutMs: 8000,
                },
            );
        },
    },
    {
        id: "livepeer",
        name: "Livepeer (streaming)",
        category: "Media",
        critical: false,
        docUrl: "https://livepeer.studio",
        run: () => {
            const key = process.env.LIVEPEER_API_KEY;
            if (!key) return null;
            // /api/stream?limit=1 was timing out at 5s for accounts with
            // large stream histories because Livepeer paginates from the
            // beginning. /api/user/me is a constant-time auth check —
            // always fast. A 401 here would mean our key is invalid; a
            // 200 means we're healthy. Anything < 500 still indicates the
            // service itself is reachable.
            return simpleHttpProbe("https://livepeer.studio/api/user/me", {
                headers: { authorization: `Bearer ${key}` },
                treatStatus: (s) => s < 500,
                timeoutMs: 10000,
                degradedMs: 3000,
            });
        },
    },
    {
        id: "pinata",
        name: "Pinata (IPFS)",
        category: "Media",
        critical: false,
        run: () => {
            const apiKey = process.env.PINATA_API_KEY;
            const secret = process.env.PINATA_SECRET_KEY;
            if (!apiKey || !secret) return null;
            return simpleHttpProbe(
                "https://api.pinata.cloud/data/testAuthentication",
                {
                    headers: {
                        pinata_api_key: apiKey,
                        pinata_secret_api_key: secret,
                    },
                },
            );
        },
    },
    {
        id: "giphy",
        name: "Giphy",
        category: "Media",
        critical: false,
        run: () => {
            const key = process.env.NEXT_PUBLIC_GIPHY_API_KEY;
            if (!key) return null;
            return simpleHttpProbe(
                `https://api.giphy.com/v1/gifs/trending?limit=1&api_key=${key}`,
            );
        },
    },

    // ---------- Communications ----------
    {
        id: "twilio",
        name: "Twilio (SMS)",
        category: "Communications",
        critical: false,
        run: () => {
            const sid = process.env.TWILIO_ACCOUNT_SID;
            const token = process.env.TWILIO_AUTH_TOKEN;
            if (!sid || !token) return null;
            const auth = Buffer.from(`${sid}:${token}`).toString("base64");
            return simpleHttpProbe(
                `https://api.twilio.com/2010-04-01/Accounts/${sid}.json`,
                { headers: { authorization: `Basic ${auth}` } },
            );
        },
    },
    {
        id: "resend",
        name: "Resend (email)",
        category: "Communications",
        critical: false,
        docUrl: "https://resend.com/api-keys",
        run: () => {
            const key = process.env.RESEND_API_KEY;
            if (!key) return null;
            return async () => {
                // Resend has two API-key tiers:
                //   - Full access: can read /domains, /api-keys, etc.
                //   - Sending only: can ONLY POST /emails and GET /emails/:id.
                // Spritz uses a Sending-only key (correct, minimal scope),
                // so /domains returns 401 with a body like
                //   { name: "restricted_api_key", message: "...only send emails" }
                // which is "service healthy, key correctly scoped" — NOT an
                // outage. We treat that as up. Any other 401 (e.g. name:
                // "validation_error" / "API key is invalid") means the key
                // is bad and we flag it as down with an actionable message.
                const url = "https://api.resend.com/domains";
                const res = await timedFetch(url, {
                    headers: { authorization: `Bearer ${key}` },
                    timeoutMs: 5000,
                });

                const body = (res.bodyText ?? "").toLowerCase();
                const isRestrictedKey =
                    /restricted[_ ]api[_ ]key/.test(body) ||
                    /only\s+send\s+emails/.test(body) ||
                    /this\s+api\s+key\s+is\s+restricted/.test(body);

                if (res.status === 401 || res.status === 403) {
                    if (isRestrictedKey) {
                        return {
                            status: classify(true, res.latencyMs, 200),
                            latencyMs: res.latencyMs,
                            httpStatus: res.status,
                            message:
                                "Sending-only API key (correct) — /domains scope not granted, sending works.",
                            probedUrl: url,
                        };
                    }
                    return {
                        status: "down" as Status,
                        latencyMs: res.latencyMs,
                        httpStatus: res.status,
                        message:
                            "API key rejected — RESEND_API_KEY is invalid or revoked. Rotate at resend.com/api-keys.",
                        probedUrl: url,
                    };
                }

                return {
                    status: classify(res.ok, res.latencyMs, res.status),
                    latencyMs: res.latencyMs,
                    httpStatus: res.status,
                    message: res.ok
                        ? `HTTP ${res.status}`
                        : res.error || `HTTP ${res.status}`,
                    probedUrl: url,
                };
            };
        },
    },

    // ---------- Integrations ----------
    {
        id: "thegraph",
        name: "The Graph (subgraphs)",
        category: "Integrations",
        critical: false,
        run: () => {
            const key = process.env.NEXT_PUBLIC_GRAPH_API_KEY;
            if (!key) return null;
            // Any gateway-hosted subgraph endpoint — ping public ENS subgraph for liveness.
            return simpleHttpProbe(
                `https://gateway-arbitrum.network.thegraph.com/api/${key}/subgraphs/id/5XqPmWe6gjyrJtFn9cLy237i4cWw2j9HcUJEXsrxodQg`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ query: "{ _meta { block { number } } }" }),
                },
            );
        },
    },
    {
        id: "spotify",
        name: "Spotify",
        category: "Integrations",
        critical: false,
        run: () => {
            const id = process.env.SPOTIFY_CLIENT_ID;
            const secret = process.env.SPOTIFY_CLIENT_SECRET;
            if (!id || !secret) return null;
            // Client credentials token — fastest health check.
            const auth = Buffer.from(`${id}:${secret}`).toString("base64");
            return simpleHttpProbe("https://accounts.spotify.com/api/token", {
                method: "POST",
                headers: {
                    authorization: `Basic ${auth}`,
                    "content-type": "application/x-www-form-urlencoded",
                },
                body: "grant_type=client_credentials",
            });
        },
    },
    {
        id: "google-places",
        name: "Google Places",
        category: "Integrations",
        critical: false,
        run: () => {
            const key = process.env.GOOGLE_PLACES_API_KEY;
            if (!key) return null;
            return simpleHttpProbe(
                `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=test&inputtype=textquery&key=${key}`,
            );
        },
    },
    {
        id: "poap",
        name: "POAP",
        category: "Integrations",
        critical: false,
        run: () => {
            const key = process.env.POAP_API_KEY;
            if (!key) return null;
            return simpleHttpProbe("https://api.poap.tech/health-check", {
                headers: { "x-api-key": key },
                treatStatus: (s) => s < 500,
            });
        },
    },
    {
        id: "github",
        name: "GitHub (bug reports)",
        category: "Integrations",
        critical: false,
        run: () => {
            const token = process.env.GITHUB_TOKEN;
            if (!token) return null;
            return simpleHttpProbe("https://api.github.com/rate_limit", {
                headers: {
                    authorization: `Bearer ${token}`,
                    accept: "application/vnd.github+json",
                },
            });
        },
    },
    {
        id: "walletconnect",
        name: "WalletConnect Relay",
        category: "Integrations",
        critical: false,
        run: () => {
            return simpleHttpProbe("https://relay.walletconnect.com/health", {
                treatStatus: (s) => s < 500,
            });
        },
    },
    {
        id: "alien-sso",
        name: "Alien SSO",
        category: "Integrations",
        critical: false,
        run: () => {
            const base = process.env.NEXT_PUBLIC_ALIEN_SSO_BASE_URL;
            if (!base) return null;
            return simpleHttpProbe(base, { treatStatus: (s) => s < 500 });
        },
    },
    {
        id: "x402-facilitator",
        name: "x402 Facilitator",
        category: "Payments",
        critical: false,
        run: () => {
            const url = process.env.X402_FACILITATOR_URL;
            if (!url) return null;
            return simpleHttpProbe(url, { treatStatus: (s) => s < 500 });
        },
    },
];

// -----------------------------------------------------------------------------
// Internal Supabase table checks — validate we can read critical tables.
// -----------------------------------------------------------------------------
const CRITICAL_TABLES = [
    "shout_users",
    "shout_messages",
    "shout_channel_messages",
    "shout_alpha_messages",
    "shout_friends",
    "shout_user_settings",
    "shout_admins",
    "shout_public_channels",
    "shout_admin_activity",
];

async function probeTables(): Promise<
    {
        table: string;
        status: Status;
        latencyMs: number | null;
        rows: number | null;
        error: string | null;
    }[]
> {
    if (!supabase)
        return CRITICAL_TABLES.map((t) => ({
            table: t,
            status: "unconfigured" as Status,
            latencyMs: null,
            rows: null,
            error: "supabase not configured",
        }));

    return Promise.all(
        CRITICAL_TABLES.map(async (table) => {
            const start = performance.now();
            try {
                const { count, error, status } = await supabase
                    .from(table)
                    .select("*", { count: "exact", head: true });
                const latencyMs = Math.round(performance.now() - start);
                if (error) {
                    return {
                        table,
                        status: "down" as Status,
                        latencyMs,
                        rows: null,
                        error: `${error.code ?? status ?? "?"}: ${error.message}`,
                    };
                }
                return {
                    table,
                    status: classify(true, latencyMs, status ?? 200),
                    latencyMs,
                    rows: count ?? null,
                    error: null,
                };
            } catch (err) {
                return {
                    table,
                    status: "down" as Status,
                    latencyMs: Math.round(performance.now() - start),
                    rows: null,
                    error: (err as Error).message,
                };
            }
        }),
    );
}

// -----------------------------------------------------------------------------
// Supabase connection pool probe
//
// Fans out a small burst of cheap reads to detect pool saturation. When the
// PostgREST pool is exhausted we see PGRST003 ("Timed out acquiring connection
// from connection pool") and/or 504 gateway timeouts. This probe quantifies
// how much headroom we currently have.
// -----------------------------------------------------------------------------
const POOL_PROBE_FANOUT = 6;
const POOL_PROBE_TIMEOUT_MS = 4_000;

async function probePool(): Promise<{
    status: Status;
    latencyMs: number | null;
    successRate: number;
    p95Ms: number | null;
    maxMs: number | null;
    poolExhausted: boolean;
    errors: string[];
} | null> {
    if (!supabase) return null;

    const attempts = Array.from({ length: POOL_PROBE_FANOUT }, async () => {
        const start = performance.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(
            () => controller.abort(),
            POOL_PROBE_TIMEOUT_MS,
        );
        try {
            const { error } = await supabase
                .from("shout_admins")
                .select("wallet_address", { count: "exact", head: true })
                .abortSignal(controller.signal);
            const latencyMs = performance.now() - start;
            if (error) {
                return {
                    ok: false,
                    latencyMs,
                    error: `${error.code ?? "?"}: ${error.message}`,
                    poolExhausted:
                        error.code === "PGRST003" ||
                        /connection pool/i.test(error.message ?? ""),
                };
            }
            return { ok: true, latencyMs, error: null, poolExhausted: false };
        } catch (err) {
            const e = err as Error;
            return {
                ok: false,
                latencyMs: performance.now() - start,
                error: e.message || "abort",
                poolExhausted: /timeout|abort|pool/i.test(e.message || ""),
            };
        } finally {
            clearTimeout(timeoutId);
        }
    });

    const results = await Promise.all(attempts);
    const successes = results.filter((r) => r.ok).length;
    const successRate = successes / results.length;
    const latencies = results
        .map((r) => r.latencyMs)
        .filter((n): n is number => Number.isFinite(n))
        .sort((a, b) => a - b);
    const p95 =
        latencies.length > 0
            ? Math.round(latencies[Math.floor(latencies.length * 0.95)])
            : null;
    const max =
        latencies.length > 0
            ? Math.round(latencies[latencies.length - 1])
            : null;
    const poolExhausted = results.some((r) => r.poolExhausted);
    const errors = results
        .map((r) => r.error)
        .filter((e): e is string => !!e)
        .slice(0, 3);

    let status: Status;
    if (poolExhausted || successRate < 0.5) status = "down";
    else if (successRate < 1 || (p95 !== null && p95 > 1500))
        status = "degraded";
    else status = "up";

    return {
        status,
        latencyMs: p95,
        successRate,
        p95Ms: p95,
        maxMs: max,
        poolExhausted,
        errors,
    };
}

// -----------------------------------------------------------------------------
// Runtime / build metadata
// -----------------------------------------------------------------------------
function runtimeInfo() {
    return {
        node: process.version,
        region: process.env.VERCEL_REGION ?? "local",
        env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
        commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        commitShort: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
        branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
        deployedAt: process.env.VERCEL_DEPLOYMENT_CREATED_AT ?? null,
        uptimeSec: Math.round(process.uptime?.() ?? 0),
        memoryMb:
            Math.round(
                (process.memoryUsage?.().heapUsed ?? 0) / 1024 / 1024,
            ) || null,
    };
}

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------
export async function GET(request: NextRequest) {
    const { isAdmin } = await verifyAdmin(request);
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const overallStart = performance.now();

    // Run all probes concurrently; each probe enforces its own timeout.
    const probes = await Promise.all(
        PROBES.map(async (p): Promise<ProbeResult> => {
            const runner = p.run();
            if (!runner) {
                return {
                    id: p.id,
                    name: p.name,
                    category: p.category,
                    critical: p.critical,
                    docUrl: p.docUrl,
                    status: "unconfigured",
                    latencyMs: null,
                    httpStatus: null,
                    message: "env not configured",
                    skipped: true,
                };
            }
            try {
                const r = await runner();
                return {
                    id: p.id,
                    name: p.name,
                    category: p.category,
                    critical: p.critical,
                    docUrl: p.docUrl,
                    ...r,
                };
            } catch (err) {
                return {
                    id: p.id,
                    name: p.name,
                    category: p.category,
                    critical: p.critical,
                    docUrl: p.docUrl,
                    status: "down",
                    latencyMs: null,
                    httpStatus: null,
                    message:
                        (err as Error)?.message ?? "unexpected probe failure",
                };
            }
        }),
    );

    const [tables, pool] = await Promise.all([probeTables(), probePool()]);

    // Summary rollup
    const countsByStatus = probes.reduce<Record<Status, number>>(
        (acc, p) => {
            acc[p.status] = (acc[p.status] ?? 0) + 1;
            return acc;
        },
        { up: 0, degraded: 0, down: 0, unknown: 0, unconfigured: 0 },
    );

    const criticalDown = probes.some(
        (p) => p.critical && (p.status === "down"),
    );
    const anyDegraded = probes.some((p) => p.status === "degraded" || p.status === "down");

    const overall: Status = criticalDown
        ? "down"
        : anyDegraded
          ? "degraded"
          : "up";

    const latencies = probes
        .filter((p) => p.latencyMs !== null)
        .map((p) => p.latencyMs as number)
        .sort((a, b) => a - b);
    const p50 =
        latencies.length > 0
            ? latencies[Math.floor(latencies.length * 0.5)]
            : null;
    const p95 =
        latencies.length > 0
            ? latencies[Math.floor(latencies.length * 0.95)]
            : null;
    const maxLatency =
        latencies.length > 0 ? latencies[latencies.length - 1] : null;

    return NextResponse.json({
        generatedAt: new Date().toISOString(),
        totalProbeDurationMs: Math.round(performance.now() - overallStart),
        overall,
        summary: {
            ...countsByStatus,
            total: probes.length,
            criticalDown,
            latency: { p50, p95, max: maxLatency },
        },
        runtime: runtimeInfo(),
        probes,
        tables,
        pool,
    });
}
