"use client";

import { useEffect, useMemo, useState } from "react";

import { getRegistrationStatusInfo, updateDelveSettings } from "@/lib/delve/settings";
import type { DelveSettingsResponse } from "@/lib/delve/types";

type KnowledgeCollectionToggleProps = {
  agentId: string;
  userAddress: string;
  settings: DelveSettingsResponse | null;
  isLoading?: boolean;
  onSettingsChange?: (settings: DelveSettingsResponse) => void;
};

const STATUS_TONE_CLASSES: Record<
  "neutral" | "warning" | "success" | "error",
  string
> = {
  neutral: "bg-zinc-700/60 text-zinc-200 border border-zinc-600/60",
  warning: "bg-yellow-500/10 text-yellow-300 border border-yellow-500/30",
  success: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30",
  error: "bg-red-500/10 text-red-300 border border-red-500/30",
};

export function KnowledgeCollectionToggle({
  agentId,
  userAddress,
  settings,
  isLoading = false,
  onSettingsChange,
}: KnowledgeCollectionToggleProps) {
  const [localSettings, setLocalSettings] = useState<DelveSettingsResponse | null>(
    settings,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const statusInfo = useMemo(
    () =>
      getRegistrationStatusInfo(
        localSettings?.registration_status ?? null,
        localSettings?.registration_error ?? null,
      ),
    [localSettings],
  );

  const enabled = localSettings?.knowledge_collection_enabled ?? false;
  const isBusy = isLoading || isSaving;
  const statusClasses = STATUS_TONE_CLASSES[statusInfo.tone];

  const handleToggle = async () => {
    if (!agentId || !userAddress || isBusy) return;
    const nextValue = !enabled;
    setIsSaving(true);
    setError(null);

    try {
      const updated = await updateDelveSettings(agentId, userAddress, nextValue);
      setLocalSettings(updated);
      onSettingsChange?.(updated);
    } catch (err) {
      console.error("[KnowledgeToggle] Failed to update settings:", err);
      setError(err instanceof Error ? err.message : "Failed to update settings");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 bg-zinc-800/60 border border-zinc-700 rounded-xl">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-white">
              Automatic Knowledge Learning
            </p>
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusClasses}`}>
              {isSaving ? "Saving..." : isLoading ? "Loading..." : statusInfo.label}
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Build knowledge graph from conversations automatically
          </p>
          {!isLoading && (
            <p className="text-xs text-zinc-500">{statusInfo.description}</p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-busy={isBusy}
          onClick={handleToggle}
          disabled={isBusy}
          className={`w-12 h-6 rounded-full transition-colors relative ${
            enabled ? "bg-cyan-500" : "bg-zinc-600"
          } ${isBusy ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <span
            className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
              enabled ? "left-7" : "left-1"
            }`}
          />
        </button>
      </div>
      {error && (
        <div className="mt-3 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}

export default KnowledgeCollectionToggle;
