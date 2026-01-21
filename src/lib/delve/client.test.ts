import assert from "node:assert/strict";
import { test } from "node:test";
import type { StackMessage } from "./types.ts";

test("addToStack sends paired messages payload", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.DELVE_API_URL;
  const originalKey = process.env.DELVE_API_KEY;

  process.env.DELVE_API_URL = "https://delve.example.test";
  process.env.DELVE_API_KEY = "test-key";

  let capturedBody: string | null = null;

  const mockFetch: typeof fetch = async (_input, init) => {
    const body = init?.body;
    capturedBody = typeof body === "string" ? body : null;
    return new Response(
      JSON.stringify({
        success: true,
        message_ids: ["m1", "m2"],
        message_count: 2,
        stack_count: 2,
        is_paired: true,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  globalThis.fetch = mockFetch;

  try {
    const { DelveClient } = await import("./client.ts");
    const client = new DelveClient({
      baseUrl: "https://delve.example.test",
      apiKey: "test-key",
    });

    const messages: StackMessage[] = [
      {
        text: "Hello",
        userId: "user-1",
        username: "user-1",
        chatId: "chat-1",
        agentId: "agent-1",
        timestamp: "2025-01-01T00:00:00.000Z",
      },
      {
        text: "Hi there",
        userId: "agent-1",
        username: "Agent",
        chatId: "chat-1",
        agentId: "agent-1",
        timestamp: "2025-01-01T00:00:01.000Z",
      },
    ];

    await client.addToStack("agent-1", messages);

    assert.ok(capturedBody);
    assert.deepEqual(JSON.parse(capturedBody ?? "{}"), {
      messages,
      is_paired: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
    process.env.DELVE_API_URL = originalUrl;
    process.env.DELVE_API_KEY = originalKey;
  }
});
