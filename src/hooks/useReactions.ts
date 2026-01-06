"use client";

import { useState, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/config/supabase";

export type Reaction = {
  emoji: string;
  count: number;
  hasReacted: boolean;
};

export const REACTION_EMOJIS = ["❤️", "🔥", "😍", "🎨", "⭐", "👏"];

export function useReactions(userAddress: string | null) {
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Fetch reactions for multiple IPFS URLs
  const fetchReactions = useCallback(
    async (ipfsUrls: string[]) => {
      if (!isSupabaseConfigured || !supabase || ipfsUrls.length === 0) return;

      try {
        const { data, error } = await supabase
          .from("shout_reactions")
          .select("ipfs_url, user_address, emoji")
          .in("ipfs_url", ipfsUrls);

        if (error) {
          console.error("[useReactions] Fetch error:", error);
          return;
        }

        if (data) {
          const reactionMap: Record<string, Reaction[]> = {};

          // Initialize all URLs
          ipfsUrls.forEach((url) => {
            reactionMap[url] = REACTION_EMOJIS.map((emoji) => ({
              emoji,
              count: 0,
              hasReacted: false,
            }));
          });

          // Count reactions
          data.forEach((row) => {
            const urlReactions = reactionMap[row.ipfs_url];
            if (urlReactions) {
              const reactionIndex = urlReactions.findIndex(
                (r) => r.emoji === row.emoji
              );
              if (reactionIndex >= 0) {
                urlReactions[reactionIndex].count++;
                if (
                  userAddress &&
                  row.user_address.toLowerCase() === userAddress.toLowerCase()
                ) {
                  urlReactions[reactionIndex].hasReacted = true;
                }
              }
            }
          });

          setReactions(reactionMap);
        }
      } catch (err) {
        console.error("[useReactions] Error:", err);
      }
    },
    [userAddress]
  );

  // Toggle a reaction
  const toggleReaction = useCallback(
    async (ipfsUrl: string, emoji: string): Promise<boolean> => {
      if (!isSupabaseConfigured || !supabase || !userAddress) return false;

      setIsLoading(true);

      try {
        // Check if already reacted
        const { data: existing } = await supabase
          .from("shout_reactions")
          .select("id")
          .eq("ipfs_url", ipfsUrl)
          .eq("user_address", userAddress.toLowerCase())
          .eq("emoji", emoji)
          .single();

        if (existing) {
          // Remove reaction
          const { error } = await supabase
            .from("shout_reactions")
            .delete()
            .eq("id", existing.id);

          if (error) throw error;

          // Update local state
          setReactions((prev) => {
            const urlReactions = [...(prev[ipfsUrl] || [])];
            const idx = urlReactions.findIndex((r) => r.emoji === emoji);
            if (idx >= 0) {
              urlReactions[idx] = {
                ...urlReactions[idx],
                count: Math.max(0, urlReactions[idx].count - 1),
                hasReacted: false,
              };
            }
            return { ...prev, [ipfsUrl]: urlReactions };
          });
        } else {
          // Add reaction
          const { error } = await supabase.from("shout_reactions").insert({
            ipfs_url: ipfsUrl,
            user_address: userAddress.toLowerCase(),
            emoji,
          });

          if (error) throw error;

          // Update local state
          setReactions((prev) => {
            const urlReactions = [...(prev[ipfsUrl] || [])];
            const idx = urlReactions.findIndex((r) => r.emoji === emoji);
            if (idx >= 0) {
              urlReactions[idx] = {
                ...urlReactions[idx],
                count: urlReactions[idx].count + 1,
                hasReacted: true,
              };
            } else {
              urlReactions.push({ emoji, count: 1, hasReacted: true });
            }
            return { ...prev, [ipfsUrl]: urlReactions };
          });
        }

        return true;
      } catch (err) {
        console.error("[useReactions] Toggle error:", err);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [userAddress]
  );

  return {
    reactions,
    isLoading,
    fetchReactions,
    toggleReaction,
  };
}











