"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { supabase, isSupabaseConfigured } from "@/config/supabase";
import { normalizeAddress } from "@/utils/address";
import { useENS } from "./useENS";
import { getENSCache } from "@/lib/lruCache";
import { ENS_CACHE_TTL_MS } from "@/lib/constants";

// H-2 FIX: Use LRU cache with size limits instead of unbounded Map
// This prevents memory leaks in long-running sessions
const ensCache = getENSCache();

export type FriendRequest = {
    id: string;
    from_address: string;
    to_address: string;
    status: "pending" | "accepted" | "rejected";
    created_at: string;
    memo?: string | null;
    // Resolved data
    fromEnsName?: string | null;
    fromAvatar?: string | null;
    fromUsername?: string | null;
    toEnsName?: string | null;
    toAvatar?: string | null;
    toUsername?: string | null;
};

export type Friend = {
    id: string;
    user_address: string;
    friend_address: string;
    nickname: string | null;
    created_at: string;
    // Resolved data
    ensName?: string | null;
    avatar?: string | null;
    reachUsername?: string | null;
};

export function useFriendRequests(userAddress: string | null) {
    const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>(
        []
    );
    const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>(
        []
    );
    const [friends, setFriends] = useState<Friend[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { resolveAddressOrENS } = useENS();
    const isResolvingRef = useRef(false);

    // Cached ENS resolver with TTL (H-2 FIX: uses LRU cache)
    const getCachedENS = useCallback(async (address: string) => {
        const normalizedAddr = address.toLowerCase();
        const cached = ensCache.get(normalizedAddr);
        
        // LRU cache handles TTL internally
        if (cached) {
            return cached;
        }
        
        try {
            const resolved = await resolveAddressOrENS(address);
            const result = {
                ensName: resolved?.ensName || null,
                avatar: resolved?.avatar || null,
            };
            ensCache.set(normalizedAddr, result);
            return result;
        } catch {
            return { ensName: null, avatar: null };
        }
    }, [resolveAddressOrENS]);

    // Fetch all data - FAST version (no ENS blocking)
    const fetchData = useCallback(async () => {
        if (!userAddress || !isSupabaseConfigured || !supabase) {
            return;
        }

        setIsLoading(true);
        try {
            const normalizedAddress = normalizeAddress(userAddress);
            const client = supabase;

            // Fetch ALL data in parallel - no ENS resolution yet!
            const [
                { data: incoming },
                { data: outgoing },
                { data: friendsData },
            ] = await Promise.all([
                client
                    .from("shout_friend_requests")
                    .select("*")
                    .eq("to_address", normalizedAddress)
                    .eq("status", "pending"),
                client
                    .from("shout_friend_requests")
                    .select("*")
                    .eq("from_address", normalizedAddress)
                    .eq("status", "pending"),
                client
                    .from("shout_friends")
                    .select("*")
                    .eq("user_address", normalizedAddress),
            ]);

            // Batch fetch usernames in ONE query instead of N queries
            const friendAddresses = (friendsData || []).map(f => 
                normalizeAddress(f.friend_address)
            );
            
            let usernameMap: Record<string, string> = {};
            if (friendAddresses.length > 0) {
                const { data: usernameData } = await client
                    .from("shout_usernames")
                    .select("wallet_address, username")
                    .in("wallet_address", friendAddresses);
                
                usernameMap = (usernameData || []).reduce((acc, row) => {
                    acc[row.wallet_address.toLowerCase()] = row.username;
                    return acc;
                }, {} as Record<string, string>);
            }

            // Build friends list with cached ENS data (instant) + batch usernames
            const resolvedFriends = (friendsData || []).map((friend) => {
                const addr = friend.friend_address.toLowerCase();
                const cached = ensCache.get(addr); // LRU cache handles TTL
                return {
                    ...friend,
                    ensName: cached?.ensName || null,
                    avatar: cached?.avatar || null,
                    reachUsername: usernameMap[addr] || null,
                };
            });

            // Batch-fetch usernames for incoming/outgoing request addresses
            const requestAddresses = [
                ...(incoming || []).map(r => r.from_address.toLowerCase()),
                ...(outgoing || []).map(r => r.to_address.toLowerCase()),
            ].filter((v, i, a) => a.indexOf(v) === i); // unique

            let requestUsernameMap: Record<string, string> = {};
            if (requestAddresses.length > 0) {
                const { data: reqUsernameData } = await client
                    .from("shout_usernames")
                    .select("wallet_address, username")
                    .in("wallet_address", requestAddresses);
                requestUsernameMap = (reqUsernameData || []).reduce((acc, row) => {
                    acc[row.wallet_address.toLowerCase()] = row.username;
                    return acc;
                }, {} as Record<string, string>);
            }

            // Quick ENS lookup for incoming requests (usually just 0-3 items)
            const resolvedIncoming = await Promise.all(
                (incoming || []).map(async (req) => {
                    const addr = req.from_address.toLowerCase();
                    const cached = ensCache.get(addr);
                    if (cached) {
                        return {
                            ...req,
                            fromEnsName: cached.ensName,
                            fromAvatar: cached.avatar,
                            fromUsername: requestUsernameMap[addr] || null,
                        };
                    }
                    const resolved = await getCachedENS(req.from_address);
                    return {
                        ...req,
                        fromEnsName: resolved?.ensName,
                        fromAvatar: resolved?.avatar,
                        fromUsername: requestUsernameMap[addr] || null,
                    };
                })
            );

            // Resolve outgoing requests with usernames + ENS
            const resolvedOutgoing = await Promise.all(
                (outgoing || []).map(async (req) => {
                    const addr = req.to_address.toLowerCase();
                    const cached = ensCache.get(addr);
                    if (cached) {
                        return {
                            ...req,
                            toEnsName: cached.ensName,
                            toAvatar: cached.avatar,
                            toUsername: requestUsernameMap[addr] || null,
                        };
                    }
                    const resolved = await getCachedENS(req.to_address);
                    return {
                        ...req,
                        toEnsName: resolved?.ensName,
                        toAvatar: resolved?.avatar,
                        toUsername: requestUsernameMap[addr] || null,
                    };
                })
            );

            setIncomingRequests(resolvedIncoming);
            setOutgoingRequests(resolvedOutgoing);
            setFriends(resolvedFriends);

            // M-5 FIX: Resolve ENS for friends in background with proper cleanup
            // Return abort controller for cleanup
            return { friendsData };
        } catch (err) {
            console.error("Error fetching friend data:", err);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [userAddress, getCachedENS]);

    // M-5 FIX: Separate effect for background ENS resolution with cleanup
    const resolveENSInBackground = useCallback(async (
        friendsData: Array<{ friend_address: string }>,
        isMountedRef: React.MutableRefObject<boolean>
    ) => {
        if (!isResolvingRef.current && friendsData.length > 0) {
            isResolvingRef.current = true;
            
            try {
                await Promise.all(
                    friendsData.map(async (friend) => {
                        const addr = friend.friend_address.toLowerCase();
                        // Skip if already cached
                        if (ensCache.has(addr)) return null;
                        return getCachedENS(friend.friend_address);
                    })
                );
                
                // M-5 FIX: Check if still mounted before updating state
                if (isMountedRef.current) {
                    setFriends(prev => prev.map(friend => {
                        const cached = ensCache.get(friend.friend_address.toLowerCase());
                        if (cached && (!friend.ensName && cached.ensName)) {
                            return {
                                ...friend,
                                ensName: cached.ensName,
                                avatar: cached.avatar,
                            };
                        }
                        return friend;
                    }));
                }
            } finally {
                isResolvingRef.current = false;
            }
        }
    }, [getCachedENS]);

    // M-5 FIX: Track mount state for cleanup
    const isMountedRef = useRef(true);
    
    // Initial fetch with proper cleanup
    useEffect(() => {
        isMountedRef.current = true;
        
        const doFetch = async () => {
            const result = await fetchData();
            if (result?.friendsData && isMountedRef.current) {
                resolveENSInBackground(result.friendsData, isMountedRef);
            }
        };
        
        doFetch();
        
        // Cleanup: prevent state updates after unmount
        return () => {
            isMountedRef.current = false;
        };
    }, [fetchData, resolveENSInBackground]);

    // Real-time subscription for friend requests
    useEffect(() => {
        if (!userAddress || !isSupabaseConfigured || !supabase) return;

        const normalizedAddress = normalizeAddress(userAddress);

        const channel = supabase
            .channel("friend_requests_changes")
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "shout_friend_requests",
                    filter: `to_address=eq.${normalizedAddress}`,
                },
                () => {
                    fetchData();
                }
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "shout_friend_requests",
                    filter: `from_address=eq.${normalizedAddress}`,
                },
                () => {
                    fetchData();
                }
            )
            .subscribe();

        return () => {
            if (supabase) supabase.removeChannel(channel);
        };
    }, [userAddress, fetchData]);

    // Send friend request
    const sendFriendRequest = useCallback(
        async (toAddress: string, memo?: string): Promise<boolean> => {
            console.log("[sendFriendRequest] Starting with:", {
                toAddress,
                userAddress,
                isSupabaseConfigured,
            });

            if (!userAddress) {
                setError("Not logged in");
                return false;
            }

            if (!isSupabaseConfigured || !supabase) {
                setError(
                    "Supabase not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
                );
                return false;
            }

            if (!toAddress || toAddress.length < 10) {
                setError("Invalid address provided");
                return false;
            }

            setIsLoading(true);
            setError(null);

            try {
                const normalizedFrom = normalizeAddress(userAddress);
                const normalizedTo = normalizeAddress(toAddress);

                console.log("[sendFriendRequest] Normalized addresses:", {
                    normalizedFrom,
                    normalizedTo,
                });

                // Check if already friends
                console.log(
                    "[sendFriendRequest] Checking if already friends..."
                );
                const { data: existingFriend, error: friendCheckError } =
                    await supabase
                        .from("shout_friends")
                        .select("id")
                        .eq("user_address", normalizedFrom)
                        .eq("friend_address", normalizedTo)
                        .maybeSingle();

                if (friendCheckError) {
                    console.warn(
                        "[sendFriendRequest] Friend check warning:",
                        friendCheckError
                    );
                    // Don't fail, just continue - table might not exist yet
                }

                if (existingFriend) {
                    setError("Already friends with this address");
                    return false;
                }

                // Check if request already exists (in either direction)
                console.log(
                    "[sendFriendRequest] Checking for existing requests..."
                );
                const { data: existingRequests, error: requestCheckError } =
                    await supabase
                        .from("shout_friend_requests")
                        .select("id, status")
                        .or(
                            `and(from_address.eq.${normalizedFrom},to_address.eq.${normalizedTo}),and(from_address.eq.${normalizedTo},to_address.eq.${normalizedFrom})`
                        );

                if (requestCheckError) {
                    console.warn(
                        "[sendFriendRequest] Request check warning:",
                        requestCheckError
                    );
                    // Don't fail, just continue
                }

                console.log(
                    "[sendFriendRequest] Existing requests found:",
                    existingRequests
                );

                // Only block if there's a pending request
                const pendingRequest = existingRequests?.find(
                    (r) => r.status === "pending"
                );
                if (pendingRequest) {
                    setError("Friend request already pending");
                    return false;
                }

                // Delete any old rejected/accepted requests to allow fresh start
                const oldRequests = existingRequests?.filter(
                    (r) => r.status !== "pending"
                );
                if (oldRequests && oldRequests.length > 0) {
                    console.log(
                        "[sendFriendRequest] Cleaning up old requests..."
                    );
                    for (const req of oldRequests) {
                        await supabase
                            .from("shout_friend_requests")
                            .delete()
                            .eq("id", req.id);
                    }
                }

                // Ensure user exists
                console.log("[sendFriendRequest] Upserting user...");
                const { error: upsertError } = await supabase
                    .from("shout_users")
                    .upsert(
                        {
                            wallet_address: normalizedFrom,
                        },
                        { onConflict: "wallet_address" }
                    );

                if (upsertError) {
                    console.error(
                        "[sendFriendRequest] Upsert error:",
                        upsertError
                    );
                }

                // Create friend request
                console.log("[sendFriendRequest] Inserting friend request...");
                const { data: insertData, error: insertError } = await supabase
                    .from("shout_friend_requests")
                    .insert({
                        from_address: normalizedFrom,
                        to_address: normalizedTo,
                        status: "pending",
                        ...(memo ? { memo: memo.slice(0, 100) } : {}),
                    })
                    .select();

                console.log("[sendFriendRequest] Insert result:", {
                    insertData,
                    insertError,
                });

                if (insertError) {
                    console.error(
                        "[sendFriendRequest] Insert error details:",
                        insertError
                    );
                    throw new Error(
                        insertError.message || "Failed to create friend request"
                    );
                }

                await fetchData();
                console.log("[sendFriendRequest] Success!");
                return true;
            } catch (err) {
                console.error("[sendFriendRequest] Caught error:", err);
                const errorMessage =
                    err instanceof Error
                        ? err.message
                        : "Failed to send request";
                setError(errorMessage);
                return false;
            } finally {
                setIsLoading(false);
            }
        },
        [userAddress, fetchData]
    );

    // Accept friend request
    const acceptRequest = useCallback(
        async (requestId: string): Promise<boolean> => {
            if (!userAddress || !isSupabaseConfigured || !supabase)
                return false;

            setIsLoading(true);
            try {
                const normalizedAddress = normalizeAddress(userAddress);

                // Get the request
                const { data: request } = await supabase
                    .from("shout_friend_requests")
                    .select("*")
                    .eq("id", requestId)
                    .maybeSingle();

                if (!request) {
                    setError("Request not found");
                    return false;
                }

                // Update request status
                await supabase
                    .from("shout_friend_requests")
                    .update({
                        status: "accepted",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", requestId);

                // Create bidirectional friendship
                await supabase.from("shout_friends").insert([
                    {
                        user_address: normalizedAddress,
                        friend_address: request.from_address,
                    },
                    {
                        user_address: request.from_address,
                        friend_address: normalizedAddress,
                    },
                ]);

                await fetchData();
                return true;
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to accept request"
                );
                return false;
            } finally {
                setIsLoading(false);
            }
        },
        [userAddress, fetchData]
    );

    // Reject friend request
    const rejectRequest = useCallback(
        async (requestId: string): Promise<boolean> => {
            if (!isSupabaseConfigured || !supabase) return false;

            setIsLoading(true);
            try {
                await supabase
                    .from("shout_friend_requests")
                    .update({
                        status: "rejected",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", requestId);

                await fetchData();
                return true;
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to reject request"
                );
                return false;
            } finally {
                setIsLoading(false);
            }
        },
        [fetchData]
    );

    // Cancel outgoing friend request
    const cancelRequest = useCallback(
        async (requestId: string): Promise<boolean> => {
            if (!userAddress || !isSupabaseConfigured || !supabase)
                return false;

            setIsLoading(true);
            try {
                // Delete the request (only if it belongs to the user)
                const { error: deleteError } = await supabase
                    .from("shout_friend_requests")
                    .delete()
                    .eq("id", requestId)
                    .eq("from_address", normalizeAddress(userAddress));

                if (deleteError) {
                    throw new Error(deleteError.message);
                }

                await fetchData();
                return true;
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to cancel request"
                );
                return false;
            } finally {
                setIsLoading(false);
            }
        },
        [userAddress, fetchData]
    );

    // Remove friend
    const removeFriend = useCallback(
        async (friendId: string): Promise<boolean> => {
            if (!userAddress || !isSupabaseConfigured || !supabase)
                return false;

            setIsLoading(true);
            try {
                const friend = friends.find((f) => f.id === friendId);
                if (!friend) return false;

                const normalizedAddress = normalizeAddress(userAddress);

                // Remove both directions of friendship
                await supabase
                    .from("shout_friends")
                    .delete()
                    .or(
                        `and(user_address.eq.${normalizedAddress},friend_address.eq.${friend.friend_address}),and(user_address.eq.${friend.friend_address},friend_address.eq.${normalizedAddress})`
                    );

                await fetchData();
                return true;
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to remove friend"
                );
                return false;
            } finally {
                setIsLoading(false);
            }
        },
        [userAddress, friends, fetchData]
    );

    // Update friend nickname
    const updateNickname = useCallback(
        async (friendId: string, nickname: string): Promise<boolean> => {
            if (!isSupabaseConfigured || !supabase) return false;

            try {
                await supabase
                    .from("shout_friends")
                    .update({ nickname })
                    .eq("id", friendId);

                await fetchData();
                return true;
            } catch (err) {
                return false;
            }
        },
        [fetchData]
    );

    return {
        incomingRequests,
        outgoingRequests,
        friends,
        isLoading,
        error,
        sendFriendRequest,
        acceptRequest,
        rejectRequest,
        cancelRequest,
        removeFriend,
        updateNickname,
        clearError: () => setError(null),
        refresh: fetchData,
        isConfigured: isSupabaseConfigured,
    };
}
