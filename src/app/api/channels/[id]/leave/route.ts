import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMembershipLookupAddresses } from "@/lib/ensResolution";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/channels/[id]/leave - Leave a channel
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const body = await request.json();
        const { userAddress } = body;

        if (!userAddress) {
            return NextResponse.json(
                { error: "User address is required" },
                { status: 400 }
            );
        }

        const lookupAddrs = await getMembershipLookupAddresses(userAddress);
        if (lookupAddrs.length === 0) {
            return NextResponse.json(
                { error: "Invalid address or ENS name" },
                { status: 400 }
            );
        }

        // Delete membership (row may be stored under resolved 0x or original ENS)
        const { error: leaveError } = await supabase
            .from("shout_channel_members")
            .delete()
            .eq("channel_id", id)
            .in("user_address", lookupAddrs);

        if (leaveError) {
            console.error("[Channels API] Error leaving channel:", leaveError);
            return NextResponse.json(
                { error: "Failed to leave channel" },
                { status: 500 }
            );
        }

        // member_count is updated by DB trigger on shout_channel_members DELETE

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("[Channels API] Error:", e);
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 }
        );
    }
}
