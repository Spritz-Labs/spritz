"use client";

import { useState } from "react";
import { motion } from "motion/react";
import type { Poll } from "@/app/api/channels/[id]/polls/route";
import { formatDistanceToNow } from "date-fns";

type PollDisplayProps = {
    poll: Poll;
    onVote: (optionIndex: number) => Promise<void>;
    showVoters?: boolean;
    compact?: boolean;
};

export function PollDisplay({ poll, onVote, showVoters = false, compact = false }: PollDisplayProps) {
    const [isVoting, setIsVoting] = useState<number | null>(null);

    const hasVoted = poll.user_votes.length > 0;
    const isEnded = poll.is_closed || (poll.ends_at && new Date(poll.ends_at) < new Date());
    const totalVotes = poll.votes.reduce((sum, v) => sum + v.count, 0);

    const handleVote = async (optionIndex: number) => {
        if (isVoting !== null || isEnded) return;
        
        setIsVoting(optionIndex);
        try {
            await onVote(optionIndex);
        } catch (err) {
            console.error("[Poll] Error voting:", err);
        } finally {
            setIsVoting(null);
        }
    };

    const getPercentage = (count: number) => {
        if (totalVotes === 0) return 0;
        return Math.round((count / totalVotes) * 100);
    };

    return (
        <div className={`bg-zinc-800/50 border border-zinc-700/50 rounded-xl overflow-hidden ${compact ? "p-3" : "p-4"}`}>
            {/* Header */}
            <div className="flex items-start gap-3 mb-3">
                <div className={`${compact ? "w-8 h-8 text-base" : "w-10 h-10 text-xl"} rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center`}>
                    🗳️
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className={`${compact ? "text-sm" : "text-base"} font-semibold text-white leading-tight`}>
                        {poll.question}
                    </h4>
                    <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                        <span>{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</span>
                        {poll.allows_multiple && (
                            <>
                                <span>•</span>
                                <span>Multiple choice</span>
                            </>
                        )}
                        {poll.ends_at && (
                            <>
                                <span>•</span>
                                <span>
                                    {isEnded 
                                        ? "Ended" 
                                        : `Ends ${formatDistanceToNow(new Date(poll.ends_at), { addSuffix: true })}`
                                    }
                                </span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Options */}
            <div className="space-y-2">
                {poll.options.map((option, index) => {
                    const voteData = poll.votes[index];
                    const percentage = getPercentage(voteData.count);
                    const isSelected = poll.user_votes.includes(index);
                    const isVotingThis = isVoting === index;

                    return (
                        <motion.button
                            key={index}
                            onClick={() => handleVote(index)}
                            disabled={isVoting !== null || !!isEnded}
                            whileTap={!isEnded ? { scale: 0.98 } : undefined}
                            className={`w-full relative overflow-hidden rounded-lg transition-all ${
                                isEnded 
                                    ? "cursor-default" 
                                    : "cursor-pointer hover:ring-2 hover:ring-purple-500/50"
                            } ${
                                isSelected 
                                    ? "ring-2 ring-purple-500" 
                                    : ""
                            }`}
                        >
                            {/* Progress bar background */}
                            <div className="absolute inset-0 bg-zinc-700/30">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${percentage}%` }}
                                    transition={{ duration: 0.5, ease: "easeOut" }}
                                    className={`h-full ${
                                        isSelected 
                                            ? "bg-purple-500/30" 
                                            : "bg-zinc-600/30"
                                    }`}
                                />
                            </div>

                            {/* Content */}
                            <div className={`relative flex items-center justify-between ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
                                <div className="flex items-center gap-2 min-w-0">
                                    {isVotingThis ? (
                                        <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin shrink-0" />
                                    ) : isSelected ? (
                                        <svg className="w-4 h-4 text-purple-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                    ) : (
                                        <div className={`${compact ? "w-4 h-4" : "w-4 h-4"} rounded-full border-2 border-zinc-500 shrink-0`} />
                                    )}
                                    <span className={`${compact ? "text-sm" : "text-sm"} text-white truncate`}>
                                        {option}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className={`${compact ? "text-xs" : "text-sm"} font-medium ${
                                        isSelected ? "text-purple-400" : "text-zinc-400"
                                    }`}>
                                        {percentage}%
                                    </span>
                                    <span className="text-xs text-zinc-500">
                                        ({voteData.count})
                                    </span>
                                </div>
                            </div>
                        </motion.button>
                    );
                })}
            </div>

            {/* Voters (optional) */}
            {showVoters && !poll.is_anonymous && hasVoted && totalVotes > 0 && (
                <div className="mt-3 pt-3 border-t border-zinc-700/50">
                    <p className="text-xs text-zinc-500">
                        {poll.votes
                            .filter(v => v.voters.length > 0)
                            .slice(0, 3)
                            .map(v => v.voters[0]?.slice(0, 6) + "...")
                            .join(", ")}
                        {totalVotes > 3 && ` and ${totalVotes - 3} more`}
                    </p>
                </div>
            )}

            {/* Status */}
            {isEnded && (
                <div className="mt-3 pt-3 border-t border-zinc-700/50 text-center">
                    <span className="text-xs text-zinc-500 font-medium">
                        ✓ Poll has ended
                    </span>
                </div>
            )}
        </div>
    );
}
