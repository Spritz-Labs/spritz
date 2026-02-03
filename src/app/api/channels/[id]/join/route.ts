import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const POAP_API_BASE = "https://api.poap.tech";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function addressHoldsPoap(
    address: string,
    eventId: number,
    apiKey: string
): Promise<boolean> {
    const url = `${POAP_API_BASE}/actions/scan/${encodeURIComponent(address)}/${eventId}`;
    const res = await fetch(url, {
        headers: { "X-API-Key": apiKey },
        next: { revalidate: 60 },
    });
    if (!res.ok) return false;
    const data = await res.json();
    const list = Array.isArray(data) ? data : data?.tokens ?? data?.poaps ?? [];
    return list.length > 0;
}

// POST /api/channels/[id]/join - Join a channel (POAP channels require holding the POAP)
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

        const normalizedAddress = userAddress.toLowerCase();

        // Check if channel exists and if it's a POAP channel
        const { data: channel } = await supabase
            .from("shout_public_channels")
            .select("id, name, poap_event_id")
            .eq("id", id)
            .single();

        if (!channel) {
            return NextResponse.json(
                { error: "Channel not found" },
                { status: 404 }
            );
        }

        const poapEventId =
            channel.poap_event_id != null &&
            typeof channel.poap_event_id === "number" &&
            !Number.isNaN(channel.poap_event_id)
                ? channel.poap_event_id
                : null;

        if (poapEventId !== null) {
            const apiKey = process.env.POAP_API_KEY;
            if (!apiKey) {
                return NextResponse.json(
                    {
                        error:
                            "POAP verification is not configured. You need this POAP to join this channel.",
                    },
                    { status: 403 }
                );
            }

            const addressesToCheck: string[] = [normalizedAddress];
            const { data: userRow } = await supabase
                .from("shout_users")
                .select("smart_wallet_address")
                .eq("wallet_address", normalizedAddress)
                .maybeSingle();
            if (
                userRow?.smart_wallet_address &&
                userRow.smart_wallet_address.toLowerCase() !== normalizedAddress
            ) {
                addressesToCheck.push(
                    userRow.smart_wallet_address.toLowerCase()
                );
            }

            let hasPoap = false;
            for (const addr of addressesToCheck) {
                const holds = await addressHoldsPoap(addr, poapEventId, apiKey);
                if (holds) {
                    hasPoap = true;
                    break;
                }
            }

            if (!hasPoap) {
                return NextResponse.json(
                    {
                        error:
                            "You need this POAP to join this channel. Hold the POAP in your wallet to join.",
                    },
                    { status: 403 }
                );
            }
        }

        // Check if already a member
        const { data: existing } = await supabase
            .from("shout_channel_members")
            .select("id")
            .eq("channel_id", id)
            .eq("user_address", normalizedAddress)
            .single();

        if (existing) {
            return NextResponse.json(
                { error: "Already a member of this channel" },
                { status: 400 }
            );
        }

        // Join the channel
        const { error: joinError } = await supabase
            .from("shout_channel_members")
            .insert({
                channel_id: id,
                user_address: normalizedAddress,
            });

        if (joinError) {
            console.error("[Channels API] Error joining channel:", joinError);
            return NextResponse.json(
                { error: "Failed to join channel" },
                { status: 500 }
            );
        }

        // Increment member count
        await supabase.rpc("increment_channel_members", { channel_uuid: id });

        return NextResponse.json({ success: true, channelName: channel.name });
    } catch (e) {
        console.error("[Channels API] Error:", e);
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 }
        );
    }
}

