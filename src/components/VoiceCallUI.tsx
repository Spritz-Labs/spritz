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
    isScreenSharing: boolean;
    isRemoteVideoOff: boolean;
    isRemoteScreenSharing: boolean;
    duration: number;
    error: string | null;
    formatDuration: (seconds: number) => string;
    onToggleMute: () => void;
    onToggleVideo: () => void;
    onToggleScreenShare: () => void;
    onTakeScreenshot: () => Promise<boolean>;
    onEndCall: () => void;
    setLocalVideoContainer: (element: HTMLDivElement | null) => void;
    setRemoteVideoContainer: (element: HTMLDivElement | null) => void;
    setScreenShareContainer: (element: HTMLDivElement | null) => void;
    setLocalScreenShareContainer: (element: HTMLDivElement | null) => void;
};

export function VoiceCallUI({
    friend,
    callState,
    callType,
    isMuted,
    isVideoOff,
    isScreenSharing,
    isRemoteVideoOff,
    isRemoteScreenSharing,
    duration,
    error,
    formatDuration,
    onToggleMute,
    onToggleVideo,
    onToggleScreenShare,
    onTakeScreenshot,
    onEndCall,
    setLocalVideoContainer,
    setRemoteVideoContainer,
    setScreenShareContainer,
    setLocalScreenShareContainer,
}: VoiceCallUIProps) {
    if (!friend || callState === "idle") return null;

    const isVideoCall = callType === "video";

    const getDisplayName = (friend: Friend) => {
        return (
            friend.nickname ||
            (friend.reachUsername ? `@${friend.reachUsername}` : null) ||
            friend.ensName ||
            `${friend.address.slice(0, 6)}...${friend.address.slice(-4)}`
        );
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
                return error || "Connection error";
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
                        {/* onClick handler to force video playback on mobile (iOS requires user gesture) */}
                        <div
                            ref={setRemoteVideoContainer}
                            className={`absolute inset-0 bg-black ${
                                isRemoteVideoOff ? "hidden" : ""
                            }`}
                            style={{ width: "100%", height: "100%" }}
                            onClick={(e) => {
                                // Force play all video/audio elements on tap (needed for iOS)
                                const container = e.currentTarget;
                                container.querySelectorAll("video").forEach((video) => {
                                    video.play().catch(() => {});
                                });
                                container.querySelectorAll("audio").forEach((audio) => {
                                    audio.play().catch(() => {});
                                });
                                // Also try to play any audio elements in document body (remote audio)
                                document.querySelectorAll("audio").forEach((audio) => {
                                    audio.play().catch(() => {});
                                });
                            }}
                        />
                        {/* Show avatar overlay when remote video is off */}
                        {isRemoteVideoOff && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="flex flex-col items-center">
                                    {friend.avatar ? (
                                        <img
                                            src={friend.avatar}
                                            alt={getDisplayName(friend)}
                                            className="w-32 h-32 rounded-full object-cover ring-4 ring-[#FF5500]/30"
                                        />
                                    ) : (
                                        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-[#FB8D22] to-[#FF5500] flex items-center justify-center ring-4 ring-[#FF5500]/30">
                                            <span className="text-white font-bold text-5xl">
                                                {getDisplayName(
                                                    friend
                                                )[0].toUpperCase()}
                                            </span>
                                        </div>
                                    )}
                                    <p className="text-zinc-400 mt-4">
                                        Camera off
                                    </p>
                                </div>
                            </div>
                        )}
                        {/* Mobile hint - tap to play if video is stuck */}
                        {!isRemoteVideoOff && callState === "connected" && (
                            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2 pointer-events-none">
                                <p className="text-zinc-400 text-xs">Tap screen if video doesn&apos;t play</p>
                            </div>
                        )}

                        {/* Local Video (Picture-in-Picture) */}
                        <div className="absolute top-4 right-4 w-32 h-44 sm:w-40 sm:h-56 rounded-xl overflow-hidden shadow-2xl border-2 border-zinc-700">
                            {isVideoOff ? (
                                <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                                    <svg
                                        className="w-8 h-8 text-zinc-500"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                        />
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M17 17L7 7m0 10l10-10"
                                        />
                                    </svg>
                                </div>
                            ) : (
                                <div
                                    ref={setLocalVideoContainer}
                                    className="w-full h-full bg-black"
                                    onClick={(e) => {
                                        // Force play local video on tap (needed for iOS)
                                        e.currentTarget.querySelectorAll("video").forEach((video) => {
                                            video.play().catch(() => {});
                                        });
                                    }}
                                />
                            )}
                        </div>

                        {/* Name and Duration Overlay */}
                        <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2">
                            <p className="text-white font-medium">
                                {getDisplayName(friend)}
                            </p>
                            <p className="text-zinc-400 text-sm">
                                {getStatusText()}
                            </p>
                        </div>
                    </div>

                    {/* Remote Screen Share (full screen when remote is sharing) */}
                    {isRemoteScreenSharing && (
                        <div className="absolute inset-0 z-20 bg-black">
                            <div
                                ref={setScreenShareContainer}
                                className="w-full h-full"
                                onClick={(e) => {
                                    // Force play screen share on tap (needed for iOS)
                                    e.currentTarget.querySelectorAll("video").forEach((video) => {
                                        video.play().catch(() => {});
                                    });
                                }}
                            />
                            <div className="absolute top-4 left-4 bg-emerald-500 text-white text-sm px-3 py-1.5 rounded-lg shadow-lg">
                                {friend ? `${getDisplayName(friend)} is sharing screen` : 'Screen Share'}
                            </div>
                        </div>
                    )}

                    {/* Local Screen Share Preview (when you are sharing) */}
                    {isScreenSharing && (
                        <div className="absolute bottom-24 left-4 w-48 h-28 sm:w-56 sm:h-32 rounded-xl overflow-hidden shadow-2xl border-2 border-emerald-500 z-10">
                            <div
                                ref={setLocalScreenShareContainer}
                                className="w-full h-full bg-black"
                            />
                            <div className="absolute top-1 left-1 bg-emerald-500 text-white text-xs px-1.5 py-0.5 rounded">
                                Your Screen
                            </div>
                        </div>
                    )}

                    {/* Video Call Controls */}
                    <div className="bg-zinc-900/90 backdrop-blur-lg border-t border-zinc-800 px-4 py-6 safe-area-pb">
                        <div className="flex items-center justify-center gap-3">
                            {/* Toggle Video Button */}
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={onToggleVideo}
                                disabled={callState !== "connected"}
                                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors ${
                                    isVideoOff
                                        ? "bg-red-500/20 text-red-400"
                                        : "bg-zinc-800 text-white hover:bg-zinc-700"
                                } disabled:opacity-50`}
                            >
                                {isVideoOff ? (
                                    <svg
                                        className="w-5 h-5 sm:w-6 sm:h-6"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                        />
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M17 17L7 7"
                                        />
                                    </svg>
                                ) : (
                                    <svg
                                        className="w-5 h-5 sm:w-6 sm:h-6"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                        />
                                    </svg>
                                )}
                            </motion.button>

                            {/* Mute Button */}
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={onToggleMute}
                                disabled={callState !== "connected"}
                                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors ${
                                    isMuted
                                        ? "bg-red-500/20 text-red-400"
                                        : "bg-zinc-800 text-white hover:bg-zinc-700"
                                } disabled:opacity-50`}
                            >
                                {isMuted ? (
                                    <svg
                                        className="w-5 h-5 sm:w-6 sm:h-6"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                                        />
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                                        />
                                    </svg>
                                ) : (
                                    <svg
                                        className="w-5 h-5 sm:w-6 sm:h-6"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                                        />
                                    </svg>
                                )}
                            </motion.button>

                            {/* Screen Share Button */}
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={onToggleScreenShare}
                                disabled={callState !== "connected"}
                                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors ${
                                    isScreenSharing
                                        ? "bg-emerald-500/20 text-emerald-400"
                                        : "bg-zinc-800 text-white hover:bg-zinc-700"
                                } disabled:opacity-50`}
                                title={
                                    isScreenSharing
                                        ? "Stop sharing"
                                        : "Share screen"
                                }
                            >
                                <svg
                                    className="w-5 h-5 sm:w-6 sm:h-6"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                    />
                                </svg>
                            </motion.button>

                            {/* Screenshot Button */}
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={onTakeScreenshot}
                                disabled={callState !== "connected"}
                                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-zinc-800 text-white hover:bg-zinc-700 flex items-center justify-center transition-colors disabled:opacity-50"
                                title="Take screenshot"
                            >
                                <svg
                                    className="w-5 h-5 sm:w-6 sm:h-6"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                                    />
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                                    />
                                </svg>
                            </motion.button>

                            {/* End Call Button */}
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={onEndCall}
                                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-lg shadow-red-500/30"
                            >
                                <svg
                                    className="w-6 h-6 sm:w-7 sm:h-7 rotate-135"
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
                            className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-[#FB8D22]/20 blur-3xl"
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
                                    className="w-32 h-32 rounded-full object-cover ring-4 ring-[#FF5500]/30"
                                />
                            ) : (
                                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-[#FB8D22] to-[#FF5500] flex items-center justify-center ring-4 ring-[#FF5500]/30">
                                    <span className="text-white font-bold text-5xl">
                                        {getDisplayName(
                                            friend
                                        )[0].toUpperCase()}
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
                        <p className="text-zinc-400 text-lg mb-12">
                            {getStatusText()}
                        </p>

                        {/* Controls */}
                        <div className="flex items-center gap-4">
                            {/* Video Button - Enable video during audio call */}
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={onToggleVideo}
                                disabled={callState !== "connected"}
                                className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                                    isVideoOff
                                        ? "bg-zinc-800 text-white hover:bg-zinc-700"
                                        : "bg-[#FB8D22]/20 text-[#FFBBA7]"
                                } disabled:opacity-50`}
                                title="Enable video"
                            >
                                <svg
                                    className="w-6 h-6"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                    />
                                </svg>
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
                                    <svg
                                        className="w-6 h-6"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                                        />
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                                        />
                                    </svg>
                                ) : (
                                    <svg
                                        className="w-6 h-6"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                                        />
                                    </svg>
                                )}
                            </motion.button>

                            {/* Screen Share Button */}
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={onToggleScreenShare}
                                disabled={callState !== "connected"}
                                className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                                    isScreenSharing
                                        ? "bg-emerald-500/20 text-emerald-400"
                                        : "bg-zinc-800 text-white hover:bg-zinc-700"
                                } disabled:opacity-50`}
                                title={
                                    isScreenSharing
                                        ? "Stop sharing"
                                        : "Share screen"
                                }
                            >
                                <svg
                                    className="w-6 h-6"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                    />
                                </svg>
                            </motion.button>

                            {/* End Call Button */}
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={onEndCall}
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
                        </div>
                    </div>
                </>
            )}
        </motion.div>
    );
}
