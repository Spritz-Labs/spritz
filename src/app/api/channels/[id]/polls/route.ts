import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
    getMembershipLookupAddresses,
    resolveToAddress,
} from "@/lib/ensResolution";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type Poll = {
    id: string;
    channel_id: string;
    creator_address: string;
    question: string;
    options: string[];
    allows_multiple: boolean;
    ends_at: string | null;
    is_anonymous: boolean;
    is_closed: boolean;
    created_at: string;
    votes: { option_index: number; count: number; voters: string[] }[];
    user_votes: number[];
    total_votes: number;
};

// Helper to check if user can create polls (admin, moderator, or channel owner)
async function canCreatePollCheck(
    userAddress: string,
    channelId: string
): Promise<boolean> {
    // Check if global admin
    const { data: admin } = await supabase
        .from("shout_admins")
        .select("id")
        .eq("wallet_address", userAddress)
        .single();

    if (admin) return true;

    // Check if channel owner
    const { data: channel } = await supabase
        .from("shout_public_channels")
        .select("creator_address")
        .eq("id", channelId)
        .single();

    if (channel?.creator_address?.toLowerCase() === userAddress) return true;

    // Check if moderator for this channel
    const { data: moderator } = await supabase
        .from("shout_moderators")
        .select("id")
        .eq("user_address", userAddress)
        .eq("channel_id", channelId)
        .single();

    if (moderator) return true;

    // Check if global moderator (channel_id is NULL)
    const { data: globalMod } = await supabase
        .from("shout_moderators")
        .select("id")
        .eq("user_address", userAddress)
        .is("channel_id", null)
        .single();

    return !!globalMod;
}

// GET /api/channels/[id]/polls - Get all polls for a channel
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get("userAddress")?.toLowerCase();

    try {
        // Check if user can create polls
        let canCreatePoll = false;
        if (userAddress) {
            canCreatePoll = await canCreatePollCheck(userAddress, id);
        }

        // Fetch polls
        const { data: polls, error } = await supabase
            .from("shout_channel_polls")
            .select("*")
            .eq("channel_id", id)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("[Polls API] Error fetching polls:", error);
            return NextResponse.json(
                { error: "Failed to fetch polls" },
                { status: 500 }
            );
        }

        // Fetch vote counts for all polls
        const pollIds = polls.map((p) => p.id);
        const { data: votes } = await supabase
            .from("shout_channel_poll_votes")
            .select("poll_id, option_index, user_address")
            .in("poll_id", pollIds);

        // Get user's votes if logged in
        let userVotes: Record<string, number[]> = {};
        if (userAddress && votes) {
            userVotes = votes
                .filter((v) => v.user_address.toLowerCase() === userAddress)
                .reduce((acc, v) => {
                    if (!acc[v.poll_id]) acc[v.poll_id] = [];
                    acc[v.poll_id].push(v.option_index);
                    return acc;
                }, {} as Record<string, number[]>);
        }

        // Build poll response with vote counts
        const pollsWithVotes: Poll[] = polls.map((poll) => {
            const pollVotes = votes?.filter((v) => v.poll_id === poll.id) || [];
            const options = poll.options as string[];

            const voteCounts = options.map((_, index) => {
                const optionVotes = pollVotes.filter(
                    (v) => v.option_index === index
                );
                return {
                    option_index: index,
                    count: optionVotes.length,
                    voters: poll.is_anonymous
                        ? []
                        : optionVotes.map((v) => v.user_address),
                };
            });

            return {
                id: poll.id,
                channel_id: poll.channel_id,
                creator_address: poll.creator_address,
                question: poll.question,
                options: options,
                allows_multiple: poll.allows_multiple,
                ends_at: poll.ends_at,
                is_anonymous: poll.is_anonymous,
                is_closed: poll.is_closed,
                created_at: poll.created_at,
                votes: voteCounts,
                user_votes: userVotes[poll.id] || [],
                total_votes: pollVotes.length,
            };
        });

        return NextResponse.json({ polls: pollsWithVotes, canCreatePoll });
    } catch (e) {
        console.error("[Polls API] Error:", e);
        return NextResponse.json(
            { error: "Failed to fetch polls" },
            { status: 500 }
        );
    }
}

// POST /api/channels/[id]/polls - Create a new poll
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const body = await request.json();
        const {
            userAddress,
            question,
            options,
            allowsMultiple = false,
            endsAt = null,
            isAnonymous = false,
        } = body;

        if (!userAddress) {
            return NextResponse.json(
                { error: "User address is required" },
                { status: 400 }
            );
        }

        if (!question?.trim()) {
            return NextResponse.json(
                { error: "Question is required" },
                { status: 400 }
            );
        }

        if (!options || !Array.isArray(options) || options.length < 2) {
            return NextResponse.json(
                { error: "At least 2 options are required" },
                { status: 400 }
            );
        }

        if (options.length > 10) {
            return NextResponse.json(
                { error: "Maximum 10 options allowed" },
                { status: 400 }
            );
        }

        const normalizedAddress =
            (await resolveToAddress(userAddress)) ?? userAddress.toLowerCase();

        // Check if user can create polls (admin, moderator, or channel owner)
        const canCreate = await canCreatePollCheck(normalizedAddress, id);
        if (!canCreate) {
            return NextResponse.json(
                {
                    error: "Only admins, moderators, and channel owners can create polls",
                },
                { status: 403 }
            );
        }

        // Verify user is a member of the channel (resolve ENS so we find rows stored by 0x)
        const lookupAddrs = await getMembershipLookupAddresses(userAddress);
        const { data: membership } =
            lookupAddrs.length > 0
                ? await supabase
                      .from("shout_channel_members")
                      .select("id")
                      .eq("channel_id", id)
                      .in("user_address", lookupAddrs)
                      .maybeSingle()
                : { data: null };

        if (!membership) {
            return NextResponse.json(
                {
                    error: "You must be a member of this channel to create polls",
                },
                { status: 403 }
            );
        }

        // Create the poll
        const { data: poll, error } = await supabase
            .from("shout_channel_polls")
            .insert({
                channel_id: id,
                creator_address: normalizedAddress,
                question: question.trim(),
                options: options.map((o: string) => o.trim()),
                allows_multiple: allowsMultiple,
                ends_at: endsAt,
                is_anonymous: isAnonymous,
            })
            .select()
            .single();

        if (error) {
            console.error("[Polls API] Error creating poll:", error);
            return NextResponse.json(
                { error: "Failed to create poll" },
                { status: 500 }
            );
        }

        // Return poll with empty votes
        const pollResponse: Poll = {
            id: poll.id,
            channel_id: poll.channel_id,
            creator_address: poll.creator_address,
            question: poll.question,
            options: poll.options,
            allows_multiple: poll.allows_multiple,
            ends_at: poll.ends_at,
            is_anonymous: poll.is_anonymous,
            is_closed: poll.is_closed,
            created_at: poll.created_at,
            votes: poll.options.map((_: string, i: number) => ({
                option_index: i,
                count: 0,
                voters: [],
            })),
            user_votes: [],
            total_votes: 0,
        };

        return NextResponse.json({ poll: pollResponse });
    } catch (e) {
        console.error("[Polls API] Error:", e);
        return NextResponse.json(
            { error: "Failed to create poll" },
            { status: 500 }
        );
    }
}
