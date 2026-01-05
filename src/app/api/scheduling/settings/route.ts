import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/scheduling/settings?userAddress=...
// Get scheduling settings for a user
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress");

        if (!userAddress) {
            return NextResponse.json(
                { error: "User address required" },
                { status: 400 }
            );
        }

        const { data: settings } = await supabase
            .from("shout_user_settings")
            .select(`
                scheduling_enabled,
                scheduling_slug,
                scheduling_title,
                scheduling_bio,
                scheduling_free_enabled,
                scheduling_paid_enabled,
                scheduling_free_duration_minutes,
                scheduling_paid_duration_minutes,
                scheduling_price_cents,
                scheduling_network,
                scheduling_wallet_address,
                scheduling_duration_minutes,
                scheduling_buffer_minutes,
                scheduling_advance_notice_hours,
                scheduling_calendar_sync
            `)
            .eq("wallet_address", userAddress.toLowerCase())
            .single();

        if (!settings) {
            return NextResponse.json({
                scheduling_enabled: false,
                scheduling_slug: null,
                scheduling_title: null,
                scheduling_bio: null,
                scheduling_free_enabled: true,
                scheduling_paid_enabled: false,
                scheduling_free_duration_minutes: 15,
                scheduling_paid_duration_minutes: 30,
                scheduling_price_cents: 0,
                scheduling_network: "base",
                scheduling_wallet_address: null,
                scheduling_duration_minutes: 30,
                scheduling_buffer_minutes: 15,
                scheduling_advance_notice_hours: 24,
                scheduling_calendar_sync: true,
            });
        }

        return NextResponse.json({
            scheduling_enabled: settings.scheduling_enabled || false,
            scheduling_slug: settings.scheduling_slug || null,
            scheduling_title: settings.scheduling_title || null,
            scheduling_bio: settings.scheduling_bio || null,
            scheduling_free_enabled: settings.scheduling_free_enabled ?? true,
            scheduling_paid_enabled: settings.scheduling_paid_enabled ?? false,
            scheduling_free_duration_minutes: settings.scheduling_free_duration_minutes || 15,
            scheduling_paid_duration_minutes: settings.scheduling_paid_duration_minutes || 30,
            scheduling_price_cents: settings.scheduling_price_cents || 0,
            scheduling_network: settings.scheduling_network || "base",
            scheduling_wallet_address: settings.scheduling_wallet_address || null,
            scheduling_duration_minutes: settings.scheduling_duration_minutes || 30,
            scheduling_buffer_minutes: settings.scheduling_buffer_minutes || 15,
            scheduling_advance_notice_hours: settings.scheduling_advance_notice_hours || 24,
            scheduling_calendar_sync: settings.scheduling_calendar_sync ?? true,
        });
    } catch (error) {
        console.error("[Scheduling] Settings GET error:", error);
        return NextResponse.json(
            { error: "Failed to fetch scheduling settings" },
            { status: 500 }
        );
    }
}

