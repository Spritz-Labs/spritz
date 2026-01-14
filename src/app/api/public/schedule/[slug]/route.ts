import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http } from "viem";
import { normalize } from "viem/ens";
import { mainnet } from "viem/chains";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Viem client for ENS resolution
const viemClient = createPublicClient({
    chain: mainnet,
    transport: http(`https://eth-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`),
});

/**
 * Resolve a slug to a wallet address
 * Supports: wallet addresses, ENS names, Spritz usernames
 * 
 * NOTE: Custom booking slugs are handled by /api/public/book/[slug] instead
 * to avoid collisions with usernames
 */
async function resolveSlugToWalletAddress(slug: string): Promise<string | null> {
    const normalizedSlug = slug.toLowerCase();
    
    // 1. Direct wallet address
    if (normalizedSlug.startsWith("0x") && normalizedSlug.length === 42) {
        console.log(`[Schedule] Slug is a wallet address: ${normalizedSlug}`);
        return normalizedSlug;
    }
    
    // 2. ENS name (ends with .eth)
    if (normalizedSlug.endsWith(".eth")) {
        try {
            console.log(`[Schedule] Resolving ENS name: ${slug}`);
            const address = await viemClient.getEnsAddress({
                name: normalize(slug),
            });
            if (address) {
                console.log(`[Schedule] ENS resolved to: ${address}`);
                return address.toLowerCase();
            }
        } catch (err) {
            console.log(`[Schedule] ENS resolution failed for ${slug}:`, err);
        }
        // ENS name didn't resolve, don't fall through - return null
        return null;
    }
    
    // 3. Spritz username (lookup in shout_usernames)
    const { data: usernameRecord } = await supabase
        .from("shout_usernames")
        .select("wallet_address")
        .eq("username", normalizedSlug)
        .maybeSingle();
    
    if (usernameRecord?.wallet_address) {
        console.log(`[Schedule] Username "${slug}" resolved to: ${usernameRecord.wallet_address}`);
        return usernameRecord.wallet_address.toLowerCase();
    }
    
    // Custom scheduling slugs are NOT supported here
    // Use /book/[slug] for custom booking URLs to avoid username collisions
    console.log(`[Schedule] Could not resolve slug: ${slug}`);
    return null;
}

// GET /api/public/schedule/[slug] - Get public scheduling profile
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;

        if (!slug) {
            return NextResponse.json(
                { error: "Slug required" },
                { status: 400 }
            );
        }

        // Resolve slug to wallet address (supports addresses, ENS, usernames, custom slugs)
        const walletAddress = await resolveSlugToWalletAddress(slug);
        
        if (!walletAddress) {
            return NextResponse.json(
                { error: "User not found" },
                { status: 404 }
            );
        }

        // Fetch settings by resolved wallet address
        const { data: settings, error } = await supabase
            .from("shout_user_settings")
            .select(`
                wallet_address,
                scheduling_enabled,
                scheduling_slug,
                scheduling_bio,
                scheduling_title,
                scheduling_free_enabled,
                scheduling_paid_enabled,
                scheduling_free_duration_minutes,
                scheduling_paid_duration_minutes,
                scheduling_price_cents,
                scheduling_network,
                scheduling_wallet_address,
                scheduling_buffer_minutes,
                scheduling_advance_notice_hours
            `)
            .eq("wallet_address", walletAddress)
            .single();

        if (error || !settings) {
            return NextResponse.json(
                { error: "User not found" },
                { status: 404 }
            );
        }

        if (!settings.scheduling_enabled) {
            return NextResponse.json(
                { error: "Scheduling not enabled for this user" },
                { status: 403 }
            );
        }

        // Get user's display info
        const { data: user } = await supabase
            .from("shout_users")
            .select("display_name, avatar_url, email, ens_name")
            .eq("wallet_address", settings.wallet_address)
            .single();

        // Get Spritz username
        const { data: usernameData } = await supabase
            .from("shout_usernames")
            .select("username")
            .eq("wallet_address", settings.wallet_address)
            .maybeSingle();

        // Get availability windows
        const { data: windows } = await supabase
            .from("shout_availability_windows")
            .select("day_of_week, start_time, end_time, timezone")
            .eq("wallet_address", settings.wallet_address)
            .eq("is_active", true)
            .order("day_of_week");

        // Determine timezone from windows or default
        const timezone = windows?.[0]?.timezone || "UTC";

        // Build display name with priority: Spritz username > ENS > Shortened address
        const shortenedAddress = `${settings.wallet_address.slice(0, 6)}...${settings.wallet_address.slice(-4)}`;
        const displayName = usernameData?.username || user?.ens_name || user?.display_name || shortenedAddress;

        return NextResponse.json({
            profile: {
                walletAddress: settings.wallet_address,
                displayName,
                username: usernameData?.username || null,
                ensName: user?.ens_name || null,
                avatarUrl: user?.avatar_url || null,
                bio: settings.scheduling_bio || null,
                title: settings.scheduling_title || `Book a call`,
                slug: settings.scheduling_slug || settings.wallet_address,
            },
            scheduling: {
                freeEnabled: settings.scheduling_free_enabled ?? true,
                paidEnabled: settings.scheduling_paid_enabled ?? false,
                freeDuration: settings.scheduling_free_duration_minutes || 15,
                paidDuration: settings.scheduling_paid_duration_minutes || 30,
                priceCents: settings.scheduling_price_cents || 0,
                network: settings.scheduling_network || "base",
                payToAddress: settings.scheduling_wallet_address || settings.wallet_address,
                bufferMinutes: settings.scheduling_buffer_minutes || 15,
                advanceNoticeHours: settings.scheduling_advance_notice_hours || 24,
            },
            availability: {
                windows: windows?.map(w => ({
                    dayOfWeek: w.day_of_week,
                    startTime: w.start_time,
                    endTime: w.end_time,
                })) || [],
                timezone,
            },
        });
    } catch (error) {
        console.error("[Schedule] Profile error:", error);
        return NextResponse.json(
            { error: "Failed to fetch scheduling profile" },
            { status: 500 }
        );
    }
}

