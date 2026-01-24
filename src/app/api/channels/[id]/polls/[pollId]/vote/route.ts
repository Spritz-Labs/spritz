import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/channels/[id]/polls/[pollId]/vote - Vote on a poll
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; pollId: string }> }
) {
    const { id, pollId } = await params;

    try {
        const body = await request.json();
        const { userAddress, optionIndex } = body;

        if (!userAddress) {
            return NextResponse.json(
                { error: "User address is required" },
                { status: 400 }
            );
        }

        if (optionIndex === undefined || optionIndex === null) {
            return NextResponse.json(
                { error: "Option index is required" },
                { status: 400 }
            );
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Verify user is a member of the channel
        const { data: membership } = await supabase
            .from("shout_channel_members")
            .select("id")
            .eq("channel_id", id)
            .eq("user_address", normalizedAddress)
            .single();

        if (!membership) {
            return NextResponse.json(
                { error: "You must be a member of this channel to vote" },
                { status: 403 }
            );
        }

        // Get the poll
        const { data: poll, error: pollError } = await supabase
            .from("shout_channel_polls")
            .select("*")
            .eq("id", pollId)
            .eq("channel_id", id)
            .single();

        if (pollError || !poll) {
            return NextResponse.json(
                { error: "Poll not found" },
                { status: 404 }
            );
        }

        // Check if poll is closed
        if (poll.is_closed) {
            return NextResponse.json(
                { error: "This poll is closed" },
                { status: 400 }
            );
        }

        // Check if poll has ended
        if (poll.ends_at && new Date(poll.ends_at) < new Date()) {
            return NextResponse.json(
                { error: "This poll has ended" },
                { status: 400 }
            );
        }

        // Check if option index is valid
        const options = poll.options as string[];
        if (optionIndex < 0 || optionIndex >= options.length) {
            return NextResponse.json(
                { error: "Invalid option index" },
                { status: 400 }
            );
        }

        // Check if user already voted (for single-choice polls)
        const { data: existingVotes } = await supabase
            .from("shout_channel_poll_votes")
            .select("id, option_index")
            .eq("poll_id", pollId)
            .eq("user_address", normalizedAddress);

        if (!poll.allows_multiple && existingVotes && existingVotes.length > 0) {
            // If single choice and already voted for same option, remove the vote (toggle)
            if (existingVotes.some(v => v.option_index === optionIndex)) {
                const { error: deleteError } = await supabase
                    .from("shout_channel_poll_votes")
                    .delete()
                    .eq("poll_id", pollId)
                    .eq("user_address", normalizedAddress)
                    .eq("option_index", optionIndex);

                if (deleteError) {
                    console.error("[Polls API] Error removing vote:", deleteError);
                    return NextResponse.json(
                        { error: "Failed to remove vote" },
                        { status: 500 }
                    );
                }

                return NextResponse.json({ success: true, action: "removed" });
            }

            // If single choice and voted for different option, change the vote
            const { error: deleteError } = await supabase
                .from("shout_channel_poll_votes")
                .delete()
                .eq("poll_id", pollId)
                .eq("user_address", normalizedAddress);

            if (deleteError) {
                console.error("[Polls API] Error removing previous vote:", deleteError);
            }
        }

        // For multiple choice, check if already voted for this specific option (toggle)
        if (poll.allows_multiple && existingVotes?.some(v => v.option_index === optionIndex)) {
            const { error: deleteError } = await supabase
                .from("shout_channel_poll_votes")
                .delete()
                .eq("poll_id", pollId)
                .eq("user_address", normalizedAddress)
                .eq("option_index", optionIndex);

            if (deleteError) {
                console.error("[Polls API] Error removing vote:", deleteError);
                return NextResponse.json(
                    { error: "Failed to remove vote" },
                    { status: 500 }
                );
            }

            return NextResponse.json({ success: true, action: "removed" });
        }

        // Add the vote
        const { error: voteError } = await supabase
            .from("shout_channel_poll_votes")
            .insert({
                poll_id: pollId,
                user_address: normalizedAddress,
                option_index: optionIndex,
            });

        if (voteError) {
            console.error("[Polls API] Error voting:", voteError);
            return NextResponse.json(
                { error: "Failed to vote" },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, action: "added" });
    } catch (e) {
        console.error("[Polls API] Error:", e);
        return NextResponse.json(
            { error: "Failed to vote" },
            { status: 500 }
        );
    }
}
