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
    onCreateStream: (
        title?: string,
        description?: string
    ) => Promise<Stream | null>;
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
    const broadcastKeyRef = useRef(0); // Key to force Broadcast remount
    const isCleaningUpRef = useRef(false); // Track if cleanup is in progress

    const [title, setTitle] = useState("");
    const [status, setStatus] = useState<StreamStatus>("preview");
    const [error, setError] = useState<string | null>(null);
    const [isStarting, setIsStarting] = useState(false);
    const [duration, setDuration] = useState(0);
    const [ingestUrl, setIngestUrl] = useState<string | null>(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [copied, setCopied] = useState(false);

    // Generate shareable URL
    const shareUrl = currentStream?.id
        ? `https://app.spritz.chat/live/${currentStream.id}`
        : null;

    // Copy share URL to clipboard
    const copyShareUrl = async () => {
        if (!shareUrl) return;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (e) {
            console.error("[GoLive] Failed to copy:", e);
        }
    };

    // Start camera preview
    const startCamera = useCallback(async () => {
        try {
            setError(null);

            // Use default camera resolution - let the device choose best quality
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
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
            setError(
                "Failed to access camera. Please allow camera permissions."
            );
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

    // Comprehensive cleanup function to stop ALL media tracks
    const stopAllMediaTracks = useCallback(() => {
        console.log("[GoLive] Stopping all media tracks...");

        // Collect all tracks first, then stop them all
        const allTracks: MediaStreamTrack[] = [];
        const trackIds = new Set<string>();

        // Stop our tracked stream
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => {
                if (!trackIds.has(track.id)) {
                    allTracks.push(track);
                    trackIds.add(track.id);
                }
            });
            mediaStreamRef.current = null;
        }

        // Collect tracks from all video element streams (including Broadcast component's video)
        // Do this multiple times to catch any tracks that might be added asynchronously
        try {
            const videoElements = document.querySelectorAll("video");
            videoElements.forEach((video) => {
                const stream = video.srcObject as MediaStream;
                if (stream) {
                    stream.getTracks().forEach((track) => {
                        if (!trackIds.has(track.id)) {
                            allTracks.push(track);
                            trackIds.add(track.id);
                        }
                    });
                    video.srcObject = null;
                }
            });
        } catch (e) {
            console.error("[GoLive] Error collecting video streams:", e);
        }

        // Collect tracks from all audio elements
        try {
            const audioElements = document.querySelectorAll("audio");
            audioElements.forEach((audio) => {
                const stream = audio.srcObject as MediaStream;
                if (stream) {
                    stream.getTracks().forEach((track) => {
                        if (!trackIds.has(track.id)) {
                            allTracks.push(track);
                            trackIds.add(track.id);
                        }
                    });
                    audio.srcObject = null;
                }
            });
        } catch (e) {
            console.error("[GoLive] Error collecting audio streams:", e);
        }

        // AGGRESSIVE: Try to get all active media streams from getUserMedia
        // This might catch streams that aren't attached to DOM elements
        try {
            // Access navigator.mediaDevices.getUserMedia's active streams
            // Note: There's no direct API for this, but we can try to enumerate
            // all possible tracks by checking if they're still active
        } catch (e) {
            // Ignore
        }

        // Stop ALL tracks immediately with iOS-specific handling
        allTracks.forEach((track) => {
            try {
                if (track.readyState !== "ended") {
                    // iOS-specific: Set enabled to false first
                    track.enabled = false;
                    
                    // Stop the track
                    track.stop();
                    
                    // iOS-specific: Try to close the track if available
                    if (typeof (track as any).close === "function") {
                        (track as any).close();
                    }
                    
                    console.log(
                        "[GoLive] Stopped track:",
                        track.kind,
                        track.id,
                        track.label,
                        "readyState:",
                        track.readyState
                    );
                }
            } catch (e) {
                console.error("[GoLive] Error stopping track:", e);
            }
        });

        // Force garbage collection hint (iOS Safari sometimes needs this)
        // Request a repaint to help iOS release the camera indicator
        if (typeof window !== "undefined") {
            requestAnimationFrame(() => {
                // Force a repaint
                document.body.style.display = "none";
                document.body.offsetHeight; // Trigger reflow
                document.body.style.display = "";
            });
        }

        // Log how many tracks we stopped
        console.log(`[GoLive] Stopped ${allTracks.length} media tracks`);
    }, []);

    // Handle creating stream and getting ingest URL
    const handleGoLive = async () => {
        // Don't allow starting if cleanup is in progress
        if (isCleaningUpRef.current) {
            console.log("[GoLive] Cleanup in progress, waiting...");
            setError("Please wait for previous stream to fully stop...");
            return;
        }

        setIsStarting(true);
        setError(null);

        try {
            // Ensure all previous tracks are stopped before starting new broadcast
            stopAllMediaTracks();
            stopCamera();

            // Wait a bit to ensure camera is fully released (especially on iOS)
            await new Promise((resolve) => setTimeout(resolve, 500));

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

            // Small delay to ensure camera is released before Broadcast component tries to access it
            await new Promise((resolve) => setTimeout(resolve, 300));

            // Set the ingest URL to trigger broadcast mode
            setIngestUrl(whipUrl);

            // Mark as going live in the database
            await onGoLive(stream.id);
            setStatus("live");
        } catch (e) {
            console.error("[GoLive] Error:", e);
            setError(
                e instanceof Error ? e.message : "Failed to create stream"
            );
            // Restart preview camera on error
            startCamera();
        } finally {
            setIsStarting(false);
        }
    };

    // Handle end stream
    const handleEndStream = async () => {
        if (!currentStream) return;

        // Mark cleanup as in progress
        isCleaningUpRef.current = true;
        setStatus("ending");

        try {
            // CRITICAL: Set status to "ending" first - this will unmount Broadcast component
            // The conditional rendering will remove Broadcast.Root from DOM
            
            // CRITICAL: Force Broadcast component remount by changing key
            broadcastKeyRef.current += 1;
            
            // CRITICAL: Clear ingestUrl to ensure Broadcast component is not rendered
            // This must happen before stopping tracks to ensure the component releases them
            setIngestUrl(null);

            // Wait for Broadcast component to fully unmount from DOM
            // iOS needs more time for WebRTC to disconnect
            await new Promise((resolve) => setTimeout(resolve, 500));

            // Now stop all media tracks - the Broadcast component should be completely unmounted
            stopAllMediaTracks();

            // Additional cleanup passes with increasing delays for iOS
            await new Promise((resolve) => setTimeout(resolve, 300));
            stopAllMediaTracks();

            await new Promise((resolve) => setTimeout(resolve, 500));
            stopAllMediaTracks();

            // End the stream in the database
            await onEndStream(currentStream.id);

            // Wait a bit more before allowing new broadcasts
            await new Promise((resolve) => setTimeout(resolve, 500));

            setStatus("preview");
            setDuration(0);

            // Final cleanup passes for iOS - more aggressive
            setTimeout(() => {
                console.log("[GoLive] Final cleanup pass 1 (500ms)");
                stopAllMediaTracks();
            }, 500);

            setTimeout(() => {
                console.log("[GoLive] Final cleanup pass 2 (1000ms)");
                stopAllMediaTracks();
            }, 1000);

            setTimeout(() => {
                console.log("[GoLive] Final cleanup pass 3 (2000ms)");
                stopAllMediaTracks();
            }, 2000);

            setTimeout(() => {
                console.log("[GoLive] Final cleanup pass 4 (3000ms)");
                stopAllMediaTracks();
                // Mark cleanup as complete after final pass
                isCleaningUpRef.current = false;
            }, 3000);

            // Don't restart preview camera - user is ending the stream
            // They can reopen the modal if they want to go live again
        } catch (e) {
            console.error("[GoLive] Error ending stream:", e);
            setError("Failed to end stream properly");
            // Still try to clean up
            broadcastKeyRef.current += 1;
            setIngestUrl(null);
            setStatus("ending"); // Force unmount
            stopAllMediaTracks();
            setTimeout(() => stopAllMediaTracks(), 200);
            setTimeout(() => stopAllMediaTracks(), 500);
            setTimeout(() => {
                stopAllMediaTracks();
                isCleaningUpRef.current = false;
            }, 1000);
        }
    };

    // Handle close
    const handleClose = async () => {
        if (status === "live") {
            if (!confirm("You are currently live. End stream and close?")) {
                return;
            }
            // End stream first (which will handle cleanup)
            await handleEndStream();
        }

        // IMMEDIATE cleanup - don't wait for anything
        // Force Broadcast remount
        broadcastKeyRef.current += 1;
        
        // Clear ingest URL first to unmount Broadcast component
        setIngestUrl(null);

        // Wait for component to unmount, then stop tracks
        setTimeout(() => {
            stopAllMediaTracks();
            stopCamera();
        }, 100);

        // Additional aggressive cleanup passes with longer delays for iOS
        // The Broadcast component needs time to fully unmount and release tracks
        setTimeout(() => {
            console.log("[GoLive] Cleanup pass 1 (200ms)");
            stopAllMediaTracks();
            stopCamera();
        }, 200);

        setTimeout(() => {
            console.log("[GoLive] Cleanup pass 2 (400ms)");
            stopAllMediaTracks();
            stopCamera();
        }, 400);

        setTimeout(() => {
            console.log("[GoLive] Cleanup pass 3 (600ms)");
            stopAllMediaTracks();
            stopCamera();
        }, 600);

        setTimeout(() => {
            console.log("[GoLive] Cleanup pass 4 (1000ms)");
            stopAllMediaTracks();
            stopCamera();
        }, 1000);

        setTimeout(() => {
            console.log("[GoLive] Cleanup pass 5 (2000ms)");
            stopAllMediaTracks();
            stopCamera();
        }, 2000);

        setStatus("preview");
        onClose();
    };

    // Start camera when modal opens
    useEffect(() => {
        if (isOpen && !ingestUrl && !isStarting) {
            // Check if we're reconnecting to an existing live stream
            if (currentStream?.status === "live" && currentStream?.stream_id) {
                setIngestUrl(
                    `https://livepeer.studio/webrtc/${currentStream.stream_key}`
                );
                setStatus("live");
            } else {
                // Only start camera if not already ready (prevents interrupting play())
                if (!cameraReady) {
                    startCamera();
                }
            }
        } else if (!isOpen) {
            // Modal is closing - IMMEDIATE comprehensive cleanup
            broadcastKeyRef.current += 1; // Force Broadcast remount
            setIngestUrl(null); // Unmount Broadcast component first
            // Wait for component to unmount, then stop tracks
            setTimeout(() => {
                stopAllMediaTracks();
                stopCamera();
            }, 100);
            // Additional cleanup passes with longer delays for iOS
            setTimeout(() => {
                console.log("[GoLive] useEffect cleanup pass 1 (200ms)");
                stopAllMediaTracks();
                stopCamera();
            }, 200);
            setTimeout(() => {
                console.log("[GoLive] useEffect cleanup pass 2 (400ms)");
                stopAllMediaTracks();
                stopCamera();
            }, 400);
            setTimeout(() => {
                console.log("[GoLive] useEffect cleanup pass 3 (600ms)");
                stopAllMediaTracks();
                stopCamera();
            }, 600);
            setTimeout(() => {
                console.log("[GoLive] useEffect cleanup pass 4 (1000ms)");
                stopAllMediaTracks();
                stopCamera();
            }, 1000);
            setTimeout(() => {
                console.log("[GoLive] useEffect cleanup pass 5 (2000ms)");
                stopAllMediaTracks();
                stopCamera();
            }, 2000);
            setStatus("preview");
            setTitle("");
            setError(null);
            setDuration(0);
        }
    }, [
        isOpen,
        currentStream?.status,
        currentStream?.stream_id,
        ingestUrl,
        isStarting,
        cameraReady,
        startCamera,
        stopCamera,
    ]);

    // Cleanup on unmount - ensure camera is released
    useEffect(() => {
        return () => {
            console.log(
                "[GoLive] Component unmounting, cleaning up all media tracks..."
            );
            // IMMEDIATE cleanup - don't wait
            setIngestUrl(null);
            stopAllMediaTracks();
            stopCamera();
            // Additional aggressive cleanup passes with longer delays
            setTimeout(() => {
                console.log("[GoLive] Unmount cleanup pass 1 (100ms)");
                stopAllMediaTracks();
                stopCamera();
            }, 100);
            setTimeout(() => {
                console.log("[GoLive] Unmount cleanup pass 2 (300ms)");
                stopAllMediaTracks();
                stopCamera();
            }, 300);
            setTimeout(() => {
                console.log("[GoLive] Unmount cleanup pass 3 (500ms)");
                stopAllMediaTracks();
                stopCamera();
            }, 500);
            setTimeout(() => {
                console.log("[GoLive] Unmount cleanup pass 4 (1000ms)");
                stopAllMediaTracks();
                stopCamera();
            }, 1000);
        };
    }, [stopAllMediaTracks, stopCamera]);

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
            return `${hrs}:${mins.toString().padStart(2, "0")}:${secs
                .toString()
                .padStart(2, "0")}`;
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
                    {ingestUrl && status !== "ending" ? (
                        /* Live broadcast mode - only render when not ending */
                        <Broadcast.Root
                            key={broadcastKeyRef.current}
                            ingestUrl={ingestUrl}
                            aspectRatio={null}
                            video={{
                                facingMode: "user",
                            }}
                            audio={true}
                            forceEnabled
                            onError={(e) => {
                                // Livepeer SDK may call onError with null during initialization - ignore these
                                if (!e) return;
                                console.error("[Broadcast] Error:", e);
                                setError(
                                    "Broadcast error: " +
                                        (e?.message || "Connection failed")
                                );
                            }}
                        >
                            <Broadcast.Container className="absolute inset-0 flex items-center justify-center">
                                <Broadcast.Video
                                    title="Live broadcast"
                                    className="w-full h-full object-contain"
                                    style={{ transform: "scaleX(-1)" }}
                                />

                                {/* Loading indicator */}
                                <Broadcast.LoadingIndicator className="absolute inset-0 flex items-center justify-center bg-black/60">
                                    <div className="text-center">
                                        <div className="w-16 h-16 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin mx-auto mb-4" />
                                        <p className="text-white text-lg">
                                            Connecting...
                                        </p>
                                    </div>
                                </Broadcast.LoadingIndicator>

                                {/* Error indicator */}
                                <Broadcast.ErrorIndicator
                                    matcher="all"
                                    className="absolute inset-0 flex items-center justify-center bg-black/80"
                                >
                                    <div className="text-center p-4">
                                        <svg
                                            className="w-16 h-16 text-red-500 mx-auto mb-4"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                            />
                                        </svg>
                                        <p className="text-red-400 text-lg mb-2">
                                            Failed to start broadcast
                                        </p>
                                        <p className="text-zinc-400">
                                            Please check camera permissions
                                        </p>
                                    </div>
                                </Broadcast.ErrorIndicator>

                                {/* Floating controls - always visible */}
                                <div className="absolute inset-0 pointer-events-none">
                                    {/* Top bar - with safe area for notch */}
                                    <div className="absolute top-0 left-0 right-0 pt-[env(safe-area-inset-top,16px)] px-4 pb-4 bg-gradient-to-b from-black/70 to-transparent pointer-events-auto">
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
                                                className="p-3 bg-black/60 hover:bg-black/80 rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                                            >
                                                <svg
                                                    className="w-7 h-7 text-white"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2.5}
                                                        d="M6 18L18 6M6 6l12 12"
                                                    />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Bottom controls */}
                                    <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/70 to-transparent pointer-events-auto">
                                        <div className="flex items-center justify-center gap-6">
                                            {/* Audio toggle */}
                                            <Broadcast.AudioEnabledTrigger className="p-4 bg-black/50 hover:bg-black/70 rounded-full transition-colors">
                                                <Broadcast.AudioEnabledIndicator
                                                    matcher={false}
                                                >
                                                    <svg
                                                        className="w-7 h-7 text-red-500"
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
                                                </Broadcast.AudioEnabledIndicator>
                                                <Broadcast.AudioEnabledIndicator
                                                    matcher={true}
                                                >
                                                    <svg
                                                        className="w-7 h-7 text-white"
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
                                                </Broadcast.AudioEnabledIndicator>
                                            </Broadcast.AudioEnabledTrigger>

                                            {/* End stream button */}
                                            <button
                                                onClick={handleEndStream}
                                                className="p-5 bg-red-500 hover:bg-red-600 rounded-full transition-colors"
                                            >
                                                <svg
                                                    className="w-8 h-8 text-white"
                                                    fill="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <rect
                                                        x="6"
                                                        y="6"
                                                        width="12"
                                                        height="12"
                                                        rx="2"
                                                    />
                                                </svg>
                                            </button>

                                            {/* Video toggle */}
                                            <Broadcast.VideoEnabledTrigger className="p-4 bg-black/50 hover:bg-black/70 rounded-full transition-colors">
                                                <Broadcast.VideoEnabledIndicator
                                                    matcher={false}
                                                >
                                                    <svg
                                                        className="w-7 h-7 text-red-500"
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
                                                </Broadcast.VideoEnabledIndicator>
                                                <Broadcast.VideoEnabledIndicator
                                                    matcher={true}
                                                >
                                                    <svg
                                                        className="w-7 h-7 text-white"
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
                                                </Broadcast.VideoEnabledIndicator>
                                            </Broadcast.VideoEnabledTrigger>
                                        </div>

                                        {/* Share URL bar */}
                                        {shareUrl && (
                                            <div className="mt-4 flex items-center gap-2 bg-black/60 rounded-xl p-2 backdrop-blur-sm">
                                                <div className="flex-1 px-3 py-2 bg-zinc-800/50 rounded-lg text-white/80 text-sm truncate">
                                                    {shareUrl}
                                                </div>
                                                <button
                                                    onClick={copyShareUrl}
                                                    className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 shrink-0"
                                                >
                                                    {copied ? (
                                                        <>
                                                            <svg
                                                                className="w-4 h-4"
                                                                fill="none"
                                                                viewBox="0 0 24 24"
                                                                stroke="currentColor"
                                                            >
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    strokeWidth={
                                                                        2
                                                                    }
                                                                    d="M5 13l4 4L19 7"
                                                                />
                                                            </svg>
                                                            Copied!
                                                        </>
                                                    ) : (
                                                        <>
                                                            <svg
                                                                className="w-4 h-4"
                                                                fill="none"
                                                                viewBox="0 0 24 24"
                                                                stroke="currentColor"
                                                            >
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    strokeWidth={
                                                                        2
                                                                    }
                                                                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                                                />
                                                            </svg>
                                                            Share
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        )}
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
                                className="w-full h-full object-contain"
                                style={{ transform: "scaleX(-1)" }}
                            />

                            {/* Loading camera */}
                            {!cameraReady && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black">
                                    <div className="text-center">
                                        <div className="w-16 h-16 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin mx-auto mb-4" />
                                        <p className="text-white text-lg">
                                            Starting camera...
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Error */}
                            {error && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                                    <div className="text-center p-6">
                                        <svg
                                            className="w-16 h-16 text-red-500 mx-auto mb-4"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                            />
                                        </svg>
                                        <p className="text-red-400 text-lg mb-4">
                                            {error}
                                        </p>
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
                                {/* Top bar - with safe area for notch */}
                                <div className="absolute top-0 left-0 right-0 pt-[env(safe-area-inset-top,16px)] px-4 pb-4 bg-gradient-to-b from-black/70 to-transparent pointer-events-auto">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-white font-bold text-lg">
                                            Go Live
                                        </h2>
                                        <button
                                            onClick={handleClose}
                                            className="p-3 bg-black/60 hover:bg-black/80 rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                                        >
                                            <svg
                                                className="w-7 h-7 text-white"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2.5}
                                                    d="M6 18L18 6M6 6l12 12"
                                                />
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
                                        onChange={(e) =>
                                            setTitle(e.target.value)
                                        }
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
                                        Stream will be recorded for later
                                        playback
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
                            <p className="text-white text-lg">
                                Ending stream...
                            </p>
                            <p className="text-white/60 text-sm mt-2">
                                Saving your recording
                            </p>
                        </div>
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    );
}
