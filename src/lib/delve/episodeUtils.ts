import type { Episode } from "./types";

export type EpisodeStatus = "processed" | "processing" | "pending" | "failed" | "unknown";

export type EpisodeStatusInfo = {
  status: EpisodeStatus;
  label: string;
  tone: "success" | "warning" | "error" | "neutral";
};

export type EpisodeEntitySummary = {
  name: string;
  type?: string;
  uuid?: string;
};

export type EpisodeCounts = {
  messageCount: number;
  entityCount: number;
  relationshipCount: number;
  categoryCount: number;
};

const STATUS_LABELS: Record<EpisodeStatus, EpisodeStatusInfo> = {
  processed: { status: "processed", label: "Processed", tone: "success" },
  processing: { status: "processing", label: "Processing", tone: "warning" },
  pending: { status: "pending", label: "Pending", tone: "warning" },
  failed: { status: "failed", label: "Failed", tone: "error" },
  unknown: { status: "unknown", label: "Unknown", tone: "neutral" },
};

const STATUS_ALIASES: Record<string, EpisodeStatus> = {
  processed: "processed",
  complete: "processed",
  completed: "processed",
  done: "processed",
  success: "processed",
  processing: "processing",
  in_progress: "processing",
  inprogress: "processing",
  running: "processing",
  pending: "pending",
  queued: "pending",
  waiting: "pending",
  failed: "failed",
  error: "failed",
  rejected: "failed",
};

const CATEGORY_KEYS = [
  "labels",
  "category",
  "categories",
  "taxonomy",
  "taxonomy_labels",
  "taxonomyLabels",
  "category_names",
  "categoryNames",
] as const;

const CATEGORY_MAP_KEYS = [
  "category_counts",
  "categoryCounts",
  "categories_count",
  "categoriesCount",
] as const;

const ENTITY_LIST_KEYS = [
  "entities",
  "nodes",
  "key_entities",
  "keyEntities",
  "entity_list",
  "entityList",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const readNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^[+-]?(\d+|\d*\.\d+)$/.test(trimmed)) {
      return null;
    }
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const results: string[] = [];
  for (const entry of value) {
    const normalized = readString(entry);
    if (normalized) {
      results.push(normalized);
    } else if (isRecord(entry)) {
      const name = readString(entry.name) ?? readString(entry.label);
      if (name) results.push(name);
    }
  }
  return results;
};

