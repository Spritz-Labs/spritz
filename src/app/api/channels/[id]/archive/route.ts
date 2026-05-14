import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { getCallerRole, roleRank, type ChannelRole } from "@/lib/channelRoles";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// POST /api/channels/[id]/archive - Archive a channel (owner only)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: channelId } = await params;

    try {
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const callerRole = await getCallerRole(channelId, session.userAddress);
        if (callerRole !== "owner") {
            return NextResponse.json(
                { error: "Only the channel owner can archive a channel" },
                { status: 403 },
            );
        }

        const { error } = await supabase
            .from("shout_public_channels")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("id", channelId);

        if (error) {
            console.error("[Channels] Archive failed:", error);
            return NextResponse.json({ error: "Failed to archive channel" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("[Channels] Archive error:", e);
        return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
    }
}
