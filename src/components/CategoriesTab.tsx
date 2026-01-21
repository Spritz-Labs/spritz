"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CategoriesTabProps = {
  agentId: string;
  userAddress: string;
  isActive: boolean;
};

type CategoryItem = {
  name: string;
  count: number;
  updatedAt?: number | null;
};

type SortOption = "count" | "name" | "date";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const readNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const readTimestamp = (value: unknown): number | null => {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  const numeric = readNumber(value);
  if (numeric === null) return null;
  return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
};

const parseCategoriesPayload = (payload: unknown): CategoryItem[] => {
  if (!isRecord(payload)) return [];
  const rawCategories = payload.categories;
  if (!Array.isArray(rawCategories)) return [];

  const results: CategoryItem[] = [];
  for (const entry of rawCategories) {
    if (typeof entry === "string") {
      results.push({ name: entry, count: 0 });
      continue;
    }
    if (!isRecord(entry)) continue;
    const name = readString(entry.name) ?? readString(entry.label);
    if (!name) continue;
    const count = readNumber(entry.count) ?? 0;
    const updatedAt =
      readTimestamp(entry.updated_at) ??
      readTimestamp(entry.updatedAt) ??
      readTimestamp(entry.last_updated) ??
      readTimestamp(entry.lastUpdated) ??
      null;
    results.push({ name, count, updatedAt });
  }
  return results;
};

const sortCategories = (items: CategoryItem[], sortBy: SortOption): CategoryItem[] => {
  const sorted = [...items];
  sorted.sort((left, right) => {
    if (sortBy === "count") {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.name.localeCompare(right.name);
    }
    if (sortBy === "date") {
      const leftTime = left.updatedAt ?? 0;
      const rightTime = right.updatedAt ?? 0;
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }
      return left.name.localeCompare(right.name);
    }
    return left.name.localeCompare(right.name);
  });
  return sorted;
};

export function CategoriesTab({ agentId, userAddress, isActive }: CategoriesTabProps) {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortOption>("count");
  const [showSortMenu, setShowSortMenu] = useState(false);

  const fetchCategories = useCallback(
    async (signal?: AbortSignal) => {
      if (!agentId || !userAddress) return;
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/agents/${agentId}/delve/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: "", userAddress }),
          signal,
        });
        const data: unknown = await response.json();

        if (!response.ok) {
          const message =
            isRecord(data) && typeof data.error === "string"
              ? data.error
              : "Unable to load categories";
          throw new Error(message);
        }

        setCategories(parseCategoriesPayload(data));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unable to load categories");
      } finally {
        setIsLoading(false);
      }
    },
    [agentId, userAddress],
  );

  useEffect(() => {
    if (!isActive) return;
    const controller = new AbortController();
    fetchCategories(controller.signal);
    return () => controller.abort();
  }, [fetchCategories, isActive]);

  const sortedCategories = useMemo(() => sortCategories(categories, sortBy), [categories, sortBy]);

  const filteredCategories = useMemo(() => {
    if (selectedCategories.size === 0) return sortedCategories;
    return sortedCategories.filter((category) => selectedCategories.has(category.name));
  }, [selectedCategories, sortedCategories]);

  const toggleCategory = (name: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedCategories(new Set());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Categories</h3>
          <p className="text-xs text-zinc-500">
            {selectedCategories.size > 0
              ? `${filteredCategories.length} selected`
              : `${categories.length} total`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedCategories.size > 0 && (
            <button
              onClick={clearSelection}
              className="text-xs text-zinc-400 hover:text-white transition-colors"
            >
              Clear filters
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowSortMenu((prev) => !prev)}
              className="px-3 py-1.5 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-xs text-zinc-300 hover:text-white transition-colors flex items-center gap-2"
            >
              Sort: {sortBy === "count" ? "Count" : sortBy === "date" ? "Date" : "Name"}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showSortMenu && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10"
                  onClick={() => setShowSortMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-20 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden min-w-[140px]">
                  {([
                    { value: "count", label: "Count" },
                    { value: "name", label: "Name" },
                    { value: "date", label: "Date" },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSortBy(option.value);
                        setShowSortMenu(false);
                      }}
                      className={`w-full px-4 py-2 text-left text-xs transition-colors ${
                        sortBy === option.value
                          ? "bg-blue-500/10 text-blue-300"
                          : "text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

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
          <h3 className="text-white font-medium mb-2">Unable to load categories</h3>
          <p className="text-sm text-zinc-400 mb-4">{error}</p>
          <button
            onClick={() => fetchCategories()}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-zinc-800 flex items-center justify-center">
            <span className="text-3xl">🏷️</span>
          </div>
          <h3 className="text-white font-medium mb-1">No categories yet</h3>
          <p className="text-sm text-zinc-400">
            Chat with your agent to build knowledge automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredCategories.map((category) => {
            const isSelected = selectedCategories.has(category.name);
            return (
              <button
                key={category.name}
                onClick={() => toggleCategory(category.name)}
                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-colors ${
                  isSelected
                    ? "bg-blue-500/10 border-blue-500/30 text-blue-200"
                    : "bg-zinc-800/40 border-zinc-700/50 text-zinc-200 hover:border-zinc-600"
                }`}
              >
                <span className="text-sm font-medium">{category.name}</span>
                <span className="text-xs text-zinc-400">{category.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default CategoriesTab;
