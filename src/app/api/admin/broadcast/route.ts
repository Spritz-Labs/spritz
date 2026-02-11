import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Web Push setup
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:hello@reach.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

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

async function verifyAdmin(
    request: NextRequest,
): Promise<{
    isAdmin: boolean;
    address: string | null;
    isSuperAdmin: boolean;
}> {
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

// Resolve sender display name
async function getSenderName(address: string): Promise<string> {
    if (!supabase) return address;
    try {
        const { data } = await supabase
            .from("shout_usernames")
            .select("username")
            .eq("wallet_address", address.toLowerCase())
            .maybeSingle();
        if (data?.username) return data.username;

        // Try ENS name from user record
        const { data: user } = await supabase
            .from("shout_users")
            .select("ens_name, username")
            .eq("wallet_address", address.toLowerCase())
            .maybeSingle();
        if (user?.ens_name) return user.ens_name;
        if (user?.username) return user.username;
    } catch {
        // ignore
    }
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Send push notification to a single user (fire and forget)
async function sendPushNotification(
    targetAddress: string,
    senderName: string,
    messageBody: string,
): Promise<boolean> {
    if (!supabase || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;

    try {
        const { data: subscription } = await supabase
            .from("push_subscriptions")
            .select("endpoint, p256dh, auth")
            .eq("user_address", targetAddress.toLowerCase())
            .single();

        if (!subscription) return false;

        const payload = JSON.stringify({
            title: `Message from ${senderName}`,
            body:
                messageBody.length > 100
                    ? messageBody.slice(0, 100) + "..."
                    : messageBody,
            type: "message",
            url: "/",
            tag: "reach-notification",
        });

        await webpush.sendNotification(
            {
                endpoint: subscription.endpoint,
                keys: {
                    p256dh: subscription.p256dh,
                    auth: subscription.auth,
                },
            },
            payload,
        );

        return true;
    } catch (err) {
        // Remove expired subscriptions
        if (
            err instanceof webpush.WebPushError &&
            err.statusCode === 410
        ) {
            await supabase
                .from("push_subscriptions")
                .delete()
                .eq("user_address", targetAddress.toLowerCase());
        }
        return false;
    }
}

// GET: Get recipient counts for the admin
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }

    const { isAdmin, address } = await verifyAdmin(request);
    if (!isAdmin || !address) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Count friends
        const { data: friends } = await supabase
            .from("shout_friends")
            .select("friend_address")
            .eq("user_address", address);

        // Count all users (excluding self)
        const { count: allUsersCount } = await supabase
            .from("shout_users")
            .select("*", { count: "exact", head: true })
            .neq("wallet_address", address);

        // Count users with push subscriptions
        const { count: pushCount } = await supabase
            .from("push_subscriptions")
            .select("*", { count: "exact", head: true });

        // Get sender display name
        const senderName = await getSenderName(address);

        return NextResponse.json({
            friendCount: friends?.length || 0,
            allUsersCount: allUsersCount ?? 0,
            pushSubscribedCount: pushCount ?? 0,
            senderAddress: address,
            senderName,
        });
    } catch (error) {
        console.error("[Broadcast] GET error:", error);
        return NextResponse.json(
            { error: "Internal error" },
            { status: 500 },
        );
    }
}

