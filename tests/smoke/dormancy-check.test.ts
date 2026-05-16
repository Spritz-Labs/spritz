import { describe, it, expect, vi } from "vitest";

function chainMock(): Record<string, unknown> {
    const handler: ProxyHandler<Record<string, unknown>> = {
        get(_target, prop) {
            if (prop === "then") return undefined;
            if (prop === "data") return [];
            if (prop === "error") return null;
            return (..._args: unknown[]) => new Proxy({ data: [], error: null }, handler);
        },
    };
    return new Proxy({ data: [], error: null }, handler);
}

vi.mock("@supabase/supabase-js", () => ({
    createClient: () => chainMock(),
}));

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
vi.stubEnv("CRON_SECRET", "test-secret");

describe("Dormancy check cron", () => {
    it("rejects unauthorized requests", async () => {
        const { GET } = await import("@/app/api/cron/dormancy-check/route");

        const request = new Request("http://localhost/api/cron/dormancy-check", {
            headers: { authorization: "Bearer wrong-secret" },
        });

        const response = await GET(request as never);
        expect(response.status).toBe(401);
    });

    it("returns stats on successful run with empty user base", async () => {
        const { GET } = await import("@/app/api/cron/dormancy-check/route");

        const request = new Request("http://localhost/api/cron/dormancy-check", {
            headers: { authorization: "Bearer test-secret" },
        });

        const response = await GET(request as never);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.stats).toHaveProperty("pushSent");
        expect(data.stats).toHaveProperty("emailSent");
        expect(data.stats).toHaveProperty("autoUnsubscribed");
        expect(data.stats.pushSent).toBe(0);
        expect(data.stats.emailSent).toBe(0);
    });
});
