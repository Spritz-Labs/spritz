import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

const ADMIN_MESSAGE_EXPIRY_MS = 24 * 60 * 60 * 1000;

function validateMessageTimestamp(message: string): boolean {
    const match = message.match(/Issued At: ([^\n]+)/);
    if (!match) return false;
    const issuedAt = new Date(match[1]);
    if (isNaN(issuedAt.getTime())) return false;
    const messageAge = Date.now() - issuedAt.getTime();
    if (messageAge > ADMIN_MESSAGE_EXPIRY_MS || messageAge < -60000) return false;
    return true;
}

async function verifyAdmin(request: NextRequest): Promise<{ isAdmin: boolean; address: string | null; isSuperAdmin: boolean }> {
    const address = request.headers.get("x-admin-address");
    const signature = request.headers.get("x-admin-signature");
    const encodedMessage = request.headers.get("x-admin-message");

    if (!address || !signature || !encodedMessage || !supabase) {
        return { isAdmin: false, address: null, isSuperAdmin: false };
    }

    try {
        const message = decodeURIComponent(atob(encodedMessage));
        if (!validateMessageTimestamp(message)) {
            return { isAdmin: false, address: null, isSuperAdmin: false };
        }

        const isValidSignature = await verifyMessage({
            address: address as `0x${string}`,
            message,
            signature: signature as `0x${string}`,
        });

        if (!isValidSignature) {
            return { isAdmin: false, address: null, isSuperAdmin: false };
        }

        const { data: admin } = await supabase
            .from("shout_admins")
            .select("*")
            .eq("wallet_address", address.toLowerCase())
            .single();

        return {
            isAdmin: !!admin,
            address: address.toLowerCase(),
            isSuperAdmin: admin?.is_super_admin || false,
        };
    } catch {
        return { isAdmin: false, address: null, isSuperAdmin: false };
    }
}

// Generate DM conversation ID - must match client-side logic
function getDmContentTopic(address1: string, address2: string): string {
    const sorted = [address1.toLowerCase(), address2.toLowerCase()].sort();
    return `/spritz/1/dm/${sorted[0]}-${sorted[1]}/proto`;
}

function generateMessageId(): string {
    return `broadcast-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// GET: Get friend count + preview for the admin's address
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { isAdmin, address } = await verifyAdmin(request);
    if (!isAdmin || !address) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Count friends for this admin
        const { data: friends, error } = await supabase
            .from("shout_friends")
            .select("friend_address")
            .eq("user_address", address);

        if (error) {
            console.error("[Broadcast] Error fetching friends:", error);
            return NextResponse.json({ error: "Failed to fetch friends" }, { status: 500 });
        }

        return NextResponse.json({
            friendCount: friends?.length || 0,
            senderAddress: address,
        });
    } catch (error) {
        console.error("[Broadcast] GET error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

// POST: Send broadcast DM to all friends
export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { isAdmin, address } = await verifyAdmin(request);
    if (!isAdmin || !address) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { message } = await request.json();

        if (!message || typeof message !== "string" || !message.trim()) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }

        const trimmedMessage = message.trim();
        if (trimmedMessage.length > 2000) {
            return NextResponse.json({ error: "Message too long (max 2000 characters)" }, { status: 400 });
        }

        // Get all friends
        const { data: friends, error: friendsError } = await supabase
            .from("shout_friends")
            .select("friend_address")
            .eq("user_address", address);

        if (friendsError) {
            console.error("[Broadcast] Error fetching friends:", friendsError);
            return NextResponse.json({ error: "Failed to fetch friends" }, { status: 500 });
        }

        if (!friends || friends.length === 0) {
            return NextResponse.json({ error: "No friends to send to" }, { status: 400 });
        }

        // Remove duplicates and self
        const uniqueFriends = [...new Set(friends.map(f => f.friend_address.toLowerCase()))]
            .filter(addr => addr !== address);

        console.log(`[Broadcast] Sending message from ${address} to ${uniqueFriends.length} friends`);

        let sent = 0;
        let failed = 0;
        const batchSize = 50;

        // Process in batches for better performance
        for (let i = 0; i < uniqueFriends.length; i += batchSize) {
            const batch = uniqueFriends.slice(i, i + batchSize);
            const rows = batch.map(recipientAddress => ({
                conversation_id: getDmContentTopic(address, recipientAddress),
                sender_address: address,
                recipient_address: recipientAddress,
                group_id: null,
                encrypted_content: trimmedMessage, // Plain text for broadcast messages
                message_type: "broadcast",
                message_id: generateMessageId(),
                sent_at: new Date().toISOString(),
            }));

            const { error: insertError } = await supabase
                .from("shout_messages")
                .insert(rows);

            if (insertError) {
                console.error(`[Broadcast] Batch ${i / batchSize + 1} insert error:`, insertError);
                failed += batch.length;
            } else {
                sent += batch.length;
            }
        }

        console.log(`[Broadcast] Complete: ${sent} sent, ${failed} failed out of ${uniqueFriends.length}`);

        return NextResponse.json({
            success: true,
            sent,
            failed,
            total: uniqueFriends.length,
        });
    } catch (error) {
        console.error("[Broadcast] POST error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
