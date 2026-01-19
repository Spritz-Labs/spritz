import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/vault/eligible-friends
 * Returns friends who have Spritz Smart Wallets and can be added as vault signers
 */
export async function GET(request: NextRequest) {
    try {
        // Get authenticated user
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        const userAddress = session.userAddress.toLowerCase();

        // Get user's friends
        const { data: friendsData, error: friendsError } = await supabase
            .from("shout_friends")
            .select("friend_address")
            .eq("user_address", userAddress);

        if (friendsError) {
            console.error("[Vault] Error fetching friends:", friendsError);
            return NextResponse.json(
                { error: "Failed to fetch friends" },
                { status: 500 }
            );
        }

        if (!friendsData || friendsData.length === 0) {
            return NextResponse.json({ friends: [] });
        }

        const friendAddresses = friendsData.map(f => f.friend_address.toLowerCase());

        // Get profiles of friends who have smart wallets
        const { data: profiles, error: profilesError } = await supabase
            .from("shout_profiles")
            .select("wallet_address, smart_wallet_address, avatar_url")
            .in("wallet_address", friendAddresses)
            .not("smart_wallet_address", "is", null);

        if (profilesError) {
            console.error("[Vault] Error fetching profiles:", profilesError);
            return NextResponse.json(
                { error: "Failed to fetch profiles" },
                { status: 500 }
            );
        }

        // Filter to only those with valid smart wallet addresses
        const eligibleAddresses = (profiles || [])
            .filter(p => p.smart_wallet_address && p.smart_wallet_address.length === 42)
            .map(p => p.wallet_address.toLowerCase());

        if (eligibleAddresses.length === 0) {
            return NextResponse.json({ friends: [] });
        }

        // Get usernames
        const { data: usernames } = await supabase
            .from("shout_usernames")
            .select("wallet_address, username")
            .in("wallet_address", eligibleAddresses);

        const usernameMap = (usernames || []).reduce((acc, u) => {
            acc[u.wallet_address.toLowerCase()] = u.username;
            return acc;
        }, {} as Record<string, string>);

        // Format response
        const eligibleFriends = (profiles || [])
            .filter(p => p.smart_wallet_address && p.smart_wallet_address.length === 42)
            .map(p => ({
                address: p.wallet_address,
                smartWalletAddress: p.smart_wallet_address,
                username: usernameMap[p.wallet_address.toLowerCase()],
                avatar: p.avatar_url,
            }));

        return NextResponse.json({ friends: eligibleFriends });
    } catch (error) {
        console.error("[Vault] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch eligible friends" },
            { status: 500 }
        );
    }
}
