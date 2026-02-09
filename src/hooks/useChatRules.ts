"use client";

import { useState, useEffect, useCallback } from "react";
import type { ChatRules } from "@/app/api/chat-rules/route";

export type ChatRulesState = {
    rules: ChatRules | null;
    isLoading: boolean;
    error: string | null;
};

const DEFAULT_RULES = {
    links_allowed: true,
    photos_allowed: true,
    pixel_art_allowed: true,
    gifs_allowed: true,
    polls_allowed: true,
    location_sharing_allowed: true,
    voice_allowed: true,
    slow_mode_seconds: 0,
    read_only: false,
    max_message_length: 0,
    rules_text: null as string | null,
};

export function useChatRules(chatType: string | null, chatId?: string | null) {
    const [state, setState] = useState<ChatRulesState>({
        rules: null,
        isLoading: true,
        error: null,
    });

    const fetchRules = useCallback(async () => {
        if (!chatType) {
            setState({ rules: null, isLoading: false, error: null });
            return;
        }

        try {
            const params = new URLSearchParams({ chatType });
            if (chatId) params.set("chatId", chatId);

            const res = await fetch(`/api/chat-rules?${params.toString()}`);
            const data = await res.json();

            if (res.ok) {
                setState({ rules: data.rules, isLoading: false, error: null });
            } else {
                console.error("[useChatRules] Fetch error:", data.error);
                setState({ rules: null, isLoading: false, error: data.error });
            }
        } catch (err) {
            console.error("[useChatRules] Error:", err);
            setState({
                rules: null,
                isLoading: false,
                error: "Failed to load rules",
            });
        }
    }, [chatType, chatId]);

    useEffect(() => {
        fetchRules();
    }, [fetchRules]);

    // Update a single rule
    const updateRule = useCallback(
        async (
            field: keyof typeof DEFAULT_RULES,
            value: boolean | number,
        ): Promise<boolean> => {
            if (!chatType) return false;

            try {
                const res = await fetch("/api/chat-rules", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        chatType,
                        chatId: chatId || null,
                        rules: { [field]: value },
                    }),
                });

                if (!res.ok) {
                    const data = await res.json();
                    console.error("[useChatRules] Update error:", data.error);
                    return false;
                }

                const data = await res.json();
                setState((prev) => ({
                    ...prev,
                    rules: data.rules || prev.rules,
                }));
                return true;
            } catch (err) {
                console.error("[useChatRules] Update error:", err);
                return false;
            }
        },
        [chatType, chatId],
    );

    // Update multiple rules at once
    const updateRules = useCallback(
        async (updates: Partial<typeof DEFAULT_RULES>): Promise<boolean> => {
            if (!chatType) return false;

            try {
                const res = await fetch("/api/chat-rules", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        chatType,
                        chatId: chatId || null,
                        rules: updates,
                    }),
                });

                if (!res.ok) {
                    const data = await res.json();
                    console.error("[useChatRules] Update error:", data.error);
                    return false;
                }

                const data = await res.json();
                setState((prev) => ({
                    ...prev,
                    rules: data.rules || prev.rules,
                }));
                return true;
            } catch (err) {
                console.error("[useChatRules] Update error:", err);
                return false;
            }
        },
        [chatType, chatId],
    );

    // Helper to check if a specific feature is allowed
    const isAllowed = useCallback(
        (feature: keyof typeof DEFAULT_RULES): boolean => {
            if (!state.rules) return DEFAULT_RULES[feature] as boolean;
            const value = state.rules[feature as keyof ChatRules];
            if (typeof value === "boolean") return value;
            return DEFAULT_RULES[feature] as boolean;
        },
        [state.rules],
    );

    // Update rules text (room guidelines)
    const updateRulesText = useCallback(
        async (text: string | null): Promise<boolean> => {
            if (!chatType) return false;

            try {
                const res = await fetch("/api/chat-rules", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        chatType,
                        chatId: chatId || null,
                        rules: { rules_text: text },
                    }),
                });

                if (!res.ok) {
                    const data = await res.json();
                    console.error(
                        "[useChatRules] Update rules text error:",
                        data.error,
                    );
                    return false;
                }

                const data = await res.json();
                setState((prev) => ({
                    ...prev,
                    rules: data.rules || prev.rules,
                }));
                return true;
            } catch (err) {
                console.error("[useChatRules] Update rules text error:", err);
                return false;
            }
        },
        [chatType, chatId],
    );

    return {
        ...state,
        updateRule,
        updateRules,
        updateRulesText,
        isAllowed,
        refresh: fetchRules,
    };
}

// Room ban management hook
export function useRoomBans(chatType: string | null, chatId?: string | null) {
    const [bans, setBans] = useState<
        Array<{
            id: string;
            user_address: string;
            banned_by: string;
            reason: string | null;
            banned_at: string;
            banned_until: string | null;
        }>
    >([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchBans = useCallback(async () => {
        if (!chatType) {
            setBans([]);
            setIsLoading(false);
            return;
        }

        try {
            const params = new URLSearchParams({ chatType });
            if (chatId) params.set("chatId", chatId);

            const res = await fetch(`/api/chat-rules/ban?${params.toString()}`);
            const data = await res.json();

            setBans(data.bans || []);
        } catch (err) {
            console.error("[useRoomBans] Error:", err);
        } finally {
            setIsLoading(false);
        }
    }, [chatType, chatId]);

    useEffect(() => {
        fetchBans();
    }, [fetchBans]);

    const banUser = useCallback(
        async (
            targetAddress: string,
            options?: { reason?: string; duration?: string },
        ): Promise<boolean> => {
            if (!chatType) return false;

            try {
                const res = await fetch("/api/chat-rules/ban", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "ban",
                        chatType,
                        chatId: chatId || null,
                        targetAddress,
                        reason: options?.reason,
                        duration: options?.duration || "permanent",
                    }),
                });

                if (!res.ok) {
                    const data = await res.json();
                    alert(data.error || "Failed to ban user");
                    return false;
                }

                await fetchBans();
                return true;
            } catch (err) {
                console.error("[useRoomBans] Ban error:", err);
                return false;
            }
        },
        [chatType, chatId, fetchBans],
    );

    const unbanUser = useCallback(
        async (targetAddress: string): Promise<boolean> => {
            if (!chatType) return false;

            try {
                const res = await fetch("/api/chat-rules/ban", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "unban",
                        chatType,
                        chatId: chatId || null,
                        targetAddress,
                    }),
                });

                if (!res.ok) {
                    const data = await res.json();
                    alert(data.error || "Failed to unban user");
                    return false;
                }

                await fetchBans();
                return true;
            } catch (err) {
                console.error("[useRoomBans] Unban error:", err);
                return false;
            }
        },
        [chatType, chatId, fetchBans],
    );

    const checkBanned = useCallback(
        async (userAddress: string): Promise<boolean> => {
            if (!chatType) return false;

            try {
                const params = new URLSearchParams({
                    chatType,
                    action: "check",
                    userAddress,
                });
                if (chatId) params.set("chatId", chatId);

                const res = await fetch(
                    `/api/chat-rules/ban?${params.toString()}`,
                );
                const data = await res.json();
                return data.isBanned || false;
            } catch {
                return false;
            }
        },
        [chatType, chatId],
    );

    return {
        bans,
        isLoading,
        banUser,
        unbanUser,
        checkBanned,
        refresh: fetchBans,
    };
}
