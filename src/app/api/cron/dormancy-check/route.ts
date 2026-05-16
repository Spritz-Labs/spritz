import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function verifyCronSecret(request: NextRequest): boolean {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return process.env.NODE_ENV === "development";
    return authHeader === `Bearer ${cronSecret}`;
}

const PUSH_DORMANCY_DAYS = 7;
const EMAIL_30D_DAYS = 30;
const EMAIL_60D_DAYS = 60;
const EMAIL_90D_DAYS = 90;
const MAX_PUSH_DISMISSALS = 2;
const PUSH_COOLDOWN_DAYS = 7;
const EMAIL_COOLDOWN_DAYS = 60;
const MIN_ACCOUNT_AGE_DAYS = 14;
const BATCH_SIZE = 50;

interface DormantUser {
    wallet_address: string;
    email?: string;
    username?: string;
    last_login: string;
    messages_sent: number;
    friends_count: number;
    first_login: string;
    last_reengagement_push_at: string | null;
    reengagement_push_dismissals: number;
    last_lifecycle_email_at: string | null;
    lifecycle_email_stage: string | null;
    email_updates_opt_in: boolean;
}

function daysSince(dateStr: string): number {
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

async function sendReengagementPush(user: DormantUser): Promise<boolean> {
    const { wallet_address, username, friends_count } = user;

    let title: string;
    let body: string;
    let type = "reengagement";
    let url = "https://app.spritz.chat/";

    const daysAway = daysSince(user.last_login);

    if (user.messages_sent > 0) {
        title = "Messages waiting for you";
        body = username
            ? `Hey ${username}, your conversations miss you. It's been ${daysAway} days.`
            : `You have conversations waiting. It's been ${daysAway} days.`;
        url = "https://app.spritz.chat/?source=push_7d";
    } else if (friends_count > 0) {
        title = "Your friends are on Spritz";
        body = `${friends_count} friend${friends_count > 1 ? "s" : ""} ${friends_count > 1 ? "are" : "is"} waiting to hear from you.`;
        url = "https://app.spritz.chat/?source=push_7d";
    } else {
        title = "Your daily bonus is waiting";
        body = "Claim your points before they expire. Tap to open Spritz.";
        type = "reengagement_bonus";
        url = "https://app.spritz.chat/?source=push_7d_bonus";
    }

    try {
        const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
                ? `https://${process.env.VERCEL_URL}`
                : "http://localhost:3000";

        const response = await fetch(`${baseUrl}/api/push/send`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-internal-key": process.env.INTERNAL_API_KEY || "",
            },
            body: JSON.stringify({
                targetAddress: wallet_address,
                title,
                body,
                type,
                url,
            }),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            if (response.status === 404) return false;
            console.warn("[Dormancy] Push failed for", wallet_address.slice(0, 10), errData);
            return false;
        }

        await supabase
            .from("shout_users")
            .update({ last_reengagement_push_at: new Date().toISOString() })
            .eq("wallet_address", wallet_address);

        return true;
    } catch (err) {
        console.error("[Dormancy] Push error:", err);
        return false;
    }
}

