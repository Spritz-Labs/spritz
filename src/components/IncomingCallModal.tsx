"use client";

import { motion, AnimatePresence } from "motion/react";

type IncomingCallModalProps = {
  callerAddress: string;
  callerName?: string | null;
  callerAvatar?: string | null;
  callType?: "audio" | "video";
  onAccept: () => void;
  onReject: () => void;
};

export function IncomingCallModal({
  callerAddress,
  callerName,
  callerAvatar,
  callType = "audio",
  onAccept,
  onReject,
}: IncomingCallModalProps) {
  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const displayName = callerName || formatAddress(callerAddress);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center"
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-sm w-full mx-4"
        >
          {/* Pulsing Ring */}
          <div className="relative flex items-center justify-center mb-6">
            <motion.div
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.3, 0.1, 0.3],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute w-32 h-32 rounded-full bg-emerald-500/30"
            />
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 0.2, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.3,
              }}
              className="absolute w-28 h-28 rounded-full bg-emerald-500/40"
            />
            
            {/* Avatar */}
            {callerAvatar ? (
              <img
                src={callerAvatar}
                alt={displayName}
                className="w-24 h-24 rounded-full object-cover relative z-10"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center relative z-10">
                <span className="text-white font-bold text-4xl">
                  {displayName[0].toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* Caller Info */}
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-white mb-1">
              {displayName}
            </h2>
            <p className="text-emerald-400 text-sm flex items-center justify-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Incoming {callType === "video" ? "video" : "voice"} call
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-center gap-8">
            {/* Reject */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onReject}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-lg shadow-red-500/30"
            >
              <svg
                className="w-7 h-7 rotate-135"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
            </motion.button>

            {/* Accept */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onAccept}
              className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-colors shadow-lg shadow-emerald-500/30"
            >
              <svg
                className="w-7 h-7"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
