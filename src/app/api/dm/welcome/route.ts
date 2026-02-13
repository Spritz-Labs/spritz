import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Kevin's wallet address
const KEVIN_ADDRESS = "0x3f22f740d41518f5017b76eed3a63eb14d2e1b07";

// Generate DM content topic (conversation ID) - must match client-side logic
function getDmContentTopic(address1: string, address2: string): string {
    const sorted = [address1.toLowerCase(), address2.toLowerCase()].sort();
    return `/spritz/1/dm/${sorted[0]}-${sorted[1]}/proto`;
}

// Generate unique message ID
function generateMessageId(): string {
    return `welcome-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Welcome message content
const WELCOME_MESSAGE =
    "Hey, its Kevin from Spritz! 😎 Thanks so much for joining and I hope you love the app! I am here if you need anything. 🍊";

// POST: Send welcome message from Kevin to a new user
// This is called internally from track-login, not exposed to clients
export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }

    try {
        // Check for internal API key to prevent abuse
        const authHeader = request.headers.get("x-internal-key");
        const internalKey =
            process.env.INTERNAL_API_KEY ||
            process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (authHeader !== internalKey) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        const { recipientAddress } = await request.json();

        if (!recipientAddress) {
            return NextResponse.json(
                { error: "Recipient address required" },
                { status: 400 },
            );
        }

        const normalizedRecipient = recipientAddress.toLowerCase();

        // Don't send welcome message to Kevin himself
        if (normalizedRecipient === KEVIN_ADDRESS) {
            return NextResponse.json({
                success: true,
                skipped: true,
                reason: "sender is recipient",
            });
        }

        // Generate conversation ID
        const conversationId = getDmContentTopic(
            KEVIN_ADDRESS,
            normalizedRecipient,
        );
        const messageId = generateMessageId();

        // Check if welcome message already sent to this user
        const { data: existingWelcome } = await supabase
            .from("shout_messages")
            .select("message_id")
            .eq("conversation_id", conversationId)
            .eq("message_type", "welcome")
            .single();

        if (existingWelcome) {
            console.log("[Welcome] Already sent to:", normalizedRecipient);
            return NextResponse.json({
                success: true,
                skipped: true,
                reason: "already sent",
            });
        }

        // Bidirectional friendship: new user ↔ Kevin
        // Both directions so Kevin can broadcast to "friends" and new user sees Kevin in their list.
        // Direction 1: new user → Kevin (so welcome chat shows in new user's list)
        const { data: existingFriend } = await supabase
            .from("shout_friends")
            .select("id")
            .eq("user_address", normalizedRecipient)
            .eq("friend_address", KEVIN_ADDRESS)
            .maybeSingle();

        if (!existingFriend) {
            const { error: friendError } = await supabase
                .from("shout_friends")
                .insert({
                    user_address: normalizedRecipient,
                    friend_address: KEVIN_ADDRESS,
                });

            if (friendError) {
                console.error("[Welcome] Error adding friend (user→Kevin):", friendError);
            } else {
                console.log(
                    "[Welcome] Added Kevin as friend for:",
                    normalizedRecipient,
                );
            }
        }

        // Direction 2: Kevin → new user (so Kevin can broadcast to "friends" and see user in DMs)
        const { data: existingReverse } = await supabase
            .from("shout_friends")
            .select("id")
            .eq("user_address", KEVIN_ADDRESS)
            .eq("friend_address", normalizedRecipient)
            .maybeSingle();

        if (!existingReverse) {
            const { error: reverseError } = await supabase
                .from("shout_friends")
                .insert({
                    user_address: KEVIN_ADDRESS,
                    friend_address: normalizedRecipient,
                });

            if (reverseError) {
                console.error("[Welcome] Error adding friend (Kevin→user):", reverseError);
            } else {
                console.log(
                    "[Welcome] Added new user as friend for Kevin:",
                    normalizedRecipient,
                );
            }
        }

        // Insert welcome message (plain text, not encrypted)
        const { error } = await supabase.from("shout_messages").insert({
            conversation_id: conversationId,
            sender_address: KEVIN_ADDRESS,
            recipient_address: normalizedRecipient,
            group_id: null,
            encrypted_content: WELCOME_MESSAGE, // Plain text for welcome messages
            message_type: "welcome",
            message_id: messageId,
            sent_at: new Date().toISOString(),
        });

        if (error) {
            console.error("[Welcome] Error sending message:", error);
            return NextResponse.json(
                { error: "Failed to send welcome message" },
                { status: 500 },
            );
        }

        console.log(
            "[Welcome] Sent to:",
            normalizedRecipient,
            "messageId:",
            messageId,
        );
        return NextResponse.json({ success: true, messageId });
    } catch (error) {
        console.error("[Welcome] Error:", error);
        return NextResponse.json(
            { error: "Failed to send welcome message" },
            { status: 500 },
        );
    }
}
