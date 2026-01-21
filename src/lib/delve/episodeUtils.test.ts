import assert from "node:assert/strict";
import { test } from "node:test";
import type { Episode } from "./types";
import {
  formatRelativeTime,
  getEpisodeCategories,
  getEpisodeCounts,
  getEpisodeEntities,
  getEpisodeStatusInfo,
  getEpisodeTimestamp,
} from "./episodeUtils.ts";

test("getEpisodeTimestamp parses ISO and seconds", () => {
  const isoEpisode: Episode = {
    uuid: "episode-1",
    created_at: "2025-01-02T03:04:05Z",
  };
  const isoTimestamp = getEpisodeTimestamp(isoEpisode);
  assert.equal(isoTimestamp, Date.parse("2025-01-02T03:04:05Z"));

  const secondsEpisode: Episode = {
    uuid: "episode-2",
    timestamp: 1_700_000_000,
  };
  const secondsTimestamp = getEpisodeTimestamp(secondsEpisode);
  assert.equal(secondsTimestamp, 1_700_000_000 * 1000);
});

test("formatRelativeTime returns friendly labels", () => {
  const now = Date.now();
  const twoHoursAgo = now - 2 * 60 * 60 * 1000;
  const result = formatRelativeTime(twoHoursAgo);
  assert.ok(result.includes("hour"));
});

test("getEpisodeStatusInfo maps aliases", () => {
  const episode: Episode = {
    uuid: "episode-3",
    status: "processing",
  };
  const statusInfo = getEpisodeStatusInfo(episode);
  assert.equal(statusInfo.status, "processing");
  assert.equal(statusInfo.label, "Processing");
});

test("getEpisodeEntities extracts unique names", () => {
  const episode: Episode = {
    uuid: "episode-4",
    entities: [
      { uuid: "e1", label: "Acme Corp", type: "organization" },
      { uuid: "e2", name: "Jane Doe", type: "person" },
      "Acme Corp",
    ],
  };
  const entities = getEpisodeEntities(episode);
  assert.equal(entities.length, 2);
  assert.equal(entities[0].name, "Acme Corp");
});

test("getEpisodeCategories aggregates taxonomy values", () => {
  const episode: Episode = {
    uuid: "episode-5",
    categories: ["Technology"],
    entities: [
      {
        uuid: "e1",
        labels: ["Startups", " "],
        metadata: { taxonomy_labels: ["AI"] },
      },
      {
        uuid: "e2",
        attributes: { category: "Business" },
      },
    ],
  };

  const categories = getEpisodeCategories(episode);
  assert.deepEqual(categories.sort(), ["AI", "Business", "Startups", "Technology"].sort());
});

test("getEpisodeCounts falls back to entity arrays", () => {
  const episode: Episode = {
    uuid: "episode-6",
    stats: { message_count: 4, relationship_count: 3 },
    entities: [{ uuid: "e1", label: "Acme Corp" }, { uuid: "e2", label: "Jane Doe" }],
  };

  const counts = getEpisodeCounts(episode);
  assert.equal(counts.messageCount, 4);
  assert.equal(counts.entityCount, 2);
  assert.equal(counts.relationshipCount, 3);
});
