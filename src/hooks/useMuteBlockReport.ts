"use client";

import { useState, useEffect, useCallback } from "react";

// Types
export type MuteDuration = "1h" | "8h" | "1d" | "1w" | "forever";

export type MutedConversation = {
    id: string;
    user_address: string;
    conversation_type: "dm" | "group" | "channel";
    conversation_id: string;
    muted_until: string | null;
    created_at: string;
};

export type BlockedUser = {
    id: string;
    blocker_address: string;
    blocked_address: string;
    reason: string | null;
    created_at: string;
};

export type ReportType =
    | "spam"
    | "harassment"
    | "hate_speech"
    | "violence"
    | "scam"
    | "impersonation"
    | "inappropriate_content"
    | "other";

export type UserReport = {
    id: string;
    reporter_address: string;
    reported_address: string;
    report_type: ReportType;
    description: string | null;
    conversation_type: string | null;
    conversation_id: string | null;
    message_id: string | null;
    message_content: string | null;
    status: "pending" | "reviewed" | "action_taken" | "dismissed";
    admin_notes: string | null;
    reviewed_at: string | null;
    reviewed_by: string | null;
    created_at: string;
};

export const MUTE_DURATIONS: { value: MuteDuration; label: string }[] = [
    { value: "1h", label: "1 hour" },
    { value: "8h", label: "8 hours" },
    { value: "1d", label: "1 day" },
    { value: "1w", label: "1 week" },
    { value: "forever", label: "Forever" },
];

export const REPORT_TYPES: { value: ReportType; label: string; emoji: string; description: string }[] = [
    { value: "spam", label: "Spam", emoji: "📧", description: "Unwanted promotional content" },
    { value: "harassment", label: "Harassment", emoji: "😠", description: "Bullying or targeted abuse" },
    { value: "hate_speech", label: "Hate Speech", emoji: "🚫", description: "Discriminatory content" },
    { value: "violence", label: "Violence", emoji: "⚠️", description: "Threats or dangerous content" },
    { value: "scam", label: "Scam/Fraud", emoji: "🎣", description: "Attempting to steal info" },
    { value: "impersonation", label: "Impersonation", emoji: "🎭", description: "Pretending to be someone" },
    { value: "inappropriate_content", label: "Inappropriate", emoji: "🔞", description: "NSFW or offensive" },
    { value: "other", label: "Other", emoji: "❓", description: "Something else" },
];

// Hook for managing muted conversations
export function useMutedConversations(userAddress: string | null) {
    const [mutedConversations, setMutedConversations] = useState<MutedConversation[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Fetch muted conversations
    const fetchMutes = useCallback(async () => {
        if (!userAddress) return;

        setIsLoading(true);
        try {
            const res = await fetch("/api/users/mute", { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                setMutedConversations(data.mutes || []);
            }
        } catch (err) {
            console.error("[Mute] Error fetching mutes:", err);
        } finally {
            setIsLoading(false);
        }
    }, [userAddress]);

    // Mute a conversation
    const muteConversation = useCallback(
        async (
            conversationType: "dm" | "group" | "channel",
            conversationId: string,
            duration: MuteDuration
        ): Promise<boolean> => {
            try {
                const res = await fetch("/api/users/mute", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ conversationType, conversationId, duration }),
                });

                if (res.ok) {
                    await fetchMutes();
                    return true;
                }
                return false;
            } catch (err) {
                console.error("[Mute] Error muting:", err);
                return false;
            }
        },
        [fetchMutes]
    );

    // Unmute a conversation
    const unmuteConversation = useCallback(
        async (conversationType: "dm" | "group" | "channel", conversationId: string): Promise<boolean> => {
            try {
                const res = await fetch(
                    `/api/users/mute?conversationType=${conversationType}&conversationId=${conversationId}`,
                    { method: "DELETE", credentials: "include" }
                );

                if (res.ok) {
                    setMutedConversations((prev) =>
                        prev.filter(
                            (m) =>
                                !(m.conversation_type === conversationType && m.conversation_id === conversationId.toLowerCase())
                        )
                    );
                    return true;
                }
                return false;
            } catch (err) {
                console.error("[Mute] Error unmuting:", err);
                return false;
            }
        },
        []
    );

    // Check if a conversation is muted
    const isMuted = useCallback(
        (conversationType: "dm" | "group" | "channel", conversationId: string): boolean => {
            const mute = mutedConversations.find(
                (m) =>
                    m.conversation_type === conversationType &&
                    m.conversation_id === conversationId.toLowerCase()
            );

            if (!mute) return false;

            // Check if mute has expired
            if (mute.muted_until) {
                return new Date(mute.muted_until) > new Date();
            }

            return true; // Forever muted
        },
        [mutedConversations]
    );

    // Get mute info for a conversation
    const getMuteInfo = useCallback(
        (conversationType: "dm" | "group" | "channel", conversationId: string): MutedConversation | null => {
            return (
                mutedConversations.find(
                    (m) =>
                        m.conversation_type === conversationType &&
                        m.conversation_id === conversationId.toLowerCase()
                ) || null
            );
        },
        [mutedConversations]
    );

    useEffect(() => {
        fetchMutes();
    }, [fetchMutes]);

    return {
        mutedConversations,
        isLoading,
        muteConversation,
        unmuteConversation,
        isMuted,
        getMuteInfo,
        refresh: fetchMutes,
    };
}

