import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRelationshipIndex,
  filterEntitiesByName,
  groupEntitiesByType,
  normalizeEntityType,
  type KgSearchEntity,
  type KgSearchRelationship,
} from "./knowledgeGraphUtils.ts";

test("normalizeEntityType maps known types", () => {
  assert.equal(normalizeEntityType("person"), "people");
  assert.equal(normalizeEntityType("Organization"), "organizations");
  assert.equal(normalizeEntityType("concept"), "concepts");
  assert.equal(normalizeEntityType("event"), "other");
});

test("groupEntitiesByType buckets entities", () => {
  const entities: KgSearchEntity[] = [
    { uuid: "1", name: "Ada Lovelace", type: "person" },
    { uuid: "2", name: "Acme Corp", type: "organization" },
    { uuid: "3", name: "Compilers", type: "concept" },
    { uuid: "4", name: "Launch Party", type: "event" },
  ];

  const grouped = groupEntitiesByType(entities);
  assert.equal(grouped.people.length, 1);
  assert.equal(grouped.organizations.length, 1);
  assert.equal(grouped.concepts.length, 1);
  assert.equal(grouped.other.length, 1);
});

test("buildRelationshipIndex attaches relationships to endpoints", () => {
  const relationships: KgSearchRelationship[] = [
    {
      source_uuid: "1",
      source_name: "Ada Lovelace",
      relation: "founded",
      target_uuid: "2",
      target_name: "Acme Corp",
    },
    {
      source_uuid: "2",
      source_name: "Acme Corp",
      relation: "uses",
      target_uuid: "3",
      target_name: "Compilers",
    },
  ];

  const index = buildRelationshipIndex(relationships);
  assert.equal(index.get("1")?.length, 1);
  assert.equal(index.get("2")?.length, 2);
  assert.equal(index.get("3")?.length, 1);
});

test("filterEntitiesByName matches case-insensitive substrings", () => {
  const entities: KgSearchEntity[] = [
    { uuid: "1", name: "Acme Corp", type: "organization" },
    { uuid: "2", name: "Beta Labs", type: "organization" },
  ];

  const filtered = filterEntitiesByName(entities, "acme");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].uuid, "1");
});
