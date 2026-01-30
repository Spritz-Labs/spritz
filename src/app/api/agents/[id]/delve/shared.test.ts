import assert from "node:assert/strict";
import { test } from "node:test";
import { DelveClientError } from "../../../../../lib/delve/types.ts";
import {
  DEFAULT_EPISODE_LIMIT,
  MAX_EPISODE_LIMIT,
  buildKgSearchResponse,
  mapDelveError,
  parseEpisodeLimit,
} from "./shared.ts";

test("parseEpisodeLimit uses default when missing", () => {
  const params = new URLSearchParams();
  assert.equal(parseEpisodeLimit(params), DEFAULT_EPISODE_LIMIT);
});

test("parseEpisodeLimit clamps to max", () => {
  const params = new URLSearchParams({ limit: "999" });
  assert.equal(parseEpisodeLimit(params), MAX_EPISODE_LIMIT);
});

test("parseEpisodeLimit ignores invalid values", () => {
  const params = new URLSearchParams({ limit: "nope" });
  assert.equal(parseEpisodeLimit(params), DEFAULT_EPISODE_LIMIT);
});

test("mapDelveError maps not found to 404", () => {
  const error = new DelveClientError("missing", {
    statusCode: 404,
    errorCode: "NOT_FOUND",
  });

  const mapped = mapDelveError(error);
  assert.ok(mapped);
  assert.equal(mapped?.status, 404);
  assert.equal(mapped?.body.error, "Delve agent not found");
});

test("mapDelveError maps server errors to 503", () => {
  const error = new DelveClientError("down", {
    statusCode: 503,
    errorCode: "SERVER_ERROR",
  });

  const mapped = mapDelveError(error);
  assert.ok(mapped);
  assert.equal(mapped?.status, 503);
  assert.equal(mapped?.body.error, "Delve service unavailable");
});

test("buildKgSearchResponse returns empty arrays for null response", () => {
  const result = buildKgSearchResponse(null);
  assert.deepEqual(result, {
    entities: [],
    relationships: [],
    categories: [],
    episodes: [],
  });
});

test("buildKgSearchResponse maps entities and relationships", () => {
  const result = buildKgSearchResponse({
    success: true,
    query: "test",
    num_results: 1,
    episodes: [],
    entities: [
      {
        uuid: "entity-1",
        label: "Acme Corp",
        type: "organization",
        summary: "A demo organization.",
      },
      {
        uuid: "entity-2",
        name: "Jane Doe",
        type: "person",
      },
    ],
    edges: [
      {
        source_uuid: "entity-1",
        target_uuid: "entity-2",
        relationship: "employs",
      },
      {
        source: "entity-2",
        target: "entity-3",
        relation_type: "leads",
      },
    ],
    nodes: [
      {
        uuid: "entity-3",
        label: "Project Atlas",
        type: "project",
      },
    ],
  });

  assert.equal(result.entities.length, 2);
  assert.deepEqual(result.entities[0], {
    uuid: "entity-1",
    name: "Acme Corp",
    type: "organization",
    summary: "A demo organization.",
  });

  assert.deepEqual(result.relationships, [
    {
      source_uuid: "entity-1",
      source_name: "Acme Corp",
      relation: "employs",
      target_uuid: "entity-2",
      target_name: "Jane Doe",
    },
    {
      source_uuid: "entity-2",
      source_name: "Jane Doe",
      relation: "leads",
      target_uuid: "entity-3",
      target_name: "Project Atlas",
    },
  ]);
});

test("buildKgSearchResponse aggregates categories from metadata", () => {
  const result = buildKgSearchResponse({
    success: true,
    query: "",
    num_results: 2,
    episodes: [],
    entities: [
      {
        uuid: "entity-1",
        label: "Acme Corp",
        type: "organization",
        labels: ["Technology", "Startups", " "],
        attributes: {
          categories: ["Innovation", "Technology"],
          category: "Business",
        },
        metadata: {
          taxonomy_labels: ["AI"],
        },
      },
      {
        uuid: "entity-2",
        label: "Jane Doe",
        type: "person",
        labels: ["AI"],
        metadata: {
          categories: ["Leadership"],
        },
      },
    ],
    edges: [],
    nodes: [],
  });

  const categories = Object.fromEntries(
    result.categories.map((category) => [category.name, category.count]),
  );

  assert.equal(categories.Technology, 1);
  assert.equal(categories.Startups, 1);
  assert.equal(categories.Innovation, 1);
  assert.equal(categories.Business, 1);
  assert.equal(categories.AI, 2);
  assert.equal(categories.Leadership, 1);
});
