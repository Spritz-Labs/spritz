import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type GroupPoll = {
    id: string;
    group_id: string;
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

// GET /api/groups/[id]/polls
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: groupId } = await params;
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get("userAddress")?.toLowerCase();

    try {
        const { data: polls, error } = await supabase
            .from("shout_group_polls")
            .select("*")
            .eq("group_id", groupId)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("[Group Polls API] Error fetching polls:", error);
            return NextResponse.json(
                { error: "Failed to fetch polls" },
                { status: 500 }
            );
        }

        const pollIds = (polls || []).map((p) => p.id);
        const { data: votes } =
            pollIds.length > 0
                ? await supabase
                      .from("shout_group_poll_votes")
                      .select("poll_id, option_index, user_address")
                      .in("poll_id", pollIds)
                : { data: [] };

        let userVotes: Record<string, number[]> = {};
        if (userAddress && votes) {
            userVotes = (votes as { poll_id: string; option_index: number; user_address: string }[])
                .filter((v) => v.user_address.toLowerCase() === userAddress)
                .reduce(
                    (acc, v) => {
                        if (!acc[v.poll_id]) acc[v.poll_id] = [];
                        acc[v.poll_id].push(v.option_index);
                        return acc;
                    },
                    {} as Record<string, number[]>
                );
        }

        const pollsWithVotes: GroupPoll[] = (polls || []).map((poll) => {
            const pollVotes =
                (votes as { poll_id: string; option_index: number; user_address: string }[])?.filter(
                    (v) => v.poll_id === poll.id
                ) || [];
            const options = (poll.options as string[]) || [];
            const voteCounts = options.map((_, index) => {
                const optionVotes = pollVotes.filter((v) => v.option_index === index);
                return {
                    option_index: index,
                    count: optionVotes.length,
                    voters: poll.is_anonymous ? [] : optionVotes.map((v) => v.user_address),
                };
            });
            return {
                id: poll.id,
                group_id: poll.group_id,
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

        return NextResponse.json({
            polls: pollsWithVotes,
            canCreatePoll: true,
        });
    } catch (e) {
        console.error("[Group Polls API] Error:", e);
        return NextResponse.json(
            { error: "Failed to fetch polls" },
            { status: 500 }
        );
    }
}

// POST /api/groups/[id]/polls
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: groupId } = await params;

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

        const normalizedAddress = (userAddress as string).toLowerCase();

        const { data: poll, error } = await supabase
            .from("shout_group_polls")
            .insert({
                group_id: groupId,
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
            console.error("[Group Polls API] Error creating poll:", error);
            return NextResponse.json(
                { error: "Failed to create poll" },
                { status: 500 }
            );
        }

        const pollResponse: GroupPoll = {
            id: poll.id,
            group_id: poll.group_id,
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
        console.error("[Group Polls API] Error:", e);
        return NextResponse.json(
            { error: "Failed to create poll" },
            { status: 500 }
        );
    }
}
