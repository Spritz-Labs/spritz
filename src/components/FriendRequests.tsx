"use client";

import { motion, AnimatePresence } from "motion/react";
import { type FriendRequest } from "@/hooks/useFriendRequests";

type FriendRequestsProps = {
    incomingRequests: FriendRequest[];
    outgoingRequests: FriendRequest[];
    onAccept: (requestId: string) => Promise<boolean>;
    onReject: (requestId: string) => Promise<boolean>;
    onCancel: (requestId: string) => Promise<boolean>;
    isLoading: boolean;
};

export function FriendRequests({
    incomingRequests,
    outgoingRequests,
    onAccept,
    onReject,
    onCancel,
    isLoading,
}: FriendRequestsProps) {
    const formatAddress = (address: string) => {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return "Just now";
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    };

    if (incomingRequests.length === 0 && outgoingRequests.length === 0) {
        return (
            <div className="text-center py-8">
                <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-7 h-7 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                </div>
                <p className="text-zinc-400 font-medium">No pending requests</p>
                <p className="text-zinc-500 text-sm mt-1">Friend requests will appear here</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Incoming Requests */}
            {incomingRequests.length > 0 && (
                <div>
                    <h3 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                        Incoming Requests ({incomingRequests.length})
                    </h3>

                    <AnimatePresence>
                        {incomingRequests.map((request, index) => (
                            <motion.div
                                key={request.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ delay: index * 0.05 }}
                                className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 mb-2"
                            >
                                <div className="flex items-center gap-4">
                                    {/* Avatar */}
                                    {request.fromAvatar ? (
                                        <img
                                            src={request.fromAvatar}
                                            alt="Avatar"
                                            className="w-10 h-10 rounded-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                                            <span className="text-white font-bold">
                                                {(request.fromEnsName ||
                                                    request.from_address)[0].toUpperCase()}
                                            </span>
                                        </div>
                                    )}

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-medium truncate">
                                            {request.fromUsername
                                                ? `@${request.fromUsername}`
                                                : request.fromEnsName ||
                                                  formatAddress(
                                                      request.from_address
                                                  )}
                                        </p>
                                        {/* Show ENS/address below username if both exist */}
                                        {request.fromUsername && (request.fromEnsName || request.from_address) && (
                                            <p className="text-zinc-500 text-xs truncate">
                                                {request.fromEnsName || formatAddress(request.from_address)}
                                            </p>
                                        )}
                                        {request.memo && (
                                            <p className="text-zinc-400 text-xs mt-0.5 italic truncate">
                                                &ldquo;{request.memo}&rdquo;
                                            </p>
                                        )}
                                        <p className="text-zinc-500 text-xs mt-0.5">
                                            {formatTime(request.created_at)}
                                        </p>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => onReject(request.id)}
                                            disabled={isLoading}
                                            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors disabled:opacity-50"
                                        >
                                            Decline
                                        </button>
                                        <button
                                            onClick={() => onAccept(request.id)}
                                            disabled={isLoading}
                                            className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
                                        >
                                            Accept
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            {/* Outgoing Requests */}
            {outgoingRequests.length > 0 && (
                <div>
                    <h3 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-[#FF5500]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        Sent Requests ({outgoingRequests.length})
                    </h3>

                    <AnimatePresence>
                        {outgoingRequests.map((request, index) => (
                            <motion.div
                                key={request.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ delay: index * 0.05 }}
                                className="bg-[#FF5500]/5 border border-[#FF5500]/20 rounded-xl p-4 mb-2"
                            >
                                <div className="flex items-center gap-4">
                                    {/* Avatar */}
                                    {request.toAvatar ? (
                                        <img
                                            src={request.toAvatar}
                                            alt="Avatar"
                                            className="w-10 h-10 rounded-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FB8D22] to-[#FF5500] flex items-center justify-center">
                                            <span className="text-white font-bold">
                                                {(request.toEnsName || request.to_address)[0].toUpperCase()}
                                            </span>
                                        </div>
                                    )}

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-medium truncate">
                                            {request.toUsername
                                                ? `@${request.toUsername}`
                                                : request.toEnsName || formatAddress(request.to_address)}
                                        </p>
                                        {request.toUsername && (request.toEnsName || request.to_address) && (
                                            <p className="text-zinc-500 text-xs truncate">
                                                {request.toEnsName || formatAddress(request.to_address)}
                                            </p>
                                        )}
                                        {request.memo && (
                                            <p className="text-zinc-400 text-xs mt-0.5 italic truncate">
                                                &ldquo;{request.memo}&rdquo;
                                            </p>
                                        )}
                                        <p className="text-[#FF5500]/70 text-xs flex items-center gap-1.5 mt-0.5">
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF5500] opacity-75" />
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF5500]" />
                                            </span>
                                            Awaiting response •{" "}
                                            {formatTime(request.created_at)}
                                        </p>
                                    </div>

                                    {/* Cancel Button */}
                                    <button
                                        onClick={() => onCancel(request.id)}
                                        disabled={isLoading}
                                        className="px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-red-500/20 hover:text-red-400 text-zinc-400 text-sm font-medium transition-colors disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}



