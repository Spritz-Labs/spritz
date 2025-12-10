"use client";

import { motion, AnimatePresence } from "motion/react";
import { type FriendRequest } from "@/hooks/useFriendRequests";

type FriendRequestsProps = {
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  onAccept: (requestId: string) => Promise<boolean>;
  onReject: (requestId: string) => Promise<boolean>;
  isLoading: boolean;
};

export function FriendRequests({
  incomingRequests,
  outgoingRequests,
  onAccept,
  onReject,
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
    return null;
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
                        {(request.fromEnsName || request.from_address)[0].toUpperCase()}
                      </span>
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">
                      {request.fromEnsName || formatAddress(request.from_address)}
                    </p>
                    <p className="text-zinc-500 text-sm">
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
          <h3 className="text-sm font-medium text-zinc-400 mb-3">
            Pending Requests ({outgoingRequests.length})
          </h3>

          <AnimatePresence>
            {outgoingRequests.map((request, index) => (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: index * 0.05 }}
                className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4 mb-2"
              >
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                    <span className="text-white font-bold">
                      {request.to_address[2].toUpperCase()}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">
                      {formatAddress(request.to_address)}
                    </p>
                    <p className="text-zinc-500 text-sm flex items-center gap-1">
                      <svg
                        className="w-3 h-3 animate-pulse"
                        fill="currentColor"
                        viewBox="0 0 8 8"
                      >
                        <circle cx="4" cy="4" r="3" />
                      </svg>
                      Waiting for response
                    </p>
                  </div>

                  {/* Time */}
                  <span className="text-zinc-500 text-sm">
                    {formatTime(request.created_at)}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}





