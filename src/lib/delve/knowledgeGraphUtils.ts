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

export type KgSearchEpisode = {
  uuid: string;
  summary?: string;
  created_at?: string;
};

export type EntityGroupKey = "people" | "organizations" | "concepts" | "other";

export const ENTITY_GROUP_STYLES: Record<
  EntityGroupKey,
  { label: string; text: string; bg: string; border: string }
> = {
  people: {
    label: "People",
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
  organizations: {
    label: "Organizations",
    text: "text-blue-300",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  concepts: {
    label: "Concepts",
    text: "text-purple-300",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
  },
  other: {
    label: "Other",
    text: "text-zinc-300",
    bg: "bg-zinc-700/20",
    border: "border-zinc-600/40",
  },
};

export const normalizeEntityType = (type?: string | null): EntityGroupKey => {
  if (!type) return "other";
  const normalized = type.toLowerCase();
  if (normalized.includes("person") || normalized.includes("people") || normalized.includes("human")) {
    return "people";
  }
  if (
    normalized.includes("org") ||
    normalized.includes("company") ||
    normalized.includes("organization") ||
    normalized.includes("institution")
  ) {
    return "organizations";
  }
  if (normalized.includes("concept") || normalized.includes("topic") || normalized.includes("idea")) {
    return "concepts";
  }
  return "other";
};

export const groupEntitiesByType = (
  entities: KgSearchEntity[],
): Record<EntityGroupKey, KgSearchEntity[]> => {
  const grouped: Record<EntityGroupKey, KgSearchEntity[]> = {
    people: [],
    organizations: [],
    concepts: [],
    other: [],
  };

  for (const entity of entities) {
    grouped[normalizeEntityType(entity.type)].push(entity);
  }

  for (const key of Object.keys(grouped) as EntityGroupKey[]) {
    grouped[key].sort((left, right) => left.name.localeCompare(right.name));
  }

  return grouped;
};

export const filterEntitiesByName = (
  entities: KgSearchEntity[],
  query: string,
): KgSearchEntity[] => {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return entities;
  return entities.filter((entity) => entity.name.toLowerCase().includes(trimmed));
};

export const buildRelationshipIndex = (
  relationships: KgSearchRelationship[],
): Map<string, KgSearchRelationship[]> => {
  const index = new Map<string, KgSearchRelationship[]>();

  for (const relationship of relationships) {
    const sourceList = index.get(relationship.source_uuid) ?? [];
    sourceList.push(relationship);
    index.set(relationship.source_uuid, sourceList);

    const targetList = index.get(relationship.target_uuid) ?? [];
    targetList.push(relationship);
    index.set(relationship.target_uuid, targetList);
  }

  return index;
};
