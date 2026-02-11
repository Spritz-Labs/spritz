import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMembershipLookupAddresses } from "@/lib/ensResolution";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/channels/[id] - Get channel details
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const userAddress = request.nextUrl.searchParams.get("userAddress");

    // Support both UUID and slug lookups
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    let channel = null;
    let fetchError = null;

    if (isUuid) {
        const { data, error: err } = await supabase
            .from("shout_public_channels")
            .select("*")
            .eq("id", id)
            .eq("is_active", true)
            .single();
        channel = data;
        fetchError = err;
    } else {
        const { data, error: err } = await supabase
            .from("shout_public_channels")
            .select("*")
            .eq("slug", id.toLowerCase())
            .eq("is_active", true)
            .single();
        channel = data;
        fetchError = err;
    }

    if (fetchError || !channel) {
        return NextResponse.json(
            { error: "Channel not found" },
            { status: 404 }
        );
    }

    // Check if user is a member (resolve ENS so we find rows stored by 0x)
    let is_member = false;
    if (userAddress) {
        const lookupAddrs = await getMembershipLookupAddresses(userAddress);
        if (lookupAddrs.length > 0) {
            const { data: membership } = await supabase
                .from("shout_channel_members")
                .select("id")
                .eq("channel_id", channel.id)
                .in("user_address", lookupAddrs)
                .maybeSingle();
            is_member = !!membership;
        }
    }

    return NextResponse.json({ channel: { ...channel, is_member } });
}
