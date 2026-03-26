"use client";

import { useState, useCallback, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "@/config/supabase";
import { useENS } from "./useENS";
import { walletCacheKey } from "@/utils/address";

export type Friend = {
    id: string;
    address: string; // Can be EVM or Solana address
    ensName: string | null;
    snsName?: string | null;
    avatar: string | null;
    nickname: string | null;
    addedAt: string;
    isOnline?: boolean;
};

export type CallStatus = "idle" | "calling" | "ringing" | "connected" | "ended";

export type IncomingCall = {
    from: Friend;
    channelName: string;
};

const FRIENDS_STORAGE_KEY = "spritz_friends";

export function useFriends(userAddress: string | null) {
    const [friends, setFriends] = useState<Friend[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
    const { resolveAddressOrENS, isResolving } = useENS();

    // Load friends from localStorage on mount
    useEffect(() => {
        if (!userAddress) return;

        const stored = localStorage.getItem(
            `${FRIENDS_STORAGE_KEY}_${userAddress}`
        );
        if (stored) {
            try {
                setFriends(JSON.parse(stored));
            } catch {
                // Invalid stored data
            }
        }
    }, [userAddress]);

    // Save friends to localStorage when they change
    useEffect(() => {
        if (!userAddress || friends.length === 0) return;
        localStorage.setItem(
            `${FRIENDS_STORAGE_KEY}_${userAddress}`,
            JSON.stringify(friends)
        );
    }, [friends, userAddress]);

    // Subscribe to incoming calls via Supabase Realtime
    useEffect(() => {
        if (!userAddress || !isSupabaseConfigured || !supabase) return;

        const channel = supabase
            .channel(`calls:${userAddress}`)
            .on("broadcast", { event: "incoming_call" }, (payload) => {
                const { from, channelName } = payload.payload as {
                    from: Friend;
                    channelName: string;
                };
                setIncomingCall({ from, channelName });
            })
            .subscribe();

        return () => {
            supabase?.removeChannel(channel);
        };
    }, [userAddress]);

    const addFriend = useCallback(
        async (input: string, nickname?: string): Promise<boolean> => {
            if (!userAddress) {
                setError("You must be logged in to add friends");
                return false;
            }

            setIsLoading(true);
            setError(null);

            try {
                const resolution = await resolveAddressOrENS(input);

                if (!resolution || !resolution.address) {
                    setError("Could not resolve address or ENS name");
                    return false;
                }

                // Check if already a friend
                if (
                    friends.some(
                        (f) =>
                            walletCacheKey(f.address) ===
                            walletCacheKey(resolution.address as string)
                    )
                ) {
                    setError("This address is already in your friends list");
                    return false;
                }

                // Check if trying to add self
                if (
                    walletCacheKey(resolution.address as string) ===
                    walletCacheKey(userAddress)
                ) {
                    setError("You cannot add yourself as a friend");
                    return false;
                }

                const newFriend: Friend = {
                    id: crypto.randomUUID(),
                    address: resolution.address as string,
                    ensName: resolution.ensName,
                    snsName: resolution.snsName ?? null,
                    avatar: resolution.avatar,
                    nickname: nickname || null,
                    addedAt: new Date().toISOString(),
                };

                setFriends((prev) => [...prev, newFriend]);
                return true;
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Failed to add friend"
                );
                return false;
            } finally {
                setIsLoading(false);
            }
        },
        [userAddress, friends, resolveAddressOrENS]
    );

    const removeFriend = useCallback((friendId: string) => {
        setFriends((prev) => prev.filter((f) => f.id !== friendId));
    }, []);

    const updateFriendNickname = useCallback(
        (friendId: string, nickname: string) => {
            setFriends((prev) =>
                prev.map((f) => (f.id === friendId ? { ...f, nickname } : f))
            );
        },
        []
    );

    const initiateCall = useCallback(
        async (friend: Friend): Promise<string | null> => {
            if (!userAddress) {
                setError("You must be logged in to make calls");
                return null;
            }

            // Generate a unique channel name for this call
            const channelName = `call_${Date.now()}_${Math.random()
                .toString(36)
                .substring(7)}`;

            // If Supabase is configured, notify the friend
            if (isSupabaseConfigured && supabase) {
                const callerFriend: Friend = {
                    id: "caller",
                    address: userAddress,
                    ensName: null, // Could resolve this too
                    avatar: null,
                    nickname: null,
                    addedAt: new Date().toISOString(),
                };

                await supabase.channel(`calls:${friend.address}`).send({
                    type: "broadcast",
                    event: "incoming_call",
                    payload: {
                        from: callerFriend,
                        channelName,
                    },
                });
            }

            return channelName;
        },
        [userAddress]
    );

    const acceptCall = useCallback(() => {
        const call = incomingCall;
        setIncomingCall(null);
        return call;
    }, [incomingCall]);

    const rejectCall = useCallback(() => {
        setIncomingCall(null);
    }, []);

    return {
        friends,
        isLoading: isLoading || isResolving,
        error,
        incomingCall,
        addFriend,
        removeFriend,
        updateFriendNickname,
        initiateCall,
        acceptCall,
        rejectCall,
        clearError: () => setError(null),
    };
}
