import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// POST /api/token-chats/[id]/leave - Leave a token chat
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: chatId } = await params;

    try {
        const body = await request.json();
        const { userAddress } = body;

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Check if creator trying to leave
        const { data: chat } = await supabase
            .from("shout_token_chats")
            .select("created_by")
            .eq("id", chatId)
            .single();

        if (chat?.created_by?.toLowerCase() === normalizedAddress) {
            // Creator can leave, but we should check if there are other admins
            const { data: admins } = await supabase
                .from("shout_token_chat_members")
                .select("member_address")
                .eq("chat_id", chatId)
                .eq("role", "admin")
                .neq("member_address", normalizedAddress);

            if (!admins || admins.length === 0) {
                return NextResponse.json(
                    { error: "You must promote another member to admin before leaving as the creator" },
                    { status: 400 },
                );
            }
        }

        // Remove membership
        const { error } = await supabase
            .from("shout_token_chat_members")
            .delete()
            .eq("chat_id", chatId)
            .eq("member_address", normalizedAddress);

        if (error) {
            console.error("[Token Chat Leave] Error:", error);
            return NextResponse.json({ error: "Failed to leave chat" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[Token Chat Leave] Error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