const readTimestampValue = (value: unknown): number | null => {
  const numeric = readNumber(value);
  if (numeric !== null) {
    const asMillis = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    return Number.isFinite(asMillis) ? asMillis : null;
  }

  const text = readString(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
};

const resolveStatusValue = (value: unknown): EpisodeStatusInfo => {
  const raw = readString(value);
  if (!raw) return STATUS_LABELS.unknown;
  const normalized = raw.trim().toLowerCase();
  const status = STATUS_ALIASES[normalized] ?? "unknown";
  return STATUS_LABELS[status];
};

const readCountFromContainer = (
  container: Record<string, unknown>,
  keys: string[],
): number | null => {
  for (const key of keys) {
    const value = container[key];
    const numeric = readNumber(value);
    if (numeric !== null) return Math.max(0, Math.floor(numeric));
    if (Array.isArray(value)) return value.length;
  }
  return null;
};

const getNestedContainers = (record: Record<string, unknown>): Record<string, unknown>[] => {
  const containers = [record];
  for (const key of ["stats", "metrics", "counts"] as const) {
    const nested = record[key];
    if (isRecord(nested)) {
      containers.push(nested);
    }
  }
  return containers;
};

const addCategory = (categories: Set<string>, value: string | null) => {
  if (!value) return;
  categories.add(value);
};

const collectCategoryValues = (
  container: Record<string, unknown>,
  categories: Set<string>,
) => {
  for (const key of CATEGORY_KEYS) {
    const value = container[key];
    addCategory(categories, readString(value));
    for (const entry of readStringArray(value)) {
      categories.add(entry);
    }
  }

  for (const key of CATEGORY_MAP_KEYS) {
    const value = container[key];
    if (!isRecord(value)) continue;
    for (const [category, countValue] of Object.entries(value)) {
      if (!readString(category)) continue;
      const count = readNumber(countValue);
      if (count === null || count <= 0) continue;
      categories.add(category);
    }
  }
};

const collectCategoriesFromEntities = (entities: unknown[], categories: Set<string>) => {
  for (const entry of entities) {
    if (!isRecord(entry)) continue;
    collectCategoryValues(entry, categories);
    const attributes = entry.attributes;
    if (isRecord(attributes)) {
      collectCategoryValues(attributes, categories);
    }
    const metadata = entry.metadata;
    if (isRecord(metadata)) {
      collectCategoryValues(metadata, categories);
    }
  }
};

export const getEpisodeTimestamp = (episode: Episode): number | null => {
  const record = episode as Record<string, unknown>;
  const candidates = [
    record.created_at,
    record.createdAt,
    record.timestamp,
    record.started_at,
    record.start_time,
    record.startTime,
  ];
  for (const candidate of candidates) {
    const parsed = readTimestampValue(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
};

export const formatRelativeTime = (timestamp: number | null): string => {
  if (!timestamp) return "Unknown";
  const now = Date.now();
  const diff = now - timestamp;
  if (diff <= 0) return "Just now";

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 30) {
    return new Date(timestamp).toLocaleDateString();
  }
  if (days > 0) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
  if (hours > 0) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  return "Just now";
};

export const getEpisodeStatusInfo = (episode: Episode): EpisodeStatusInfo => {
  const record = episode as Record<string, unknown>;
  const candidates = [
    record.status,
    record.processing_status,
    record.processingStatus,
    record.state,
  ];
  for (const candidate of candidates) {
    const info = resolveStatusValue(candidate);
    if (info.status !== "unknown") {
      return info;
    }
  }
  return STATUS_LABELS.unknown;
};

export const getEpisodeEntities = (
  episode: Episode,
  limit?: number,
): EpisodeEntitySummary[] => {
  const record = episode as Record<string, unknown>;
  const entities: EpisodeEntitySummary[] = [];
  const seen = new Set<string>();

  for (const key of ENTITY_LIST_KEYS) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      const name =
        readString(entry) ??
        (isRecord(entry) ? readString(entry.name) ?? readString(entry.label) : null);
      if (!name) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      const type = isRecord(entry)
        ? readString(entry.type) ?? readString(entry.node_type) ?? readString(entry.entity_type)
        : null;
      const uuid = isRecord(entry) ? readString(entry.uuid) ?? readString(entry.id) : null;
      entities.push({
        name,
        ...(type ? { type } : {}),
        ...(uuid ? { uuid } : {}),
      });
      if (limit && entities.length >= limit) {
        return entities;
      }
    }
  }
  return entities;
};

export const getEpisodeCategories = (
  episode: Episode,
  limit?: number,
): string[] => {
  const record = episode as Record<string, unknown>;
  const categories = new Set<string>();
  collectCategoryValues(record, categories);

  for (const key of ENTITY_LIST_KEYS) {
    const listValue = record[key];
    if (Array.isArray(listValue)) {
      collectCategoriesFromEntities(listValue, categories);
    }
  }

  const entries = Array.from(categories).sort((left, right) => left.localeCompare(right));
  return typeof limit === "number" ? entries.slice(0, limit) : entries;
};

export const getEpisodeCounts = (episode: Episode): EpisodeCounts => {
  const record = episode as Record<string, unknown>;
  const containers = getNestedContainers(record);

  const messageCountKeys = ["message_count", "messages_count", "messageCount", "messagesCount"];
  const entityCountKeys = ["entity_count", "entities_count", "entityCount", "entitiesCount"];
  const relationshipCountKeys = [
    "relationship_count",
    "relationships_count",
    "relationshipCount",
    "relationshipsCount",
  ];

  let messageCount = 0;
  let entityCount = 0;
  let relationshipCount = 0;

  for (const container of containers) {
    if (!messageCount) {
      messageCount = readCountFromContainer(container, messageCountKeys) ?? messageCount;
    }
    if (!entityCount) {
      entityCount = readCountFromContainer(container, entityCountKeys) ?? entityCount;
    }
    if (!relationshipCount) {
      relationshipCount =
        readCountFromContainer(container, relationshipCountKeys) ?? relationshipCount;
    }
  }

  if (!entityCount) {
    entityCount = getEpisodeEntities(episode).length;
  }
  if (!relationshipCount) {
    const relationships =
      (isRecord(record) && Array.isArray(record.relationships)
        ? record.relationships
        : Array.isArray(record.edges)
          ? record.edges
          : []) ?? [];
    relationshipCount = relationships.length;
  }

  const categoryCount = getEpisodeCategories(episode).length;

  return {
    messageCount,
    entityCount,
    relationshipCount,
    categoryCount,
  };
};
