import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/username/resolve?username=...
 * 
 * Resolves a Spritz username to a wallet address
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const username = searchParams.get("username");

        if (!username) {
            return NextResponse.json(
                { error: "Username is required" },
                { status: 400 }
            );
        }

        // Normalize the username (lowercase, trim, remove @ prefix)
        const normalizedUsername = username
            .toLowerCase()
            .trim()
            .replace(/^@/, "");

        if (normalizedUsername.length < 3) {
            return NextResponse.json(
                { error: "Username must be at least 3 characters" },
                { status: 400 }
            );
        }

        // Look up the username in the database
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data, error } = await supabase
            .from("shout_usernames")
            .select("username, wallet_address")
            .eq("username", normalizedUsername)
            .maybeSingle();

        if (error) {
            console.error("[Username/Resolve] Lookup error:", error);
            return NextResponse.json(
                { error: "Failed to look up username" },
                { status: 500 }
            );
        }

        if (!data) {
            return NextResponse.json(
                { error: "Username not found", address: null },
                { status: 404 }
            );
        }

        return NextResponse.json({
            username: data.username,
            address: data.wallet_address,
        });
    } catch (error) {
        console.error("[Username/Resolve] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
