"use client";

import { useState, useCallback, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "@/config/supabase";
import { normalizeAddress } from "@/utils/address";

type UsernameData = {
    id: string;
    username: string;
    wallet_address: string;
    created_at: string;
};

export function useUsername(userAddress: string | null) {
    const [username, setUsername] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch current user's username on mount
    useEffect(() => {
        if (!userAddress || !isSupabaseConfigured || !supabase) return;

        const fetchUsername = async () => {
            if (!supabase) return;
            const { data } = await supabase
                .from("shout_usernames")
                .select("username")
                .eq("wallet_address", normalizeAddress(userAddress))
                .maybeSingle();

            if (data) {
                setUsername(data.username);
            }
        };

        fetchUsername();
    }, [userAddress]);

    // Check if a username is available
    const checkAvailability = useCallback(
        async (name: string): Promise<boolean> => {
            if (!isSupabaseConfigured || !supabase) return false;
            if (!name || name.length < 3) return false;

            const normalizedName = name.toLowerCase().trim();
            const client = supabase; // TypeScript narrowing

            const { data } = await client
                .from("shout_usernames")
                .select("id")
                .eq("username", normalizedName)
                .maybeSingle();

            return !data; // Available if no data found
        },
        []
    );

    // Claim a username
    const claimUsername = useCallback(
        async (name: string): Promise<boolean> => {
            if (!userAddress || !isSupabaseConfigured || !supabase) {
                setError("Not connected");
                return false;
            }

            const normalizedName = name.toLowerCase().trim();

            // Validate username
            if (normalizedName.length < 3) {
                setError("Username must be at least 3 characters");
                return false;
            }

            if (normalizedName.length > 20) {
                setError("Username must be 20 characters or less");
                return false;
            }

            if (!/^[a-z0-9_]+$/.test(normalizedName)) {
                setError(
                    "Username can only contain letters, numbers, and underscores"
                );
                return false;
            }

            setIsLoading(true);
            setError(null);

            try {
                // Check if user already has a username
                const { data: existing } = await supabase
                    .from("shout_usernames")
                    .select("id")
                    .eq("wallet_address", normalizeAddress(userAddress))
                    .maybeSingle();

                if (existing) {
                    // Update existing username
                    const { error: updateError } = await supabase
                        .from("shout_usernames")
                        .update({
                            username: normalizedName,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("wallet_address", normalizeAddress(userAddress));

                    if (updateError) {
                        if (updateError.message.includes("unique")) {
                            setError("Username already taken");
                        } else {
                            setError(updateError.message);
                        }
                        return false;
                    }
                } else {
                    // Create new username
                    const { error: insertError } = await supabase
                        .from("shout_usernames")
                        .insert({
                            username: normalizedName,
                            wallet_address: normalizeAddress(userAddress),
                        });

                    if (insertError) {
                        if (insertError.message.includes("unique")) {
                            setError("Username already taken");
                        } else {
                            setError(insertError.message);
                        }
                        return false;
                    }

                    // Award points for claiming username (first time only)
                    try {
                        await fetch("/api/points", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                walletAddress: userAddress,
                                action: "username_claimed",
                            }),
                        });
                    } catch (pointsErr) {
                        console.error("[Username] Failed to award points:", pointsErr);
                        // Don't fail the username claim if points fail
                    }
                }

                setUsername(normalizedName);
                return true;
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to claim username"
                );
                return false;
            } finally {
                setIsLoading(false);
            }
        },
        [userAddress]
    );

    // Lookup a user by username (returns wallet address)
    const lookupUsername = useCallback(
        async (name: string): Promise<UsernameData | null> => {
            if (!isSupabaseConfigured || !supabase) return null;

            try {
                const normalizedName = name.toLowerCase().trim();
                const client = supabase;

                const { data, error } = await client
                    .from("shout_usernames")
                    .select("*")
                    .eq("username", normalizedName)
                    .maybeSingle();

                if (error) {
                    console.error("[useUsername] Lookup error:", error);
                    return null;
                }

                return data;
            } catch (err) {
                console.error("[useUsername] Lookup exception:", err);
                return null;
            }
        },
        []
    );

    // Search usernames by prefix (for autocomplete)
    const searchUsernames = useCallback(
        async (prefix: string): Promise<UsernameData[]> => {
            if (!isSupabaseConfigured || !supabase) return [];
            if (!prefix || prefix.length < 2) return [];

            const normalizedPrefix = prefix.toLowerCase().trim();

            const { data } = await supabase
                .from("shout_usernames")
                .select("*")
                .ilike("username", `${normalizedPrefix}%`)
                .limit(5);

            return data || [];
        },
        []
    );

    // Remove username
    const removeUsername = useCallback(
        async (): Promise<boolean> => {
            if (!userAddress || !isSupabaseConfigured || !supabase) {
                setError("Not connected");
                return false;
            }

            setIsLoading(true);
            setError(null);

            try {
                const { error: deleteError } = await supabase
                    .from("shout_usernames")
                    .delete()
                    .eq("wallet_address", normalizeAddress(userAddress));

                if (deleteError) {
                    setError(deleteError.message);
                    return false;
                }

                setUsername(null);
                return true;
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to remove username"
                );
                return false;
            } finally {
                setIsLoading(false);
            }
        },
        [userAddress]
    );

    const clearError = useCallback(() => setError(null), []);

    return {
        username,
        isLoading,
        error,
        isConfigured: isSupabaseConfigured,
        checkAvailability,
        claimUsername,
        removeUsername,
        lookupUsername,
        searchUsernames,
        clearError,
    };
}
