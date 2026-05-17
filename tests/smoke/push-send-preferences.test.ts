import { describe, it, expect, vi } from "vitest";

function chainMock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const handler: ProxyHandler<Record<string, unknown>> = {
        get(target, prop) {
            if (prop === "then") return undefined;
            if (prop in target) return target[prop as string];
            if (prop === "data") return overrides.data ?? null;
            if (prop === "error") return overrides.error ?? null;
            return (..._args: unknown[]) => new Proxy({ ...overrides }, handler);
        },
    };
    return new Proxy({ ...overrides }, handler);
}

const mockSendNotification = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("web-push", () => ({
    default: {
        setVapidDetails: vi.fn(),
        sendNotification: mockSendNotification,
        WebPushError: class extends Error {
            statusCode: number;
            constructor(msg: string, code: number) {
                super(msg);
                this.statusCode = code;
            }
        },
    },
}));

let mockUserPrefs: Record<string, unknown> | null = null;
const mockSubscription: Record<string, unknown> | null = {
    endpoint: "https://push.example.com/test",
    p256dh: "test-p256dh",
    auth: "test-auth",
};

vi.mock("@supabase/supabase-js", () => ({
    createClient: () => ({
        from: (table: string) => {
            if (table === "shout_users") {
                return chainMock({ data: mockUserPrefs, error: null });
            }
            if (table === "push_subscriptions") {
                return chainMock({ data: mockSubscription, error: null });
            }
            if (table === "shout_usernames") {
                return chainMock({ data: null, error: null });
            }
            return chainMock({});
        },
    }),
}));

vi.mock("@/lib/ratelimit", () => ({
    checkRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-vapid-pub");
vi.stubEnv("VAPID_PRIVATE_KEY", "test-vapid-priv");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");

describe("/api/push/send - preference enforcement", () => {
    it("suppresses DM push when notify_dms is false", async () => {
        mockUserPrefs = {
            notify_dms: false,
            notify_groups: true,
            notify_channels: true,
            notify_calls: true,
            notification_quiet_start: null,
            notification_quiet_end: null,
        };
        mockSendNotification.mockClear();

        const { POST } = await import("@/app/api/push/send/route");

        const req = new Request("http://localhost/api/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetAddress: "0xtest", type: "message", body: "hi" }),
        });

        const res = await POST(req as never);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.suppressed).toBe("notify_dms");
        expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("suppresses group push when notify_groups is false", async () => {
        mockUserPrefs = {
            notify_dms: true,
            notify_groups: false,
            notify_channels: true,
            notify_calls: true,
            notification_quiet_start: null,
            notification_quiet_end: null,
        };
        mockSendNotification.mockClear();

        const { POST } = await import("@/app/api/push/send/route");

        const req = new Request("http://localhost/api/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetAddress: "0xtest", type: "group_message", body: "hi" }),
        });

        const res = await POST(req as never);
        const data = await res.json();

        expect(data.suppressed).toBe("notify_groups");
    });

    it("suppresses during quiet hours for non-call types", async () => {
        const currentHour = new Date().getUTCHours();
        mockUserPrefs = {
            notify_dms: true,
            notify_groups: true,
            notify_channels: true,
            notify_calls: true,
            notification_quiet_start: currentHour,
            notification_quiet_end: (currentHour + 2) % 24,
        };
        mockSendNotification.mockClear();

        const { POST } = await import("@/app/api/push/send/route");

        const req = new Request("http://localhost/api/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetAddress: "0xtest", type: "message", body: "hi" }),
        });

        const res = await POST(req as never);
        const data = await res.json();

        expect(data.suppressed).toBe("quiet_hours");
    });

    it("does NOT suppress calls during quiet hours", async () => {
        const currentHour = new Date().getUTCHours();
        mockUserPrefs = {
            notify_dms: true,
            notify_groups: true,
            notify_channels: true,
            notify_calls: true,
            notification_quiet_start: currentHour,
            notification_quiet_end: (currentHour + 2) % 24,
        };
        mockSendNotification.mockClear();

        const { POST } = await import("@/app/api/push/send/route");

        const req = new Request("http://localhost/api/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                targetAddress: "0xtest",
                type: "incoming_call",
                callerId: "0xcaller",
            }),
        });

        const res = await POST(req as never);
        const data = await res.json();

        expect(data.suppressed).toBeUndefined();
        expect(data.success).toBe(true);
    });
});
