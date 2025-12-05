"use client";

import { motion } from "motion/react";
import { type Friend } from "@/components/FriendsList";
import { type CallState, type CallType } from "@/hooks/useVoiceCall";

type VoiceCallUIProps = {
  friend: Friend | null;
  callState: CallState;
  callType: CallType;
  isMuted: boolean;
  isVideoOff: boolean;
  isRemoteVideoOff: boolean;
  duration: number;
  formatDuration: (seconds: number) => string;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onEndCall: () => void;
  setLocalVideoContainer: (element: HTMLDivElement | null) => void;
  setRemoteVideoContainer: (element: HTMLDivElement | null) => void;
};

export function VoiceCallUI({
  friend,
  callState,
  callType,
  isMuted,
  isVideoOff,
  isRemoteVideoOff,
  duration,
  formatDuration,
  onToggleMute,
  onToggleVideo,
  onEndCall,
  setLocalVideoContainer,
  setRemoteVideoContainer,
}: VoiceCallUIProps) {
  if (!friend || callState === "idle") return null;

  const isVideoCall = callType === "video";

  const getDisplayName = (friend: Friend) => {
    return friend.nickname || (friend.shoutUsername ? `@${friend.shoutUsername}` : null) || friend.ensName || `${friend.address.slice(0, 6)}...${friend.address.slice(-4)}`;
  };

  const getStatusText = () => {
    switch (callState) {
      case "joining":
        return "Connecting...";
      case "connected":
        return formatDuration(duration);
      case "leaving":
        return "Ending call...";
      case "error":
        return "Connection error";
      default:
        return "";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 100 }}
      className="fixed inset-0 z-50 bg-gradient-to-b from-zinc-900 to-black flex flex-col"
    >
      {/* Video Call Layout */}
      {isVideoCall ? (
        <>
          {/* Remote Video (Full Screen) */}
          <div className="flex-1 relative bg-zinc-900">
            {/* Always render video container so ref is available */}
            <div
              ref={setRemoteVideoContainer}
              className={`absolute inset-0 bg-black ${isRemoteVideoOff ? 'hidden' : ''}`}
              style={{ width: '100%', height: '100%' }}
            />
            {/* Show avatar overlay when remote video is off */}
            {isRemoteVideoOff && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center">
                  {friend.avatar ? (
                    <img
                      src={friend.avatar}
                      alt={getDisplayName(friend)}
                      className="w-32 h-32 rounded-full object-cover ring-4 ring-violet-500/30"
                    />
                  ) : (
                    <div className="w-32 h-32 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center ring-4 ring-violet-500/30">
                      <span className="text-white font-bold text-5xl">
                        {getDisplayName(friend)[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                  <p className="text-zinc-400 mt-4">Camera off</p>
                </div>
              </div>
            )}
            
            {/* Local Video (Picture-in-Picture) */}
            <div className="absolute top-4 right-4 w-32 h-44 sm:w-40 sm:h-56 rounded-xl overflow-hidden shadow-2xl border-2 border-zinc-700">
              {isVideoOff ? (
                <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                  <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17L7 7m0 10l10-10" />
                  </svg>
                </div>
              ) : (
                <div
                  ref={setLocalVideoContainer}
                  className="w-full h-full bg-black"
                />
              )}
            </div>
            
            {/* Name and Duration Overlay */}
            <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2">
              <p className="text-white font-medium">{getDisplayName(friend)}</p>
              <p className="text-zinc-400 text-sm">{getStatusText()}</p>
            </div>
          </div>

          {/* Video Call Controls */}
          <div className="bg-zinc-900/90 backdrop-blur-lg border-t border-zinc-800 px-4 py-6 safe-area-pb">
            <div className="flex items-center justify-center gap-4">
              {/* Toggle Video Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onToggleVideo}
                disabled={callState !== "connected"}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                  isVideoOff
                    ? "bg-red-500/20 text-red-400"
                    : "bg-zinc-800 text-white hover:bg-zinc-700"
                } disabled:opacity-50`}
              >
                {isVideoOff ? (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17L7 7" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </motion.button>

              {/* Mute Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onToggleMute}
                disabled={callState !== "connected"}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                  isMuted
                    ? "bg-red-500/20 text-red-400"
                    : "bg-zinc-800 text-white hover:bg-zinc-700"
                } disabled:opacity-50`}
              >
                {isMuted ? (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                )}
              </motion.button>

              {/* End Call Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onEndCall}
                className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-lg shadow-red-500/30"
              >
                <svg className="w-7 h-7 rotate-135" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </motion.button>

              {/* Flip Camera Button (placeholder for future) */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                disabled={isVideoOff || callState !== "connected"}
                className="w-14 h-14 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center transition-colors disabled:opacity-50"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </motion.button>
            </div>
          </div>
        </>
      ) : (
        /* Audio-only Call Layout (Original) */
        <>
          {/* Background Effects */}
          <div className="absolute inset-0 overflow-hidden">
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.5, 0.3],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-violet-500/20 blur-3xl"
            />
          </div>

          {/* Content */}
          <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
            {/* Avatar */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="relative mb-8"
            >
              {friend.avatar ? (
                <img
                  src={friend.avatar}
                  alt={getDisplayName(friend)}
                  className="w-32 h-32 rounded-full object-cover ring-4 ring-violet-500/30"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center ring-4 ring-violet-500/30">
                  <span className="text-white font-bold text-5xl">
                    {getDisplayName(friend)[0].toUpperCase()}
                  </span>
                </div>
              )}

              {/* Audio Indicator */}
              {callState === "connected" && (
                <motion.div
                  animate={{
                    scale: [1, 1.3, 1],
                    opacity: [1, 0.5, 1],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1"
                >
                  <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animation-delay-100" />
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animation-delay-200" />
                </motion.div>
              )}
            </motion.div>

            {/* Name */}
            <h2 className="text-2xl font-bold text-white mb-2">
              {getDisplayName(friend)}
            </h2>

            {/* Status */}
            <p className="text-zinc-400 text-lg mb-12">{getStatusText()}</p>

            {/* Controls */}
            <div className="flex items-center gap-6">
              {/* Video Button - Enable video during audio call */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onToggleVideo}
                disabled={callState !== "connected"}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
                  isVideoOff
                    ? "bg-zinc-800 text-white hover:bg-zinc-700"
                    : "bg-violet-500/20 text-violet-400"
                } disabled:opacity-50`}
              >
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </motion.button>

              {/* Mute Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onToggleMute}
                disabled={callState !== "connected"}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
                  isMuted
                    ? "bg-red-500/20 text-red-400"
                    : "bg-zinc-800 text-white hover:bg-zinc-700"
                } disabled:opacity-50`}
              >
                {isMuted ? (
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                ) : (
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                )}
              </motion.button>

              {/* End Call Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onEndCall}
                className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-lg shadow-red-500/30"
              >
                <svg className="w-8 h-8 rotate-135" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </motion.button>

              {/* Speaker Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-16 h-16 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center transition-colors"
              >
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              </motion.button>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
