import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type TokenChat = {
    id: string;
    name: string;
    created_by: string;
    token_address: string;
    token_chain_id: number;
    token_name: string | null;
    token_symbol: string | null;
    token_decimals: number;
    token_image: string | null;
    min_balance: string;
    min_balance_display: string | null;
    is_official: boolean;
    description: string | null;
    emoji: string;
    member_count: number;
    created_at: string;
    updated_at: string;
    is_member?: boolean;
};

// POST /api/token-chats - Create a new token chat
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            userAddress,
            tokenAddress,
            tokenChainId,
            tokenName,
            tokenSymbol,
            tokenDecimals,
            tokenImage,
            minBalance,
            minBalanceDisplay,
            isOfficial,
            name,
            description,
            emoji,
        } = body;

        if (!userAddress || !tokenAddress || !tokenChainId || !name) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const chatId = `tc_${uuidv4().replace(/-/g, "").slice(0, 16)}`;

        const { data, error } = await supabase
            .from("shout_token_chats")
            .insert({
                id: chatId,
                name: name.trim(),
                created_by: userAddress.toLowerCase(),
                token_address: tokenAddress.toLowerCase(),
                token_chain_id: tokenChainId,
                token_name: tokenName || null,
                token_symbol: tokenSymbol || null,
                token_decimals: tokenDecimals || 18,
                token_image: tokenImage || null,
                min_balance: minBalance || "0",
                min_balance_display: minBalanceDisplay || null,
                is_official: isOfficial || false,
                description: description?.trim() || null,
                emoji: emoji || "🪙",
            })
            .select()
            .single();

        if (error) {
            console.error("[token-chats] Create error:", error);
            return NextResponse.json({ error: "Failed to create token chat" }, { status: 500 });
        }

        // Auto-join the creator as admin
        await supabase.from("shout_token_chat_members").insert({
            chat_id: chatId,
            member_address: userAddress.toLowerCase(),
            role: "admin",
        });

        return NextResponse.json({ chat: data });
    } catch (err) {
        console.error("[token-chats] Error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// GET /api/token-chats - List/search token chats
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get("userAddress")?.toLowerCase();
    const tokenAddress = searchParams.get("tokenAddress")?.toLowerCase();
    const chainId = searchParams.get("chainId");
    const search = searchParams.get("search");
    const mode = searchParams.get("mode") || "browse"; // "browse" | "my"

    try {
        let query = supabase
            .from("shout_token_chats")
            .select("*")
            .order("member_count", { ascending: false });

        if (tokenAddress) {
            query = query.eq("token_address", tokenAddress);
        }
        if (chainId) {
            query = query.eq("token_chain_id", parseInt(chainId));
        }
        if (search) {
            query = query.or(`name.ilike.%${search}%,token_name.ilike.%${search}%,token_symbol.ilike.%${search}%`);
        }

        const { data: chats, error } = await query.limit(50);

        if (error) {
            console.error("[token-chats] List error:", error);
            return NextResponse.json({ error: "Failed to list token chats" }, { status: 500 });
        }

        // If userAddress provided, check membership
        let memberChatIds = new Set<string>();
        if (userAddress) {
            const { data: memberships } = await supabase
                .from("shout_token_chat_members")
                .select("chat_id")
                .eq("member_address", userAddress);

            if (memberships) {
                memberChatIds = new Set(memberships.map((m) => m.chat_id));
            }
        }

        // If mode is "my", filter to only chats the user is a member of
        let result = (chats || []).map((chat) => ({
            ...chat,
            is_member: memberChatIds.has(chat.id),
        }));

        if (mode === "my" && userAddress) {
            result = result.filter((chat) => chat.is_member);
        }

        return NextResponse.json({ chats: result });
    } catch (err) {
        console.error("[token-chats] Error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
