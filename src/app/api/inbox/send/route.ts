import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";
import { snsForwardResolve } from "@/lib/snsResolveServer";
import { resolveToAddress } from "@/lib/ensResolution";
import { isSolanaAddress } from "@/utils/address";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const MAX_CONTENT_LENGTH = 2000;
const DEFAULT_EXPIRY_DAYS = 90;
const MAX_EXPIRY_DAYS = 365;

/**
 * Resolve a recipient identifier (alice.sol, vitalik.eth, 0x..., base58)
 * to a wallet address. Returns null if resolution fails.
 */
async function resolveRecipient(
    identifier: string
): Promise<{ address: string | null; kind: string }> {
    const trimmed = identifier.trim();

    if (trimmed.toLowerCase().endsWith(".sol")) {
        try {
            const result = await snsForwardResolve(trimmed);
            return { address: result?.address ?? null, kind: "sns" };
        } catch {
            return { address: null, kind: "sns" };
        }
    }

    if (trimmed.includes(".")) {
        const resolved = await resolveToAddress(trimmed);
        return { address: resolved, kind: "ens" };
    }

    if (isSolanaAddress(trimmed) || trimmed.startsWith("0x")) {
        return { address: trimmed, kind: "address" };
    }

    return { address: null, kind: "unknown" };
}

/**
 * POST /api/inbox/send — Send a deferred message to any name/address.
 * The recipient does not need to be a Spritz user yet.
 */
export async function POST(request: NextRequest) {
    const rateLimitResponse = await checkRateLimit(request, "strict");
    if (rateLimitResponse) return rateLimitResponse;

    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 }
        );
    }

    try {
        const body = await request.json();
        const { to, content, messageType, metadata, expiresInDays } = body;

        if (!to || typeof to !== "string" || !to.trim()) {
            return NextResponse.json(
                { error: "Recipient (to) is required" },
                { status: 400 }
            );
        }

        if (!content || typeof content !== "string" || !content.trim()) {
            return NextResponse.json(
                { error: "Message content is required" },
                { status: 400 }
            );
        }

        if (content.length > MAX_CONTENT_LENGTH) {
            return NextResponse.json(
                {
                    error: `Content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters`,
                },
                { status: 400 }
            );
        }

        const recipientIdentifier = to.trim();
        const { address: recipientAddress } =
            await resolveRecipient(recipientIdentifier);

        if (
            recipientAddress &&
            recipientAddress.toLowerCase() === session.userAddress.toLowerCase()
        ) {
            return NextResponse.json(
                { error: "Cannot send inbox message to yourself" },
                { status: 400 }
            );
        }

        // Resolve sender display name for recipient context
        let senderDisplayName: string | null = null;
        const { data: senderUser } = await supabase
            .from("shout_users")
            .select("display_name, username, ens_name")
            .eq("wallet_address", session.userAddress.toLowerCase())
            .maybeSingle();

        if (senderUser) {
            senderDisplayName =
                senderUser.display_name ||
                senderUser.username ||
                senderUser.ens_name ||
                null;
        }

        const expDays = Math.min(
            Math.max(expiresInDays ?? DEFAULT_EXPIRY_DAYS, 1),
            MAX_EXPIRY_DAYS
        );
        const expiresAt = new Date(
            Date.now() + expDays * 24 * 60 * 60 * 1000
        ).toISOString();

        const { data: message, error: insertError } = await supabase
            .from("shout_inbox")
            .insert({
                sender_address: session.userAddress.toLowerCase(),
                recipient_identifier: recipientIdentifier.toLowerCase(),
                recipient_address: recipientAddress?.toLowerCase() ?? null,
                content: content.trim(),
                message_type: messageType || "text",
                metadata: metadata || null,
                sender_display_name: senderDisplayName,
                expires_at: expiresAt,
            })
            .select()
            .single();

        if (insertError) {
            console.error("[Inbox] Insert error:", insertError);
            return NextResponse.json(
                { error: "Failed to send inbox message" },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, message });
    } catch (error) {
        console.error("[Inbox] Send error:", error);
        return NextResponse.json(
            { error: "Failed to send inbox message" },
            { status: 500 }
        );
    }
}
