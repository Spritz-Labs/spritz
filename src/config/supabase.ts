"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
        "Supabase not configured - friends and calling features will be limited",
    );
}

// Use a global symbol so that:
//   1. Dev HMR doesn't create a new GoTrueClient every reload
//   2. Accidental duplicate imports (from different module specifiers) still share the same instance
//
// Without this, Supabase logs: "Multiple GoTrueClient instances detected in the
// same browser context" and auth state can desynchronize between copies.
const GLOBAL_KEY = Symbol.for("spritz.supabase.client.v1");

type GlobalWithSupabase = typeof globalThis & {
    [GLOBAL_KEY]?: SupabaseClient | null;
};

const g = globalThis as GlobalWithSupabase;

function makeClient(): SupabaseClient | null {
    if (!supabaseUrl || !supabaseAnonKey) return null;
    return createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            // Explicit, unique storage key so Supabase's internal "one client per
            // storageKey" check only ever sees this instance.
            storageKey: "sb-spritz-auth",
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
        },
    });
}

export const supabase: SupabaseClient | null =
    g[GLOBAL_KEY] ?? (g[GLOBAL_KEY] = makeClient());

export const isSupabaseConfigured = !!supabase;