// Hook for managing blocked users
export function useBlockedUsers(userAddress: string | null) {
    const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
    const [blockedBy, setBlockedBy] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Fetch blocked users
    const fetchBlocks = useCallback(async () => {
        if (!userAddress) return;

        setIsLoading(true);
        try {
            const res = await fetch("/api/users/block", { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                setBlockedUsers(data.blockedUsers || []);
                setBlockedBy(data.blockedBy || []);
            }
        } catch (err) {
            console.error("[Block] Error fetching blocks:", err);
        } finally {
            setIsLoading(false);
        }
    }, [userAddress]);

    // Block a user
    const blockUser = useCallback(
        async (blockedAddress: string, reason?: string): Promise<boolean> => {
            try {
                const res = await fetch("/api/users/block", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ userAddress: blockedAddress, reason }),
                });

                if (res.ok) {
                    await fetchBlocks();
                    return true;
                }
                return false;
            } catch (err) {
                console.error("[Block] Error blocking:", err);
                return false;
            }
        },
        [fetchBlocks]
    );

    // Unblock a user
    const unblockUser = useCallback(
        async (blockedAddress: string): Promise<boolean> => {
            try {
                const res = await fetch(`/api/users/block?userAddress=${blockedAddress}`, {
                    method: "DELETE",
                    credentials: "include",
                });

                if (res.ok) {
                    setBlockedUsers((prev) =>
                        prev.filter((b) => b.blocked_address !== blockedAddress.toLowerCase())
                    );
                    return true;
                }
                return false;
            } catch (err) {
                console.error("[Block] Error unblocking:", err);
                return false;
            }
        },
        []
    );

    // Check if a user is blocked (by me or blocking me)
    const isBlocked = useCallback(
        (address: string): boolean => {
            const addrLower = address.toLowerCase();
            return (
                blockedUsers.some((b) => b.blocked_address === addrLower) ||
                blockedBy.includes(addrLower)
            );
        },
        [blockedUsers, blockedBy]
    );

    // Check if I blocked this user
    const isBlockedByMe = useCallback(
        (address: string): boolean => {
            return blockedUsers.some((b) => b.blocked_address === address.toLowerCase());
        },
        [blockedUsers]
    );

    // Check if this user blocked me
    const isBlockingMe = useCallback(
        (address: string): boolean => {
            return blockedBy.includes(address.toLowerCase());
        },
        [blockedBy]
    );

    useEffect(() => {
        fetchBlocks();
    }, [fetchBlocks]);

    return {
        blockedUsers,
        blockedBy,
        isLoading,
        blockUser,
        unblockUser,
        isBlocked,
        isBlockedByMe,
        isBlockingMe,
        refresh: fetchBlocks,
    };
}

// Hook for reporting users
export function useReportUser(userAddress: string | null) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [myReports, setMyReports] = useState<UserReport[]>([]);

    // Fetch my reports
    const fetchMyReports = useCallback(async () => {
        if (!userAddress) return;

        try {
            const res = await fetch("/api/users/report", { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                setMyReports(data.reports || []);
            }
        } catch (err) {
            console.error("[Report] Error fetching reports:", err);
        }
    }, [userAddress]);

    // Submit a report
    const reportUser = useCallback(
        async (params: {
            reportedAddress: string;
            reportType: ReportType;
            description?: string;
            conversationType?: "dm" | "group" | "channel";
            conversationId?: string;
            messageId?: string;
            messageContent?: string;
            alsoBlock?: boolean;
        }): Promise<{ success: boolean; error?: string }> => {
            setIsSubmitting(true);
            try {
                const res = await fetch("/api/users/report", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(params),
                });

                const data = await res.json();

                if (res.ok) {
                    await fetchMyReports();
                    return { success: true };
                }

                return { success: false, error: data.error || "Failed to submit report" };
            } catch (err) {
                console.error("[Report] Error reporting:", err);
                return { success: false, error: "Network error" };
            } finally {
                setIsSubmitting(false);
            }
        },
        [fetchMyReports]
    );

    // Check if user was recently reported
    const hasRecentReport = useCallback(
        (reportedAddress: string, reportType: ReportType): boolean => {
            const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
            return myReports.some(
                (r) =>
                    r.reported_address === reportedAddress.toLowerCase() &&
                    r.report_type === reportType &&
                    new Date(r.created_at).getTime() > oneDayAgo
            );
        },
        [myReports]
    );

    useEffect(() => {
        fetchMyReports();
    }, [fetchMyReports]);

    return {
        myReports,
        isSubmitting,
        reportUser,
        hasRecentReport,
        refresh: fetchMyReports,
    };
}

// Combined hook for convenience
export function useMuteBlockReport(userAddress: string | null) {
    const mute = useMutedConversations(userAddress);
    const block = useBlockedUsers(userAddress);
    const report = useReportUser(userAddress);

    return {
        // Mute
        mutedConversations: mute.mutedConversations,
        muteConversation: mute.muteConversation,
        unmuteConversation: mute.unmuteConversation,
        isMuted: mute.isMuted,
        getMuteInfo: mute.getMuteInfo,

        // Block
        blockedUsers: block.blockedUsers,
        blockedBy: block.blockedBy,
        blockUser: block.blockUser,
        unblockUser: block.unblockUser,
        isBlocked: block.isBlocked,
        isBlockedByMe: block.isBlockedByMe,
        isBlockingMe: block.isBlockingMe,

        // Report
        reportUser: report.reportUser,
        isSubmitting: report.isSubmitting,
        hasRecentReport: report.hasRecentReport,

        // Loading states
        isLoading: mute.isLoading || block.isLoading,

        // Refresh all
        refresh: async () => {
            await Promise.all([mute.refresh(), block.refresh(), report.refresh()]);
        },
    };
}
