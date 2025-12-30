"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as Broadcast from "@livepeer/react/broadcast";
import type { Stream } from "@/app/api/streams/route";

type GoLiveModalProps = {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string;
    currentStream: Stream | null;
    onCreateStream: (title?: string, description?: string) => Promise<Stream | null>;
    onGoLive: (streamId: string) => Promise<boolean>;
    onEndStream: (streamId: string) => Promise<boolean>;
};

type StreamStatus = "preview" | "connecting" | "live" | "ending";

export function GoLiveModal({
    isOpen,
    onClose,
    userAddress,
    currentStream,
    onCreateStream,
    onGoLive,
    onEndStream,
}: GoLiveModalProps) {
    const videoPreviewRef = useRef<HTMLVideoElement>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    
    const [title, setTitle] = useState("");
    const [status, setStatus] = useState<StreamStatus>("preview");
    const [error, setError] = useState<string | null>(null);
    const [isStarting, setIsStarting] = useState(false);
    const [duration, setDuration] = useState(0);
    const [ingestUrl, setIngestUrl] = useState<string | null>(null);
    const [cameraReady, setCameraReady] = useState(false);

    // Start camera preview
    const startCamera = useCallback(async () => {
        try {
            setError(null);
            const isMobile = window.innerWidth < 640;
            
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: isMobile ? 720 : 1280 },
                    height: { ideal: isMobile ? 1280 : 720 },
                    facingMode: "user",
                },
                audio: true,
            });

            mediaStreamRef.current = stream;

            if (videoPreviewRef.current) {
                videoPreviewRef.current.srcObject = stream;
                await videoPreviewRef.current.play();
            }

            setCameraReady(true);
        } catch (e) {
            console.error("[GoLive] Camera error:", e);
            setError("Failed to access camera. Please allow camera permissions.");
            setCameraReady(false);
        }
    }, []);

    // Stop camera
    const stopCamera = useCallback(() => {
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
        }
        if (videoPreviewRef.current) {
            videoPreviewRef.current.srcObject = null;
        }
        setCameraReady(false);
    }, []);

    // Handle creating stream and getting ingest URL
    const handleGoLive = async () => {
        setIsStarting(true);
        setError(null);

        try {
            // Create stream if we don't have one
            let stream = currentStream;
            if (!stream) {
                stream = await onCreateStream(title || "Live Stream");
                if (!stream) {
                    throw new Error("Failed to create stream");
                }
            }

            // Get the WebRTC ingest URL - use stream_key (NOT stream_id!)
            // The format is: https://livepeer.studio/webrtc/{streamKey}
            const streamKey = stream.stream_key;
            if (!streamKey) {
                throw new Error("Stream key not available");
            }
            
            const whipUrl = `https://livepeer.studio/webrtc/${streamKey}`;
            console.log("[GoLive] Using WHIP URL:", whipUrl);
            console.log("[GoLive] Stream Key:", streamKey);
            console.log("[GoLive] Playback ID:", stream.playback_id);
            
            // Stop the preview camera - the Broadcast component will request its own
            stopCamera();
            
            // Set the ingest URL to trigger broadcast mode
            setIngestUrl(whipUrl);

            // Mark as going live in the database
            await onGoLive(stream.id);
            setStatus("live");
        } catch (e) {
            console.error("[GoLive] Error:", e);
            setError(e instanceof Error ? e.message : "Failed to create stream");
            // Restart preview camera on error
            startCamera();
        } finally {
            setIsStarting(false);
        }
    };

    // Handle end stream
    const handleEndStream = async () => {
        if (!currentStream) return;

        setStatus("ending");

        try {
            await onEndStream(currentStream.id);
            setStatus("preview");
            setDuration(0);
            setIngestUrl(null);
            // Restart preview camera
            startCamera();
        } catch (e) {
            console.error("[GoLive] Error ending stream:", e);
            setError("Failed to end stream properly");
        }
    };

    // Handle close
    const handleClose = () => {
        if (status === "live") {
            if (!confirm("You are currently live. End stream and close?")) {
                return;
            }
            handleEndStream();
        }

        stopCamera();
        setIngestUrl(null);
        setStatus("preview");
        onClose();
    };

    // Start camera when modal opens
    useEffect(() => {
        if (isOpen && !ingestUrl && !isStarting) {
            // Check if we're reconnecting to an existing live stream
            if (currentStream?.status === "live" && currentStream?.stream_id) {
                setIngestUrl(`https://livepeer.studio/webrtc/${currentStream.stream_key}`);
                setStatus("live");
            } else {
                // Only start camera if not already ready (prevents interrupting play())
                if (!cameraReady) {
                    startCamera();
                }
            }
        } else if (!isOpen) {
            stopCamera();
            setStatus("preview");
            setTitle("");
            setError(null);
            setDuration(0);
            setIngestUrl(null);
        }
    }, [isOpen, currentStream?.status, currentStream?.stream_id, ingestUrl, isStarting, cameraReady, startCamera, stopCamera]);

    // Track duration while live
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (status === "live") {
            interval = setInterval(() => {
                setDuration((d) => d + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [status]);

    // Format duration
    const formatDuration = (seconds: number) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
        }
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black z-50 flex flex-col"
            >
                {/* Full screen video area */}
                <div className="flex-1 relative overflow-hidden">
                    {ingestUrl ? (
                        /* Live broadcast mode */
                        <Broadcast.Root
                            ingestUrl={ingestUrl}
                            aspectRatio={null}
                            video={true}
                            audio={true}
                            forceEnabled
                            onError={(e) => {
                                // Livepeer SDK may call onError with null during initialization - ignore these
                                if (!e) return;
                                console.error("[Broadcast] Error:", e);
                                setError("Broadcast error: " + (e?.message || "Connection failed"));
                            }}
                        >
                            <Broadcast.Container className="absolute inset-0">
                                <Broadcast.Video
                                    title="Live broadcast"
                                    className="w-full h-full object-cover"
                                    style={{ transform: "scaleX(-1)" }}
                                />

                                {/* Loading indicator */}
                                <Broadcast.LoadingIndicator className="absolute inset-0 flex items-center justify-center bg-black/60">
                                    <div className="text-center">
                                        <div className="w-16 h-16 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin mx-auto mb-4" />
                                        <p className="text-white text-lg">Connecting...</p>
                                    </div>
                                </Broadcast.LoadingIndicator>

                                {/* Error indicator */}
                                <Broadcast.ErrorIndicator
                                    matcher="all"
                                    className="absolute inset-0 flex items-center justify-center bg-black/80"
                                >
                                    <div className="text-center p-4">
                                        <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <p className="text-red-400 text-lg mb-2">Failed to start broadcast</p>
                                        <p className="text-zinc-400">Please check camera permissions</p>
                                    </div>
                                </Broadcast.ErrorIndicator>

                                {/* Floating controls - always visible */}
                                <div className="absolute inset-0 pointer-events-none">
                                    {/* Top bar */}
                                    <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent pointer-events-auto">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <Broadcast.StatusIndicator matcher="live">
                                                    <span className="px-3 py-1.5 bg-red-500 text-white text-sm font-bold rounded-full flex items-center gap-2">
                                                        <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                                        LIVE
                                                    </span>
                                                </Broadcast.StatusIndicator>
                                                <Broadcast.StatusIndicator matcher="pending">
                                                    <span className="px-3 py-1.5 bg-yellow-500 text-black text-sm font-bold rounded-full flex items-center gap-2">
                                                        <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                                        CONNECTING
                                                    </span>
                                                </Broadcast.StatusIndicator>
                                                <Broadcast.StatusIndicator matcher="idle">
                                                    <span className="px-3 py-1.5 bg-zinc-600 text-white text-sm font-bold rounded-full">
                                                        READY
                                                    </span>
                                                </Broadcast.StatusIndicator>
                                                <span className="text-white font-medium">
                                                    {formatDuration(duration)}
                                                </span>
                                            </div>
                                            <button
                                                onClick={handleClose}
                                                className="p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
                                            >
                                                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Bottom controls */}
                                    <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/70 to-transparent pointer-events-auto">
                                        <div className="flex items-center justify-center gap-6">
                                            {/* Audio toggle */}
                                            <Broadcast.AudioEnabledTrigger className="p-4 bg-black/50 hover:bg-black/70 rounded-full transition-colors">
                                                <Broadcast.AudioEnabledIndicator matcher={false}>
                                                    <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                                                    </svg>
                                                </Broadcast.AudioEnabledIndicator>
                                                <Broadcast.AudioEnabledIndicator matcher={true}>
                                                    <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                                    </svg>
                                                </Broadcast.AudioEnabledIndicator>
                                            </Broadcast.AudioEnabledTrigger>

                                            {/* End stream button */}
                                            <button
                                                onClick={handleEndStream}
                                                className="p-5 bg-red-500 hover:bg-red-600 rounded-full transition-colors"
                                            >
                                                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                    <rect x="6" y="6" width="12" height="12" rx="2" />
                                                </svg>
                                            </button>

                                            {/* Video toggle */}
                                            <Broadcast.VideoEnabledTrigger className="p-4 bg-black/50 hover:bg-black/70 rounded-full transition-colors">
                                                <Broadcast.VideoEnabledIndicator matcher={false}>
                                                    <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
                                                    </svg>
                                                </Broadcast.VideoEnabledIndicator>
                                                <Broadcast.VideoEnabledIndicator matcher={true}>
                                                    <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                    </svg>
                                                </Broadcast.VideoEnabledIndicator>
                                            </Broadcast.VideoEnabledTrigger>
                                        </div>
                                    </div>
                                </div>
                            </Broadcast.Container>
                        </Broadcast.Root>
                    ) : (
                        /* Camera preview mode */
                        <>
                            <video
                                ref={videoPreviewRef}
                                autoPlay
                                muted
                                playsInline
                                className="w-full h-full object-cover"
                                style={{ transform: "scaleX(-1)" }}
                            />

                            {/* Loading camera */}
                            {!cameraReady && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black">
                                    <div className="text-center">
                                        <div className="w-16 h-16 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin mx-auto mb-4" />
                                        <p className="text-white text-lg">Starting camera...</p>
                                    </div>
                                </div>
                            )}

                            {/* Error */}
                            {error && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                                    <div className="text-center p-6">
                                        <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <p className="text-red-400 text-lg mb-4">{error}</p>
                                        <button
                                            onClick={startCamera}
                                            className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors"
                                        >
                                            Try Again
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Floating controls for preview */}
                            <div className="absolute inset-0 pointer-events-none">
                                {/* Top bar */}
                                <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent pointer-events-auto">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-white font-bold text-lg">Go Live</h2>
                                        <button
                                            onClick={handleClose}
                                            className="p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
                                        >
                                            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                {/* Bottom controls */}
                                <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent pointer-events-auto">
                                    {/* Title input */}
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="Add a title..."
                                        className="w-full px-4 py-3 mb-4 bg-black/50 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-red-500 backdrop-blur-sm"
                                    />

                                    {/* Go Live Button */}
                                    <button
                                        onClick={handleGoLive}
                                        disabled={!cameraReady || isStarting}
                                        className="w-full py-4 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-bold text-lg rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                                    >
                                        {isStarting ? (
                                            <>
                                                <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                                                Going live...
                                            </>
                                        ) : (
                                            <>
                                                <span className="w-4 h-4 bg-white rounded-full animate-pulse" />
                                                Go Live
                                            </>
                                        )}
                                    </button>

                                    <p className="text-white/60 text-xs text-center mt-3">
                                        Stream will be recorded for later playback
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Ending overlay */}
                {status === "ending" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-10">
                        <div className="text-center">
                            <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
                            <p className="text-white text-lg">Ending stream...</p>
                            <p className="text-white/60 text-sm mt-2">Saving your recording</p>
                        </div>
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    );
}
