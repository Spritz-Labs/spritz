import { DelveClientError } from "../../../../../lib/delve/types.ts";
import type {
  Episode,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  KnowledgeGraphSearchResponse,
} from "../../../../../lib/delve/types.ts";

export const DEFAULT_EPISODE_LIMIT = 20;
export const MAX_EPISODE_LIMIT = 100;

export type DelveErrorMapping = {
  status: number;
  body: { error: string };
};

export const parseEpisodeLimit = (searchParams: URLSearchParams): number => {
  const rawLimit = searchParams.get("limit");
  if (!rawLimit) return DEFAULT_EPISODE_LIMIT;

  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_EPISODE_LIMIT;
  }

  return Math.min(parsed, MAX_EPISODE_LIMIT);
};

export const mapDelveError = (error: unknown): DelveErrorMapping | null => {
  if (!(error instanceof DelveClientError)) {
    return null;
  }

  if (error.errorCode === "NOT_FOUND") {
    return {
      status: 404,
      body: { error: "Delve agent not found" },
    };
  }

  return {
    status: 503,
    body: { error: "Delve service unavailable" },
  };
};

export type KgSearchEntity = {
  uuid: string;
  name: string;
  type: string;
  summary?: string;
};

export type KgSearchRelationship = {
  source_uuid: string;
  source_name: string;
  relation: string;
  target_uuid: string;
  target_name: string;
};

export type KgSearchCategory = {
  name: string;
  count: number;
};

export type KgSearchEpisode = {
  uuid: string;
  summary?: string;
  created_at?: string;
};

export type KgSearchResponse = {
  entities: KgSearchEntity[];
  relationships: KgSearchRelationship[];
  categories: KgSearchCategory[];
  episodes: KgSearchEpisode[];
};

const CATEGORY_KEYS = [
  "labels",
  "category",
  "categories",
  "taxonomy",
  "taxonomy_labels",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeText = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const readString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  return normalizeText(value);
};

const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const results: string[] = [];
  for (const entry of value) {
    const normalized = readString(entry);
    if (normalized) {
      results.push(normalized);
    }
  }
  return results;
};

const collectCategoryValues = (
  container: Record<string, unknown>,
  categories: Set<string>,
): void => {
  for (const key of CATEGORY_KEYS) {
    const rawValue = container[key];
    const stringValue = readString(rawValue);
    if (stringValue) {
      categories.add(stringValue);
      continue;
    }
    for (const entry of readStringArray(rawValue)) {
      categories.add(entry);
    }
  }
};

const extractCategoryNames = (node: KnowledgeGraphNode): string[] => {
  const record = node as Record<string, unknown>;
  const categories = new Set<string>();
  collectCategoryValues(record, categories);

  const attributes = record.attributes;
  if (isRecord(attributes)) {
    collectCategoryValues(attributes, categories);
  }

  const metadata = record.metadata;
  if (isRecord(metadata)) {
    collectCategoryValues(metadata, categories);
  }

  return Array.from(categories);
};

const getNodeName = (node: KnowledgeGraphNode): string => {
  const record = node as Record<string, unknown>;
  return (
    readString(record.label) ??
    readString(record.name) ??
    readString(node.uuid) ??
    "unknown"
  );
};

const getNodeType = (node: KnowledgeGraphNode): string => {
  const record = node as Record<string, unknown>;
  return (
    readString(record.type) ??
    readString(record.node_type) ??
    "unknown"
  );
};

const getNodeSummary = (node: KnowledgeGraphNode): string | null => {
  const record = node as Record<string, unknown>;
  return readString(record.summary);
};

const buildNodeLookup = (
  entities: KnowledgeGraphNode[],
  nodes: KnowledgeGraphNode[],
): Map<string, KgSearchEntity> => {
  const lookup = new Map<string, KgSearchEntity>();
  const combined = [...entities, ...nodes];

  for (const node of combined) {
    const uuid = readString(node.uuid);
    if (!uuid || lookup.has(uuid)) {
      continue;
    }

    const summary = getNodeSummary(node);
    lookup.set(uuid, {
      uuid,
      name: getNodeName(node),
      type: getNodeType(node),
      ...(summary ? { summary } : {}),
    });
  }

  return lookup;
};

const resolveEdgeEndpoint = (
  edge: KnowledgeGraphEdge,
  key: string,
): string | null => {
  const record = edge as Record<string, unknown>;
  return readString(record[key]);
};

const resolveEdgeRelation = (edge: KnowledgeGraphEdge): string => {
  const record = edge as Record<string, unknown>;
  return (
    readString(record.relationship) ??
    readString(record.relation_type) ??
    readString(record.label) ??
    readString(record.relation) ??
    "related_to"
  );
};

const mapEpisodes = (episodes: Episode[]): KgSearchEpisode[] => {
  const mapped: KgSearchEpisode[] = [];
  for (const episode of episodes) {
    const record = episode as Record<string, unknown>;
    const uuid = readString(record.uuid);
    if (!uuid) continue;

    const summary = readString(record.summary);
    const createdAt = readString(record.created_at);
    mapped.push({
      uuid,
      ...(summary ? { summary } : {}),
      ...(createdAt ? { created_at: createdAt } : {}),
    });
  }
  return mapped;
};

export const buildKgSearchResponse = (
  response?: KnowledgeGraphSearchResponse | null,
): KgSearchResponse => {
  if (!response) {
    return {
      entities: [],
      relationships: [],
      categories: [],
      episodes: [],
    };
  }

  const entities = response.entities ?? [];
  const nodes = response.nodes ?? [];
  const edges = response.edges ?? [];
  const episodes = response.episodes ?? [];
  const nodeLookup = buildNodeLookup(entities, nodes);

  const mappedEntities = entities.flatMap((entity) => {
    const uuid = readString(entity.uuid);
    if (!uuid) {
      return [];
    }

    const summary = getNodeSummary(entity);
    return [
      {
        uuid,
        name: getNodeName(entity),
        type: getNodeType(entity),
        ...(summary ? { summary } : {}),
      },
    ];
  });

  const relationships = edges.flatMap((edge) => {
    const sourceUuid =
      resolveEdgeEndpoint(edge, "source_uuid") ??
      resolveEdgeEndpoint(edge, "source");
    const targetUuid =
      resolveEdgeEndpoint(edge, "target_uuid") ??
      resolveEdgeEndpoint(edge, "target");

    if (!sourceUuid || !targetUuid) {
      return [];
    }

    const sourceName = nodeLookup.get(sourceUuid)?.name ?? sourceUuid;
    const targetName = nodeLookup.get(targetUuid)?.name ?? targetUuid;

    return [
      {
        source_uuid: sourceUuid,
        source_name: sourceName,
        relation: resolveEdgeRelation(edge),
        target_uuid: targetUuid,
        target_name: targetName,
      },
    ];
  });

  const categoryCounts = new Map<string, number>();
  for (const entity of entities) {
    const uniqueCategories = new Set(extractCategoryNames(entity));
    for (const category of uniqueCategories) {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
  }

  const categories = Array.from(categoryCounts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, count]) => ({ name, count }));

  return {
    entities: mappedEntities,
    relationships,
    categories,
    episodes: mapEpisodes(episodes),
  };
};
