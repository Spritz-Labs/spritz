import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type AlphaPoll = {
    id: string;
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

async function canCreateAlphaPoll(userAddress: string): Promise<boolean> {
    const { data } = await supabase
        .from("shout_alpha_membership")
        .select("user_address")
        .eq("user_address", userAddress)
        .is("left_at", null)
        .single();
    return !!data;
}

// GET /api/alpha/polls
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get("userAddress")?.toLowerCase();

    try {
        let canCreatePoll = false;
        if (userAddress) {
            canCreatePoll = await canCreateAlphaPoll(userAddress);
        }

        const { data: polls, error } = await supabase
            .from("shout_alpha_polls")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) {
            console.error("[Alpha Polls API] Error fetching polls:", error);
            return NextResponse.json(
                { error: "Failed to fetch polls" },
                { status: 500 },
            );
        }

        const pollIds = (polls || []).map((p) => p.id);
        const { data: votes } =
            pollIds.length > 0
                ? await supabase
                      .from("shout_alpha_poll_votes")
                      .select("poll_id, option_index, user_address")
                      .in("poll_id", pollIds)
                : { data: [] };

        let userVotes: Record<string, number[]> = {};
        if (userAddress && votes) {
            userVotes = (
                votes as {
                    poll_id: string;
                    option_index: number;
                    user_address: string;
                }[]
            )
                .filter((v) => v.user_address.toLowerCase() === userAddress)
                .reduce(
                    (acc, v) => {
                        if (!acc[v.poll_id]) acc[v.poll_id] = [];
                        acc[v.poll_id].push(v.option_index);
                        return acc;
                    },
                    {} as Record<string, number[]>,
                );
        }

        const pollsWithVotes: AlphaPoll[] = (polls || []).map((poll) => {
            const pollVotes =
                (
                    votes as {
                        poll_id: string;
                        option_index: number;
                        user_address: string;
                    }[]
                )?.filter((v) => v.poll_id === poll.id) || [];
            const options = (poll.options as string[]) || [];
            const voteCounts = options.map((_, index) => {
                const optionVotes = pollVotes.filter(
                    (v) => v.option_index === index,
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
                creator_address: poll.creator_address,
                question: poll.question,
                options,
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
        console.error("[Alpha Polls API] Error:", e);
        return NextResponse.json(
            { error: "Failed to fetch polls" },
            { status: 500 },
        );
    }
}

// POST /api/alpha/polls
export async function POST(request: NextRequest) {
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
                { status: 400 },
            );
        }
        if (!question?.trim()) {
            return NextResponse.json(
                { error: "Question is required" },
                { status: 400 },
            );
        }
        if (!options || !Array.isArray(options) || options.length < 2) {
            return NextResponse.json(
                { error: "At least 2 options are required" },
                { status: 400 },
            );
        }
        if (options.length > 10) {
            return NextResponse.json(
                { error: "Maximum 10 options allowed" },
                { status: 400 },
            );
        }

        const normalizedAddress = (userAddress as string).toLowerCase();

        const canCreate = await canCreateAlphaPoll(normalizedAddress);
        if (!canCreate) {
            return NextResponse.json(
                { error: "You must be a member of Alpha to create polls" },
                { status: 403 },
            );
        }

        const { data: poll, error } = await supabase
            .from("shout_alpha_polls")
            .insert({
                creator_address: normalizedAddress,
                question: (question as string).trim(),
                options: (options as string[]).map((o: string) => o.trim()),
                allows_multiple: allowsMultiple,
                ends_at: endsAt,
                is_anonymous: isAnonymous,
            })
            .select()
            .single();

        if (error) {
            console.error("[Alpha Polls API] Error creating poll:", error);
            return NextResponse.json(
                { error: "Failed to create poll" },
                { status: 500 },
            );
        }

        const pollResponse: AlphaPoll = {
            id: poll.id,
            creator_address: poll.creator_address,
            question: poll.question,
            options: poll.options as string[],
            allows_multiple: poll.allows_multiple,
            ends_at: poll.ends_at,
            is_anonymous: poll.is_anonymous,
            is_closed: poll.is_closed,
            created_at: poll.created_at,
            votes: (poll.options as string[]).map((_: string, i: number) => ({
                option_index: i,
                count: 0,
                voters: [],
            })),
            user_votes: [],
            total_votes: 0,
        };

        return NextResponse.json({ poll: pollResponse });
    } catch (e) {
        console.error("[Alpha Polls API] Error:", e);
        return NextResponse.json(
            { error: "Failed to create poll" },
            { status: 500 },
        );
    }
}
