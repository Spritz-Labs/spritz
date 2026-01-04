import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
                // Try to resolve as ENS name
                const { data: userData } = await supabase
                    .from("shout_users")
                    .select("wallet_address")
                    .eq("ens_name", address.toLowerCase())
                    .maybeSingle();

                if (userData) {
                    normalizedAddress = userData.wallet_address.toLowerCase();
                }
            }
        }

        if (!normalizedAddress) {
            return NextResponse.json(
                { error: "User not found" },
                { status: 404 }
            );
        }

        // Check if user has public landing enabled
        const { data: settings, error: settingsError } = await supabase
            .from("shout_user_settings")
            .select("public_landing_enabled")
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

        // Fetch socials
        const { data: socials } = await supabase
            .from("shout_socials")
            .select("platform, handle, url")
            .eq("wallet_address", normalizedAddress)
            .order("platform");

        // Fetch public agents
        const { data: agents } = await supabase
            .from("shout_agents")
            .select("id, name, personality, avatar_emoji, visibility")
            .eq("owner_address", normalizedAddress)
            .eq("visibility", "public")
            .order("created_at", { ascending: false });

        // Fetch public calendar/scheduling link if enabled
        const { data: schedulingSettings } = await supabase
            .from("shout_user_settings")
            .select("scheduling_enabled, scheduling_slug, scheduling_title, scheduling_bio")
            .eq("wallet_address", normalizedAddress)
            .single();

        return NextResponse.json({
            user: {
                address: normalizedAddress,
                name: user?.display_name || usernameData?.username || null,
                username: usernameData?.username || null,
                ensName: user?.ens_name || null,
                avatarUrl: user?.avatar_url || null,
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

