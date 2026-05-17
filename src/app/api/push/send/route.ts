import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/ratelimit";

// Initialize web-push with VAPID keys
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:hello@reach.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Server-side Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
    supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

export async function POST(request: NextRequest) {
    const rateLimitResponse = await checkRateLimit(request, "messaging");
    if (rateLimitResponse) return rateLimitResponse;

    let targetAddress: string | undefined;

    try {
        if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
            return NextResponse.json(
                { error: "Push notifications not configured" },
                { status: 500 }
            );
        }

        if (!supabase) {
            return NextResponse.json({ error: "Database not configured" }, { status: 500 });
        }

        const body = await request.json();
        const { senderAddress, title, body: messageBody, type, callerId, callerName, url } = body;
        targetAddress = body.targetAddress;

        if (!targetAddress) {
            return NextResponse.json({ error: "Target address required" }, { status: 400 });
        }

        const normalizedTarget = targetAddress.toLowerCase();

        // Check user notification preferences before sending
        const { data: userPrefs } = await supabase
            .from("shout_users")
            .select(
                "notify_dms, notify_groups, notify_channels, notify_calls, notification_quiet_start, notification_quiet_end"
            )
            .eq("wallet_address", normalizedTarget)
            .maybeSingle();

        if (userPrefs) {
            // Per-type suppression
            if (type === "message" && userPrefs.notify_dms === false) {
                return NextResponse.json({ success: true, suppressed: "notify_dms" });
            }
            if (type === "group_message" && userPrefs.notify_groups === false) {
                return NextResponse.json({ success: true, suppressed: "notify_groups" });
            }
            if (type === "channel_message" && userPrefs.notify_channels === false) {
                return NextResponse.json({ success: true, suppressed: "notify_channels" });
            }
            if (type === "incoming_call" && userPrefs.notify_calls === false) {
                return NextResponse.json({ success: true, suppressed: "notify_calls" });
            }

            // Quiet hours suppression (skip for calls — those are urgent)
            if (
                type !== "incoming_call" &&
                userPrefs.notification_quiet_start != null &&
                userPrefs.notification_quiet_end != null
            ) {
                const nowHour = new Date().getUTCHours();
                const start = userPrefs.notification_quiet_start;
                const end = userPrefs.notification_quiet_end;
                const inQuiet =
                    start <= end
                        ? nowHour >= start && nowHour < end
                        : nowHour >= start || nowHour < end;
                if (inQuiet) {
                    return NextResponse.json({ success: true, suppressed: "quiet_hours" });
                }
            }
        }

        let resolvedTitle = title;
        if (type === "message" && senderAddress && supabase) {
            try {
                const { data: usernameData } = await supabase
                    .from("shout_usernames")
                    .select("username")
                    .eq("wallet_address", senderAddress.toLowerCase())
                    .maybeSingle();

                if (usernameData?.username) {
                    resolvedTitle = `Message from ${usernameData.username}`;
                } else {
                    const shortAddr = `${senderAddress.slice(0, 6)}...${senderAddress.slice(-4)}`;
                    resolvedTitle = `Message from ${shortAddr}`;
                }
            } catch (err) {
                console.error("[Push API] Error looking up sender name:", err);
            }
        }

        const { data: subscription, error: dbError } = await supabase
            .from("push_subscriptions")
            .select("*")
            .eq("user_address", normalizedTarget)
            .single();

        if (dbError || !subscription) {
            console.log("[Push API] No subscription found for:", targetAddress);
            return NextResponse.json(
                { error: "User not subscribed to push notifications" },
                { status: 404 }
            );
        }

        // Build push subscription object
        const pushSubscription = {
            endpoint: subscription.endpoint,
            keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
            },
        };

        // Build notification payload
        const payload = JSON.stringify({
            title: resolvedTitle || title || "Spritz",
            body: messageBody || "You have a notification",
            type: type || "notification",
            callerId,
            callerName,
            senderAddress: senderAddress || null,
            url: url || "/",
            tag: type === "incoming_call" ? `call-${callerId}` : "reach-notification",
        });

        // Send push notification
        await webpush.sendNotification(pushSubscription, payload);

        console.log("[Push API] Notification sent to:", targetAddress);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Push API] Error sending notification:", error);

        if (error instanceof webpush.WebPushError && error.statusCode === 410) {
            if (supabase && targetAddress) {
                await supabase
                    .from("push_subscriptions")
                    .delete()
                    .eq("user_address", targetAddress.toLowerCase());
            }
            return NextResponse.json({ error: "Subscription expired" }, { status: 410 });
        }

        return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
    }
}
