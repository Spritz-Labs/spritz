import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// GET /api/public/token-chats/[id] - Get public token chat info (for invite pages)
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;

    try {
        const { data: chat, error } = await supabase
            .from("shout_token_chats")
            .select(
                "id, name, description, emoji, icon_url, token_address, token_chain_id, token_name, token_symbol, token_decimals, min_balance, min_balance_display, is_official, member_count, messaging_type, created_at",
            )
            .eq("id", id)
            .single();

        if (error || !chat) {
            return NextResponse.json(
                { error: "Token chat not found" },
                { status: 404 },
            );
        }

        return NextResponse.json({ chat });
    } catch (e) {
        console.error("[Public Token Chats API] Error:", e);
        return NextResponse.json(
            { error: "Failed to fetch token chat" },
            { status: 500 },
        );
    }
}
