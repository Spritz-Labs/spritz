"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/config/supabase";
import { normalizeAddress } from "@/utils/address";

export type SocialLinks = {
    x?: string;
    farcaster?: string;
    instagram?: string;
    tiktok?: string;
    youtube?: string;
    linkedin?: string;
    github?: string;
};

export type SocialPlatform = keyof SocialLinks;

export const SOCIAL_PLATFORMS: {
    key: SocialPlatform;
    name: string;
    placeholder: string;
    urlPrefix: string;
    icon: string;
    color: string;
}[] = [
    {
        key: "x",
        name: "X (Twitter)",
        placeholder: "username",
        urlPrefix: "https://x.com/",
        icon: "𝕏",
        color: "bg-black text-white",
    },
    {
        key: "farcaster",
        name: "Farcaster",
        placeholder: "username",
        urlPrefix: "https://warpcast.com/",
        icon: "🟣",
        color: "bg-[#FF5500] text-white",
    },
    {
        key: "instagram",
        name: "Instagram",
        placeholder: "username",
        urlPrefix: "https://instagram.com/",
        icon: "📷",
        color: "bg-gradient-to-br from-[#FF5500] via-[#FB8D22] to-[#FFBBA7] text-white",
    },
    {
        key: "tiktok",
        name: "TikTok",
        placeholder: "username",
        urlPrefix: "https://tiktok.com/@",
        icon: "🎵",
        color: "bg-black text-white",
    },
    {
        key: "youtube",
        name: "YouTube",
        placeholder: "@handle or channel name",
        urlPrefix: "https://youtube.com/@",
        icon: "▶️",
        color: "bg-red-600 text-white",
    },
    {
        key: "linkedin",
        name: "LinkedIn",
        placeholder: "username",
        urlPrefix: "https://linkedin.com/in/",
        icon: "💼",
        color: "bg-[#004921] text-white",
    },
    {
        key: "github",
        name: "GitHub",
        placeholder: "username",
        urlPrefix: "https://github.com/",
        icon: "🐙",
        color: "bg-gray-900 text-white",
    },
];

export function useSocials(userAddress: string | null) {
    const [socials, setSocials] = useState<SocialLinks>({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch user's social links
    const fetchSocials = useCallback(async () => {
        if (!userAddress || !isSupabaseConfigured || !supabase) return;

        setIsLoading(true);
        setError(null);

        try {
            const { data, error: fetchError } = await supabase
                .from("shout_socials")
                .select("*")
                .eq("wallet_address", normalizeAddress(userAddress))
                .single();

            if (fetchError && fetchError.code !== "PGRST116") {
                // PGRST116 = no rows returned, which is fine
                console.error("[useSocials] Fetch error:", fetchError);
                setError("Failed to load social links");
                return;
            }

            if (data) {
                setSocials({
                    x: data.x_username || undefined,
                    farcaster: data.farcaster_username || undefined,
                    instagram: data.instagram_username || undefined,
                    tiktok: data.tiktok_username || undefined,
                    youtube: data.youtube_handle || undefined,
                    linkedin: data.linkedin_username || undefined,
                    github: data.github_username || undefined,
                });
            }
        } catch (err) {
            console.error("[useSocials] Error:", err);
            setError("Failed to load social links");
        } finally {
            setIsLoading(false);
        }
    }, [userAddress]);

    // Save social links
    const saveSocials = useCallback(
        async (newSocials: SocialLinks): Promise<boolean> => {
            if (!userAddress || !isSupabaseConfigured || !supabase)
                return false;

            // Check if this is the first social being added
            const previousCount = Object.values(socials).filter(Boolean).length;
            const newCount = Object.values(newSocials).filter(Boolean).length;
            const isFirstSocial = previousCount === 0 && newCount > 0;

            setIsLoading(true);
            setError(null);

            try {
                const { error: upsertError } = await supabase
                    .from("shout_socials")
                    .upsert(
                        {
                            wallet_address: normalizeAddress(userAddress),
                            x_username: newSocials.x || null,
                            farcaster_username: newSocials.farcaster || null,
                            instagram_username: newSocials.instagram || null,
                            tiktok_username: newSocials.tiktok || null,
                            youtube_handle: newSocials.youtube || null,
                            linkedin_username: newSocials.linkedin || null,
                            github_username: newSocials.github || null,
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: "wallet_address" }
                    );

                if (upsertError) {
                    console.error("[useSocials] Save error:", upsertError);
                    setError("Failed to save social links");
                    return false;
                }

                // Award points for adding first social link
                if (isFirstSocial) {
                    try {
                        await fetch("/api/points", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                walletAddress: userAddress,
                                action: "social_added",
                            }),
                        });
                    } catch (pointsErr) {
                        console.error("[Socials] Failed to award points:", pointsErr);
                        // Don't fail the save if points fail
                    }
                }

                setSocials(newSocials);
                return true;
            } catch (err) {
                console.error("[useSocials] Error:", err);
                setError("Failed to save social links");
                return false;
            } finally {
                setIsLoading(false);
            }
        },
        [userAddress, socials]
    );

    // Fetch socials for a specific address (for viewing friend's socials)
    const fetchSocialsForAddress = useCallback(
        async (address: string): Promise<SocialLinks | null> => {
            if (!isSupabaseConfigured || !supabase) return null;

            try {
                const { data, error: fetchError } = await supabase
                    .from("shout_socials")
                    .select("*")
                    .eq("wallet_address", normalizeAddress(address))
                    .single();

                if (fetchError && fetchError.code !== "PGRST116") {
                    console.error(
                        "[useSocials] Fetch for address error:",
                        fetchError
                    );
                    return null;
                }

                if (data) {
                    return {
                        x: data.x_username || undefined,
                        farcaster: data.farcaster_username || undefined,
                        instagram: data.instagram_username || undefined,
                        tiktok: data.tiktok_username || undefined,
                        youtube: data.youtube_handle || undefined,
                        linkedin: data.linkedin_username || undefined,
                        github: data.github_username || undefined,
                    };
                }

                return null;
            } catch (err) {
                console.error("[useSocials] Error:", err);
                return null;
            }
        },
        []
    );

    // Load on mount
    useEffect(() => {
        fetchSocials();
    }, [fetchSocials]);

    // Count how many socials are set
    const socialCount = Object.values(socials).filter(Boolean).length;

    return {
        socials,
        socialCount,
        isLoading,
        error,
        saveSocials,
        fetchSocialsForAddress,
        refetch: fetchSocials,
    };
}


