import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

interface LifecyclePayload {
    targetAddress: string;
    email: string;
    username?: string;
    stage: "30d" | "60d";
    unreadCount?: number;
    topFriendName?: string;
    daysSinceLogin?: number;
}

function buildSubjectLine(
    payload: LifecyclePayload,
    variant: "A" | "B" | "C"
): { subject: string; preview: string } {
    const { unreadCount, topFriendName, username } = payload;
    const name = username || "there";

    if (variant === "A" && unreadCount && unreadCount > 0) {
        return {
            subject: `You have ${unreadCount} unread message${unreadCount > 1 ? "s" : ""} on Spritz`,
            preview: topFriendName
                ? `From ${topFriendName} and others — tap to catch up`
                : "Your conversations are waiting for you",
        };
    }
    if (variant === "B" && topFriendName) {
        return {
            subject: `${topFriendName} sent you something`,
            preview: "Open Spritz to see what they said",
        };
    }
    return {
        subject: `Hey ${name}, Spritz misses you`,
        preview: "Your conversations are waiting. Come say hi.",
    };
}

function pickVariant(address: string): "A" | "B" | "C" {
    const hash = address.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const variants = ["A", "B", "C"] as const;
    return variants[hash % 3];
}

function buildEmailHtml(
    payload: LifecyclePayload,
    variant: "A" | "B" | "C",
    stage: "30d" | "60d"
): string {
    const { username, unreadCount, topFriendName, targetAddress } = payload;
    const greeting = username ? `Hey ${username}` : "Hey there";
    const deepLink = `https://app.spritz.chat/?source=email_${stage}`;

    const unsubscribeLink = `https://app.spritz.chat/api/email/lifecycle/unsubscribe?address=${encodeURIComponent(targetAddress)}`;

    let hook: string;
    if (variant === "A" && unreadCount && unreadCount > 0) {
        hook = `You have <strong>${unreadCount} unread message${unreadCount > 1 ? "s" : ""}</strong> waiting for you on Spritz.`;
    } else if (variant === "B" && topFriendName) {
        hook = `<strong>${topFriendName}</strong> has been active on Spritz recently. Say hi!`;
    } else {
        hook = "Your friends on Spritz are waiting to hear from you.";
    }

    const stageNote =
        stage === "60d"
            ? `<p style="color: #888; font-size: 13px; margin-top: 24px;">This is our last email — we won't message you again unless you come back and re-enable updates in Settings.</p>`
            : "";

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 480px; margin: 0 auto; padding: 40px 20px;">
    <div style="text-align: center; margin-bottom: 32px;">
      <span style="font-size: 28px; font-weight: bold; color: #FF5500;">Spritz</span>
    </div>
    <div style="background: #1a1a1a; border-radius: 16px; padding: 32px 24px; border: 1px solid #333;">
      <p style="color: #fff; font-size: 18px; font-weight: 600; margin: 0 0 12px;">${greeting},</p>
      <p style="color: #ccc; font-size: 15px; line-height: 1.5; margin: 0 0 24px;">${hook}</p>
      ${
          unreadCount && unreadCount > 0
              ? `<div style="background: #222; border-radius: 12px; padding: 16px; margin-bottom: 24px; text-align: center;">
            <span style="font-size: 32px; font-weight: bold; color: #FF5500;">${unreadCount}</span>
            <p style="color: #888; font-size: 13px; margin: 4px 0 0;">unread message${unreadCount > 1 ? "s" : ""}</p>
          </div>`
              : ""
      }
      <div style="text-align: center;">
        <a href="${deepLink}" style="display: inline-block; background: #FF5500; color: #fff; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 12px; text-decoration: none;">Open Spritz</a>
      </div>
      ${stageNote}
    </div>
    <div style="text-align: center; margin-top: 24px;">
      <a href="${unsubscribeLink}" style="color: #666; font-size: 12px; text-decoration: underline;">Unsubscribe from these emails</a>
    </div>
  </div>
</body>
</html>`;
}

export async function POST(request: NextRequest) {
    try {
        const cronSecret = process.env.CRON_SECRET;
        const authHeader = request.headers.get("authorization");
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (!supabase || !resend) {
            return NextResponse.json({ error: "Email service not configured" }, { status: 500 });
        }

        const payload: LifecyclePayload = await request.json();
        const { targetAddress, email, stage } = payload;

        if (!targetAddress || !email || !stage) {
            return NextResponse.json(
                { error: "targetAddress, email, and stage are required" },
                { status: 400 }
            );
        }

        const variant = pickVariant(targetAddress);
        const { subject, preview } = buildSubjectLine(payload, variant);
        const html = buildEmailHtml(payload, variant, stage);

        const { error: emailError } = await resend.emails.send({
            from: "Kevin from Spritz <kevin@spritz.chat>",
            to: email,
            subject,
            html,
            headers: {
                "X-Entity-Ref-ID": `lifecycle-${stage}-${targetAddress}`,
                "List-Unsubscribe": `<https://app.spritz.chat/api/email/lifecycle/unsubscribe?address=${encodeURIComponent(targetAddress)}>`,
            },
            tags: [
                { name: "category", value: "lifecycle" },
                { name: "stage", value: stage },
                { name: "variant", value: variant },
            ],
        });

        if (emailError) {
            console.error("[Lifecycle Email] Send error:", emailError);
            return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
        }

        await supabase
            .from("shout_users")
            .update({
                last_lifecycle_email_at: new Date().toISOString(),
                lifecycle_email_stage: stage,
            })
            .eq("wallet_address", targetAddress.toLowerCase());

        return NextResponse.json({
            success: true,
            variant,
            stage,
            preview,
        });
    } catch (err) {
        console.error("[Lifecycle Email] Error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
