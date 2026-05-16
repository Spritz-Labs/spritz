import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@/config/supabase", () => ({
    supabase: null,
    isSupabaseConfigured: false,
}));

describe("useUsername - AbortController cleanup", () => {
    let abortSpy: ReturnType<typeof vi.fn>;
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
        abortSpy = vi.fn();

        const originalAbortController = globalThis.AbortController;
        globalThis.AbortController = class extends originalAbortController {
            abort(...args: Parameters<AbortController["abort"]>) {
                abortSpy();
                return super.abort(...args);
            }
        } as typeof AbortController;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it("aborts the fetch when unmounted before response", async () => {
        let resolveRequest: (value: Response) => void;
        globalThis.fetch = vi.fn(
            () =>
                new Promise<Response>((resolve) => {
                    resolveRequest = resolve;
                })
        );

        const { useUsername } = await import("@/hooks/useUsername");
        const { unmount } = renderHook(() => useUsername("0x1234567890abcdef"));

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);

        unmount();
        expect(abortSpy).toHaveBeenCalledTimes(1);
    });

    it("passes signal to fetch call", async () => {
        globalThis.fetch = vi
            .fn()
            .mockResolvedValue(new Response(JSON.stringify({ username: null }), { status: 200 }));

        const { useUsername } = await import("@/hooks/useUsername");
        renderHook(() => useUsername("0xabc123"));

        expect(globalThis.fetch).toHaveBeenCalledWith(
            expect.stringContaining("/api/username"),
            expect.objectContaining({ signal: expect.any(AbortSignal) })
        );
    });

    it("does not fetch when address is empty", async () => {
        globalThis.fetch = vi.fn();

        const { useUsername } = await import("@/hooks/useUsername");
        renderHook(() => useUsername(""));

        expect(globalThis.fetch).not.toHaveBeenCalled();
    });
});
