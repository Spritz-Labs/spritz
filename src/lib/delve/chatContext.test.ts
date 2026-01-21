import assert from "node:assert/strict";
import { test } from "node:test";
import { buildKgContext } from "./chatContext.ts";
import type { KnowledgeGraphSearchResponse } from "./types.ts";

test("buildKgContext maps entities and relationships", () => {
  const response: KnowledgeGraphSearchResponse = {
    success: true,
    query: "test",
    num_results: 1,
    episodes: [{ uuid: "episode-1" }],
    entities: [
      { uuid: "node-1", label: "Alice", type: "Person" },
      { uuid: "node-2", type: "Company" },
    ],
    edges: [
      {
        uuid: "edge-1",
        source_uuid: "node-1",
        target_uuid: "node-2",
        relationship: "works_at",
      },
    ],
    nodes: [],
  };

  const context = buildKgContext(response);

  assert.ok(context);
  assert.equal(context?.episode_id, "episode-1");
  assert.deepEqual(context?.entities, [
    { uuid: "node-1", name: "Alice", type: "Person" },
    { uuid: "node-2", name: "node-2", type: "Company" },
  ]);
  assert.deepEqual(context?.relationships, [
    { source: "Alice", relation: "works_at", target: "node-2" },
  ]);
});
