import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useApi, useApiMutation } from "@/hooks/useApi";

vi.mock("@/lib/reportError", () => ({
    reportError: vi.fn(),
}));

describe("useApi", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("starts with idle state", () => {
        const { result } = renderHook(() => useApi());
        expect(result.current.data).toBeNull();
        expect(result.current.error).toBeNull();
        expect(result.current.isLoading).toBe(false);
    });

    it("fetches data successfully", async () => {
        const mockData = { users: [{ id: 1, name: "Alice" }] };
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockData),
        });

        const { result } = renderHook(() => useApi<typeof mockData>());

        let response: typeof mockData | null = null;
        await act(async () => {
            response = await result.current.execute("/api/users");
        });

        expect(response).toEqual(mockData);
        expect(result.current.data).toEqual(mockData);
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it("handles HTTP error responses", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
            json: () => Promise.resolve({ error: "Not found" }),
        });

        const { result } = renderHook(() => useApi());

        await act(async () => {
            await result.current.execute("/api/missing");
        });

        expect(result.current.data).toBeNull();
        expect(result.current.error).toBe("Not found");
        expect(result.current.isLoading).toBe(false);
    });

    it("handles network failures", async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

        const { result } = renderHook(() => useApi({ context: "test" }));

        await act(async () => {
            await result.current.execute("/api/down");
        });

        expect(result.current.error).toBe("Network timeout");
        expect(result.current.data).toBeNull();
    });

    it("reports errors via reportError", async () => {
        const { reportError } = await import("@/lib/reportError");
        global.fetch = vi.fn().mockRejectedValue(new Error("fail"));

        const { result } = renderHook(() => useApi({ context: "testCtx" }));

        await act(async () => {
            await result.current.execute("/api/x");
        });

        expect(reportError).toHaveBeenCalledWith(
            expect.any(Error),
            expect.objectContaining({ context: "testCtx", silent: true })
        );
    });

    it("resets state", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ value: 42 }),
        });

        const { result } = renderHook(() => useApi());

        await act(async () => {
            await result.current.execute("/api/data");
        });
        expect(result.current.data).toEqual({ value: 42 });

        act(() => {
            result.current.reset();
        });
        expect(result.current.data).toBeNull();
    });

    it("includes credentials by default", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({}),
        });

        const { result } = renderHook(() => useApi());
        await act(async () => {
            await result.current.execute("/api/auth");
        });

        expect(global.fetch).toHaveBeenCalledWith(
            "/api/auth",
            expect.objectContaining({ credentials: "include" })
        );
    });
});

describe("useApiMutation", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("sends POST with JSON body", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ ok: true }),
        });

        const { result } = renderHook(() => useApiMutation("POST"));

        await act(async () => {
            await result.current.execute("/api/messages", { text: "hello" });
        });

        expect(global.fetch).toHaveBeenCalledWith(
            "/api/messages",
            expect.objectContaining({
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: "hello" }),
            })
        );
    });

    it("sends DELETE without body", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ deleted: true }),
        });

        const { result } = renderHook(() => useApiMutation("DELETE"));

        await act(async () => {
            await result.current.execute("/api/messages/123");
        });

        expect(global.fetch).toHaveBeenCalledWith(
            "/api/messages/123",
            expect.objectContaining({
                method: "DELETE",
                body: undefined,
            })
        );
    });
});
