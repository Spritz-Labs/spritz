import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, isAddress } from "viem";
import { normalize } from "viem/ens";
import { mainnet } from "viem/chains";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Create public client for ENS resolution
const publicClient = createPublicClient({
    chain: mainnet,
    transport: http("https://eth.llamarpc.com"),
});

// GET /api/public/user/[address] - Get public user profile (only if enabled)
// Supports: wallet address, username, or ENS name
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ address: string }> }
) {
    try {
        const { address } = await params;
        let normalizedAddress: string | null = null;

        // Check if input is a wallet address (starts with 0x)
        if (address.toLowerCase().startsWith("0x")) {
            normalizedAddress = address.toLowerCase();
        } else {
            // Try to resolve as username first
            const { data: usernameData } = await supabase
                .from("shout_usernames")
                .select("wallet_address")
                .eq("username", address.toLowerCase())
                .maybeSingle();

            if (usernameData) {
                normalizedAddress = usernameData.wallet_address.toLowerCase();
            } else {
                // Try to resolve as ENS name - check database first
                const normalizedEns = address.toLowerCase().endsWith(".eth") 
                    ? address.toLowerCase() 
                    : `${address.toLowerCase()}.eth`;
                
                const { data: userData } = await supabase
                    .from("shout_users")
                    .select("wallet_address")
                    .or(`ens_name.eq.${address.toLowerCase()},ens_name.eq.${normalizedEns}`)
                    .maybeSingle();

                if (userData) {
                    normalizedAddress = userData.wallet_address.toLowerCase();
                } else {
                    // Try on-chain ENS resolution if not in database
                    try {
                        const resolvedAddress = await publicClient.getEnsAddress({
                            name: normalize(normalizedEns),
                        });
                        
                        if (resolvedAddress) {
                            normalizedAddress = resolvedAddress.toLowerCase();
                        }
                    } catch (err) {
                        // ENS resolution failed, will return 404 below
                        console.warn("[Public User] ENS resolution failed:", err);
                    }
                }
            }
        }

        if (!normalizedAddress) {
            return NextResponse.json(
                { error: "User not found" },
                { status: 404 }
            );
        }

        // Check if user has public landing enabled and get avatar preferences
        const { data: settings, error: settingsError } = await supabase
            .from("shout_user_settings")
            .select("public_landing_enabled, public_bio, custom_avatar_url, use_custom_avatar")
            .eq("wallet_address", normalizedAddress)
            .single();

        if (settingsError || !settings?.public_landing_enabled) {
            return NextResponse.json(
                { error: "Public profile not available" },
                { status: 404 }
            );
        }

        // Fetch user data
        const { data: user, error: userError } = await supabase
            .from("shout_users")
            .select("wallet_address, display_name, ens_name, avatar_url")
            .eq("wallet_address", normalizedAddress)
            .single();

        // Fetch username
        const { data: usernameData } = await supabase
            .from("shout_usernames")
            .select("username")
            .eq("wallet_address", normalizedAddress)
            .maybeSingle();

        // If ENS name not in database, try to resolve on-chain
        let ensName = user?.ens_name || null;
        let ensAvatar = user?.avatar_url || null;
        
        if (!ensName && normalizedAddress.startsWith("0x")) {
            try {
                const resolvedName = await publicClient.getEnsName({
                    address: normalizedAddress as `0x${string}`,
                });
                if (resolvedName) {
                    ensName = resolvedName;
                    console.log("[Public User] Resolved ENS name on-chain:", resolvedName);
                    
                    // Also try to get ENS avatar if we found a name
                    if (!ensAvatar) {
                        try {
                            const avatar = await publicClient.getEnsAvatar({
                                name: normalize(resolvedName),
                            });
                            if (avatar) {
                                ensAvatar = avatar;
                                console.log("[Public User] Resolved ENS avatar on-chain");
                            }
                        } catch (avatarErr) {
                            // Silent fail for avatar
                        }
                    }
                }
            } catch (ensErr) {
                // Silent fail - many addresses don't have ENS
                console.log("[Public User] No ENS found for address");
            }
        }

        // Fetch socials
        const { data: socials } = await supabase
            .from("shout_socials")
            .select("platform, handle, url")
            .eq("wallet_address", normalizedAddress)
            .order("platform");

        // Fetch public agents
        const { data: agents } = await supabase
            .from("shout_agents")
            .select("id, name, personality, avatar_emoji, avatar_url, visibility")
            .eq("owner_address", normalizedAddress)
            .eq("visibility", "public")
            .order("created_at", { ascending: false });

        // Fetch public calendar/scheduling link if enabled
        const { data: schedulingSettings } = await supabase
            .from("shout_user_settings")
            .select("scheduling_enabled, scheduling_slug, scheduling_title, scheduling_bio")
            .eq("wallet_address", normalizedAddress)
            .single();

        // Determine which avatar to use based on user preference
        // If useCustomAvatar is true and they have a custom avatar, use it
        // Otherwise, fall back to ENS avatar
        const avatarUrl = (settings?.use_custom_avatar && settings?.custom_avatar_url)
            ? settings.custom_avatar_url
            : ensAvatar;

        return NextResponse.json({
            user: {
                address: normalizedAddress,
                name: user?.display_name || usernameData?.username || null,
                username: usernameData?.username || null,
                ensName: ensName,
                avatarUrl: avatarUrl,
                bio: settings?.public_bio || null,
            },
            socials: socials || [],
            agents: agents || [],
            scheduling: schedulingSettings?.scheduling_enabled
                ? {
                      slug: schedulingSettings.scheduling_slug || normalizedAddress, // Use wallet address as fallback
                      title: schedulingSettings.scheduling_title,
                      bio: schedulingSettings.scheduling_bio,
                  }
                : null,
        });
    } catch (error) {
        console.error("[Public User] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch public profile" },
            { status: 500 }
        );
    }
}

