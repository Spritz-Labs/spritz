"use client";

import { useState, useEffect, use, useRef, useCallback } from "react";
import { motion } from "motion/react";
import Link from "next/link";
import { huddle01ProjectId, isHuddle01Configured } from "@/config/huddle01";

type RoomInfo = {
    id: string;
    roomId: string;
    joinCode: string;
    title: string;
    maxParticipants: number;
    participantCount: number;
    expiresAt: string;
    createdAt: string;
    host: {
        address: string;
        displayName: string;
        avatar: string | null;
    };
};

// Dynamic imports for Huddle01
let HuddleClient: typeof import("@huddle01/web-core").HuddleClient | null = null;

async function loadHuddle01SDK(): Promise<void> {
    if (HuddleClient) return;
    const module = await import("@huddle01/web-core");
    HuddleClient = module.HuddleClient;
}

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
    const { code } = use(params);
    const [room, setRoom] = useState<RoomInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [displayName, setDisplayName] = useState("");
    const [joiningRoom, setJoiningRoom] = useState(false);
    const [inCall, setInCall] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientRef = useRef<any>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLDivElement>(null);
    const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        fetchRoom();
    }, [code]);

    const fetchRoom = async () => {
        try {
            const res = await fetch(`/api/rooms/${code}`);
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Room not found");
                return;
            }

            setRoom(data.room);
        } catch {
            setError("Failed to load room");
        } finally {
            setLoading(false);
        }
    };

    const handleJoin = async () => {
        if (!displayName.trim() || !room) return;

        setJoiningRoom(true);
        try {
            // Get token
            const tokenRes = await fetch(`/api/rooms/${code}/token`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ displayName: displayName.trim() }),
            });

            const tokenData = await tokenRes.json();
            if (!tokenRes.ok) {
                setError(tokenData.error || "Failed to join room");
                setJoiningRoom(false);
                return;
            }

            // Load Huddle01 SDK
            await loadHuddle01SDK();
            if (!HuddleClient) {
                setError("Failed to load video SDK");
                setJoiningRoom(false);
                return;
            }

            // Create client and join
            const client = new HuddleClient({
                projectId: huddle01ProjectId,
            });
            clientRef.current = client;

            // Set up event listeners before joining
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const localPeerEvents = client.localPeer as any;
            
            localPeerEvents.on("stream-playable", (data: { label?: string; producer?: { track?: MediaStreamTrack } }) => {
                console.log("[Room] Local stream playable:", data);
                if (data.label === "video" && data.producer?.track && localVideoRef.current) {
                    const stream = new MediaStream([data.producer.track]);
                    localVideoRef.current.srcObject = stream;
                    localVideoRef.current.play().catch(e => console.warn("[Room] Video play failed:", e));
                }
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (client.room as any).on("peer-joined", (peer: unknown) => {
                console.log("[Room] Peer joined:", peer);
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (client.room as any).on("peer-left", (peer: unknown) => {
                console.log("[Room] Peer left:", peer);
            });

            await client.joinRoom({
                roomId: room.roomId,
                token: tokenData.token,
            });

            // Enable media after joining
            await client.localPeer.enableAudio();
            await client.localPeer.enableVideo();

            // Start duration timer
            durationIntervalRef.current = setInterval(() => {
                setCallDuration(d => d + 1);
            }, 1000);

            setInCall(true);
            setJoiningRoom(false);
        } catch (err) {
            console.error("[Room] Join error:", err);
            setError("Failed to join room");
            setJoiningRoom(false);
        }
    };

    const handleLeave = useCallback(async () => {
        if (durationIntervalRef.current) {
            clearInterval(durationIntervalRef.current);
        }

        if (clientRef.current) {
            try {
                await clientRef.current.leaveRoom();
            } catch (err) {
                console.error("[Room] Leave error:", err);
            }
            clientRef.current = null;
        }

        setInCall(false);
        setCallDuration(0);
    }, []);

    const toggleMute = useCallback(async () => {
        if (!clientRef.current) return;
        try {
            if (isMuted) {
                await clientRef.current.localPeer.enableAudio();
            } else {
                await clientRef.current.localPeer.disableAudio();
            }
            setIsMuted(!isMuted);
        } catch (err) {
            console.error("[Room] Toggle mute error:", err);
        }
    }, [isMuted]);

    const toggleVideo = useCallback(async () => {
        if (!clientRef.current) return;
        try {
            if (isVideoOff) {
                await clientRef.current.localPeer.enableVideo();
                // Stream will be set via the "stream-playable" event listener
            } else {
                await clientRef.current.localPeer.disableVideo();
                if (localVideoRef.current) {
                    const stream = localVideoRef.current.srcObject as MediaStream;
                    if (stream) {
                        stream.getTracks().forEach(t => t.stop());
                    }
                    localVideoRef.current.srcObject = null;
                }
            }
            setIsVideoOff(!isVideoOff);
        } catch (err) {
            console.error("[Room] Toggle video error:", err);
        }
    }, [isVideoOff]);

    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (durationIntervalRef.current) {
                clearInterval(durationIntervalRef.current);
            }
            if (clientRef.current) {
                clientRef.current.leaveRoom().catch(() => {});
            }
        };
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !room) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center max-w-md"
                >
                    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-zinc-800/50 flex items-center justify-center">
                        <span className="text-4xl">🚫</span>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-3">
                        {error === "Room not found" ? "Room Not Found" : 
                         error === "This room has ended" ? "Room Ended" :
                         error === "This room has expired" ? "Room Expired" : "Error"}
                    </h1>
                    <p className="text-zinc-400 mb-8">
                        {error === "Room not found" 
                            ? "This room code doesn't exist. Please check the code and try again."
                            : error === "This room has ended"
                            ? "The host has ended this meeting."
                            : error === "This room has expired"
                            ? "This room has expired. Rooms are only available for 24 hours."
                            : error}
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium rounded-xl hover:shadow-lg hover:shadow-orange-500/25 transition-all"
                    >
                        Go to Spritz
                    </Link>
                </motion.div>
            </div>
        );
    }

    // In-call view
    if (inCall) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-white font-medium">{room.title}</span>
                        <span className="text-zinc-500 text-sm">{formatDuration(callDuration)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <span>🔗 {room.joinCode}</span>
                    </div>
                </div>

                {/* Video Area */}
                <div className="flex-1 p-4 flex items-center justify-center">
                    <div className="w-full max-w-4xl aspect-video bg-zinc-900 rounded-2xl overflow-hidden relative">
                        {!isVideoOff ? (
                            <video
                                ref={localVideoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                                    <span className="text-4xl text-white font-bold">
                                        {displayName[0]?.toUpperCase() || "?"}
                                    </span>
                                </div>
                            </div>
                        )}
                        <div className="absolute bottom-4 left-4 flex items-center gap-2">
                            <span className="px-3 py-1.5 bg-black/60 rounded-lg text-white text-sm">
                                {displayName} (You)
                            </span>
                            {isMuted && (
                                <span className="px-2 py-1 bg-red-500/80 rounded-lg text-white text-xs">
                                    🔇 Muted
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Controls */}
                <div className="p-4 border-t border-zinc-800">
                    <div className="flex items-center justify-center gap-4">
                        {/* Mic Toggle */}
                        <button
                            onClick={toggleMute}
                            className={`p-4 rounded-full transition-all ${
                                !isMuted
                                    ? "bg-zinc-800 hover:bg-zinc-700 text-white"
                                    : "bg-red-500 hover:bg-red-600 text-white"
                            }`}
                            title={isMuted ? "Unmute" : "Mute"}
                        >
                            {!isMuted ? (
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                </svg>
                            ) : (
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                                </svg>
                            )}
                        </button>

                        {/* Camera Toggle */}
                        <button
                            onClick={toggleVideo}
                            className={`p-4 rounded-full transition-all ${
                                !isVideoOff
                                    ? "bg-zinc-800 hover:bg-zinc-700 text-white"
                                    : "bg-red-500 hover:bg-red-600 text-white"
                            }`}
                            title={isVideoOff ? "Turn on camera" : "Turn off camera"}
                        >
                            {!isVideoOff ? (
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                            ) : (
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                            )}
                        </button>

                        {/* Leave Call */}
                        <button
                            onClick={handleLeave}
                            className="p-4 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all"
                            title="Leave meeting"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                            </svg>
                        </button>
                    </div>
                    <p className="text-center text-xs text-zinc-500 mt-4">
                        Share this code to invite others: <span className="font-mono text-orange-400">{room.joinCode}</span>
                    </p>
                </div>
            </div>
        );
    }

    // Pre-join lobby
    return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md"
            >
                {/* Header */}
                <div className="text-center mb-8">
                    <Link href="/" className="inline-block mb-6">
                        <span className="text-3xl font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
                            Spritz
                        </span>
                    </Link>
                </div>

                {/* Room Card */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                    {/* Room Info */}
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                            <span className="text-3xl">🎥</span>
                        </div>
                        <h1 className="text-xl font-bold text-white mb-2">{room.title}</h1>
                        <p className="text-zinc-400 text-sm">
                            Hosted by {room.host.displayName}
                        </p>
                        <div className="flex items-center justify-center gap-4 mt-3 text-xs text-zinc-500">
                            <span className="flex items-center gap-1">
                                <span>👥</span>
                                Max {room.maxParticipants} participants
                            </span>
                            <span className="flex items-center gap-1">
                                <span>🔗</span>
                                {room.joinCode}
                            </span>
                        </div>
                    </div>

                    {/* Join Form */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-2">
                                Your Name
                            </label>
                            <input
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="Enter your name"
                                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                maxLength={30}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && displayName.trim()) {
                                        handleJoin();
                                    }
                                }}
                            />
                        </div>

                        <button
                            onClick={handleJoin}
                            disabled={!displayName.trim() || joiningRoom || !isHuddle01Configured}
                            className="w-full py-3 px-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium rounded-xl hover:shadow-lg hover:shadow-green-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {joiningRoom ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Joining...
                                </>
                            ) : (
                                <>
                                    <span>🎥</span>
                                    Join Meeting
                                </>
                            )}
                        </button>

                        {!isHuddle01Configured && (
                            <p className="text-center text-xs text-red-400">
                                Video calling is not configured
                            </p>
                        )}
                    </div>

                    {/* Footer */}
                    <p className="text-center text-xs text-zinc-500 mt-6">
                        No account required • Video & audio enabled
                    </p>
                </div>

                {/* Powered by */}
                <p className="text-center text-xs text-zinc-600 mt-6">
                    Powered by{" "}
                    <Link href="/" className="text-orange-500 hover:text-orange-400">
                        Spritz
                    </Link>
                </p>
            </motion.div>
        </div>
    );
}
