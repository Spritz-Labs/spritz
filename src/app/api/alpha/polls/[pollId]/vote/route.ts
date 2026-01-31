import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ pollId: string }> },
) {
    const { pollId } = await params;

    try {
        const body = await request.json();
        const { userAddress, optionIndex } = body;

        if (!userAddress) {
            return NextResponse.json(
                { error: "User address is required" },
                { status: 400 },
            );
        }
        if (optionIndex === undefined || optionIndex === null) {
            return NextResponse.json(
                { error: "Option index is required" },
                { status: 400 },
            );
        }

        const normalizedAddress = (userAddress as string).toLowerCase();

        const { data: membership } = await supabase
            .from("shout_alpha_membership")
            .select("user_address")
            .eq("user_address", normalizedAddress)
            .is("left_at", null)
            .single();

        if (!membership) {
            return NextResponse.json(
                { error: "You must be a member of Alpha to vote" },
                { status: 403 },
            );
        }

        const { data: poll, error: pollError } = await supabase
            .from("shout_alpha_polls")
            .select("*")
            .eq("id", pollId)
            .single();

        if (pollError || !poll) {
            return NextResponse.json(
                { error: "Poll not found" },
                { status: 404 },
            );
        }
        if (poll.is_closed) {
            return NextResponse.json(
                { error: "This poll is closed" },
                { status: 400 },
            );
        }
        if (poll.ends_at && new Date(poll.ends_at) < new Date()) {
            return NextResponse.json(
                { error: "This poll has ended" },
                { status: 400 },
            );
        }

        const options = (poll.options as string[]) || [];
        if (optionIndex < 0 || optionIndex >= options.length) {
            return NextResponse.json(
                { error: "Invalid option index" },
                { status: 400 },
            );
        }

        const { data: existingVotes } = await supabase
            .from("shout_alpha_poll_votes")
            .select("id, option_index")
            .eq("poll_id", pollId)
            .eq("user_address", normalizedAddress);

        if (
            !poll.allows_multiple &&
            existingVotes &&
            existingVotes.length > 0
        ) {
            if (existingVotes.some((v) => v.option_index === optionIndex)) {
                const { error: deleteError } = await supabase
                    .from("shout_alpha_poll_votes")
                    .delete()
                    .eq("poll_id", pollId)
                    .eq("user_address", normalizedAddress)
                    .eq("option_index", optionIndex);
                if (deleteError) {
                    return NextResponse.json(
                        { error: "Failed to remove vote" },
                        { status: 500 },
                    );
                }
                return NextResponse.json({ success: true, action: "removed" });
            }
            await supabase
                .from("shout_alpha_poll_votes")
                .delete()
                .eq("poll_id", pollId)
                .eq("user_address", normalizedAddress);
        }

        if (
            poll.allows_multiple &&
            existingVotes?.some((v) => v.option_index === optionIndex)
        ) {
            const { error: deleteError } = await supabase
                .from("shout_alpha_poll_votes")
                .delete()
                .eq("poll_id", pollId)
                .eq("user_address", normalizedAddress)
                .eq("option_index", optionIndex);
            if (deleteError) {
                return NextResponse.json(
                    { error: "Failed to remove vote" },
                    { status: 500 },
                );
            }
            return NextResponse.json({ success: true, action: "removed" });
        }

        const { error: voteError } = await supabase
            .from("shout_alpha_poll_votes")
            .insert({
                poll_id: pollId,
                user_address: normalizedAddress,
                option_index: optionIndex,
            });

        if (voteError) {
            console.error("[Alpha Polls API] Error voting:", voteError);
            return NextResponse.json(
                { error: "Failed to vote" },
                { status: 500 },
            );
        }

        return NextResponse.json({ success: true, action: "added" });
    } catch (e) {
        console.error("[Alpha Polls API] Error:", e);
        return NextResponse.json({ error: "Failed to vote" }, { status: 500 });
    }
}
