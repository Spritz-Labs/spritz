"use client";

import { useState, useEffect, use, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { huddle01ProjectId, isHuddle01Configured } from "@/config/huddle01";
import { InstantRoomChat } from "@/components/InstantRoomChat";

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

type RemotePeer = {
    peerId: string;
    displayName: string;
    audioTrack: MediaStreamTrack | null;
    videoTrack: MediaStreamTrack | null;
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
    const [remotePeers, setRemotePeers] = useState<Map<string, RemotePeer>>(new Map());
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [unreadMessages, setUnreadMessages] = useState(0);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientRef = useRef<any>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
    const remoteAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
    const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (code) {
            fetchRoom();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        setError(null);
        
        try {
            console.log("[Room] Getting token for room:", room.roomId);
            
            // Get token
            const tokenRes = await fetch(`/api/rooms/${code}/token`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ displayName: displayName.trim() }),
            });

            const tokenData = await tokenRes.json();
            console.log("[Room] Token response:", tokenRes.ok, tokenData);
            
            if (!tokenRes.ok) {
                setError(tokenData.error || "Failed to get access token");
                setJoiningRoom(false);
                return;
            }

            console.log("[Room] Loading Huddle01 SDK...");
            
            // Load Huddle01 SDK
            await loadHuddle01SDK();
            if (!HuddleClient) {
                setError("Failed to load video SDK");
                setJoiningRoom(false);
                return;
            }

            console.log("[Room] Creating Huddle01 client with projectId:", huddle01ProjectId);
            
            if (!huddle01ProjectId) {
                setError("Video calling not configured (missing project ID)");
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
            const roomEvents = client.room as any;

            // Handle new peer joining
            roomEvents.on("new-peer-joined", (data: { peerId: string; metadata?: { displayName?: string } }) => {
                console.log("[Room] New peer joined:", data);
                const peerName = data.metadata?.displayName || `Participant ${data.peerId.slice(0, 6)}`;
                setRemotePeers(prev => {
                    const updated = new Map(prev);
                    updated.set(data.peerId, {
                        peerId: data.peerId,
                        displayName: peerName,
                        audioTrack: null,
                        videoTrack: null,
                    });
                    return updated;
                });
            });

            // Handle peer leaving
            roomEvents.on("peer-left", (data: { peerId: string }) => {
                console.log("[Room] Peer left:", data);
                setRemotePeers(prev => {
                    const updated = new Map(prev);
                    updated.delete(data.peerId);
                    return updated;
                });
                // Clean up refs
                remoteVideoRefs.current.delete(data.peerId);
                remoteAudioRefs.current.delete(data.peerId);
            });

            // Handle remote stream becoming available
            roomEvents.on("stream-added", (data: { peerId: string; label: string; track: MediaStreamTrack }) => {
                console.log("[Room] Remote stream added:", data.peerId, data.label);
                
                setRemotePeers(prev => {
                    const updated = new Map(prev);
                    const peer = updated.get(data.peerId);
                    if (peer) {
                        if (data.label === "audio") {
                            peer.audioTrack = data.track;
                            // Play audio immediately
                            setTimeout(() => {
                                const audioEl = remoteAudioRefs.current.get(data.peerId);
                                if (audioEl) {
                                    const stream = new MediaStream([data.track]);
                                    audioEl.srcObject = stream;
                                    audioEl.play().catch(e => console.warn("[Room] Audio play failed:", e));
                                }
                            }, 100);
                        } else if (data.label === "video") {
                            peer.videoTrack = data.track;
                            // Play video immediately
                            setTimeout(() => {
                                const videoEl = remoteVideoRefs.current.get(data.peerId);
                                if (videoEl) {
                                    const stream = new MediaStream([data.track]);
                                    videoEl.srcObject = stream;
                                    videoEl.play().catch(e => console.warn("[Room] Video play failed:", e));
                                }
                            }, 100);
                        }
                        updated.set(data.peerId, { ...peer });
                    }
                    return updated;
                });
            });

            // Handle remote stream being removed
            roomEvents.on("stream-closed", (data: { peerId: string; label: string }) => {
                console.log("[Room] Remote stream closed:", data.peerId, data.label);
                
                setRemotePeers(prev => {
                    const updated = new Map(prev);
                    const peer = updated.get(data.peerId);
                    if (peer) {
                        if (data.label === "audio") {
                            peer.audioTrack = null;
                        } else if (data.label === "video") {
                            peer.videoTrack = null;
                        }
                        updated.set(data.peerId, { ...peer });
                    }
                    return updated;
                });
            });

            console.log("[Room] Joining room:", room.roomId);
            
            await client.joinRoom({
                roomId: room.roomId,
                token: tokenData.token,
            });

            console.log("[Room] Joined! Enabling audio/video...");

            // Enable media after joining
            try {
                await client.localPeer.enableAudio();
            } catch (audioErr) {
                console.warn("[Room] Could not enable audio:", audioErr);
            }
            
            try {
                await client.localPeer.enableVideo();
            } catch (videoErr) {
                console.warn("[Room] Could not enable video:", videoErr);
            }

            // Start duration timer
            durationIntervalRef.current = setInterval(() => {
                setCallDuration(d => d + 1);
            }, 1000);

            setInCall(true);
            setJoiningRoom(false);
        } catch (err) {
            console.error("[Room] Join error:", err);
            const errorMessage = err instanceof Error ? err.message : "Unknown error";
            setError(`Failed to join room: ${errorMessage}`);
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
        const isJoinError = error?.includes("Failed to join");
        
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center max-w-md"
                >
                    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-zinc-800/50 flex items-center justify-center">
                        <span className="text-4xl">{isJoinError ? "⚠️" : "🚫"}</span>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-3">
                        {error === "Room not found" ? "Room Not Found" : 
                         error === "This room has ended" ? "Room Ended" :
                         error === "This room has expired" ? "Room Expired" :
                         isJoinError ? "Connection Issue" : "Error"}
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
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        {isJoinError && (
                            <button
                                onClick={() => {
                                    setError(null);
                                    setLoading(true);
                                    fetchRoom();
                                }}
                                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-xl transition-all"
                            >
                                Try Again
                            </button>
                        )}
                        <Link
                            href="/"
                            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium rounded-xl hover:shadow-lg hover:shadow-orange-500/25 transition-all"
                        >
                            Go to Spritz
                        </Link>
                    </div>
                </motion.div>
            </div>
        );
    }

    // In-call view
    if (inCall) {
        const remotePeerArray = Array.from(remotePeers.values());
        const hasRemotePeers = remotePeerArray.length > 0;
        
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col relative">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-white font-medium">{room.title}</span>
                        <span className="text-zinc-500 text-sm">{formatDuration(callDuration)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-zinc-400">
                        <span>👥 {remotePeerArray.length + 1}</span>
                        <span>🔗 {room.joinCode}</span>
                        {/* Chat Toggle in Header for mobile */}
                        <button
                            onClick={() => setIsChatOpen(!isChatOpen)}
                            className={`relative p-2 rounded-lg transition-colors ${
                                isChatOpen 
                                    ? "bg-orange-500/20 text-orange-400" 
                                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                            }`}
                            title="Toggle chat"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            {unreadMessages > 0 && !isChatOpen && (
                                <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 rounded-full text-xs text-white flex items-center justify-center font-medium">
                                    {unreadMessages > 9 ? "9+" : unreadMessages}
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                {/* Main content area with chat sidebar */}
                <div className="flex-1 flex overflow-hidden relative">
                    {/* Video Area */}
                    <div className={`flex-1 p-4 overflow-hidden transition-all ${isChatOpen ? "pr-0 sm:pr-4" : ""}`}>
                        <div className={`h-full grid gap-4 ${
                            hasRemotePeers 
                                ? remotePeerArray.length === 1 
                                    ? "grid-cols-2" 
                                    : "grid-cols-2 grid-rows-2"
                                : "grid-cols-1"
                        }`}>
                        {/* Local Video */}
                        <div className="relative bg-zinc-900 rounded-2xl overflow-hidden">
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
                                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                                        <span className="text-3xl sm:text-4xl text-white font-bold">
                                            {displayName[0]?.toUpperCase() || "?"}
                                        </span>
                                    </div>
                                </div>
                            )}
                            <div className="absolute bottom-3 left-3 flex items-center gap-2">
                                <span className="px-2 py-1 bg-black/60 rounded-lg text-white text-xs sm:text-sm">
                                    {displayName} (You)
                                </span>
                                {isMuted && (
                                    <span className="px-2 py-1 bg-red-500/80 rounded-lg text-white text-xs">
                                        🔇
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Remote Peers */}
                        <AnimatePresence>
                            {remotePeerArray.map((peer) => (
                                <motion.div
                                    key={peer.peerId}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className="relative bg-zinc-900 rounded-2xl overflow-hidden"
                                >
                                    {peer.videoTrack ? (
                                        <video
                                            ref={(el) => {
                                                if (el) {
                                                    remoteVideoRefs.current.set(peer.peerId, el);
                                                    // Try to play if we have a track
                                                    if (peer.videoTrack && !el.srcObject) {
                                                        el.srcObject = new MediaStream([peer.videoTrack]);
                                                        el.play().catch(() => {});
                                                    }
                                                }
                                            }}
                                            autoPlay
                                            playsInline
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                                            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                                                <span className="text-3xl sm:text-4xl text-white font-bold">
                                                    {peer.displayName[0]?.toUpperCase() || "?"}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                    {/* Remote Audio Element (hidden) */}
                                    <audio
                                        ref={(el) => {
                                            if (el) {
                                                remoteAudioRefs.current.set(peer.peerId, el);
                                                // Try to play if we have a track
                                                if (peer.audioTrack && !el.srcObject) {
                                                    el.srcObject = new MediaStream([peer.audioTrack]);
                                                    el.play().catch(() => {});
                                                }
                                            }
                                        }}
                                        autoPlay
                                        className="hidden"
                                    />
                                    <div className="absolute bottom-3 left-3">
                                        <span className="px-2 py-1 bg-black/60 rounded-lg text-white text-xs sm:text-sm">
                                            {peer.displayName}
                                        </span>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {/* Waiting for others message */}
                        {!hasRemotePeers && (
                            <div className="flex items-center justify-center bg-zinc-900/50 rounded-2xl border-2 border-dashed border-zinc-700">
                                <div className="text-center p-4">
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-800 flex items-center justify-center">
                                        <span className="text-3xl">👥</span>
                                    </div>
                                    <p className="text-zinc-400 text-sm">Waiting for others to join...</p>
                                    <p className="text-zinc-500 text-xs mt-2">
                                        Share code: <span className="text-orange-400 font-mono">{room.joinCode}</span>
                                    </p>
                                </div>
                            </div>
                        )}
                        </div>
                    </div>

                    {/* Chat Panel - Slides in from right */}
                    <InstantRoomChat
                        roomCode={room.joinCode}
                        displayName={displayName}
                        isOpen={isChatOpen}
                        onClose={() => setIsChatOpen(false)}
                        onUnreadChange={setUnreadMessages}
                    />
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

                        {/* Chat Toggle */}
                        <button
                            onClick={() => setIsChatOpen(!isChatOpen)}
                            className={`relative p-4 rounded-full transition-all ${
                                isChatOpen 
                                    ? "bg-orange-500 hover:bg-orange-600 text-white" 
                                    : "bg-zinc-800 hover:bg-zinc-700 text-white"
                            }`}
                            title={isChatOpen ? "Close chat" : "Open chat"}
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            {unreadMessages > 0 && !isChatOpen && (
                                <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 rounded-full text-xs text-white flex items-center justify-center font-medium animate-pulse">
                                    {unreadMessages > 9 ? "9+" : unreadMessages}
                                </span>
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
