import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabaseServer";

// GET /api/public/user - Get public user info by address (no auth required)
export async function GET(request: NextRequest) {
    const address = request.nextUrl.searchParams.get("address");

    if (!address) {
        return NextResponse.json(
            { error: "Address required" },
            { status: 400 }
        );
    }

    if (!supabaseService) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 503 }
        );
    }

    const normalizedAddress = address.toLowerCase();

    // Fetch all user data in parallel
    const [userResult, usernameResult, settingsResult] = await Promise.all([
        supabaseService
            .from("shout_users")
            .select("wallet_address, display_name, ens_name, avatar_url")
            .eq("wallet_address", normalizedAddress)
            .maybeSingle(),
        supabaseService
            .from("shout_usernames")
            .select("username")
            .eq("wallet_address", normalizedAddress)
            .maybeSingle(),
        supabaseService
            .from("shout_user_settings")
            .select("custom_avatar_url, use_custom_avatar")
            .eq("wallet_address", normalizedAddress)
            .maybeSingle(),
    ]);

    const user = userResult.data;
    const usernameData = usernameResult.data;
    const settings = settingsResult.data;

    // PERF: this endpoint is hammered by the UI whenever we render a user
    // card (friends list, chats, profiles). The payload is public and
    // rarely changes — cache at the edge for 60s, serve stale for 5min
    // while we revalidate. Works with Vercel's CDN out of the box.
    const publicCacheHeaders = {
        "Cache-Control":
            "public, s-maxage=60, stale-while-revalidate=300, max-age=0",
        // Tell intermediaries the response varies per-address. Next.js
        // already keys cache by URL so this is belt-and-braces.
        Vary: "Accept-Encoding",
    };

    if (!user && !usernameData) {
        return NextResponse.json(
            { user: null },
            { headers: publicCacheHeaders }
        );
    }

    const effectiveAvatar =
        settings?.use_custom_avatar && settings?.custom_avatar_url
            ? settings.custom_avatar_url
            : user?.avatar_url || null;

    return NextResponse.json(
        {
            user: {
                username: usernameData?.username || null,
                display_name: user?.display_name || null,
                ens_name: user?.ens_name || null,
                avatar_url: effectiveAvatar,
            },
        },
        { headers: publicCacheHeaders }
    );
}
