import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side singleton Supabase clients.
 *
 * IMPORTANT: Each `createClient` call allocates HTTP keep-alive agents and, under load,
 * contributes to the PostgREST connection pool pressure on Supabase. Creating a fresh
 * client per request (as many of our routes used to do) cascades into pool exhaustion,
 * which shows up as `PGRST003: Timed out acquiring connection from connection pool` and
 * 504 gateway timeouts.
 *
 * We cache instances on `globalThis` so they survive Next.js HMR and are shared across
 * all route handlers in the same serverless function invocation.
 */

const SERVICE_KEY = Symbol.for("spritz.supabase.server.service.v1");
const ANON_KEY = Symbol.for("spritz.supabase.server.anon.v1");

type GlobalWithClients = typeof globalThis & {
    [SERVICE_KEY]?: SupabaseClient | null;
    [ANON_KEY]?: SupabaseClient | null;
};

const g = globalThis as GlobalWithClients;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function makeServiceClient(): SupabaseClient | null {
    if (!supabaseUrl || !serviceKey) return null;
    return createClient(supabaseUrl, serviceKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
        global: {
            headers: { "x-client-info": "spritz-server" },
        },
    });
}

function makeAnonClient(): SupabaseClient | null {
    if (!supabaseUrl || !anonKey) return null;
    return createClient(supabaseUrl, anonKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
        global: {
            headers: { "x-client-info": "spritz-server-anon" },
        },
    });
}

/**
 * Service-role Supabase client (bypasses RLS). Use only from trusted server code.
 * Returns `null` if env vars are missing.
 */
export const supabaseService: SupabaseClient | null =
    g[SERVICE_KEY] ?? (g[SERVICE_KEY] = makeServiceClient());

/**
 * Anon-role Supabase client for server code that wants to run under RLS.
 */
export const supabaseAnonServer: SupabaseClient | null =
    g[ANON_KEY] ?? (g[ANON_KEY] = makeAnonClient());

/**
 * Throw-if-missing helper for code paths that require service-role access.
 */
export function requireSupabaseService(): SupabaseClient {
    if (!supabaseService) {
        throw new Error(
            "Supabase service client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
        );
    }
    return supabaseService;
}
