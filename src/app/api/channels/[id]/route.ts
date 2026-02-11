import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMembershipLookupAddresses } from "@/lib/ensResolution";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Staff-only channels: only admins or moderators may see them
async function isStaff(allAddrs: string[]): Promise<boolean> {
    if (allAddrs.length === 0) return false;
    const [adminRes, modRes] = await Promise.all([
        supabase.from("shout_admins").select("wallet_address").in("wallet_address", allAddrs).limit(1),
        supabase.from("shout_moderators").select("user_address").in("user_address", allAddrs).limit(1),
    ]);
    return (adminRes.data?.length ?? 0) > 0 || (modRes.data?.length ?? 0) > 0;
}

// GET /api/channels/[id] - Get channel details
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const userAddress = request.nextUrl.searchParams.get("userAddress");
    const alsoParam = request.nextUrl.searchParams.get("alsoAddresses");
    const alsoAddresses = alsoParam
        ? alsoParam.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean)
        : [];

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

    // Staff-only channels: only admins/moderators may see them
    if (channel.access_level === "staff") {
        // Fallback to session so staff channel works when frontend doesn't pass userAddress
        let addr = userAddress;
        if (!addr) {
            const { getAuthenticatedUser } = await import("@/lib/session");
            const session = await getAuthenticatedUser(request);
            addr = session?.userAddress ?? null;
        }
        if (!addr) {
            return NextResponse.json({ error: "Channel not found" }, { status: 404 });
        }
        const lookupAddrs = await getMembershipLookupAddresses(addr);
        const primaryNorm = addr.trim().toLowerCase();
        const allAddrs = [...new Set([primaryNorm, ...lookupAddrs, ...alsoAddresses])];
        const staff = await isStaff(allAddrs);
        if (!staff) {
            return NextResponse.json({ error: "Channel not found" }, { status: 404 });
        }
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
