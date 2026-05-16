import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));

vi.mock("resend", () => ({
    Resend: class {
        emails = { send: mockSend };
    },
}));

vi.mock("@supabase/supabase-js", () => ({
    createClient: () => ({
        from: () => ({
            update: () => ({
                eq: () => ({ error: null }),
            }),
        }),
    }),
}));

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
vi.stubEnv("RESEND_API_KEY", "re_test_key");
vi.stubEnv("CRON_SECRET", "test-secret");

describe("/api/email/lifecycle", () => {
    beforeEach(() => {
        mockSend.mockClear();
    });

    it("sends a 30-day lifecycle email", async () => {
        const { POST } = await import("@/app/api/email/lifecycle/route");

        const request = new Request("http://localhost/api/email/lifecycle", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                authorization: "Bearer test-secret",
            },
            body: JSON.stringify({
                targetAddress: "0xabc123",
                email: "user@example.com",
                username: "alice",
                stage: "30d",
                unreadCount: 5,
                topFriendName: "Bob",
                daysSinceLogin: 32,
            }),
        });

        const response = await POST(request as never);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.stage).toBe("30d");
        expect(["A", "B", "C"]).toContain(data.variant);

        expect(mockSend).toHaveBeenCalledTimes(1);
        const sendArgs = mockSend.mock.calls[0][0];
        expect(sendArgs.to).toBe("user@example.com");
        expect(sendArgs.from).toContain("kevin@spritz.chat");
        expect(sendArgs.html).toContain("Spritz");
        expect(sendArgs.html).toContain("Open Spritz");
        expect(sendArgs.html).toContain("Unsubscribe");
    });

    it("rejects missing required fields", async () => {
        const { POST } = await import("@/app/api/email/lifecycle/route");

        const request = new Request("http://localhost/api/email/lifecycle", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                authorization: "Bearer test-secret",
            },
            body: JSON.stringify({
                targetAddress: "0xabc123",
            }),
        });

        const response = await POST(request as never);
        expect(response.status).toBe(400);
    });

    it("includes unread count in email when available", async () => {
        const { POST } = await import("@/app/api/email/lifecycle/route");

        const request = new Request("http://localhost/api/email/lifecycle", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                authorization: "Bearer test-secret",
            },
            body: JSON.stringify({
                targetAddress: "0x000000000000000000000000000000000000000a",
                email: "test@test.com",
                stage: "30d",
                unreadCount: 12,
                topFriendName: "Charlie",
            }),
        });

        const response = await POST(request as never);
        expect(response.status).toBe(200);

        const sendArgs = mockSend.mock.calls[0][0];
        expect(sendArgs.html).toContain("12");
        expect(sendArgs.html).toContain("unread message");
    });
});
