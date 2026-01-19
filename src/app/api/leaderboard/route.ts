import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// GET: Get leaderboard - top users by points
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 }
        );
    }

    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get("limit") || "10", 10);

        // Get top users by points
        const { data: users, error } = await supabase
            .from("shout_users")
            .select("wallet_address, username, ens_name, points")
            .gt("points", 0)
            .order("points", { ascending: false })
            .limit(limit);

        if (error) {
            console.error("[Leaderboard] Error:", error);
            return NextResponse.json(
                { error: "Failed to fetch leaderboard" },
                { status: 500 }
            );
        }

        // Also fetch Spritz usernames from shout_usernames table
        const addresses = (users || []).map(u => u.wallet_address);
        const { data: spritzUsernames } = await supabase
            .from("shout_usernames")
            .select("wallet_address, username")
            .in("wallet_address", addresses);
        
        // Create a map for quick lookup
        const usernameMap = new Map(
            spritzUsernames?.map(u => [u.wallet_address.toLowerCase(), u.username]) || []
        );

        // Format the leaderboard with Spritz username priority
        const leaderboard = (users || []).map((user, index) => {
            // Get Spritz username from the usernames table
            const spritzUsername = usernameMap.get(user.wallet_address.toLowerCase());
            
            return {
                rank: index + 1,
                address: user.wallet_address,
                // Priority: Spritz username > legacy username field > null
                username: spritzUsername || user.username || null,
                ensName: user.ens_name,
                points: user.points || 0,
            };
        });

        return NextResponse.json({
            leaderboard,
            total: leaderboard.length,
        });
    } catch (error) {
        console.error("[Leaderboard] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch leaderboard" },
            { status: 500 }
        );
    }
}

