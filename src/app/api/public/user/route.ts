import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/public/user - Get public user info by address (no auth required)
export async function GET(request: NextRequest) {
    const address = request.nextUrl.searchParams.get("address");

    if (!address) {
        return NextResponse.json({ error: "Address required" }, { status: 400 });
    }

    const normalizedAddress = address.toLowerCase();

    // Fetch all user data in parallel
    const [userResult, usernameResult, settingsResult] = await Promise.all([
        // Fetch user data from shout_users (ENS avatar)
        supabase
            .from("shout_users")
            .select("wallet_address, display_name, ens_name, avatar_url")
            .eq("wallet_address", normalizedAddress)
            .maybeSingle(),
        // Fetch username from shout_usernames
        supabase
            .from("shout_usernames")
            .select("username")
            .eq("wallet_address", normalizedAddress)
            .maybeSingle(),
        // Fetch custom avatar settings
        supabase
            .from("shout_user_settings")
            .select("custom_avatar_url, use_custom_avatar")
            .eq("wallet_address", normalizedAddress)
            .maybeSingle(),
    ]);

    const user = userResult.data;
    const usernameData = usernameResult.data;
    const settings = settingsResult.data;

    // Return user data even if only username exists
    if (!user && !usernameData) {
        return NextResponse.json({ user: null });
    }

    // Determine effective avatar: custom if enabled, otherwise ENS
    const effectiveAvatar = settings?.use_custom_avatar && settings?.custom_avatar_url
        ? settings.custom_avatar_url
        : user?.avatar_url || null;

    return NextResponse.json({
        user: {
            username: usernameData?.username || null,
            display_name: user?.display_name || null,
            ens_name: user?.ens_name || null,
            avatar_url: effectiveAvatar,
        },
    });
}

