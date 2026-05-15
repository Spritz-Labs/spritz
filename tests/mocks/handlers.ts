import { http, HttpResponse } from "msw";

/**
 * MSW request handlers for the Spritz test suite.
 * Stubs the most critical API routes so component tests can render
 * without hitting a real backend.
 */
export const handlers = [
  // Auth session — unauthenticated by default; override in individual tests
  http.get("/api/auth/session", () =>
    HttpResponse.json({ authenticated: false }),
  ),

  http.post("/api/auth/session", () =>
    HttpResponse.json({ ok: true }),
  ),

  // Friend requests
  http.get("/api/friend-requests", () =>
    HttpResponse.json({
      incoming: [],
      outgoing: [],
      friends: [],
    }),
  ),

  // Channels
  http.get("/api/channels", () => HttpResponse.json([])),

  // Messages — empty DM list
  http.get("/api/messages", () => HttpResponse.json([])),

  // User settings
  http.get("/api/user/settings", () =>
    HttpResponse.json({ settings: {} }),
  ),

  // AI agents
  http.get("/api/agents", () => HttpResponse.json([])),
];
