"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Hls from "hls.js";
import Image from "next/image";

type StreamData = {
    id: string;
    title: string | null;
    description: string | null;
    status: string;
    is_live: boolean;
    playback_url: string | null;
    started_at: string | null;
    ended_at: string | null;
    viewer_count: number;
    streamer: {
        address: string;
        display_name: string | null;
        avatar_url: string | null;
    };
};

type ChatMessage = {
    id: string;
    stream_id: string;
    user_address: string;
    message: string;
    type: "message" | "reaction";
    created_at: string;
    user?: {
        username: string | null;
        display_name: string | null;
        ens_name: string | null;
        avatar_url: string | null;
    };
};

// Emoji reactions
const REACTIONS = ["❤️", "🔥", "🤙🏼", "👏", "😂", "😮", "🎉"];

export default function PublicLivePage() {
    const params = useParams();
    const router = useRouter();
    const streamId = params.id as string;

    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const hasTrackedViewerRef = useRef(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const lastMessageTimeRef = useRef<string | null>(null);

    const [stream, setStream] = useState<StreamData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isWaitingForBroadcast, setIsWaitingForBroadcast] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(true); // Start muted for autoplay
    const [retryCount, setRetryCount] = useState(0);
    const [viewerCount, setViewerCount] = useState(0);
    const [streamEnded, setStreamEnded] = useState(false);

    // Auth state - check for logged in user
    const [userAddress, setUserAddress] = useState<string | null>(null);
    const [userUsername, setUserUsername] = useState<string | null>(null);
    const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
    const [userEnsName, setUserEnsName] = useState<string | null>(null);
    const [userAvatar, setUserAvatar] = useState<string | null>(null);

    // Chat state
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [showChat, setShowChat] = useState(true);
    const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; x: number }[]>([]);

    const MAX_RETRIES = 60;
    const RETRY_INTERVAL = 1000;

    // Check if user is logged in (via localStorage saved credentials)
    useEffect(() => {
        const checkAuth = async () => {
            let address: string | null = null;
            
            // Check for passkey users first (spritz_passkey_address)
            const passkeyAddress = localStorage.getItem("spritz_passkey_address");
            if (passkeyAddress) {
                address = passkeyAddress.toLowerCase();
            }
            
            // Check for email auth users (spritz_email_address)
            if (!address) {
                const emailAddress = localStorage.getItem("spritz_email_address");
                if (emailAddress) {
                    address = emailAddress.toLowerCase();
                }
            }
            
            // Check for SIWE/SIWS authenticated users (spritz_auth_credentials)
            if (!address) {
                const authCredentials = localStorage.getItem("spritz_auth_credentials");
                if (authCredentials) {
                    try {
                        const parsed = JSON.parse(authCredentials);
                        const AUTH_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
                        if (parsed?.address && Date.now() - parsed.timestamp < AUTH_TTL) {
                            address = parsed.address.toLowerCase();
                        }
                    } catch {
                        // Invalid credentials
                    }
                }
            }
            
            // Check wagmi store for connected wallet
            if (!address) {
                const wagmiState = localStorage.getItem("wagmi.store");
                if (wagmiState) {
                    try {
                        const parsed = JSON.parse(wagmiState);
                        // Try to get the current account address
                        const current = parsed?.state?.current;
                        if (current) {
                            const connections = parsed?.state?.connections;
                            if (connections) {
                                // connections is a Map-like structure serialized as array of [key, value]
                                const connectionEntries = connections?.value || connections;
                                if (Array.isArray(connectionEntries)) {
                                    for (const entry of connectionEntries) {
                                        const conn = Array.isArray(entry) ? entry[1] : entry;
                                        if (conn?.accounts?.[0]) {
                                            address = conn.accounts[0].toLowerCase();
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    } catch {
                        // Invalid state
                    }
                }
            }
            
            if (address) {
                setUserAddress(address);
                
                // Fetch user info from Supabase
                try {
                    const res = await fetch(`/api/public/user?address=${encodeURIComponent(address)}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.user) {
                            setUserUsername(data.user.username || null);
                            setUserDisplayName(data.user.display_name || null);
                            setUserEnsName(data.user.ens_name || null);
                            setUserAvatar(data.user.avatar_url || null);
                        }
                    }
                } catch {
                    // Ignore errors
                }
            }
        };
        
        checkAuth();
        
        // Also listen for storage changes in case user logs in from another tab
        const handleStorageChange = () => checkAuth();
        window.addEventListener("storage", handleStorageChange);
        return () => window.removeEventListener("storage", handleStorageChange);
    }, [streamId]);

    // Fetch stream data
    useEffect(() => {
        const fetchStream = async () => {
            try {
                const res = await fetch(`/api/public/streams/${streamId}`);
                if (!res.ok) {
                    setError("Stream not found");
                    setIsLoading(false);
                    return;
                }
                const data = await res.json();
                setStream(data.stream);
                setViewerCount(data.stream.viewer_count || 0);
                
                // Check if stream already ended
                if (data.stream.status === "ended") {
                    setStreamEnded(true);
                }
                
                setIsLoading(false);
            } catch {
                setError("Failed to load stream");
                setIsLoading(false);
            }
        };

        if (streamId) {
            fetchStream();
        }
    }, [streamId]);

    // Track viewer
    useEffect(() => {
        if (stream && !hasTrackedViewerRef.current) {
            hasTrackedViewerRef.current = true;
            fetch(`/api/public/streams/${streamId}`, { method: "POST" }).catch(() => {});
            
            // Track stream view (only if user is logged in)
            if (userAddress) {
                fetch("/api/admin/track-analytics", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        walletAddress: userAddress,
                        event: { type: "stream_viewed" },
                    }),
                }).catch(() => {});
            }

            const handleBeforeUnload = () => {
                if (hasTrackedViewerRef.current) {
                    navigator.sendBeacon(`/api/public/streams/${streamId}?action=leave`);
                }
            };
            window.addEventListener("beforeunload", handleBeforeUnload);

            return () => {
                window.removeEventListener("beforeunload", handleBeforeUnload);
                if (hasTrackedViewerRef.current) {
                    hasTrackedViewerRef.current = false;
                    fetch(`/api/public/streams/${streamId}`, { method: "DELETE" }).catch(() => {});
                }
            };
        }
    }, [stream, streamId, userAddress]);

    // Refresh viewer count and check stream status
    useEffect(() => {
        if (!stream) return;

        const refreshStreamData = async () => {
            try {
                const res = await fetch(`/api/public/streams/${streamId}`);
                if (res.ok) {
                    const data = await res.json();
                    setViewerCount(data.stream.viewer_count || 0);
                    
                    // Check if stream has ended
                    if (data.stream.status === "ended" && !streamEnded) {
                        setStreamEnded(true);
                        // Stop the video
                        if (videoRef.current) {
                            videoRef.current.pause();
                        }
                        if (hlsRef.current) {
                            hlsRef.current.destroy();
                            hlsRef.current = null;
                        }
                    }
                }
            } catch {
                // Ignore
            }
        };

        const interval = setInterval(refreshStreamData, 5000);
        return () => clearInterval(interval);
    }, [stream, streamId, streamEnded]);

    // Fetch chat messages
    const fetchMessages = useCallback(async () => {
        if (!streamId) return;

        try {
            const url = lastMessageTimeRef.current
                ? `/api/streams/${streamId}/chat?since=${encodeURIComponent(lastMessageTimeRef.current)}`
                : `/api/streams/${streamId}/chat`;

            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data.messages && data.messages.length > 0) {
                    // Debug: log first message to see user data
                    if (data.messages.length > 0 && !lastMessageTimeRef.current) {
                        console.log("[Live Chat] Sample message user data:", JSON.stringify(data.messages[0].user, null, 2));
                        console.log("[Live Chat] Sample message:", {
                            id: data.messages[0].id,
                            user_address: data.messages[0].user_address,
                            username: data.messages[0].user?.username,
                            display_name: data.messages[0].user?.display_name,
                            ens_name: data.messages[0].user?.ens_name,
                        });
                    }
                    setMessages((prev) => {
                        // Merge new messages, avoiding duplicates
                        const existingIds = new Set(prev.map((m) => m.id));
                        const newMsgs = data.messages.filter((m: ChatMessage) => !existingIds.has(m.id));
                        return [...prev, ...newMsgs];
                    });
                    lastMessageTimeRef.current = data.messages[data.messages.length - 1].created_at;
                }
            }
        } catch {
            // Ignore
        }
    }, [streamId]);

    // Initial fetch and polling for chat
    useEffect(() => {
        if (!stream) return;

        fetchMessages();
        const interval = setInterval(fetchMessages, 2000);
        return () => clearInterval(interval);
    }, [stream, fetchMessages]);

    // Auto-scroll chat to bottom
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages]);

    // Send chat message
    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userAddress || !newMessage.trim() || isSending) return;

        setIsSending(true);
        try {
            const res = await fetch(`/api/streams/${streamId}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userAddress,
                    message: newMessage.trim(),
                    type: "message",
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setMessages((prev) => [...prev, data.message]);
                setNewMessage("");
            }
        } catch {
            // Ignore
        } finally {
            setIsSending(false);
        }
    };

    // Send reaction
    const sendReaction = async (emoji: string) => {
        if (!userAddress) return;

        // Add floating reaction animation
        const id = Math.random().toString(36);
        const x = 20 + Math.random() * 60; // Random x position 20-80%
        setFloatingReactions((prev) => [...prev, { id, emoji, x }]);
        setTimeout(() => {
            setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
        }, 2000);

        // Send to server
        try {
            await fetch(`/api/streams/${streamId}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userAddress,
                    message: emoji,
                    type: "reaction",
                }),
            });
        } catch {
            // Ignore
        }
    };

    // Initialize HLS player
    const initHls = useCallback(() => {
        if (!stream?.playback_url || !videoRef.current) return;

        const video = videoRef.current;

        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }

        if (Hls.isSupported()) {
            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 30,
            });

            hlsRef.current = hls;
            hls.loadSource(stream.playback_url);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                setIsWaitingForBroadcast(false);
                setRetryCount(0);
                // Try to play - will be muted initially for autoplay
                video.play().catch(() => {
                    setIsPlaying(false);
                });
            });

            hls.on(Hls.Events.ERROR, (_, data) => {
                if (data.fatal) {
                    if (
                        data.details === "manifestParsingError" ||
                        data.details === "manifestLoadError" ||
                        (data.response && data.response.code === 404)
                    ) {
                        setIsWaitingForBroadcast(true);
                        if (retryCount < MAX_RETRIES) {
                            retryTimeoutRef.current = setTimeout(() => {
                                setRetryCount((prev) => prev + 1);
                                initHls();
                            }, RETRY_INTERVAL);
                        } else {
                            setError("Stream is not available. The broadcaster may have ended the stream.");
                            setIsWaitingForBroadcast(false);
                        }
                    } else {
                        setError("Failed to load stream");
                    }
                }
            });
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = stream.playback_url;
            video.muted = true; // Ensure muted for autoplay
            video.addEventListener("loadedmetadata", () => {
                setIsWaitingForBroadcast(false);
                video.play().catch(() => setIsPlaying(false));
            });
            video.addEventListener("error", () => {
                setIsWaitingForBroadcast(true);
                if (retryCount < MAX_RETRIES) {
                    retryTimeoutRef.current = setTimeout(() => {
                        setRetryCount((prev) => prev + 1);
                        initHls();
                    }, RETRY_INTERVAL);
                }
            });
        } else {
            setError("Your browser doesn't support HLS playback");
        }
    }, [stream?.playback_url, retryCount]);

    // Initialize player when stream data is loaded (only if not ended)
    useEffect(() => {
        if (stream?.playback_url && !streamEnded) {
            initHls();
        }

        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
            }
        };
    }, [stream?.playback_url, streamEnded]); // eslint-disable-line react-hooks/exhaustive-deps

    // Video events
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        // Set initial muted state for autoplay (browsers require muted autoplay)
        video.muted = true;
        video.volume = 1; // Explicitly set volume to 1
        setIsMuted(true);
        setVolume(1);

        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        
        // Sync muted state with video element
        const handleVolumeChange = () => {
            setIsMuted(video.muted);
            setVolume(video.volume);
        };

        video.addEventListener("play", handlePlay);
        video.addEventListener("pause", handlePause);
        video.addEventListener("volumechange", handleVolumeChange);

        return () => {
            video.removeEventListener("play", handlePlay);
            video.removeEventListener("pause", handlePause);
            video.removeEventListener("volumechange", handleVolumeChange);
        };
    }, []);

    const togglePlay = async () => {
        if (!videoRef.current) return;
        const video = videoRef.current;
        
        if (isPlaying) {
            video.pause();
        } else {
            // If video is muted and user clicks to play, automatically unmute
            if (video.muted && isMuted) {
                video.muted = false;
                setIsMuted(false);
                // Set volume explicitly to trigger audio
                const targetVolume = volume > 0 ? volume : 1;
                video.volume = Math.max(0.01, targetVolume - 0.01);
                await new Promise(resolve => setTimeout(resolve, 10));
                video.volume = targetVolume;
                setVolume(targetVolume);
            }
            await video.play();
        }
    };

    const toggleMute = async () => {
        if (!videoRef.current) return;
        const video = videoRef.current;
        const newMutedState = !video.muted;
        
        // If unmuting, ensure volume is set and video is playing
        if (!newMutedState) {
            // Unmute first
            video.muted = false;
            setIsMuted(false);
            
            // Explicitly set volume - browsers need this as part of user interaction
            // Trick: Set volume to slightly less, then back to target
            // This forces the browser to recognize the volume change as user-initiated
            const targetVolume = volume > 0 ? volume : 1;
            video.volume = Math.max(0.01, targetVolume - 0.01);
            await new Promise(resolve => setTimeout(resolve, 10));
            video.volume = targetVolume;
            setVolume(targetVolume);
            
            // Ensure video is playing (browser may have paused muted autoplay)
            if (video.paused) {
                try {
                    await video.play();
                } catch (e) {
                    console.error("[Live] Failed to play after unmute:", e);
                }
            }
        } else {
            // Muting
            video.muted = true;
            setIsMuted(true);
        }
    };

    const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = parseFloat(e.target.value);
        if (videoRef.current) {
            const video = videoRef.current;
            
            // Set volume first
            video.volume = newVolume;
            setVolume(newVolume);
            
            // Unmute if volume is increased from 0
            if (newVolume > 0 && video.muted) {
                video.muted = false;
                setIsMuted(false);
                
                // Ensure video is playing when unmuting via volume slider
                if (video.paused) {
                    try {
                        await video.play();
                    } catch (e) {
                        console.error("[Live] Failed to play after volume change:", e);
                    }
                }
                
                // Force audio to be enabled by triggering a volume change
                // This helps with browsers that need explicit user interaction
                video.dispatchEvent(new Event('volumechange'));
            }
            // Mute if volume is set to 0
            if (newVolume === 0) {
                video.muted = true;
                setIsMuted(true);
            }
        }
    };

    const formatAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;
    
    // Get display name with priority: username > display_name > ens_name > formatted address
    const getDisplayName = (msg: ChatMessage) => {
        // Check for username (handle both null and empty string)
        if (msg.user?.username && msg.user.username.trim()) return msg.user.username.trim();
        if (msg.user?.display_name && msg.user.display_name.trim()) return msg.user.display_name.trim();
        if (msg.user?.ens_name && msg.user.ens_name.trim()) return msg.user.ens_name.trim();
        return formatAddress(msg.user_address);
    };
    
    // Get current user display name with priority: username > display_name > ens_name > formatted address
    const getCurrentUserDisplayName = () => {
        if (!userAddress) return "";
        if (userUsername) return userUsername;
        if (userDisplayName) return userDisplayName;
        if (userEnsName) return userEnsName;
        return formatAddress(userAddress);
    };

    // Loading state
    if (isLoading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-orange-500/30 border-t-orange-500 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-zinc-400">Loading stream...</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error && !stream) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="text-center max-w-md px-6">
                    <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Stream Not Found</h1>
                    <p className="text-zinc-400 mb-8">This stream may have ended or doesn&apos;t exist.</p>
                    <a
                        href="/"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold rounded-xl hover:from-orange-400 hover:to-red-400 transition-all"
                    >
                        <Image src="/icons/icon-96x96.png" alt="Spritz" width={24} height={24} className="rounded" />
                        Open Spritz
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen bg-zinc-950 flex flex-col overflow-hidden">
            {/* Header */}
            <header className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between shrink-0">
                <a href="/" className="flex items-center gap-2">
                    <Image src="/icons/icon-96x96.png" alt="Spritz" width={32} height={32} className="rounded-lg" />
                    <span className="text-white font-bold text-lg">Spritz</span>
                </a>
                {userAddress ? (
                    <div className="flex items-center gap-2 text-sm">
                        {userAvatar ? (
                            <img
                                src={userAvatar}
                                alt=""
                                className="w-6 h-6 rounded-full object-cover"
                            />
                        ) : (
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white text-xs font-medium">
                                {getCurrentUserDisplayName().slice(0, 2).toUpperCase()}
                            </div>
                        )}
                        <span className="text-zinc-400">Signed in as</span>
                        <span className="text-white font-medium">{getCurrentUserDisplayName()}</span>
                    </div>
                ) : (
                    <a
                        href="/"
                        className="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-semibold rounded-lg hover:from-orange-400 hover:to-red-400 transition-all"
                    >
                        Sign In
                    </a>
                )}
            </header>

            {/* Main content */}
            <main className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
                {/* Video section */}
                <div className="flex-1 flex flex-col bg-black relative min-h-0 overflow-hidden">
                    {/* Video container */}
                    <div 
                        className="relative flex-1 flex items-center justify-center group min-h-0 cursor-pointer"
                        onClick={async () => {
                            // Auto-unmute and play when user clicks on video area
                            if (videoRef.current && videoRef.current.muted) {
                                await toggleMute();
                            }
                            togglePlay();
                        }}
                    >
                        <video
                            ref={videoRef}
                            className="w-full h-full object-contain max-w-full max-h-full"
                            playsInline
                            autoPlay
                            muted
                            onClick={(e) => {
                                e.stopPropagation();
                                togglePlay();
                            }}
                        />

                        {/* Floating reactions */}
                        <div className="absolute inset-0 pointer-events-none overflow-hidden">
                            {floatingReactions.map((r) => (
                                <div
                                    key={r.id}
                                    className="absolute animate-float-up text-4xl"
                                    style={{ left: `${r.x}%`, bottom: "20%" }}
                                >
                                    {r.emoji}
                                </div>
                            ))}
                        </div>

                        {/* Waiting for broadcast */}
                        {isWaitingForBroadcast && !error && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black">
                                <div className="text-center max-w-sm px-4">
                                    <div className="relative mx-auto mb-4 w-16 h-16">
                                        <div className="absolute inset-0 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
                                        <div className="absolute inset-3 bg-red-500/20 rounded-full flex items-center justify-center">
                                            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                        </div>
                                    </div>
                                    <h3 className="text-white font-medium mb-2">Waiting for broadcast...</h3>
                                    <p className="text-zinc-400 text-sm mb-4">
                                        The streamer is setting up. The video will appear once they start broadcasting.
                                    </p>
                                    {retryCount > 0 && (
                                        <p className="text-zinc-500 text-xs">
                                            Checking for stream... ({retryCount}/{MAX_RETRIES})
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Stream ended overlay */}
                        {streamEnded && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black">
                                <div className="text-center max-w-sm px-4">
                                    <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <svg className="w-10 h-10 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-2xl font-bold text-white mb-2">Stream has ended</h3>
                                    <p className="text-zinc-400 mb-6">
                                        Thanks for watching! The recording will be available soon.
                                    </p>
                                    <a
                                        href="/"
                                        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold rounded-xl hover:from-orange-400 hover:to-red-400 transition-all"
                                    >
                                        <Image src="/icons/icon-96x96.png" alt="" width={20} height={20} className="rounded" />
                                        Back to Spritz
                                    </a>
                                </div>
                            </div>
                        )}

                        {/* Error overlay */}
                        {error && !streamEnded && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black">
                                <div className="text-center">
                                    <svg className="w-12 h-12 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="text-red-400 mb-4">{error}</p>
                                    <button
                                        onClick={() => {
                                            setError(null);
                                            setRetryCount(0);
                                            initHls();
                                        }}
                                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                                    >
                                        Try Again
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Video controls */}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="flex items-center gap-4">
                                <button onClick={togglePlay} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                                    {isPlaying ? (
                                        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                        </svg>
                                    ) : (
                                        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    )}
                                </button>

                                <div className="flex items-center gap-2">
                                    <button onClick={toggleMute} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                                        {isMuted || volume === 0 ? (
                                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                                            </svg>
                                        ) : (
                                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                            </svg>
                                        )}
                                    </button>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        value={volume}
                                        onChange={handleVolumeChange}
                                        className="w-20 h-1 bg-zinc-600 rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>

                                <div className="flex-1" />

                                {stream?.status === "live" && (
                                    <span className="px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-full flex items-center gap-2">
                                        <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                        LIVE
                                    </span>
                                )}

                                {/* Chat toggle (mobile) */}
                                <button
                                    onClick={() => setShowChat(!showChat)}
                                    className="lg:hidden p-2 hover:bg-white/20 rounded-lg transition-colors"
                                >
                                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Reaction bar (always visible when logged in) */}
                        {userAddress && (
                            <div className="absolute right-4 bottom-20 flex flex-col gap-2">
                                {REACTIONS.map((emoji) => (
                                    <button
                                        key={emoji}
                                        onClick={() => sendReaction(emoji)}
                                        className="w-12 h-12 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full flex items-center justify-center text-2xl transition-transform hover:scale-110 active:scale-95"
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar with streamer info and chat */}
                <div className={`${showChat ? "flex" : "hidden lg:flex"} w-full lg:w-96 bg-zinc-900 border-t lg:border-t-0 lg:border-l border-zinc-800 flex-col min-h-0 overflow-hidden`}>
                    {/* Streamer info */}
                    <div className="p-4 border-b border-zinc-800 shrink-0">
                        <div className="flex items-center gap-3 mb-3">
                            {stream?.streamer.avatar_url ? (
                                <img
                                    src={stream.streamer.avatar_url}
                                    alt=""
                                    className="w-12 h-12 rounded-full object-cover ring-2 ring-red-500"
                                />
                            ) : (
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white font-bold ring-2 ring-red-500">
                                    {(stream?.streamer.display_name || stream?.streamer.address || "?").slice(0, 2).toUpperCase()}
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-white font-medium truncate">
                                        {stream?.streamer.display_name || formatAddress(stream?.streamer.address || "")}
                                    </span>
                                    {stream?.status === "live" && (
                                        <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full animate-pulse shrink-0">
                                            LIVE
                                        </span>
                                    )}
                                </div>
                                <p className="text-zinc-400 text-sm">{viewerCount} watching</p>
                            </div>
                        </div>
                        <h1 className="text-lg font-bold text-white">{stream?.title || "Live Stream"}</h1>
                    </div>

                    {/* Chat messages */}
                    <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                        {messages.length === 0 ? (
                            <div className="text-center text-zinc-500 py-8">
                                <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                <p className="text-sm">No messages yet</p>
                                <p className="text-xs mt-1">Be the first to say something!</p>
                            </div>
                        ) : (
                                            messages.map((msg) => (
                                <div key={msg.id} className={msg.type === "reaction" ? "flex justify-center" : ""}>
                                    {msg.type === "reaction" ? (
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="text-zinc-500">
                                                {getDisplayName(msg)}
                                            </span>
                                            <span className="text-2xl">{msg.message}</span>
                                        </div>
                                    ) : (
                                        <div className="flex gap-2">
                                            {msg.user?.avatar_url ? (
                                                <img
                                                    src={msg.user.avatar_url}
                                                    alt=""
                                                    className="w-8 h-8 rounded-full object-cover shrink-0"
                                                />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-700 flex items-center justify-center text-white text-xs font-medium shrink-0">
                                                    {getDisplayName(msg).slice(0, 2).toUpperCase()}
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-zinc-300 font-medium text-sm">
                                                        {getDisplayName(msg)}
                                                    </span>
                                                    <span className="text-zinc-600 text-xs">
                                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                    </span>
                                                </div>
                                                <p className="text-white text-sm break-words">{msg.message}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    {/* Chat input */}
                    <div className="p-4 border-t border-zinc-800 shrink-0">
                        {userAddress ? (
                            <form onSubmit={sendMessage} className="flex gap-2">
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder="Say something..."
                                    maxLength={500}
                                    className="flex-1 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 text-sm"
                                />
                                <button
                                    type="submit"
                                    disabled={!newMessage.trim() || isSending}
                                    className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
                                >
                                    {isSending ? "..." : "Send"}
                                </button>
                            </form>
                        ) : (
                            <div className="text-center">
                                <p className="text-zinc-400 text-sm mb-3">Sign in to chat and send reactions</p>
                                <a
                                    href="/"
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-semibold rounded-lg hover:from-orange-400 hover:to-red-400 transition-all"
                                >
                                    <Image src="/icons/icon-96x96.png" alt="" width={16} height={16} className="rounded" />
                                    Sign In to Chat
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* CSS for floating animation */}
            <style jsx>{`
                @keyframes float-up {
                    0% {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                    100% {
                        opacity: 0;
                        transform: translateY(-200px) scale(1.5);
                    }
                }
                .animate-float-up {
                    animation: float-up 2s ease-out forwards;
                }
            `}</style>
        </div>
    );
}
