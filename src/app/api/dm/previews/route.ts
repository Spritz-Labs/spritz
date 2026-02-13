import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// GET: Fetch last message preview for each DM conversation the user is involved in.
// Returns sender, timestamp, and content (for plaintext types like welcome/broadcast/system).
// For encrypted messages, returns message_type so the client can show a placeholder.
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }

    try {
        const session = await getAuthenticatedUser(request);
        if (!session) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const userAddress = session.userAddress.toLowerCase();

        // Use a Supabase RPC or a raw query approach.
        // We fetch the most recent message per conversation_id for this user's DM conversations.
        // DM conversation_ids contain the user's address, so we filter by that.
        const { data, error } = await supabase.rpc(
            "get_dm_last_messages",
            { p_user_address: userAddress },
        );

        if (error) {
            // If the RPC doesn't exist, fall back to a simpler query
            console.error("[DM Previews] RPC error, falling back:", error);

            // Fallback: fetch the most recent message per conversation for this user
            // This uses a different approach - get the latest messages where the user is sender or recipient
            const { data: messages, error: fallbackError } = await supabase
                .from("shout_messages")
                .select(
                    "conversation_id, sender_address, recipient_address, encrypted_content, message_type, sent_at",
                )
                .or(
                    `sender_address.eq.${userAddress},recipient_address.eq.${userAddress}`,
                )
                .order("sent_at", { ascending: false })
                .limit(500); // Get recent messages, we'll dedupe by conversation

            if (fallbackError) {
                console.error("[DM Previews] Fallback error:", fallbackError);
                return NextResponse.json(
                    { error: "Failed to fetch previews" },
                    { status: 500 },
                );
            }

            // Deduplicate: keep only the latest message per conversation
            const latestByConversation = new Map<
                string,
                {
                    conversation_id: string;
                    sender_address: string;
                    content: string | null;
                    message_type: string;
                    sent_at: string;
                    peer_address: string;
                }
            >();

            for (const msg of messages || []) {
                if (latestByConversation.has(msg.conversation_id)) continue;

                // Determine peer address
                const peerAddress =
                    msg.sender_address === userAddress
                        ? msg.recipient_address
                        : msg.sender_address;

                // Only include content for plaintext message types
                const isPlaintext = ["welcome", "system", "broadcast"].includes(
                    msg.message_type,
                );

                latestByConversation.set(msg.conversation_id, {
                    conversation_id: msg.conversation_id,
                    sender_address: msg.sender_address,
                    content: isPlaintext ? msg.encrypted_content : null,
                    message_type: msg.message_type || "text",
                    sent_at: msg.sent_at,
                    peer_address: peerAddress,
                });
            }

            return NextResponse.json({
                previews: Array.from(latestByConversation.values()),
            });
        }

        return NextResponse.json({ previews: data || [] });
    } catch (error) {
        console.error("[DM Previews] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch previews" },
            { status: 500 },
        );
    }
}
