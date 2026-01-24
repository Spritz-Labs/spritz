import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type SearchResult = {
    type: "channel_message" | "dm" | "group";
    id: string;
    content: string;
    sender_address: string;
    sender_name?: string;
    created_at: string;
    // Context info
    channel_id?: string;
    channel_name?: string;
    channel_emoji?: string;
    peer_address?: string;
    peer_name?: string;
    group_id?: string;
    group_name?: string;
    highlight?: string;
};

// GET /api/search - Search across all chats
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim();
    const userAddress = searchParams.get("userAddress")?.toLowerCase();
    const type = searchParams.get("type"); // "all", "channels", "dms", "groups"
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    if (!userAddress) {
        return NextResponse.json(
            { error: "User address is required" },
            { status: 400 }
        );
    }

    if (!query || query.length < 2) {
        return NextResponse.json(
            { error: "Search query must be at least 2 characters" },
            { status: 400 }
        );
    }

    try {
        const results: SearchResult[] = [];
        const searchPattern = `%${query}%`;

        // Search channel messages (if user is a member)
        if (!type || type === "all" || type === "channels") {
            // First get user's joined channels
            const { data: userChannels } = await supabase
                .from("shout_channel_members")
                .select("channel_id")
                .eq("user_address", userAddress);
            
            const joinedChannelIds = (userChannels || []).map(c => c.channel_id);
            
            if (joinedChannelIds.length > 0) {
                const { data: channelMessages } = await supabase
                    .from("shout_channel_messages")
                    .select(`
                        id,
                        content,
                        sender_address,
                        created_at,
                        channel_id,
                        shout_public_channels!inner (
                            name,
                            emoji
                        )
                    `)
                    .ilike("content", searchPattern)
                    .eq("is_deleted", false)
                    .in("channel_id", joinedChannelIds)
                    .order("created_at", { ascending: false })
                    .limit(limit);

                if (channelMessages) {
                    for (const msg of channelMessages) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const channel = (msg.shout_public_channels as any)?.[0] || msg.shout_public_channels;
                        results.push({
                            type: "channel_message",
                            id: msg.id,
                            content: msg.content,
                            sender_address: msg.sender_address,
                            created_at: msg.created_at,
                            channel_id: msg.channel_id,
                            channel_name: channel?.name,
                            channel_emoji: channel?.emoji,
                            highlight: highlightMatch(msg.content, query),
                        });
                    }
                }
            }
        }

        // Get sender names/usernames
        const senderAddresses = [...new Set(results.map(r => r.sender_address))];
        if (senderAddresses.length > 0) {
            const { data: users } = await supabase
                .from("shout_users")
                .select("user_address, username, display_name")
                .in("user_address", senderAddresses);

            const userMap = new Map(
                (users || []).map(u => [
                    u.user_address.toLowerCase(),
                    u.display_name || u.username || null,
                ])
            );

            results.forEach(r => {
                r.sender_name = userMap.get(r.sender_address.toLowerCase()) || undefined;
            });
        }

        // Sort by relevance (exact matches first) then by date
        results.sort((a, b) => {
            const aExact = a.content.toLowerCase().includes(query.toLowerCase());
            const bExact = b.content.toLowerCase().includes(query.toLowerCase());
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        return NextResponse.json({
            results: results.slice(0, limit),
            total: results.length,
            query,
        });
    } catch (e) {
        console.error("[Search API] Error:", e);
        return NextResponse.json(
            { error: "Search failed" },
            { status: 500 }
        );
    }
}

// Helper to highlight matching text
function highlightMatch(content: string, query: string): string {
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerContent.indexOf(lowerQuery);
    
    if (index === -1) return content.slice(0, 150);
    
    // Extract a snippet around the match
    const start = Math.max(0, index - 30);
    const end = Math.min(content.length, index + query.length + 100);
    let snippet = content.slice(start, end);
    
    if (start > 0) snippet = "..." + snippet;
    if (end < content.length) snippet = snippet + "...";
    
    return snippet;
}