// POST /api/scheduling/settings - Update scheduling settings
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            userAddress,
            scheduling_enabled,
            scheduling_slug,
            scheduling_title,
            scheduling_bio,
            scheduling_free_enabled,
            scheduling_paid_enabled,
            scheduling_free_duration_minutes,
            scheduling_paid_duration_minutes,
            scheduling_price_cents,
            scheduling_network,
            scheduling_wallet_address,
            scheduling_duration_minutes,
            scheduling_buffer_minutes,
            scheduling_advance_notice_hours,
            scheduling_calendar_sync,
        } = body;

        if (!userAddress) {
            return NextResponse.json(
                { error: "User address required" },
                { status: 400 }
            );
        }

        // If enabling scheduling, require verified email
        if (scheduling_enabled === true) {
            const { data: user } = await supabase
                .from("shout_users")
                .select("email, email_verified")
                .eq("wallet_address", userAddress.toLowerCase())
                .single();

            if (!user?.email || !user?.email_verified) {
                return NextResponse.json(
                    { error: "Email verification is required to enable scheduling. Please verify your email first." },
                    { status: 400 }
                );
            }
        }

        // Validate price (must be >= 0)
        if (scheduling_price_cents !== undefined && scheduling_price_cents < 0) {
            return NextResponse.json(
                { error: "Price must be 0 or greater" },
                { status: 400 }
            );
        }

        // Validate durations (must be > 0)
        if (scheduling_duration_minutes !== undefined && scheduling_duration_minutes <= 0) {
            return NextResponse.json(
                { error: "Duration must be greater than 0" },
                { status: 400 }
            );
        }

        // Validate network - supported networks for USDC payments
        const SUPPORTED_NETWORKS = ["base", "base-sepolia", "ethereum", "arbitrum", "optimism", "polygon"];
        if (scheduling_network && !SUPPORTED_NETWORKS.includes(scheduling_network)) {
            return NextResponse.json(
                { error: `Network must be one of: ${SUPPORTED_NETWORKS.join(", ")}` },
                { status: 400 }
            );
        }

        // If paid scheduling is enabled and price > 0, wallet address is required
        if (scheduling_paid_enabled && scheduling_price_cents > 0 && !scheduling_wallet_address) {
            return NextResponse.json(
                { error: "Wallet address is required for paid scheduling" },
                { status: 400 }
            );
        }

        // Validate slug format if provided
        if (scheduling_slug) {
            if (!/^[a-z0-9-]+$/.test(scheduling_slug)) {
                return NextResponse.json(
                    { error: "Slug can only contain lowercase letters, numbers, and hyphens" },
                    { status: 400 }
                );
            }
            if (scheduling_slug.length < 3 || scheduling_slug.length > 30) {
                return NextResponse.json(
                    { error: "Slug must be between 3 and 30 characters" },
                    { status: 400 }
                );
            }

            // Check if slug is already taken by another user
            const { data: existingSlug } = await supabase
                .from("shout_user_settings")
                .select("wallet_address")
                .eq("scheduling_slug", scheduling_slug.toLowerCase())
                .neq("wallet_address", userAddress.toLowerCase())
                .single();

            if (existingSlug) {
                return NextResponse.json(
                    { error: "This URL is already taken" },
                    { status: 409 }
                );
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = {};
        if (scheduling_enabled !== undefined) updateData.scheduling_enabled = scheduling_enabled;
        if (scheduling_slug !== undefined) updateData.scheduling_slug = scheduling_slug?.toLowerCase() || null;
        if (scheduling_title !== undefined) updateData.scheduling_title = scheduling_title || null;
        if (scheduling_bio !== undefined) updateData.scheduling_bio = scheduling_bio || null;
        if (scheduling_free_enabled !== undefined) updateData.scheduling_free_enabled = scheduling_free_enabled;
        if (scheduling_paid_enabled !== undefined) updateData.scheduling_paid_enabled = scheduling_paid_enabled;
        if (scheduling_free_duration_minutes !== undefined) updateData.scheduling_free_duration_minutes = scheduling_free_duration_minutes;
        if (scheduling_paid_duration_minutes !== undefined) updateData.scheduling_paid_duration_minutes = scheduling_paid_duration_minutes;
        if (scheduling_price_cents !== undefined) updateData.scheduling_price_cents = scheduling_price_cents;
        if (scheduling_network !== undefined) updateData.scheduling_network = scheduling_network;
        if (scheduling_wallet_address !== undefined) updateData.scheduling_wallet_address = scheduling_wallet_address;
        if (scheduling_duration_minutes !== undefined) updateData.scheduling_duration_minutes = scheduling_duration_minutes;
        if (scheduling_buffer_minutes !== undefined) updateData.scheduling_buffer_minutes = scheduling_buffer_minutes;
        if (scheduling_advance_notice_hours !== undefined) updateData.scheduling_advance_notice_hours = scheduling_advance_notice_hours;
        if (scheduling_calendar_sync !== undefined) updateData.scheduling_calendar_sync = scheduling_calendar_sync;

        const { data, error } = await supabase
            .from("shout_user_settings")
            .upsert(
                {
                    wallet_address: userAddress.toLowerCase(),
                    ...updateData,
                    updated_at: new Date().toISOString(),
                },
                {
                    onConflict: "wallet_address",
                }
            )
            .select()
            .single();

        if (error) {
            console.error("[Scheduling] Settings POST error:", error);
            return NextResponse.json(
                { error: "Failed to update scheduling settings" },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, settings: data });
    } catch (error) {
        console.error("[Scheduling] Settings POST error:", error);
        return NextResponse.json(
            { error: "Failed to update scheduling settings" },
            { status: 500 }
        );
    }
}

