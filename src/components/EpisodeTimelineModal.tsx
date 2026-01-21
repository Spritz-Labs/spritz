"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Episode } from "@/lib/delve/types";
import {
  formatRelativeTime,
  getEpisodeCategories,
  getEpisodeCounts,
  getEpisodeEntities,
  getEpisodeStatusInfo,
  getEpisodeTimestamp,
} from "@/lib/delve/episodeUtils";

const PAGE_SIZE = 20;

type EpisodeTimelineModalProps = {
  isOpen: boolean;
  onClose: () => void;
  agentId: string | null;
  agentName?: string;
  userAddress: string;
};

type EpisodeTimelinePanelProps = {
  agentId: string;
  userAddress: string;
  isActive: boolean;
  scrollRootRef?: React.RefObject<HTMLDivElement>;
  className?: string;
};

const STATUS_STYLES: Record<
  ReturnType<typeof getEpisodeStatusInfo>["tone"],
  { text: string; bg: string }
> = {
  success: { text: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/20" },
  warning: { text: "text-amber-300", bg: "bg-amber-500/10 border-amber-500/20" },
  error: { text: "text-red-300", bg: "bg-red-500/10 border-red-500/20" },
  neutral: { text: "text-zinc-300", bg: "bg-zinc-800/40 border-zinc-700/50" },
};

const sortEpisodesNewestFirst = (episodes: Episode[]): Episode[] => {
  return [...episodes].sort((left, right) => {
    const leftTime = getEpisodeTimestamp(left) ?? 0;
    const rightTime = getEpisodeTimestamp(right) ?? 0;
    return rightTime - leftTime;
  });
};

const readEpisodesPayload = (payload: unknown): Episode[] => {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const episodes = record.episodes;
  return Array.isArray(episodes) ? (episodes as Episode[]) : [];
};

const resolveEpisodeId = (episode: Episode, index: number): string => {
  const record = episode as Record<string, unknown>;
  return typeof record.uuid === "string" ? record.uuid : `episode-${index}`;
};

export function EpisodeTimelinePanel({
  agentId,
  userAddress,
  isActive,
  scrollRootRef,
  className,
}: EpisodeTimelinePanelProps) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(true);
  const [expandedEpisodeId, setExpandedEpisodeId] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const fetchEpisodes = useCallback(
    async (nextLimit: number, signal: AbortSignal, isLoadMore: boolean) => {
      if (!agentId || !userAddress) return;
      if (isLoadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const url = new URL(`/api/agents/${agentId}/delve/episodes`, window.location.origin);
        url.searchParams.set("userAddress", userAddress);
        url.searchParams.set("limit", nextLimit.toString());

        const response = await fetch(url.toString(), { signal });
        const data: unknown = await response.json();

        if (!response.ok) {
          const message =
            typeof data === "object" && data !== null && "error" in data
              ? String((data as { error?: unknown }).error)
              : "Unable to load timeline";
          throw new Error(message);
        }

        const fetchedEpisodes = sortEpisodesNewestFirst(readEpisodesPayload(data));
        setEpisodes(fetchedEpisodes);
        setHasMore(fetchedEpisodes.length >= nextLimit);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unable to load timeline");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [agentId, userAddress],
  );

  const resetAndFetch = useCallback(() => {
    setLimit(PAGE_SIZE);
    setExpandedEpisodeId(null);
    setEpisodes([]);
    setHasMore(true);
    setError(null);

    const controller = new AbortController();
    fetchEpisodes(PAGE_SIZE, controller.signal, false);
    return () => controller.abort();
  }, [fetchEpisodes]);

  useEffect(() => {
    if (!isActive || !agentId || !userAddress) return;
    return resetAndFetch();
  }, [isActive, agentId, userAddress, resetAndFetch]);

  const handleLoadMore = useCallback(() => {
    if (isLoading || isLoadingMore || !hasMore) return;
    const nextLimit = limit + PAGE_SIZE;
    setLimit(nextLimit);
    const controller = new AbortController();
    fetchEpisodes(nextLimit, controller.signal, true);
  }, [fetchEpisodes, hasMore, isLoading, isLoadingMore, limit]);

  useEffect(() => {
    if (!isActive || !hasMore || isLoading || isLoadingMore) return;
    const root = scrollRootRef?.current ?? null;
    const target = loadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          handleLoadMore();
        }
      },
      { root, rootMargin: "0px 0px 200px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [handleLoadMore, hasMore, isActive, isLoading, isLoadingMore, scrollRootRef]);

  const renderedEpisodes = useMemo(() => episodes, [episodes]);

  return (
    <div className={className}>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
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
          <h3 className="text-white font-medium mb-2">Unable to load timeline</h3>
          <p className="text-sm text-zinc-400 mb-4">{error}</p>
          <button
            onClick={resetAndFetch}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      ) : renderedEpisodes.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-zinc-800 flex items-center justify-center">
            <span className="text-3xl">📭</span>
          </div>
          <h3 className="text-white font-medium mb-1">No activity yet</h3>
          <p className="text-sm text-zinc-400">
            Enable automatic learning to track knowledge evolution.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {renderedEpisodes.map((episode, index) => {
            const episodeId = resolveEpisodeId(episode, index);
            const isExpanded = expandedEpisodeId === episodeId;
            const statusInfo = getEpisodeStatusInfo(episode);
            const statusStyle = STATUS_STYLES[statusInfo.tone];
            const counts = getEpisodeCounts(episode);
            const timestamp = getEpisodeTimestamp(episode);
            const entities = getEpisodeEntities(episode, 6);
            const categories = getEpisodeCategories(episode, 6);
            const record = episode as Record<string, unknown>;
            const title =
              typeof record.summary === "string" && record.summary.trim().length > 0
                ? record.summary.trim()
                : `Episode ${index + 1}`;

            return (
              <div
                key={episodeId}
                className="p-4 bg-zinc-800/40 border border-zinc-700/50 rounded-xl transition-colors"
              >
                <button
                  onClick={() => setExpandedEpisodeId(isExpanded ? null : episodeId)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-zinc-400">{formatRelativeTime(timestamp)}</p>
                      <h4 className="text-white font-medium mt-1">{title}</h4>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-full border ${statusStyle.bg} ${statusStyle.text}`}
                    >
                      {statusInfo.label}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-400">
                    <span>💬 {counts.messageCount} messages</span>
                    <span>🔗 {counts.entityCount} entities</span>
                    <span>🧭 {counts.relationshipCount} relationships</span>
                    <span>🏷️ {counts.categoryCount} categories</span>
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 space-y-4">
                        <div>
                          <p className="text-xs text-zinc-500 mb-2">Key entities</p>
                          {entities.length === 0 ? (
                            <p className="text-sm text-zinc-400">No entities extracted.</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {entities.map((entity) => (
                                <span
                                  key={entity.uuid ?? entity.name}
                                  className="px-2 py-1 text-xs bg-blue-500/10 text-blue-300 rounded-full border border-blue-500/20"
                                >
                                  {entity.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <p className="text-xs text-zinc-500 mb-2">Categories</p>
                          {categories.length === 0 ? (
                            <p className="text-sm text-zinc-400">No categories assigned.</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {categories.map((category) => (
                                <span
                                  key={category}
                                  className="px-2 py-1 text-xs bg-zinc-700/50 text-zinc-200 rounded-full border border-zinc-600/40"
                                >
                                  {category}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <button
                            type="button"
                            disabled
                            title="Knowledge graph view coming soon"
                            className="px-3 py-2 text-xs bg-zinc-800/60 text-zinc-500 border border-zinc-700/60 rounded-lg cursor-not-allowed"
                          >
                            View in Knowledge Graph
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          <div ref={loadMoreRef} className="h-6" />
          {isLoadingMore && (
            <div className="flex items-center justify-center py-4 text-xs text-zinc-400">
              Loading more episodes...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EpisodeTimelineModal({
  isOpen,
  onClose,
  agentId,
  agentName,
  userAddress,
}: EpisodeTimelineModalProps) {
  const scrollRootRef = useRef<HTMLDivElement>(null);

  if (!agentId) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-zinc-900 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col border border-zinc-800 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Episode Timeline</h2>
                {agentName && (
                  <p className="text-sm text-zinc-400">for {agentName}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div ref={scrollRootRef} className="flex-1 overflow-y-auto p-6">
              <EpisodeTimelinePanel
                agentId={agentId}
                userAddress={userAddress}
                isActive={isOpen}
                scrollRootRef={scrollRootRef}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default EpisodeTimelineModal;
