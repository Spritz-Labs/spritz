"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import type {
    GroupCall,
    GroupCallParticipant,
} from "@/hooks/useGroupCallSignaling";
import { DeviceSelector } from "./DeviceSelector";

interface GroupCallUIProps {
    call: GroupCall;
    participants: GroupCallParticipant[];
    userAddress: string;
    isMuted: boolean;
    isVideoOff: boolean;
    isScreenSharing: boolean;
    duration: number;
    onToggleMute: () => void;
    onToggleVideo: () => void;
    onToggleScreenShare: () => void;
    onLeave: () => void;
    setLocalVideoContainer: (container: HTMLDivElement | null) => void;
    setRemoteVideoContainer: (container: HTMLDivElement | null) => void;
    setScreenShareContainer: (container: HTMLDivElement | null) => void;
    formatDuration: (seconds: number) => string;
    // Device selection callbacks (optional)
    onMicrophoneChange?: (deviceId: string) => Promise<void>;
    onSpeakerChange?: (deviceId: string) => void;
    onCameraChange?: (deviceId: string) => Promise<void>;
}

export function GroupCallUI({
    call,
    participants,
    userAddress,
    isMuted,
    isVideoOff,
    isScreenSharing,
    duration,
    onToggleMute,
    onToggleVideo,
    onToggleScreenShare,
    onLeave,
    setLocalVideoContainer,
    setRemoteVideoContainer,
    setScreenShareContainer,
    formatDuration,
    onMicrophoneChange,
    onSpeakerChange,
    onCameraChange,
}: GroupCallUIProps) {
    const localVideoRef = useRef<HTMLDivElement>(null);
    const remoteVideoRef = useRef<HTMLDivElement>(null);
    const screenShareRef = useRef<HTMLDivElement>(null);
    const [showParticipants, setShowParticipants] = useState(false);

    // Set video containers
    useEffect(() => {
        if (localVideoRef.current) {
            setLocalVideoContainer(localVideoRef.current);
        }
        if (remoteVideoRef.current) {
            setRemoteVideoContainer(remoteVideoRef.current);
        }
        if (screenShareRef.current) {
            setScreenShareContainer(screenShareRef.current);
        }

        return () => {
            setLocalVideoContainer(null);
            setRemoteVideoContainer(null);
            setScreenShareContainer(null);
        };
    }, [
        setLocalVideoContainer,
        setRemoteVideoContainer,
        setScreenShareContainer,
    ]);

    const formatAddress = (address: string) =>
        `${address.slice(0, 6)}...${address.slice(-4)}`;

    // Get grid layout based on participant count
    const getGridClass = (count: number) => {
        if (count <= 1) return "grid-cols-1";
        if (count <= 2) return "grid-cols-2";
        if (count <= 4) return "grid-cols-2 grid-rows-2";
        if (count <= 6) return "grid-cols-3 grid-rows-2";
        return "grid-cols-3 grid-rows-3";
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-zinc-950"
        >
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10 bg-gradient-to-b from-black/80 to-transparent">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FB8D22] to-[#FF5500] flex items-center justify-center">
                        <svg
                            className="w-5 h-5 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                            />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-white font-semibold">
                            {call.groupName}
                        </h2>
                        <div className="flex items-center gap-2">
                            <span className="text-zinc-400 text-sm">
                                {formatDuration(duration)}
                            </span>
                            <span className="text-zinc-600">•</span>
                            <button
                                onClick={() =>
                                    setShowParticipants(!showParticipants)
                                }
                                className="text-zinc-400 text-sm hover:text-white transition-colors"
                            >
                                {participants.length} participant
                                {participants.length !== 1 ? "s" : ""}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Call type badge */}
                <div
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                        call.isVideo
                            ? "bg-[#FB8D22]/20 text-[#FFF0E0]"
                            : "bg-emerald-500/20 text-emerald-300"
                    }`}
                >
                    {call.isVideo ? "Video Call" : "Voice Call"}
                </div>
            </div>

            {/* Video Grid / Audio Participants */}
            <div className="absolute inset-0 pt-20 pb-28">
                {call.isVideo ? (
                    <div
                        className={`h-full w-full grid ${getGridClass(
                            participants.length
                        )} gap-2 p-4`}
                    >
                        {/* Remote videos container */}
                        <div
                            ref={remoteVideoRef}
                            className="col-span-full row-span-full grid gap-2"
                            style={{
                                display: "grid",
                                gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))`,
                            }}
                        />

                        {/* Local video (picture-in-picture) */}
                        <div className="absolute bottom-32 right-4 w-32 h-44 sm:w-40 sm:h-56 rounded-2xl overflow-hidden border-2 border-zinc-800 shadow-2xl">
                            <div
                                ref={localVideoRef}
                                className="w-full h-full bg-zinc-900"
                            />
                            {isVideoOff && (
                                <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center">
                                    <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center">
                                        <span className="text-2xl">👤</span>
                                    </div>
                                </div>
                            )}
                            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 rounded-full">
                                <span className="text-white text-xs">You</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    // Voice call - show participant avatars
                    <div className="h-full flex items-center justify-center">
                        <div className="flex flex-wrap justify-center gap-6 max-w-2xl px-4">
                            {participants.map((participant, index) => {
                                const isMe =
                                    participant.userAddress.toLowerCase() ===
                                    userAddress.toLowerCase();
                                return (
                                    <motion.div
                                        key={participant.userAddress}
                                        initial={{ scale: 0, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ delay: index * 0.1 }}
                                        className="flex flex-col items-center gap-2"
                                    >
                                        <div
                                            className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center ${
                                                isMe
                                                    ? "bg-gradient-to-br from-[#FB8D22] to-[#FF5500]"
                                                    : "bg-zinc-800"
                                            }`}
                                        >
                                            <span className="text-3xl">👤</span>
                                        </div>
                                        <span className="text-white text-sm font-medium">
                                            {isMe
                                                ? "You"
                                                : formatAddress(
                                                      participant.userAddress
                                                  )}
                                        </span>
                                        {/* Speaking indicator */}
                                        <div className="flex gap-1">
                                            <div className="w-1 h-3 bg-emerald-500 rounded-full animate-pulse" />
                                            <div
                                                className="w-1 h-4 bg-emerald-500 rounded-full animate-pulse"
                                                style={{
                                                    animationDelay: "0.1s",
                                                }}
                                            />
                                            <div
                                                className="w-1 h-2 bg-emerald-500 rounded-full animate-pulse"
                                                style={{
                                                    animationDelay: "0.2s",
                                                }}
                                            />
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Participants Panel */}
            <AnimatePresence>
                {showParticipants && (
                    <motion.div
                        initial={{ opacity: 0, x: 300 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 300 }}
                        className="absolute top-20 right-0 bottom-28 w-72 bg-zinc-900/95 border-l border-zinc-800 overflow-y-auto"
                    >
                        <div className="p-4">
                            <h3 className="text-white font-semibold mb-4">
                                Participants
                            </h3>
                            <div className="space-y-2">
                                {participants.map((participant) => {
                                    const isMe =
                                        participant.userAddress.toLowerCase() ===
                                        userAddress.toLowerCase();
                                    return (
                                        <div
                                            key={participant.userAddress}
                                            className="flex items-center gap-3 p-2 rounded-lg bg-zinc-800/50"
                                        >
                                            <div
                                                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                                    isMe
                                                        ? "bg-[#FB8D22]"
                                                        : "bg-zinc-700"
                                                }`}
                                            >
                                                <span className="text-sm">
                                                    👤
                                                </span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white text-sm truncate">
                                                    {isMe
                                                        ? "You"
                                                        : formatAddress(
                                                              participant.userAddress
                                                          )}
                                                </p>
                                                <p className="text-zinc-500 text-xs">
                                                    Joined{" "}
                                                    {participant.joinedAt.toLocaleTimeString(
                                                        [],
                                                        {
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                        }
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Screen Share Preview */}
            {isScreenSharing && (
                <div className="absolute bottom-32 left-4 w-48 h-28 sm:w-56 sm:h-32 rounded-xl overflow-hidden shadow-2xl border-2 border-emerald-500 z-20">
                    <div
                        ref={screenShareRef}
                        className="w-full h-full bg-black"
                    />
                    <div className="absolute top-1 left-1 bg-emerald-500 text-white text-xs px-1.5 py-0.5 rounded">
                        Screen
                    </div>
                </div>
            )}

            {/* Controls */}
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center justify-center gap-3">
                    {/* Mute */}
                    <button
                        onClick={onToggleMute}
                        className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors ${
                            isMuted
                                ? "bg-red-500 text-white"
                                : "bg-zinc-800 text-white hover:bg-zinc-700"
                        }`}
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
                    </button>

                    {/* Video Toggle (only for video calls) */}
                    {call.isVideo && (
                        <button
                            onClick={onToggleVideo}
                            className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors ${
                                isVideoOff
                                    ? "bg-red-500 text-white"
                                    : "bg-zinc-800 text-white hover:bg-zinc-700"
                            }`}
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
                                        d="M3 3l18 18"
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
                        </button>
                    )}

                    {/* Screen Share */}
                    <button
                        onClick={onToggleScreenShare}
                        className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors ${
                            isScreenSharing
                                ? "bg-emerald-500 text-white"
                                : "bg-zinc-800 text-white hover:bg-zinc-700"
                        }`}
                        title={
                            isScreenSharing ? "Stop sharing" : "Share screen"
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
                    </button>

                    {/* Participants */}
                    <button
                        onClick={() => setShowParticipants(!showParticipants)}
                        className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors ${
                            showParticipants
                                ? "bg-[#FB8D22] text-white"
                                : "bg-zinc-800 text-white hover:bg-zinc-700"
                        }`}
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
                                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                            />
                        </svg>
                    </button>

                    {/* Device Selector */}
                    <DeviceSelector
                        onMicrophoneChange={onMicrophoneChange}
                        onSpeakerChange={onSpeakerChange}
                        onCameraChange={onCameraChange}
                        showCamera={call.isVideo}
                    />

                    {/* End Call */}
                    <button
                        onClick={onLeave}
                        className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-colors"
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
                                d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"
                            />
                        </svg>
                    </button>
                </div>
            </div>
        </motion.div>
    );
}
