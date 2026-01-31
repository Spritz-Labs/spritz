import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyMessage } from "viem";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

async function verifyAdmin(
    request: NextRequest,
): Promise<{ isAdmin: boolean; address: string | null }> {
    const address = request.headers.get("x-admin-address");
    const signature = request.headers.get("x-admin-signature");
    const encodedMessage = request.headers.get("x-admin-message");

    if (!address || !signature || !encodedMessage || !supabase) {
        return { isAdmin: false, address: null };
    }

    try {
        const message = decodeURIComponent(atob(encodedMessage));
        const isValidSignature = await verifyMessage({
            address: address as `0x${string}`,
            message,
            signature: signature as `0x${string}`,
        });
        if (!isValidSignature) return { isAdmin: false, address: null };

        const { data: admin } = await supabase
            .from("shout_admins")
            .select("*")
            .eq("wallet_address", address.toLowerCase())
            .single();

        return { isAdmin: !!admin, address: address.toLowerCase() };
    } catch {
        return { isAdmin: false, address: null };
    }
}

/**
 * PATCH /api/admin/agent-chats/[id]/feedback
 * Body: { feedback_type: "up" | "down" | null }
 * Sets feedback_type, feedback_at, feedback_by for the chat row (assistant rows only make sense; we allow any row).
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
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

    const { id } = await params;
    if (!id) {
        return NextResponse.json({ error: "Missing chat id" }, { status: 400 });
    }

    let body: { feedback_type?: "up" | "down" | null };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 },
        );
    }

    const feedback_type =
        body.feedback_type === "up" || body.feedback_type === "down"
            ? body.feedback_type
            : body.feedback_type === null
              ? null
              : undefined;
    if (feedback_type === undefined) {
        return NextResponse.json(
            { error: "feedback_type must be 'up', 'down', or null" },
            { status: 400 },
        );
    }

    try {
        const { data, error } = await supabase
            .from("shout_agent_chats")
            .update({
                feedback_type: feedback_type ?? null,
                feedback_at: feedback_type ? new Date().toISOString() : null,
                feedback_by: feedback_type ? address : null,
            })
            .eq("id", id)
            .select("id, feedback_type, feedback_at, feedback_by")
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (err) {
        console.error("[Admin agent-chats feedback]", err);
        return NextResponse.json(
            { error: "Failed to update feedback" },
            { status: 500 },
        );
    }
}
