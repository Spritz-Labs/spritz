"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { getDisplayName, formatAddress } from "@/utils/address";

export type ChatMember = {
    user_address: string;
    joined_at: string;
    username?: string;
    avatar?: string;
    ens_name?: string;
    isAgent?: boolean;
    agentName?: string;
    agentEmoji?: string;
    agentAvatar?: string;
};

type ChatMembersListProps = {
    channelId: string;
    /** When set, fetch from location-chats members API instead of channels (for location chats) */
    locationChatId?: string;
    isGlobal?: boolean;
    isOpen: boolean;
    onClose: () => void;
    onUserClick?: (address: string) => void;
    getUserInfo?: (address: string) => { name?: string | null; avatar?: string | null } | null;
    currentUserAddress?: string;
};

export function ChatMembersList({
    channelId,
    locationChatId,
    isGlobal = false,
    isOpen,
    onClose,
    onUserClick,
    getUserInfo,
    currentUserAddress,
}: ChatMembersListProps) {
    const [members, setMembers] = useState<ChatMember[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const membersEndpoint = locationChatId
        ? `/api/location-chats/${locationChatId}/members`
        : `/api/channels/${channelId}/members`;

    const fetchMembers = useCallback(async (offset = 0) => {
        setIsLoading(true);
        try {
            const res = await fetch(
                `${membersEndpoint}?limit=100&offset=${offset}`
            );
            if (res.ok) {
                const data = await res.json();
                if (offset === 0) {
                    setMembers(data.members || []);
                } else {
                    setMembers(prev => [...prev, ...(data.members || [])]);
                }
                setTotal(data.total || 0);
                setHasMore(data.hasMore || false);
            } else {
                const errorData = await res.json().catch(() => ({}));
                console.error("[MembersList] Error fetching members:", errorData.error || res.statusText);
            }
        } catch (err) {
            console.error("[MembersList] Error fetching members:", err);
        } finally {
            setIsLoading(false);
        }
    }, [membersEndpoint]);

    useEffect(() => {
        if (isOpen) {
            fetchMembers(0);
        }
    }, [isOpen, fetchMembers]);

    const loadMore = () => {
        if (!isLoading && hasMore) {
            fetchMembers(members.length);
        }
    };

    const getMemberDisplayName = (member: ChatMember) => {
        // Check if we have more info from getUserInfo (which may have resolved ENS)
        const info = getUserInfo?.(member.user_address);
        
        if (member.isAgent) {
            return member.agentName || "AI Agent";
        }
        
        // If getUserInfo returned a name, use it (already prioritized correctly)
        if (info?.name) return info.name;
        
        // Otherwise use our utility with priority: ENS > username > address
        return getDisplayName({
            address: member.user_address,
            ensName: member.ens_name,
            username: member.username,
        });
    };

    const getMemberAvatar = (member: ChatMember) => {
        const info = getUserInfo?.(member.user_address);
        if (member.isAgent) return member.agentAvatar || null;
        return info?.avatar || member.avatar || null;
    };

    const isCurrentUser = (addr: string) => 
        currentUserAddress?.toLowerCase() === addr.toLowerCase();

    // Filter members by search
    const filteredMembers = searchQuery.trim()
        ? members.filter(m => {
            const name = getMemberDisplayName(m).toLowerCase();
            const addr = m.user_address.toLowerCase();
            const query = searchQuery.toLowerCase();
            return name.includes(query) || addr.includes(query);
        })
        : members;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 z-[100]"
                        onClick={onClose}
                    />

                    {/* Side Panel */}
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-zinc-900 border-l border-zinc-800 z-[101] flex flex-col"
                        style={{ paddingTop: 'env(safe-area-inset-top)' }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                            <div>
                                <h3 className="font-semibold text-white">
                                    {isGlobal ? "Active Users" : "Members"}
                                </h3>
                                <p className="text-xs text-zinc-500">
                                    {total} {isGlobal ? "active" : "total"}
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Search */}
                        <div className="p-3 border-b border-zinc-800">
                            <div className="relative">
                                <svg
                                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search members..."
                                    className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
                                />
                            </div>
                        </div>

                        {/* Members List */}
                        <div className="flex-1 overflow-y-auto">
                            {isLoading && members.length === 0 ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : filteredMembers.length === 0 ? (
                                <div className="text-center py-12 px-4">
                                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-zinc-800 flex items-center justify-center">
                                        <svg className="w-6 h-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                        </svg>
                                    </div>
                                    <p className="text-zinc-400 text-sm">
                                        {searchQuery ? "No members found" : "No members yet"}
                                    </p>
                                </div>
                            ) : (
                                <div className="p-2 space-y-1">
                                    {filteredMembers.map((member) => {
                                        const avatar = getMemberAvatar(member);
                                        const displayName = getMemberDisplayName(member);
                                        const isMe = isCurrentUser(member.user_address);

                                        return (
                                            <button
                                                key={member.user_address}
                                                onClick={() => !isMe && onUserClick?.(member.user_address)}
                                                disabled={isMe}
                                                className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors ${
                                                    isMe
                                                        ? "bg-orange-500/10 cursor-default"
                                                        : "hover:bg-zinc-800 cursor-pointer"
                                                }`}
                                            >
                                                {/* Avatar */}
                                                {avatar ? (
                                                    <img
                                                        src={avatar}
                                                        alt=""
                                                        className={`w-10 h-10 rounded-full object-cover ${
                                                            member.isAgent ? "ring-2 ring-purple-500/50" : ""
                                                        }`}
                                                    />
                                                ) : member.isAgent ? (
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-lg">
                                                        {member.agentEmoji || "🤖"}
                                                    </div>
                                                ) : (
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-bold text-sm">
                                                        {displayName.slice(0, 2).toUpperCase()}
                                                    </div>
                                                )}

                                                {/* Info */}
                                                <div className="flex-1 min-w-0 text-left">
                                                    <p className={`font-medium truncate ${
                                                        isMe ? "text-orange-400" : "text-white"
                                                    }`}>
                                                        {displayName}
                                                        {isMe && <span className="text-xs ml-1 text-orange-400/70">(You)</span>}
                                                    </p>
                                                    {!member.isAgent && (
                                                        <p className="text-xs text-zinc-500 truncate font-mono">
                                                            {formatAddress(member.user_address)}
                                                        </p>
                                                    )}
                                                    {member.isAgent && (
                                                        <p className="text-xs text-purple-400">AI Agent</p>
                                                    )}
                                                </div>

                                                {/* Badge */}
                                                {member.isAgent && (
                                                    <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] rounded-full">
                                                        🤖 Agent
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}

                                    {/* Load More */}
                                    {hasMore && !searchQuery && (
                                        <button
                                            onClick={loadMore}
                                            disabled={isLoading}
                                            className="w-full py-2.5 text-sm text-zinc-400 hover:text-white transition-colors"
                                        >
                                            {isLoading ? (
                                                <div className="flex items-center justify-center gap-2">
                                                    <div className="w-4 h-4 border-2 border-zinc-600 border-t-orange-500 rounded-full animate-spin" />
                                                    Loading...
                                                </div>
                                            ) : (
                                                `Load more (${total - members.length} remaining)`
                                            )}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-3 border-t border-zinc-800 bg-zinc-900/80 backdrop-blur-sm">
                            <p className="text-xs text-zinc-500 text-center">
                                {isGlobal 
                                    ? "Showing users who have been active in Global Chat"
                                    : "Channel members can post messages and participate in discussions"
                                }
                            </p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