// POST: Send broadcast DM to recipients with push notifications
export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }

    const { isAdmin, address } = await verifyAdmin(request);
    if (!isAdmin || !address) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { message, target } = body as {
            message: string;
            target: "all_users" | "friends";
        };

        if (!message || typeof message !== "string" || !message.trim()) {
            return NextResponse.json(
                { error: "Message is required" },
                { status: 400 },
            );
        }

        const trimmedMessage = message.trim();
        if (trimmedMessage.length > 2000) {
            return NextResponse.json(
                { error: "Message too long (max 2000 characters)" },
                { status: 400 },
            );
        }

        // Get recipients based on target
        let recipientAddresses: string[] = [];

        if (target === "all_users") {
            // Fetch ALL user addresses in batches (Supabase caps at 1000)
            let offset = 0;
            const batchSize = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await supabase
                    .from("shout_users")
                    .select("wallet_address")
                    .neq("wallet_address", address)
                    .range(offset, offset + batchSize - 1);

                if (error) {
                    console.error("[Broadcast] Error fetching users:", error);
                    break;
                }

                if (!data || data.length === 0) {
                    hasMore = false;
                } else {
                    recipientAddresses.push(
                        ...data.map((u) => u.wallet_address.toLowerCase()),
                    );
                    if (data.length < batchSize) {
                        hasMore = false;
                    } else {
                        offset += batchSize;
                    }
                }
            }
        } else {
            // Friends only
            const { data: friends, error: friendsError } = await supabase
                .from("shout_friends")
                .select("friend_address")
                .eq("user_address", address);

            if (friendsError) {
                console.error(
                    "[Broadcast] Error fetching friends:",
                    friendsError,
                );
                return NextResponse.json(
                    { error: "Failed to fetch friends" },
                    { status: 500 },
                );
            }

            recipientAddresses = (friends || []).map((f) =>
                f.friend_address.toLowerCase(),
            );
        }

        // Deduplicate and remove self
        recipientAddresses = [
            ...new Set(recipientAddresses),
        ].filter((addr) => addr !== address);

        if (recipientAddresses.length === 0) {
            return NextResponse.json(
                { error: "No recipients found" },
                { status: 400 },
            );
        }

        console.log(
            `[Broadcast] Sending "${trimmedMessage.slice(0, 50)}..." from ${address} to ${recipientAddresses.length} ${target === "all_users" ? "users" : "friends"}`,
        );

        // Resolve sender name for push notifications
        const senderName = await getSenderName(address);

        let messagesSent = 0;
        let messagesFailed = 0;
        let pushSent = 0;
        const sentAt = new Date().toISOString();
        const msgBatchSize = 50;

        // Process in batches
        for (let i = 0; i < recipientAddresses.length; i += msgBatchSize) {
            const batch = recipientAddresses.slice(i, i + msgBatchSize);

            // 1) Insert DM messages into shout_messages
            const rows = batch.map((recipientAddress) => ({
                conversation_id: getDmContentTopic(address, recipientAddress),
                sender_address: address,
                recipient_address: recipientAddress,
                group_id: null,
                encrypted_content: trimmedMessage, // Plain text for broadcast
                message_type: "broadcast",
                message_id: generateMessageId(),
                sent_at: sentAt,
            }));

            const { error: insertError } = await supabase
                .from("shout_messages")
                .insert(rows);

            if (insertError) {
                console.error(
                    `[Broadcast] Batch ${Math.floor(i / msgBatchSize) + 1} insert error:`,
                    insertError,
                );
                messagesFailed += batch.length;
                continue; // Skip push for this batch if insert failed
            }

            messagesSent += batch.length;

            // 2) Send push notifications (fire and forget, don't block)
            const pushPromises = batch.map((recipientAddress) =>
                sendPushNotification(
                    recipientAddress,
                    senderName,
                    trimmedMessage,
                ).then((ok) => {
                    if (ok) pushSent++;
                }),
            );

            // Wait for push batch but with a timeout (don't let it hang)
            await Promise.race([
                Promise.allSettled(pushPromises),
                new Promise((resolve) => setTimeout(resolve, 10000)), // 10s max per batch
            ]);
        }

        console.log(
            `[Broadcast] Complete: ${messagesSent} messages, ${pushSent} push, ${messagesFailed} failed`,
        );

        return NextResponse.json({
            success: true,
            sent: messagesSent,
            failed: messagesFailed,
            pushSent,
            total: recipientAddresses.length,
            target,
        });
    } catch (error) {
        console.error("[Broadcast] POST error:", error);
        return NextResponse.json(
            { error: "Internal error" },
            { status: 500 },
        );
    }
}
