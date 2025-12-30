"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Hls from "hls.js";
import type { Stream } from "@/app/api/streams/route";

type LiveStreamPlayerProps = {
    isOpen: boolean;
    onClose: () => void;
    stream: Stream;
    streamerName?: string;
    streamerAvatar?: string | null;
};

export function LiveStreamPlayer({
    isOpen,
    onClose,
    stream,
    streamerName,
    streamerAvatar,
}: LiveStreamPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isWaitingForBroadcast, setIsWaitingForBroadcast] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [retryCount, setRetryCount] = useState(0);

    const MAX_RETRIES = 60; // Retry for up to ~60 seconds
    const RETRY_INTERVAL = 1000; // Every 1 second
    const hasTrackedViewerRef = useRef(false);

    // Track viewer count when opening/closing
    useEffect(() => {
        if (isOpen && stream.id && !hasTrackedViewerRef.current) {
            // Increment viewer count
            hasTrackedViewerRef.current = true;
            fetch(`/api/streams/${stream.id}/viewers`, { method: "POST" }).catch(() => {
                // Ignore errors - viewer tracking is best-effort
            });

            // Handle browser close/navigation
            const handleBeforeUnload = () => {
                if (hasTrackedViewerRef.current) {
                    // Use sendBeacon for reliable delivery on page unload
                    navigator.sendBeacon(`/api/streams/${stream.id}/viewers?action=leave`);
                }
            };
            window.addEventListener("beforeunload", handleBeforeUnload);

            return () => {
                window.removeEventListener("beforeunload", handleBeforeUnload);
                // Decrement viewer count on cleanup
                if (hasTrackedViewerRef.current) {
                    hasTrackedViewerRef.current = false;
                    fetch(`/api/streams/${stream.id}/viewers`, { method: "DELETE" }).catch(() => {
                        // Ignore errors
                    });
                }
            };
        }
    }, [isOpen, stream.id]);

    // Initialize HLS player
    const initHls = useCallback(() => {
        if (!isOpen || !stream.playback_url || !videoRef.current) return;

        const video = videoRef.current;
        
        // Clean up existing instance
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
                setIsLoading(false);
                setIsWaitingForBroadcast(false);
                setRetryCount(0);
                video.play().catch(() => {
                    // Autoplay blocked, user needs to click
                    setIsPlaying(false);
                });
            });

            hls.on(Hls.Events.ERROR, (_, data) => {
                if (data.fatal) {
                    // Check if this is a "stream not broadcasting yet" error
                    if (
                        data.details === "manifestParsingError" || 
                        data.details === "manifestLoadError" ||
                        (data.response && data.response.code === 404)
                    ) {
                        console.log("[HLS] Stream not broadcasting yet, retrying...", {
                            playbackUrl: stream.playback_url,
                            retryCount,
                            details: data.details,
                        });
                        setIsWaitingForBroadcast(true);
                        setIsLoading(false);
                        
                        // Retry if we haven't exceeded max retries
                        if (retryCount < MAX_RETRIES) {
                            retryTimeoutRef.current = setTimeout(() => {
                                setRetryCount(prev => prev + 1);
                                initHls();
                            }, RETRY_INTERVAL);
                        } else {
                            setError("Stream is not available. The broadcaster may have ended the stream.");
                            setIsWaitingForBroadcast(false);
                        }
                    } else {
                        console.error("[HLS] Fatal error:", data);
                        setError("Failed to load stream");
                        setIsLoading(false);
                        setIsWaitingForBroadcast(false);
                    }
                }
            });
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            // Safari native HLS support
            video.src = stream.playback_url;
            video.addEventListener("loadedmetadata", () => {
                setIsLoading(false);
                setIsWaitingForBroadcast(false);
                video.play().catch(() => setIsPlaying(false));
            });
            video.addEventListener("error", () => {
                setIsWaitingForBroadcast(true);
                setIsLoading(false);
                if (retryCount < MAX_RETRIES) {
                    retryTimeoutRef.current = setTimeout(() => {
                        setRetryCount(prev => prev + 1);
                        initHls();
                    }, RETRY_INTERVAL);
                }
            });
        } else {
            setError("Your browser doesn't support HLS playback");
            setIsLoading(false);
        }
    }, [isOpen, stream.playback_url, retryCount]);

    // Initialize on mount/change
    useEffect(() => {
        setIsLoading(true);
        setError(null);
        setIsWaitingForBroadcast(false);
        setRetryCount(0);
        
        initHls();

        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
            }
        };
    }, [isOpen, stream.playback_url]); // eslint-disable-line react-hooks/exhaustive-deps

    // Handle video events
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        const handleEnded = () => setIsPlaying(false);

        video.addEventListener("play", handlePlay);
        video.addEventListener("pause", handlePause);
        video.addEventListener("ended", handleEnded);

        return () => {
            video.removeEventListener("play", handlePlay);
            video.removeEventListener("pause", handlePause);
            video.removeEventListener("ended", handleEnded);
        };
    }, []);

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
        } else {
            videoRef.current.play();
        }
    };

    const toggleMute = () => {
        if (!videoRef.current) return;
        videoRef.current.muted = !isMuted;
        setIsMuted(!isMuted);
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = parseFloat(e.target.value);
        setVolume(newVolume);
        if (videoRef.current) {
            videoRef.current.volume = newVolume;
        }
        setIsMuted(newVolume === 0);
    };

    const toggleFullscreen = () => {
        if (!videoRef.current) return;
        if (!isFullscreen) {
            videoRef.current.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
        setIsFullscreen(!isFullscreen);
    };

    const formatAddress = (address: string) => {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/95 backdrop-blur-sm z-50 flex items-center justify-center"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full max-w-5xl mx-4"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Stream Header */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            {streamerAvatar ? (
                                <img
                                    src={streamerAvatar}
                                    alt=""
                                    className="w-10 h-10 rounded-full object-cover ring-2 ring-red-500"
                                />
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white font-bold ring-2 ring-red-500">
                                    {(streamerName || stream.user_address).slice(0, 2).toUpperCase()}
                                </div>
                            )}
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-white font-medium">
                                        {streamerName || formatAddress(stream.user_address)}
                                    </span>
                                    {stream.status === "live" && (
                                        <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full animate-pulse">
                                            LIVE
                                        </span>
                                    )}
                                </div>
                                <p className="text-zinc-400 text-sm">
                                    {stream.title || "Live Stream"}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                        >
                            <svg className="w-6 h-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Video Player - vertical on mobile, horizontal on desktop */}
                    <div className="relative aspect-[9/16] sm:aspect-video bg-black rounded-xl overflow-hidden group max-h-[70vh] sm:max-h-none mx-auto">
                        <video
                            ref={videoRef}
                            className="w-full h-full object-contain"
                            playsInline
                            onClick={togglePlay}
                        />

                        {/* Loading overlay */}
                        {isLoading && !isWaitingForBroadcast && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black">
                                <div className="text-center">
                                    <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin mx-auto mb-4" />
                                    <p className="text-zinc-400">Loading stream...</p>
                                </div>
                            </div>
                        )}

                        {/* Waiting for broadcast overlay */}
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
                                    <div className="flex items-center justify-center gap-1">
                                        <span className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                        <span className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                        <span className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                    </div>
                                    {retryCount > 0 && (
                                        <p className="text-zinc-500 text-xs mt-4">
                                            Checking for stream... ({retryCount}/{MAX_RETRIES})
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Error overlay */}
                        {error && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black">
                                <div className="text-center">
                                    <svg className="w-12 h-12 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="text-red-400">{error}</p>
                                    <button
                                        onClick={() => {
                                            setError(null);
                                            setRetryCount(0);
                                            initHls();
                                        }}
                                        className="mt-4 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                                    >
                                        Try Again
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Controls overlay */}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="flex items-center gap-4">
                                {/* Play/Pause */}
                                <button
                                    onClick={togglePlay}
                                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                                >
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

                                {/* Volume */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={toggleMute}
                                        className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                                    >
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

                                {/* Live indicator */}
                                {stream.status === "live" && (
                                    <span className="px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-full flex items-center gap-2">
                                        <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                        LIVE
                                    </span>
                                )}

                                {/* Fullscreen */}
                                <button
                                    onClick={toggleFullscreen}
                                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                                >
                                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Stream info */}
                    <div className="mt-4 flex items-center justify-between text-sm text-zinc-400">
                        <span>
                            {stream.viewer_count || 0} watching
                        </span>
                        {stream.started_at && (
                            <span>
                                Started {new Date(stream.started_at).toLocaleTimeString()}
                            </span>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

// Component for live badge on avatars
export function LiveBadge({ className = "" }: { className?: string }) {
    return (
        <span className={`absolute -bottom-1 -right-1 px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full ring-2 ring-zinc-900 animate-pulse ${className}`}>
            LIVE
        </span>
    );
}

