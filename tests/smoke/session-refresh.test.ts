import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { server } from "../mocks/server";
import { http, HttpResponse } from "msw";
import { refreshSessionSafely } from "@/lib/sessionRefresh";

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("refreshSessionSafely", () => {
  it("returns 'ok' when POST succeeds", async () => {
    server.use(
      http.post("/api/auth/session", () => HttpResponse.json({ ok: true })),
    );
    expect(await refreshSessionSafely()).toBe("ok");
  });

  it("returns 'ok' when POST 401 but GET confirms authenticated", async () => {
    server.use(
      http.post("/api/auth/session", () =>
        HttpResponse.json({ error: "Unauthorized" }, { status: 401 }),
      ),
      http.get("/api/auth/session", () =>
        HttpResponse.json({ authenticated: true }),
      ),
    );
    expect(await refreshSessionSafely()).toBe("ok");
  });

  it("returns 'expired' when both POST and GET reject", async () => {
    server.use(
      http.post("/api/auth/session", () =>
        HttpResponse.json({ error: "Unauthorized" }, { status: 401 }),
      ),
      http.get("/api/auth/session", () =>
        HttpResponse.json({ authenticated: false }, { status: 401 }),
      ),
    );
    expect(await refreshSessionSafely()).toBe("expired");
  });

  it("returns 'expired' when POST 401 and GET returns authenticated=false", async () => {
    server.use(
      http.post("/api/auth/session", () =>
        HttpResponse.json({}, { status: 401 }),
      ),
      http.get("/api/auth/session", () =>
        HttpResponse.json({ authenticated: false }),
      ),
    );
    expect(await refreshSessionSafely()).toBe("expired");
  });

  it("returns 'unknown' on non-401 server error", async () => {
    server.use(
      http.post("/api/auth/session", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
    );
    expect(await refreshSessionSafely()).toBe("unknown");
  });

  it("returns 'network' when fetch throws", async () => {
    server.use(
      http.post("/api/auth/session", () => HttpResponse.error()),
    );
    expect(await refreshSessionSafely()).toBe("network");
  });

  it("returns 'network' when POST 401 and GET throws", async () => {
    server.use(
      http.post("/api/auth/session", () =>
        HttpResponse.json({}, { status: 401 }),
      ),
      http.get("/api/auth/session", () => HttpResponse.error()),
    );
    expect(await refreshSessionSafely()).toBe("network");
  });
});
