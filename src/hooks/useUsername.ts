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

// Reserved usernames to prevent impersonation (must match server-side list)
const RESERVED_USERNAMES = new Set([
    // Company/Brand names
    "spritz", "spritzapp", "spritzchat", "spritzlabs", "spritz_labs", "spritz_app",
    "spritz_chat", "spritz_team", "spritz_support", "spritz_official", "spritz_help",
    "spritz_admin", "spritz_mod", "spritz_bot", "spritzbot", "spritz_dao",
    // Official roles
    "admin", "administrator", "support", "help", "helpdesk", "moderator", "mod",
    "staff", "team", "official", "verified", "system", "operator", "manager",
    // Security-sensitive
    "security", "secure", "root", "sysadmin", "webmaster", "superuser", "sudo",
    // Financial/Trust
    "wallet", "vault", "treasury", "finance", "payment", "billing", "account",
    "accounts", "bank", "crypto", "token", "tokens", "nft", "nfts",
    // Communication
    "announcement", "announcements", "news", "update", "updates", "alert", "alerts",
    "notification", "notifications", "info", "information", "notice", "broadcast",
    // Authority titles
    "ceo", "cto", "cfo", "coo", "founder", "cofounder", "co_founder", "owner",
    "developer", "dev", "engineer", "president", "director", "lead", "head",
    // Support variations
    "customer_support", "customersupport", "tech_support", "techsupport",
    "official_support", "support_team", "helpteam", "help_team", "service",
    // Generic reserved
    "null", "undefined", "anonymous", "guest", "test", "testing", "demo",
    "example", "user", "username", "me", "self", "api", "www", "mail", "email",
    // Scam prevention
    "giveaway", "airdrop", "free", "winner", "prize", "reward", "claim",
    "verify", "verification", "recovery", "restore", "unlock", "bonus",
]);

// Check if username is reserved
function isReservedUsername(username: string): boolean {
    const normalized = username.toLowerCase();
    if (RESERVED_USERNAMES.has(normalized)) return true;
    
    // Check patterns
    const reservedPrefixes = ["spritz_", "official_", "support_", "admin_", "mod_", "team_"];
    const reservedSuffixes = ["_official", "_support", "_admin", "_mod", "_team", "_staff", "_verified"];
    
    for (const prefix of reservedPrefixes) {
        if (normalized.startsWith(prefix)) return true;
    }
    for (const suffix of reservedSuffixes) {
        if (normalized.endsWith(suffix)) return true;
    }
    
    return false;
}

export function useUsername(userAddress: string | null) {
    const [username, setUsername] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(true); // Track initial fetch
    const [error, setError] = useState<string | null>(null);

    // Fetch current user's username on mount
    useEffect(() => {
        if (!userAddress) {
            setIsFetching(false);
            return;
        }

        const fetchUsername = async () => {
            setIsFetching(true);
            try {
                const response = await fetch(`/api/username?address=${encodeURIComponent(userAddress)}`, {
                    credentials: "include", // Important for PWA cookie handling
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.username) {
                        setUsername(data.username);
                    }
                }
            } catch (err) {
                console.error("[useUsername] Fetch error:", err);
            } finally {
                setIsFetching(false);
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
            
            // Check reserved usernames first (no server call needed)
            if (isReservedUsername(normalizedName)) {
                return false;
            }
            
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
            if (!userAddress) {
                setError("Not connected");
                return false;
            }

            const normalizedName = name.toLowerCase().trim();

            // Basic client-side validation
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

            // Check reserved usernames
            if (isReservedUsername(normalizedName)) {
                setError("Username not available");
                return false;
            }

            setIsLoading(true);
            setError(null);

            try {
                const response = await fetch("/api/username", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username: normalizedName }),
                    credentials: "include", // Important for PWA cookie handling
                });

                const data = await response.json();

                if (!response.ok) {
                    setError(data.error || "Failed to claim username");
                    return false;
                }

                // Award points for claiming username (first time only)
                if (data.isNew) {
                    try {
                        await fetch("/api/points", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                walletAddress: userAddress,
                                action: "username_claimed",
                            }),
                            credentials: "include",
                        });
                    } catch (pointsErr) {
                        console.error("[Username] Failed to award points:", pointsErr);
                    }
                }

                setUsername(data.username);
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
            if (!userAddress) {
                setError("Not connected");
                return false;
            }

            setIsLoading(true);
            setError(null);

            try {
                const response = await fetch("/api/username", {
                    method: "DELETE",
                    credentials: "include", // Important for PWA cookie handling
                });

                if (!response.ok) {
                    const data = await response.json();
                    setError(data.error || "Failed to remove username");
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
        isFetching, // True while initially loading username
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
