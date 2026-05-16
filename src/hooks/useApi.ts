"use client";

import { useState, useCallback } from "react";
import { reportError } from "@/lib/reportError";

interface ApiState<T> {
    data: T | null;
    error: string | null;
    isLoading: boolean;
}

interface UseApiOptions {
    context?: string;
}

/**
 * Lightweight wrapper for fetch-based API calls with consistent
 * loading/error state management and error reporting.
 *
 * Usage:
 *   const { data, isLoading, error, execute } = useApi<User[]>();
 *   await execute("/api/users");
 */
export function useApi<T = unknown>(options: UseApiOptions = {}) {
    const [state, setState] = useState<ApiState<T>>({
        data: null,
        error: null,
        isLoading: false,
    });

    const execute = useCallback(
        async (url: string, init?: RequestInit): Promise<T | null> => {
            setState((prev) => ({ ...prev, isLoading: true, error: null }));

            try {
                const res = await fetch(url, {
                    credentials: "include",
                    ...init,
                });

                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    const msg = body.error || body.message || `Request failed (${res.status})`;
                    setState({ data: null, error: msg, isLoading: false });
                    return null;
                }

                const data = (await res.json()) as T;
                setState({ data, error: null, isLoading: false });
                return data;
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Network error";
                reportError(err, { context: options.context || "useApi", silent: true });
                setState({ data: null, error: msg, isLoading: false });
                return null;
            }
        },
        [options.context]
    );

    const reset = useCallback(() => {
        setState({ data: null, error: null, isLoading: false });
    }, []);

    return { ...state, execute, reset };
}

/**
 * Shorthand for JSON POST/PATCH/PUT requests.
 *
 * Usage:
 *   const { execute } = useApiMutation<{ ok: boolean }>();
 *   await execute("/api/settings", { theme: "dark" });
 */
export function useApiMutation<T = unknown>(
    method: "POST" | "PATCH" | "PUT" | "DELETE" = "POST",
    options: UseApiOptions = {}
) {
    const { data, error, isLoading, execute: rawExecute, reset } = useApi<T>(options);

    const execute = useCallback(
        async (url: string, body?: unknown): Promise<T | null> => {
            return rawExecute(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: body ? JSON.stringify(body) : undefined,
            });
        },
        [rawExecute, method]
    );

    return { data, error, isLoading, execute, reset };
}
