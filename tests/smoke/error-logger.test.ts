import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
    createClient: vi.fn(() => null),
}));

describe("errorLogger", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it("exports logError function", async () => {
        const mod = await import("@/lib/errorLogger");
        expect(typeof mod.logError).toBe("function");
    });

    it("exports logSafeTransactionError", async () => {
        const mod = await import("@/lib/errorLogger");
        expect(typeof mod.logSafeTransactionError).toBe("function");
    });

    it("exports logPasskeySigningError", async () => {
        const mod = await import("@/lib/errorLogger");
        expect(typeof mod.logPasskeySigningError).toBe("function");
    });

    it("logError handles missing supabase gracefully", async () => {
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const mod = await import("@/lib/errorLogger");

        const result = await mod.logError({
            errorType: "api_error",
            errorMessage: "test error",
        });

        expect(result).toBeNull();
        consoleSpy.mockRestore();
    });

    it("logErrorFromClient sends to API", async () => {
        const mockFetch = vi.fn().mockResolvedValue({ ok: true });
        global.fetch = mockFetch;

        const mod = await import("@/lib/errorLogger");
        const result = await mod.logErrorFromClient({
            errorType: "other",
            errorMessage: "client-side crash",
            context: { userAddress: "0x123" },
        });

        expect(result).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/admin/error-log",
            expect.objectContaining({
                method: "POST",
                body: expect.stringContaining("client-side crash"),
            })
        );
    });

    it("logErrorFromClient returns false on network failure", async () => {
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        global.fetch = vi.fn().mockRejectedValue(new Error("Network down"));

        const mod = await import("@/lib/errorLogger");
        const result = await mod.logErrorFromClient({
            errorType: "other",
            errorMessage: "test",
        });

        expect(result).toBe(false);
        consoleSpy.mockRestore();
    });
});
