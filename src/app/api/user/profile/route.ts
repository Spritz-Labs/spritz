import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// PATCH /api/user/profile - Update authenticated user's profile
export async function PATCH(request: NextRequest) {
    try {
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const body = await request.json();
        const { display_name, username, avatar_url } = body;
        const address = session.userAddress.toLowerCase();

        if (display_name !== undefined) {
            await supabase
                .from("shout_users")
                .update({ display_name })
                .eq("wallet_address", address);
        }

        if (avatar_url !== undefined) {
            await supabase
                .from("shout_users")
                .update({ avatar_url })
                .eq("wallet_address", address);
        }

        if (username !== undefined && username) {
            const normalizedUsername = username
                .toLowerCase()
                .replace(/[^a-z0-9_-]/g, "")
                .slice(0, 30);

            if (normalizedUsername) {
                const { data: existing } = await supabase
                    .from("shout_usernames")
                    .select("wallet_address")
                    .eq("username", normalizedUsername)
                    .maybeSingle();

                if (existing && existing.wallet_address.toLowerCase() !== address) {
                    // Username taken by someone else -- skip
                } else {
                    await supabase
                        .from("shout_usernames")
                        .upsert(
                            { wallet_address: address, username: normalizedUsername },
                            { onConflict: "wallet_address" },
                        );
                }
            }
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("[User Profile] Error:", e);
        return NextResponse.json(
            { error: "Failed to update profile" },
            { status: 500 },
        );
    }
}

// GET /api/user/profile - Get authenticated user's profile
export async function GET(request: NextRequest) {
    try {
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const address = session.userAddress.toLowerCase();

        const [{ data: user }, { data: usernameData }] = await Promise.all([
            supabase
                .from("shout_users")
                .select("wallet_address, display_name, ens_name, avatar_url")
                .eq("wallet_address", address)
                .maybeSingle(),
            supabase
                .from("shout_usernames")
                .select("username")
                .eq("wallet_address", address)
                .maybeSingle(),
        ]);

        return NextResponse.json({
            wallet_address: address,
            display_name: user?.display_name || null,
            username: usernameData?.username || null,
            ens_name: user?.ens_name || null,
            avatar_url: user?.avatar_url || null,
        });
    } catch (e) {
        console.error("[User Profile] Error:", e);
        return NextResponse.json(
            { error: "Failed to get profile" },
            { status: 500 },
        );
    }
}
