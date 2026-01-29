import { useState, useCallback } from "react";
import type { Poll } from "@/app/api/channels/[id]/polls/route";

export function usePolls(channelId: string | null, userAddress: string | null) {
    const [polls, setPolls] = useState<Poll[]>([]);
    const [canCreatePoll, setCanCreatePoll] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchPolls = useCallback(async () => {
        if (!channelId) return;

        setIsLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams();
            if (userAddress) params.append("userAddress", userAddress);

            const res = await fetch(`/api/channels/${channelId}/polls?${params}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to fetch polls");
            }

            setPolls(data.polls);
            setCanCreatePoll(data.canCreatePoll || false);
        } catch (err) {
            console.error("[usePolls] Error fetching polls:", err);
            setError(err instanceof Error ? err.message : "Failed to fetch polls");
        } finally {
            setIsLoading(false);
        }
    }, [channelId, userAddress]);

    const createPoll = useCallback(async (
        question: string,
        options: string[],
        allowsMultiple = false,
        endsAt: string | null = null,
        isAnonymous = false
    ) => {
        if (!channelId || !userAddress) {
            throw new Error("Channel ID and user address are required");
        }

        const res = await fetch(`/api/channels/${channelId}/polls`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userAddress,
                question,
                options,
                allowsMultiple,
                endsAt,
                isAnonymous,
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || "Failed to create poll");
        }

        setPolls(prev => [data.poll, ...prev]);
        return data.poll;
    }, [channelId, userAddress]);

    const vote = useCallback(async (pollId: string, optionIndex: number) => {
        if (!channelId || !userAddress) {
            throw new Error("Channel ID and user address are required");
        }

        const res = await fetch(`/api/channels/${channelId}/polls/${pollId}/vote`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userAddress,
                optionIndex,
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || "Failed to vote");
        }

        // Update the poll in state
        setPolls(prev => prev.map(poll => {
            if (poll.id !== pollId) return poll;

            const newUserVotes = [...poll.user_votes];
            const newVotes = [...poll.votes];
            let newTotalVotes = poll.total_votes;

            if (data.action === "added") {
                // Add vote
                if (!poll.allows_multiple) {
                    // Remove previous vote if single choice
                    if (newUserVotes.length > 0) {
                        const prevOption = newUserVotes[0];
                        newVotes[prevOption] = {
                            ...newVotes[prevOption],
                            count: Math.max(0, newVotes[prevOption].count - 1),
                            voters: newVotes[prevOption].voters.filter(v => v.toLowerCase() !== userAddress.toLowerCase()),
                        };
                        newTotalVotes--;
                    }
                    newUserVotes.length = 0;
                }
                newUserVotes.push(optionIndex);
                newVotes[optionIndex] = {
                    ...newVotes[optionIndex],
                    count: newVotes[optionIndex].count + 1,
                    voters: [...newVotes[optionIndex].voters, userAddress],
                };
                newTotalVotes++;
            } else {
                // Remove vote
                const voteIdx = newUserVotes.indexOf(optionIndex);
                if (voteIdx !== -1) {
                    newUserVotes.splice(voteIdx, 1);
                }
                newVotes[optionIndex] = {
                    ...newVotes[optionIndex],
                    count: Math.max(0, newVotes[optionIndex].count - 1),
                    voters: newVotes[optionIndex].voters.filter(v => v.toLowerCase() !== userAddress.toLowerCase()),
                };
                newTotalVotes = Math.max(0, newTotalVotes - 1);
            }

            return {
                ...poll,
                user_votes: newUserVotes,
                votes: newVotes,
                total_votes: newTotalVotes,
            };
        }));

        return data;
    }, [channelId, userAddress]);

    return {
        polls,
        canCreatePoll,
        isLoading,
        error,
        fetchPolls,
        createPoll,
        vote,
    };
}