async function sendLifecycleEmail(user: DormantUser, stage: "30d" | "60d"): Promise<boolean> {
    if (!user.email || !user.email_updates_opt_in) return false;

    try {
        const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
                ? `https://${process.env.VERCEL_URL}`
                : "http://localhost:3000";

        const response = await fetch(`${baseUrl}/api/email/lifecycle`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.CRON_SECRET || ""}`,
            },
            body: JSON.stringify({
                targetAddress: user.wallet_address,
                email: user.email,
                username: user.username,
                stage,
                unreadCount: 0,
                topFriendName: null,
                daysSinceLogin: daysSince(user.last_login),
            }),
        });

        return response.ok;
    } catch (err) {
        console.error("[Dormancy] Email error:", err);
        return false;
    }
}

/**
 * GET /api/cron/dormancy-check
 *
 * Runs daily. Identifies dormant users and sends re-engagement
 * push notifications (7d) or lifecycle emails (30d/60d).
 * Auto-unsubscribes at 90d.
 */
export async function GET(request: NextRequest) {
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const stats = {
        pushSent: 0,
        pushSkipped: 0,
        emailSent: 0,
        emailSkipped: 0,
        autoUnsubscribed: 0,
        errors: 0,
    };

    try {
        const cutoff7d = new Date(
            now.getTime() - PUSH_DORMANCY_DAYS * 24 * 60 * 60 * 1000
        ).toISOString();
        const cutoff30d = new Date(
            now.getTime() - EMAIL_30D_DAYS * 24 * 60 * 60 * 1000
        ).toISOString();
        const cutoff60d = new Date(
            now.getTime() - EMAIL_60D_DAYS * 24 * 60 * 60 * 1000
        ).toISOString();
        const cutoff90d = new Date(
            now.getTime() - EMAIL_90D_DAYS * 24 * 60 * 60 * 1000
        ).toISOString();
        const minAccountAge = new Date(
            now.getTime() - MIN_ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000
        ).toISOString();

        // --- 7-Day Push Dormancy ---
        const { data: pushCandidates } = await supabase
            .from("shout_users")
            .select(
                "wallet_address, username, last_login, messages_sent, friends_count, first_login, last_reengagement_push_at, reengagement_push_dismissals"
            )
            .lt("last_login", cutoff7d)
            .lt("first_login", minAccountAge)
            .or(
                `reengagement_push_dismissals.is.null,reengagement_push_dismissals.lt.${MAX_PUSH_DISMISSALS}`
            )
            .is("is_banned", false)
            .limit(BATCH_SIZE);

        if (pushCandidates) {
            const pushCooloff = new Date(
                now.getTime() - PUSH_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
            ).toISOString();

            for (const user of pushCandidates) {
                if (
                    user.last_reengagement_push_at &&
                    user.last_reengagement_push_at > pushCooloff
                ) {
                    stats.pushSkipped++;
                    continue;
                }

                const sent = await sendReengagementPush(user as DormantUser);
                if (sent) stats.pushSent++;
                else stats.pushSkipped++;
            }
        }

        // --- 30-Day Email ---
        const { data: email30Candidates } = await supabase
            .from("shout_users")
            .select(
                "wallet_address, email, username, last_login, messages_sent, friends_count, first_login, last_lifecycle_email_at, lifecycle_email_stage, email_updates_opt_in, last_reengagement_push_at, reengagement_push_dismissals"
            )
            .lt("last_login", cutoff30d)
            .gte("last_login", cutoff60d)
            .eq("email_updates_opt_in", true)
            .not("email", "is", null)
            .or("lifecycle_email_stage.is.null,lifecycle_email_stage.neq.opted_out")
            .neq("lifecycle_email_stage", "30d")
            .neq("lifecycle_email_stage", "60d")
            .is("is_banned", false)
            .limit(BATCH_SIZE);

        if (email30Candidates) {
            const emailCooloff = new Date(
                now.getTime() - EMAIL_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
            ).toISOString();

            for (const user of email30Candidates) {
                if (user.last_lifecycle_email_at && user.last_lifecycle_email_at > emailCooloff) {
                    stats.emailSkipped++;
                    continue;
                }

                const sent = await sendLifecycleEmail(user as DormantUser, "30d");
                if (sent) stats.emailSent++;
                else stats.emailSkipped++;
            }
        }

        // --- 60-Day Email ---
        const { data: email60Candidates } = await supabase
            .from("shout_users")
            .select(
                "wallet_address, email, username, last_login, messages_sent, friends_count, first_login, last_lifecycle_email_at, lifecycle_email_stage, email_updates_opt_in, last_reengagement_push_at, reengagement_push_dismissals"
            )
            .lt("last_login", cutoff60d)
            .gte("last_login", cutoff90d)
            .eq("email_updates_opt_in", true)
            .eq("lifecycle_email_stage", "30d")
            .not("email", "is", null)
            .is("is_banned", false)
            .limit(BATCH_SIZE);

        if (email60Candidates) {
            for (const user of email60Candidates) {
                const sent = await sendLifecycleEmail(user as DormantUser, "60d");
                if (sent) stats.emailSent++;
                else stats.emailSkipped++;
            }
        }

        // --- 90-Day Auto-Unsubscribe ---
        const { data: autoUnsub } = await supabase
            .from("shout_users")
            .select("wallet_address")
            .lt("last_login", cutoff90d)
            .eq("lifecycle_email_stage", "60d")
            .eq("email_updates_opt_in", true)
            .is("is_banned", false)
            .limit(BATCH_SIZE);

        if (autoUnsub) {
            for (const user of autoUnsub) {
                await supabase
                    .from("shout_users")
                    .update({
                        email_updates_opt_in: false,
                        lifecycle_email_stage: "opted_out",
                    })
                    .eq("wallet_address", user.wallet_address);
                stats.autoUnsubscribed++;
            }
        }

        return NextResponse.json({
            success: true,
            timestamp: now.toISOString(),
            stats,
        });
    } catch (err) {
        console.error("[Dormancy Cron] Fatal error:", err);
        return NextResponse.json(
            { error: "Cron job failed", details: String(err) },
            { status: 500 }
        );
    }
}
