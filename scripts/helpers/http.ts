import { env } from "./env.js";

export interface RequestOptions {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    token?: string;
    apiKey?: string;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<{ status: number; data: T }> {
    const url = `${env.BASE_URL}${path}`;
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...opts.headers,
    };

    if (opts.token) {
        headers["Authorization"] = `Bearer ${opts.token}`;
        headers["Cookie"] = `spritz_session=${opts.token}`;
    }
    if (opts.apiKey) {
        headers["X-API-Key"] = opts.apiKey;
    }

    const res = await fetch(url, {
        method: opts.method || "GET",
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        redirect: "manual",
    });

    const text = await res.text();
    let data: T;
    try {
        data = JSON.parse(text) as T;
    } catch {
        data = text as unknown as T;
    }
    return { status: res.status, data };
}

export async function supabaseAnon<T = unknown>(
    table: string,
    query: string = "",
): Promise<{ status: number; data: T }> {
    const url = `${env.SUPABASE_URL}/rest/v1/${table}${query ? "?" + query : ""}`;
    const res = await fetch(url, {
        headers: {
            apikey: env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        },
    });
    const text = await res.text();
    let data: T;
    try {
        data = JSON.parse(text) as T;
    } catch {
        data = text as unknown as T;
    }
    return { status: res.status, data };
}
