import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/public/book/[slug] - Get scheduling profile by custom booking slug only
// This is separate from /schedule/[slug] to avoid collisions with usernames/ENS
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

        // Only look up by custom scheduling_slug (not usernames, ENS, or addresses)
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
            .eq("scheduling_slug", slug.toLowerCase())
            .single();

        if (error || !settings) {
            return NextResponse.json(
                { error: "Booking link not found" },
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
        console.error("[Book] Profile error:", error);
        return NextResponse.json(
            { error: "Failed to fetch booking profile" },
            { status: 500 }
        );
    }
}
