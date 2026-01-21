"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ENTITY_GROUP_STYLES,
  buildRelationshipIndex,
  filterEntitiesByName,
  groupEntitiesByType,
  normalizeEntityType,
  type EntityGroupKey,
  type KgSearchEntity,
  type KgSearchEpisode,
  type KgSearchRelationship,
} from "@/lib/delve/knowledgeGraphUtils";

type KnowledgeGraphListProps = {
  agentId: string;
  userAddress: string;
  isActive: boolean;
  initialQuery?: string | null;
  onShowTimeline?: () => void;
};

const GROUP_ORDER: EntityGroupKey[] = ["people", "organizations", "concepts", "other"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isKgEntity = (value: unknown): value is KgSearchEntity => {
  if (!isRecord(value)) return false;
  return (
    typeof value.uuid === "string" &&
    typeof value.name === "string" &&
    typeof value.type === "string"
  );
};

const isKgRelationship = (value: unknown): value is KgSearchRelationship => {
  if (!isRecord(value)) return false;
  return (
    typeof value.source_uuid === "string" &&
    typeof value.source_name === "string" &&
    typeof value.relation === "string" &&
    typeof value.target_uuid === "string" &&
    typeof value.target_name === "string"
  );
};

const isKgEpisode = (value: unknown): value is KgSearchEpisode => {
  if (!isRecord(value)) return false;
  return typeof value.uuid === "string";
};

const parseKgSearchResponse = (payload: unknown) => {
  if (!isRecord(payload)) {
    return { entities: [], relationships: [], episodes: [] };
  }

  const entities = Array.isArray(payload.entities)
    ? payload.entities.filter(isKgEntity)
    : [];
  const relationships = Array.isArray(payload.relationships)
    ? payload.relationships.filter(isKgRelationship)
    : [];
  const episodes = Array.isArray(payload.episodes)
    ? payload.episodes.filter(isKgEpisode)
    : [];

  return { entities, relationships, episodes };
};

export function KnowledgeGraphList({
  agentId,
  userAddress,
  isActive,
  initialQuery,
  onShowTimeline,
}: KnowledgeGraphListProps) {
  const [entities, setEntities] = useState<KgSearchEntity[]>([]);
  const [relationships, setRelationships] = useState<KgSearchRelationship[]>([]);
  const [episodes, setEpisodes] = useState<KgSearchEpisode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [expandedEntityId, setExpandedEntityId] = useState<string | null>(null);

  const fetchKnowledgeGraph = useCallback(
    async (searchTerm: string, signal?: AbortSignal) => {
      if (!agentId || !userAddress) return;
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/agents/${agentId}/delve/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: searchTerm, userAddress }),
          signal,
        });
        const data: unknown = await response.json();

        if (!response.ok) {
          const message =
            isRecord(data) && typeof data.error === "string"
              ? data.error
              : "Search unavailable";
          throw new Error(message);
        }

        const parsed = parseKgSearchResponse(data);
        setEntities(parsed.entities);
        setRelationships(parsed.relationships);
        setEpisodes(parsed.episodes);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Search unavailable");
      } finally {
        setIsLoading(false);
      }
    },
    [agentId, userAddress],
  );

  useEffect(() => {
    if (!isActive) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetchKnowledgeGraph(query.trim(), controller.signal);
    }, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [fetchKnowledgeGraph, isActive, query]);

  useEffect(() => {
    if (initialQuery === undefined) return;
    setQuery(initialQuery ?? "");
  }, [initialQuery]);

  useEffect(() => {
    setExpandedEntityId(null);
  }, [query, isActive]);

  const filteredEntities = useMemo(
    () => filterEntitiesByName(entities, query),
    [entities, query],
  );
  const groupedEntities = useMemo(
    () => groupEntitiesByType(filteredEntities),
    [filteredEntities],
  );
  const relationshipIndex = useMemo(
    () => buildRelationshipIndex(relationships),
    [relationships],
  );

  const hasResults = filteredEntities.length > 0;
  const showEmptyState = !isLoading && !error && entities.length === 0;
  const showNoMatches = !isLoading && !error && entities.length > 0 && !hasResults;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Knowledge Graph</h3>
          <p className="text-xs text-zinc-500">
            {filteredEntities.length} entities · {relationships.length} relationships
          </p>
        </div>
        {episodes.length > 0 && onShowTimeline && (
          <button
            type="button"
            onClick={onShowTimeline}
            className="text-xs text-blue-300 hover:text-blue-200 transition-colors"
          >
            View timeline
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search entities..."
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
        <button
          type="button"
          onClick={() => fetchKnowledgeGraph(query.trim())}
          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-xs text-white rounded-lg transition-colors"
        >
          Search
        </button>
      </div>

      {episodes.length > 0 && (
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-800/30 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-zinc-200">Source episodes</p>
              <p className="text-[11px] text-zinc-500">
                {episodes.length} matched episodes
              </p>
            </div>
            {onShowTimeline && (
              <button
                type="button"
                onClick={onShowTimeline}
                className="text-[11px] text-blue-300 hover:text-blue-200 transition-colors"
              >
                Open timeline
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {episodes.map((episode) => (
              <button
                key={episode.uuid}
                type="button"
                onClick={onShowTimeline}
                className="px-2 py-1 text-[11px] text-zinc-200 bg-zinc-800 border border-zinc-700/60 rounded-full hover:border-blue-500/60 transition-colors"
                title={episode.summary ?? episode.uuid}
              >
                {episode.uuid.slice(0, 8)}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <svg className="animate-spin w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : error ? (
        <div className="text-center py-10">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <span className="text-2xl">⚠️</span>
          </div>
          <h3 className="text-white font-medium mb-2">Search unavailable</h3>
          <p className="text-sm text-zinc-400 mb-4">{error}</p>
          <button
            type="button"
            onClick={() => fetchKnowledgeGraph(query.trim())}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      ) : showEmptyState ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-zinc-800 flex items-center justify-center">
            <span className="text-3xl">🧩</span>
          </div>
          <h3 className="text-white font-medium mb-1">No knowledge graph yet...</h3>
          <p className="text-sm text-zinc-400">
            Chat with your agent to start building connections.
          </p>
        </div>
      ) : showNoMatches ? (
        <div className="text-center py-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-zinc-800 flex items-center justify-center">
            <span className="text-2xl">🔎</span>
          </div>
          <h3 className="text-white font-medium mb-1">No matching entities</h3>
          <p className="text-sm text-zinc-400">Try a different name or keyword.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {GROUP_ORDER.map((groupKey) => {
            const items = groupedEntities[groupKey];
            if (items.length === 0) return null;
            const groupStyle = ENTITY_GROUP_STYLES[groupKey];
            return (
              <div key={groupKey} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-zinc-300">
                    {groupStyle.label}
                  </h4>
                  <span className="text-[11px] text-zinc-500">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((entity) => {
                    const relationCount = relationshipIndex.get(entity.uuid)?.length ?? 0;
                    const isExpanded = expandedEntityId === entity.uuid;
                    const entityStyle = ENTITY_GROUP_STYLES[normalizeEntityType(entity.type)];
                    return (
                      <div key={entity.uuid} className="rounded-xl border border-zinc-700/60 bg-zinc-800/40">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedEntityId((prev) => (prev === entity.uuid ? null : entity.uuid))
                          }
                          className="w-full px-4 py-3 text-left flex items-center justify-between"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-white">{entity.name}</span>
                              <span
                                className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${entityStyle.text} ${entityStyle.bg} ${entityStyle.border}`}
                              >
                                {entity.type}
                              </span>
                            </div>
                            {entity.summary && (
                              <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                                {entity.summary}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-zinc-400">{relationCount} relationships</p>
                            <p className="text-[10px] text-zinc-500">
                              {isExpanded ? "Hide" : "Expand"}
                            </p>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-3">
                            {relationCount === 0 ? (
                              <p className="text-xs text-zinc-500">
                                No relationships found for this entity yet.
                              </p>
                            ) : (
                              <div className="mt-2 space-y-2">
                                {(relationshipIndex.get(entity.uuid) ?? []).map((relation, index) => (
                                  <div
                                    key={`${relation.source_uuid}-${relation.target_uuid}-${index}`}
                                    className="text-xs text-zinc-300 flex items-center gap-2"
                                  >
                                    <span className="text-zinc-400">{relation.source_name}</span>
                                    <span className="text-zinc-500">— {relation.relation} →</span>
                                    <span className="text-zinc-200">{relation.target_name}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {episodes.length > 0 && (
                              <div className="mt-3 flex items-center gap-2 text-[11px] text-zinc-500">
                                <span>Source episodes:</span>
                                {episodes.slice(0, 3).map((episode) => (
                                  <button
                                    key={episode.uuid}
                                    type="button"
                                    onClick={onShowTimeline}
                                    className="px-2 py-0.5 rounded-full border border-zinc-700/60 text-zinc-300 hover:border-blue-500/60 transition-colors"
                                  >
                                    {episode.uuid.slice(0, 6)}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default KnowledgeGraphList;
