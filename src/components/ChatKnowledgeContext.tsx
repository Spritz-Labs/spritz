"use client";

import { useState } from "react";
import type { ChatKgContext } from "@/lib/delve/chatContext";
import { ENTITY_GROUP_STYLES, normalizeEntityType } from "@/lib/delve/knowledgeGraphUtils";

type ChatKnowledgeContextProps = {
  context: ChatKgContext;
  onEntitySelect?: (entityName: string) => void;
  onEpisodeSelect?: (episodeId: string) => void;
};

export function ChatKnowledgeContext({
  context,
  onEntitySelect,
  onEpisodeSelect,
}: ChatKnowledgeContextProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const entityCount = context.entities.length;
  const relationshipCount = context.relationships.length;

  return (
    <div className="mt-3 rounded-xl border border-zinc-700/60 bg-zinc-900/60">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full px-3 py-2 flex items-center justify-between text-xs text-zinc-200"
      >
        <span>
          📊 Knowledge Context ({entityCount} entities, {relationshipCount} relationships)
        </span>
        <svg
          className={`w-4 h-4 text-zinc-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
          {entityCount > 0 && (
            <div className="flex flex-wrap gap-2">
              {context.entities.map((entity) => {
                const style = ENTITY_GROUP_STYLES[normalizeEntityType(entity.type)];
                const isClickable = Boolean(onEntitySelect);
                return (
                  <button
                    key={entity.uuid}
                    type="button"
                    onClick={() => onEntitySelect?.(entity.name)}
                    className={`px-2.5 py-1 text-[11px] rounded-full border ${style.text} ${style.bg} ${style.border} ${
                      isClickable ? "hover:border-white/40 cursor-pointer" : "cursor-default"
                    }`}
                    title={entity.type}
                    disabled={!isClickable}
                  >
                    {entity.name}
                  </button>
                );
              })}
            </div>
          )}

          {relationshipCount > 0 && (
            <div className="space-y-2">
              {context.relationships.map((relationship, index) => (
                <div
                  key={`${relationship.source}-${relationship.target}-${index}`}
                  className="text-xs text-zinc-300 flex items-center gap-2"
                >
                  <span className="text-zinc-400">{relationship.source}</span>
                  <span className="text-zinc-500">— {relationship.relation} →</span>
                  <span className="text-zinc-200">{relationship.target}</span>
                </div>
              ))}
            </div>
          )}

          {context.episode_id && (
            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
              <span>Source episode:</span>
              {onEpisodeSelect ? (
                <button
                  type="button"
                  onClick={() => onEpisodeSelect(context.episode_id)}
                  className="text-blue-300 hover:text-blue-200 transition-colors"
                >
                  {context.episode_id}
                </button>
              ) : (
                <span className="text-zinc-300">{context.episode_id}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ChatKnowledgeContext;
