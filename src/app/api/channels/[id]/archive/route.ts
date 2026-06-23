import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser, getValidatedApiKey } from "@/lib/session";
import { getCallerRole, apiKeyOwnsChannel } from "@/lib/channelRoles";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/channels/[id]/archive - Archive a channel (owner or API key)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id: channelId } = await params;

    try {
        const session = await getAuthenticatedUser(request);
        const apiKey = !session ? await getValidatedApiKey(request) : null;

        if (!session?.userAddress && !apiKey) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        // API key auth: can archive channels it created
        if (apiKey && !session) {
            const hasPermission = await apiKeyOwnsChannel(channelId, apiKey);
            if (!hasPermission) {
                return NextResponse.json(
                    { error: "API key does not have permission on this channel" },
                    { status: 403 }
                );
            }
        } else {
            const callerRole = await getCallerRole(channelId, session!.userAddress);
            if (callerRole !== "owner") {
                return NextResponse.json(
                    { error: "Only the channel owner can archive a channel" },
                    { status: 403 }
                );
            }
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
