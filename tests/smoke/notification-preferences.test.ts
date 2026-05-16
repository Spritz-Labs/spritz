import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/app/api/notifications/preferences/route", () => ({
    NotificationPreferences: {},
}));

describe("useNotificationPreferences", () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it("loads preferences on mount", async () => {
        const mockPrefs = {
            quietStart: 22,
            quietEnd: 8,
            notifyDms: true,
            notifyGroups: false,
            notifyChannels: true,
            notifyCalls: true,
        };

        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockPrefs),
        });

        const { useNotificationPreferences } = await import("@/hooks/useNotificationPreferences");
        const { result } = renderHook(() => useNotificationPreferences("0xtest"));

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.prefs.quietStart).toBe(22);
        expect(result.current.prefs.notifyGroups).toBe(false);
    });

    it("does not fetch when address is empty", async () => {
        globalThis.fetch = vi.fn();

        const { useNotificationPreferences } = await import("@/hooks/useNotificationPreferences");
        renderHook(() => useNotificationPreferences(""));

        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("updates preferences via PATCH", async () => {
        globalThis.fetch = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () =>
                    Promise.resolve({
                        quietStart: null,
                        quietEnd: null,
                        notifyDms: true,
                        notifyGroups: true,
                        notifyChannels: true,
                        notifyCalls: true,
                    }),
            })
            .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) });

        const { useNotificationPreferences } = await import("@/hooks/useNotificationPreferences");
        const { result } = renderHook(() => useNotificationPreferences("0xtest"));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        let success: boolean = false;
        await act(async () => {
            success = await result.current.updatePrefs({
                notifyGroups: false,
            });
        });

        expect(success).toBe(true);
        expect(result.current.prefs.notifyGroups).toBe(false);

        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        const patchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
        expect(patchCall[1].method).toBe("PATCH");
    });
});
