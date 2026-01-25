import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";
import { sanitizeInput, INPUT_LIMITS } from "@/lib/sanitize";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type PublicChannel = {
    id: string;
    name: string;
    description: string | null;
    emoji: string;
    icon_url: string | null;
    category: string;
    creator_address: string | null;
    is_official: boolean;
    member_count: number;
    message_count: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    is_member?: boolean;
    // Waku/Logos messaging support
    messaging_type: "standard" | "waku";
    waku_symmetric_key?: string | null;
    waku_content_topic?: string | null;
};

// GET /api/channels - List all public channels
export async function GET(request: NextRequest) {
    const userAddress = request.nextUrl.searchParams.get("userAddress");
    const category = request.nextUrl.searchParams.get("category");
    const joined = request.nextUrl.searchParams.get("joined") === "true";

    let query = supabase
        .from("shout_public_channels")
        .select("*")
        .eq("is_active", true)
        .order("is_official", { ascending: false })
        .order("member_count", { ascending: false });

    if (category && category !== "all") {
        query = query.eq("category", category);
    }

    const { data: channels, error } = await query;

    if (error) {
        console.error("[Channels API] Error fetching channels:", error);
        return NextResponse.json(
            { error: "Failed to fetch channels" },
            { status: 500 }
        );
    }

    // If user address provided, check which channels they've joined
    let memberChannelIds: string[] = [];
    if (userAddress) {
        const { data: memberships } = await supabase
            .from("shout_channel_members")
            .select("channel_id")
            .eq("user_address", userAddress.toLowerCase());

        memberChannelIds = memberships?.map((m) => m.channel_id) || [];
    }

    // Add is_member flag to each channel
    const channelsWithMembership = channels?.map((channel) => ({
        ...channel,
        is_member: memberChannelIds.includes(channel.id),
    })) || [];

    // If joined filter is on, only return joined channels
    if (joined) {
        return NextResponse.json({
            channels: channelsWithMembership.filter((c) => c.is_member),
        });
    }

    return NextResponse.json({ channels: channelsWithMembership });
}

// Helper to generate a random symmetric key for Waku encryption
function generateSymmetricKey(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Buffer.from(array).toString("base64");
}

// Helper to generate a Waku content topic
function generateContentTopic(channelId: string, channelName: string): string {
    const safeName = channelName.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 20);
    return `/spritz/1/channel-${safeName}-${channelId.slice(0, 8)}/proto`;
}

// POST /api/channels - Create a new channel
export async function POST(request: NextRequest) {
    // Rate limit - strict for channel creation
    const rateLimitResponse = await checkRateLimit(request, "strict");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        // Get authenticated user
        const session = await getAuthenticatedUser(request);
        
        const body = await request.json();
        const { 
            name, 
            description, 
            emoji, 
            category, 
            creatorAddress: bodyCreatorAddress,
            messagingType = "standard" // "standard" or "waku"
        } = body;
        
        // Use session address, fall back to body for backward compatibility
        const creatorAddress = session?.userAddress || bodyCreatorAddress;

        if (!name || !creatorAddress) {
            return NextResponse.json(
                { error: "Name and authentication are required" },
                { status: 400 }
            );
        }
        
        // Validate messaging type
        if (messagingType !== "standard" && messagingType !== "waku") {
            return NextResponse.json(
                { error: "Invalid messaging type. Must be 'standard' or 'waku'" },
                { status: 400 }
            );
        }
        
        // Warn if using unauthenticated fallback
        if (!session && bodyCreatorAddress) {
            console.warn("[Channels] Using unauthenticated creatorAddress - migrate to session auth");
        }

        // Sanitize inputs
        const sanitizedName = sanitizeInput(name, INPUT_LIMITS.SHORT_TEXT);
        const sanitizedDescription = description ? sanitizeInput(description, INPUT_LIMITS.MEDIUM_TEXT) : null;

        // Check if channel name already exists
        const { data: existing } = await supabase
            .from("shout_public_channels")
            .select("id")
            .eq("name", sanitizedName)
            .single();

        if (existing) {
            return NextResponse.json(
                { error: "A channel with this name already exists" },
                { status: 400 }
            );
        }

        // Prepare channel data
        const channelData: Record<string, unknown> = {
            name: sanitizedName.trim(),
            description: sanitizedDescription?.trim() || null,
            emoji: emoji || "💬",
            category: category || "community",
            creator_address: creatorAddress.toLowerCase(),
            is_official: false,
            member_count: 1,
            messaging_type: messagingType,
        };

        // For Waku channels, generate encryption key and content topic
        if (messagingType === "waku") {
            const tempId = crypto.randomUUID();
            channelData.waku_symmetric_key = generateSymmetricKey();
            channelData.waku_content_topic = generateContentTopic(tempId, sanitizedName);
        }

        const { data: channel, error } = await supabase
            .from("shout_public_channels")
            .insert(channelData)
            .select()
            .single();

        if (error) {
            console.error("[Channels API] Error creating channel:", error);
            return NextResponse.json(
                { error: "Failed to create channel" },
                { status: 500 }
            );
        }

        // Update content topic with actual channel ID for Waku channels
        if (messagingType === "waku" && channel) {
            const correctTopic = generateContentTopic(channel.id, sanitizedName);
            await supabase
                .from("shout_public_channels")
                .update({ waku_content_topic: correctTopic })
                .eq("id", channel.id);
            channel.waku_content_topic = correctTopic;
        }

        // Auto-join the creator
        await supabase.from("shout_channel_members").insert({
            channel_id: channel.id,
            user_address: creatorAddress.toLowerCase(),
        });

        return NextResponse.json({ channel });
    } catch (e) {
        console.error("[Channels API] Error:", e);
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 }
        );
    }
}

