"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase, isSupabaseConfigured } from "@/config/supabase";

const STORAGE_KEY = "spritz_chat_pinned";

export function useChatPinned(userAddress: string | null) {
    const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            if (!userAddress) {
                setIsLoading(false);
                return;
            }

            const addressLower = userAddress.toLowerCase();

            if (isSupabaseConfigured && supabase) {
                try {
                    const { data, error } = await supabase
                        .from("shout_chat_pinned")
                        .select("chat_id")
                        .eq("user_address", addressLower);

                    if (error) {
                        console.warn(
                            "[ChatPinned] Failed to load from Supabase:",
                            error,
                        );
                    } else if (data) {
                        setPinnedIds(
                            new Set(data.map((row) => row.chat_id)),
                        );
                    }
                    setIsLoading(false);
                    return;
                } catch (err) {
                    console.warn(
                        "[ChatPinned] Supabase error, falling back to localStorage:",
                        err,
                    );
                }
            }

            try {
                const stored = localStorage.getItem(
                    `${STORAGE_KEY}_${addressLower}`,
                );
                if (stored) {
                    setPinnedIds(new Set(JSON.parse(stored)));
                }
            } catch (e) {
                console.warn(
                    "[ChatPinned] Failed to load from localStorage:",
                    e,
                );
            }
            setIsLoading(false);
        };

        loadData();
    }, [userAddress]);

    useEffect(() => {
        if (!isLoading && userAddress) {
            const addressLower = userAddress.toLowerCase();
            localStorage.setItem(
                `${STORAGE_KEY}_${addressLower}`,
                JSON.stringify([...pinnedIds]),
            );
        }
    }, [userAddress, isLoading, pinnedIds]);

    const setChatPinned = useCallback(
        (chatId: string, pinned: boolean) => {
            if (!userAddress) return;

            setPinnedIds((prev) => {
                const next = new Set(prev);
                if (pinned) next.add(chatId);
                else next.delete(chatId);
                return next;
            });

            const addressLower = userAddress.toLowerCase();
            if (isSupabaseConfigured && supabase) {
                if (pinned) {
                    supabase
                        .from("shout_chat_pinned")
                        .upsert(
                            {
                                user_address: addressLower,
                                chat_id: chatId,
                            },
                            { onConflict: "user_address,chat_id" },
                        )
                        .then(({ error }) => {
                            if (error)
                                console.warn(
                                    "[ChatPinned] Failed to save:",
                                    error,
                                );
                        });
                } else {
                    supabase
                        .from("shout_chat_pinned")
                        .delete()
                        .eq("user_address", addressLower)
                        .eq("chat_id", chatId)
                        .then(({ error }) => {
                            if (error)
                                console.warn(
                                    "[ChatPinned] Failed to delete:",
                                    error,
                                );
                        });
                }
            }
        },
        [userAddress],
    );

    const isPinned = useCallback(
        (chatId: string) => pinnedIds.has(chatId),
        [pinnedIds],
    );

    return {
        pinnedIds: useMemo(() => pinnedIds, [pinnedIds]),
        setChatPinned,
        isPinned,
        isLoading,
    };
}
