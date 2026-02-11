"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as Broadcast from "@livepeer/react/broadcast";
import type { Stream } from "@/app/api/streams/route";
import { useAnalytics } from "@/hooks/useAnalytics";

type GoLiveModalProps = {
    isOpen: boolean;
    onClose: () => void;
    /** When true, render only inner content (no full-screen overlay) for embedding in a tab or panel */
    embed?: boolean;
    userAddress: string;
    currentStream: Stream | null;
    onCreateStream: (
        title?: string,
        description?: string,
        record?: boolean,
    ) => Promise<Stream | null>;
    onGoLive: (streamId: string) => Promise<boolean>;
    onEndStream: (streamId: string) => Promise<boolean>;
    /** Whether user has beta access (enables recording toggle) */
    hasBetaAccess?: boolean;
};

type StreamStatus = "preview" | "connecting" | "live" | "ending";

export function GoLiveModal({
    isOpen,
    onClose,
    embed = false,
    userAddress,
    currentStream,
    onCreateStream,
    onGoLive,
    onEndStream,
    hasBetaAccess = false,
}: GoLiveModalProps) {
    const { trackStreamCreated, trackStreamStarted, trackStreamEnded } = useAnalytics(userAddress);
    const videoPreviewRef = useRef<HTMLVideoElement>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const broadcastKeyRef = useRef(0); // Key to force Broadcast remount
    const isCleaningUpRef = useRef(false); // Track if cleanup is in progress
    const streamStartTimeRef = useRef<number | null>(null); // Track when stream started for duration

    const [title, setTitle] = useState("");
    const [recordEnabled, setRecordEnabled] = useState(false); // Recording off by default
    const [status, setStatus] = useState<StreamStatus>("preview");
    const [error, setError] = useState<string | null>(null);
    const [isStarting, setIsStarting] = useState(false);
    const [duration, setDuration] = useState(0);
    const [ingestUrl, setIngestUrl] = useState<string | null>(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [copied, setCopied] = useState(false);

    // Device selection state
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string>("");
    const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>("");
    const [showDeviceSettings, setShowDeviceSettings] = useState(false);

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

    // Enumerate available media devices
    const enumerateDevices = useCallback(async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const cameras = devices.filter((d) => d.kind === "videoinput");
            const mics = devices.filter((d) => d.kind === "audioinput");
            setVideoDevices(cameras);
            setAudioDevices(mics);
            console.log(`[GoLive] Found ${cameras.length} cameras, ${mics.length} mics`);
            return { cameras, mics };
        } catch (e) {
            console.error("[GoLive] Error enumerating devices:", e);
            return { cameras: [], mics: [] };
        }
    }, []);

    // Start camera preview with fallback logic
    const startCamera = useCallback(async (videoDeviceId?: string, audioDeviceId?: string) => {
        try {
            setError(null);

            // Build constraints based on selected devices
            const videoConstraint: MediaTrackConstraints | boolean = videoDeviceId
                ? { deviceId: { exact: videoDeviceId } }
                : { facingMode: "user" };
            const audioConstraint: MediaTrackConstraints | boolean = audioDeviceId
                ? { deviceId: { exact: audioDeviceId } }
                : true;

            let stream: MediaStream | null = null;

            // Attempt 1: Preferred constraints (selected device or facingMode: "user")
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: videoConstraint,
                    audio: audioConstraint,
                });
            } catch (e1) {
                console.warn("[GoLive] Preferred constraints failed, trying fallback:", e1);
                // Attempt 2: Simple video + audio (no facingMode, no specific device)
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: true,
                    });
                } catch (e2) {
                    console.warn("[GoLive] Video+audio failed, trying video only:", e2);
                    // Attempt 3: Video only (mic might be the issue)
                    try {
                        stream = await navigator.mediaDevices.getUserMedia({
                            video: true,
                            audio: false,
                        });
                    } catch (e3) {
                        // All attempts failed
                        throw e3;
                    }
                }
            }

            if (!stream) {
                throw new Error("No media stream available");
            }

            // Log which tracks we got
            const vTracks = stream.getVideoTracks();
            const aTracks = stream.getAudioTracks();
            console.log(
                `[GoLive] Got stream: ${vTracks.length} video tracks, ${aTracks.length} audio tracks`,
                vTracks.map((t) => `${t.label} (${t.id})`),
                aTracks.map((t) => `${t.label} (${t.id})`),
            );

            if (vTracks.length === 0) {
                console.warn("[GoLive] No video tracks in stream!");
            }

            mediaStreamRef.current = stream;

            // Attach to video element - retry a few times if ref not ready yet
            let attached = false;
            for (let attempt = 0; attempt < 5; attempt++) {
                if (videoPreviewRef.current) {
                    videoPreviewRef.current.srcObject = stream;
                    try {
                        await videoPreviewRef.current.play();
                    } catch (playErr) {
                        // play() can fail due to autoplay policy - the video may still show
                        console.warn("[GoLive] play() failed (may still display):", playErr);
                    }
                    attached = true;
                    break;
                }
                // Wait for ref to become available
                await new Promise((resolve) => setTimeout(resolve, 100));
            }

            if (!attached) {
                console.warn("[GoLive] Video ref not available after retries, stream still captured");
            }

            setCameraReady(true);

            // Enumerate devices after getting permission (labels become available)
            await enumerateDevices();
        } catch (e) {
            console.error("[GoLive] Camera error:", e);
            const err = e as DOMException;
            let message = "Failed to access camera. Please allow camera permissions.";
            if (err.name === "NotAllowedError") {
                message = "Camera access denied. Please enable camera permissions in your browser settings.";
            } else if (err.name === "NotFoundError") {
                message = "No camera found. Please connect a camera and try again.";
            } else if (err.name === "NotReadableError" || err.name === "AbortError") {
                message = "Camera is in use by another app. Please close other apps using your camera.";
            } else if (err.name === "OverconstrainedError") {
                message = "Camera doesn't support the requested settings. Try selecting a different camera.";
            }
            setError(message);
            setCameraReady(false);
        }
    }, [enumerateDevices]);

    // Stop camera
    const stopCamera = useCallback(() => {
        if (mediaStreamRef.current) {
            // Stop audio tracks first, then video
            const audioTracks = mediaStreamRef.current.getAudioTracks();
            const videoTracks = mediaStreamRef.current.getVideoTracks();
            
            audioTracks.forEach((track) => {
                track.enabled = false;
                track.stop();
            });
            
            videoTracks.forEach((track) => {
                track.enabled = false;
                track.stop();
            });
            
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

        // AGGRESSIVE: Also check for audio tracks in video elements (some implementations attach audio to video)
        try {
            const videoElements = document.querySelectorAll("video");
            videoElements.forEach((video) => {
                const stream = video.srcObject as MediaStream;
                if (stream) {
                    stream.getAudioTracks().forEach((track) => {
                        if (!trackIds.has(track.id)) {
                            allTracks.push(track);
                            trackIds.add(track.id);
                        }
                    });
                }
            });
        } catch (e) {
            console.error("[GoLive] Error collecting audio from video streams:", e);
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
        // Stop audio tracks FIRST (they're often the ones that stick around)
        const audioTracks = allTracks.filter(t => t.kind === "audio");
        const videoTracks = allTracks.filter(t => t.kind === "video");
        
        // Stop audio tracks first
        audioTracks.forEach((track) => {
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
                        "[GoLive] Stopped AUDIO track:",
                        track.id,
                        track.label,
                        "readyState:",
                        track.readyState
                    );
                }
            } catch (e) {
                console.error("[GoLive] Error stopping audio track:", e);
            }
        });

        // Then stop video tracks
        videoTracks.forEach((track) => {
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
                        "[GoLive] Stopped VIDEO track:",
                        track.id,
                        track.label,
                        "readyState:",
                        track.readyState
                    );
                }
            } catch (e) {
                console.error("[GoLive] Error stopping video track:", e);
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
            let isNewStream = false;
            if (!stream) {
                stream = await onCreateStream(title || "Live Stream", undefined, recordEnabled);
                if (!stream) {
                    throw new Error("Failed to create stream");
                }
                isNewStream = true;
                // Track stream creation
                trackStreamCreated();
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
            
            // Track stream started and record start time for duration calculation
            trackStreamStarted();
            streamStartTimeRef.current = Date.now();
        } catch (e) {
            console.error("[GoLive] Error:", e);
            setError(
                e instanceof Error ? e.message : "Failed to create stream"
            );
            // Restart preview camera on error
            startCamera(selectedVideoDeviceId || undefined, selectedAudioDeviceId || undefined);
        } finally {
            setIsStarting(false);
        }
    };

    // Force-close: bail out of "ending" state immediately
    const handleForceClose = useCallback(() => {
        console.log("[GoLive] Force close triggered");
        // Nuclear cleanup
        broadcastKeyRef.current += 1;
        setIngestUrl(null);
        stopAllMediaTracks();
        stopCamera();
        isCleaningUpRef.current = false;
        setStatus("preview");
        setDuration(0);
        setError(null);
        onClose();
    }, [stopAllMediaTracks, stopCamera, onClose]);

    // Handle end stream
    const handleEndStream = async () => {
        if (!currentStream) return;

        // Mark cleanup as in progress
        isCleaningUpRef.current = true;
        setStatus("ending");

        // 1. Unmount the Broadcast component immediately
        broadcastKeyRef.current += 1;
        setIngestUrl(null);

        // 2. Stop all tracks immediately
        stopAllMediaTracks();
        stopCamera();

        // 3. End stream in database (with timeout so we don't hang forever)
        try {
            const durationMinutes = streamStartTimeRef.current
                ? (Date.now() - streamStartTimeRef.current) / (1000 * 60)
                : duration / 60;

            // Give the API call 10 seconds max
            await Promise.race([
                onEndStream(currentStream.id),
                new Promise<boolean>((_, reject) =>
                    setTimeout(() => reject(new Error("End stream API timeout")), 10000)
                ),
            ]);

            trackStreamEnded(durationMinutes);
        } catch (e) {
            console.error("[GoLive] Error ending stream in database:", e);
            // Don't block the UI - the stream is already stopped locally
        }

        streamStartTimeRef.current = null;

        // 4. Final cleanup pass after a short delay (catch any lingering tracks)
        setTimeout(() => {
            stopAllMediaTracks();
            stopCamera();
        }, 500);

        // 5. One more iOS cleanup pass
        setTimeout(() => {
            stopAllMediaTracks();
        }, 2000);

        // 6. Done - release the UI
        setStatus("preview");
        setDuration(0);
        isCleaningUpRef.current = false;
    };

    // Handle close
    const handleClose = () => {
        if (status === "live") {
            if (!confirm("You are currently live. End stream and close?")) {
                return;
            }
            // End stream (non-blocking) then close
            handleEndStream();
        }

        // Immediate cleanup
        broadcastKeyRef.current += 1;
        setIngestUrl(null);
        stopAllMediaTracks();
        stopCamera();

        // One delayed cleanup pass for iOS
        setTimeout(() => {
            stopAllMediaTracks();
            stopCamera();
        }, 500);

        setStatus("preview");
        isCleaningUpRef.current = false;
        onClose();
    };

    // Start camera when modal opens
    useEffect(() => {
        if (isOpen && !ingestUrl && !isStarting) {
            // Don't auto-reconnect to existing "live" streams.
            // The stream may be stale (user closed app without ending).
            // Instead, always show the preview. If user wants to go live again,
            // they click Go Live which will create a new stream (the API auto-ends stale ones).
            if (!cameraReady) {
                startCamera(selectedVideoDeviceId || undefined, selectedAudioDeviceId || undefined);
            }
        } else if (!isOpen) {
            // Modal is closing - cleanup
            broadcastKeyRef.current += 1;
            setIngestUrl(null);
            stopAllMediaTracks();
            stopCamera();
            // One delayed pass for iOS
            setTimeout(() => {
                stopAllMediaTracks();
                stopCamera();
            }, 500);
            isCleaningUpRef.current = false;
            setStatus("preview");
            setTitle("");
            setError(null);
            setDuration(0);
            setShowDeviceSettings(false);
        }
    }, [
        isOpen,
        ingestUrl,
        isStarting,
        cameraReady,
        selectedVideoDeviceId,
        selectedAudioDeviceId,
        startCamera,
        stopCamera,
    ]);

    // Cleanup on unmount - ensure camera is released
    useEffect(() => {
        return () => {
            console.log("[GoLive] Component unmounting, cleaning up all media tracks...");
            setIngestUrl(null);
            stopAllMediaTracks();
            stopCamera();
            // One delayed pass for iOS WebRTC cleanup
            setTimeout(() => {
                stopAllMediaTracks();
                stopCamera();
            }, 500);
        };
    }, [stopAllMediaTracks, stopCamera]);

    // Listen for device changes (e.g. user plugs in/out a camera)
    useEffect(() => {
        if (!isOpen) return;
        const handler = () => {
            console.log("[GoLive] Device change detected");
            enumerateDevices();
        };
        navigator.mediaDevices?.addEventListener("devicechange", handler);
        return () => {
            navigator.mediaDevices?.removeEventListener("devicechange", handler);
        };
    }, [isOpen, enumerateDevices]);

    // Switch camera when user selects a different device
    const handleSwitchCamera = useCallback(
        (deviceId: string) => {
            setSelectedVideoDeviceId(deviceId);
            // Restart camera with new device
            stopCamera();
            startCamera(deviceId, selectedAudioDeviceId || undefined);
        },
        [stopCamera, startCamera, selectedAudioDeviceId],
    );

    // Switch mic when user selects a different device
    const handleSwitchMic = useCallback(
        (deviceId: string) => {
            setSelectedAudioDeviceId(deviceId);
            stopCamera();
            startCamera(selectedVideoDeviceId || undefined, deviceId);
        },
        [stopCamera, startCamera, selectedVideoDeviceId],
    );

    // Flip between front/back camera (mobile)
    const handleFlipCamera = useCallback(() => {
        if (videoDevices.length < 2) return;
        const currentIdx = videoDevices.findIndex((d) => d.deviceId === selectedVideoDeviceId);
        const nextIdx = (currentIdx + 1) % videoDevices.length;
        handleSwitchCamera(videoDevices[nextIdx].deviceId);
    }, [videoDevices, selectedVideoDeviceId, handleSwitchCamera]);

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

    const content = (
        <>
                {/* Full screen video area */}
                <div className={`relative overflow-hidden ${embed ? "flex-1 min-h-0 flex flex-col" : "flex-1"}`}>
                    {ingestUrl && status !== "ending" ? (
                        /* Live broadcast mode - only render when not ending */
                        <Broadcast.Root
                            key={broadcastKeyRef.current}
                            ingestUrl={ingestUrl}
                            aspectRatio={null}
                            video={true}
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
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleEndStream();
                                                }}
                                                disabled={isCleaningUpRef.current}
                                                className="p-5 bg-red-500 hover:bg-red-600 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                        <div className={embed ? "flex flex-col flex-1 min-h-0" : "contents"}>
                            {/* Video preview area */}
                            <div className={`relative bg-black ${embed ? "flex-1 min-h-0" : "w-full h-full"}`}>
                                <video
                                    ref={videoPreviewRef}
                                    autoPlay
                                    muted
                                    playsInline
                                    className="w-full h-full object-contain"
                                    style={{ transform: "scaleX(-1)" }}
                                />

                                {/* Loading camera */}
                                {!cameraReady && !error && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black">
                                        <div className="text-center">
                                            <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin mx-auto mb-3" />
                                            <p className="text-white text-sm">
                                                Starting camera...
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Error */}
                                {error && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                                        <div className="text-center p-4">
                                            <svg
                                                className="w-12 h-12 text-red-500 mx-auto mb-3"
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
                                            <p className="text-red-400 text-sm mb-3">
                                                {error}
                                            </p>
                                            <button
                                                onClick={() => startCamera(selectedVideoDeviceId || undefined, selectedAudioDeviceId || undefined)}
                                                className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white text-sm rounded-xl transition-colors"
                                            >
                                                Try Again
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Overlay buttons on video (device controls) - only when NOT embed, or when embed shows minimal overlay */}
                                {!embed && (
                                    <div className="absolute inset-0 pointer-events-none">
                                        {/* Top bar - full-screen mode */}
                                        <div className="absolute top-0 left-0 right-0 pt-[env(safe-area-inset-top,16px)] px-4 pb-4 bg-gradient-to-b from-black/70 to-transparent pointer-events-auto">
                                            <div className="flex items-center justify-between">
                                                <h2 className="text-white font-bold text-lg">Go Live</h2>
                                                <div className="flex items-center gap-2">
                                                    {videoDevices.length > 1 && (
                                                        <button onClick={handleFlipCamera} className="p-3 bg-black/60 hover:bg-black/80 rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" title="Switch camera">
                                                            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                        </button>
                                                    )}
                                                    <button onClick={handleClose} className="p-3 bg-black/60 hover:bg-black/80 rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
                                                        <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Bottom controls - full-screen mode */}
                                        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent pointer-events-auto">
                                            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a title..." className="w-full px-4 py-3 mb-4 bg-black/50 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-red-500 backdrop-blur-sm" />
                                            {hasBetaAccess && (
                                                <button type="button" onClick={() => setRecordEnabled(!recordEnabled)} className="w-full flex items-center justify-between px-4 py-3 mb-4 bg-black/50 border border-white/20 rounded-xl backdrop-blur-sm transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <svg className="w-5 h-5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                                        <div className="text-left"><p className="text-white text-sm font-medium">Record stream</p><p className="text-white/40 text-xs">Save for later playback</p></div>
                                                    </div>
                                                    <div className={`w-11 h-6 rounded-full transition-colors relative ${recordEnabled ? 'bg-red-500' : 'bg-zinc-600'}`}><div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${recordEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} /></div>
                                                </button>
                                            )}
                                            <button onClick={handleGoLive} disabled={!cameraReady || isStarting} className="w-full py-4 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-bold text-lg rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3">
                                                {isStarting ? (<><div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />Going live...</>) : (<><span className="w-4 h-4 bg-white rounded-full animate-pulse" />Go Live</>)}
                                            </button>
                                            <p className="text-white/60 text-xs text-center mt-3">{recordEnabled ? "Stream will be recorded for later playback" : "Live only \u2014 stream will not be saved"}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Embed mode: small device buttons overlay on video */}
                                {embed && (videoDevices.length > 1 || audioDevices.length > 1) && (
                                    <div className="absolute top-2 right-2 flex items-center gap-1.5">
                                        {videoDevices.length > 1 && (
                                            <button onClick={handleFlipCamera} className="p-2 bg-black/60 hover:bg-black/80 rounded-full transition-colors" title="Switch camera">
                                                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                            </button>
                                        )}
                                        <button onClick={() => setShowDeviceSettings(!showDeviceSettings)} className={`p-2 rounded-full transition-colors ${showDeviceSettings ? 'bg-white/20' : 'bg-black/60 hover:bg-black/80'}`} title="Device settings">
                                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                        </button>
                                    </div>
                                )}

                                {/* Device settings dropdown overlay */}
                                {embed && showDeviceSettings && (
                                    <div className="absolute top-12 right-2 w-64 p-3 bg-black/90 rounded-xl backdrop-blur-sm space-y-2 z-10">
                                        {videoDevices.length > 0 && (
                                            <div>
                                                <label className="text-white/60 text-xs font-medium mb-1 block">Camera</label>
                                                <select value={selectedVideoDeviceId} onChange={(e) => handleSwitchCamera(e.target.value)} className="w-full px-2 py-1.5 bg-zinc-800 border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:border-red-500 appearance-none">
                                                    {videoDevices.map((device, idx) => (<option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${idx + 1}`}</option>))}
                                                </select>
                                            </div>
                                        )}
                                        {audioDevices.length > 0 && (
                                            <div>
                                                <label className="text-white/60 text-xs font-medium mb-1 block">Microphone</label>
                                                <select value={selectedAudioDeviceId} onChange={(e) => handleSwitchMic(e.target.value)} className="w-full px-2 py-1.5 bg-zinc-800 border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:border-red-500 appearance-none">
                                                    {audioDevices.map((device, idx) => (<option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${idx + 1}`}</option>))}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Embed mode: controls below video (not overlapping) */}
                            {embed && (
                                <div className="shrink-0 p-3 bg-zinc-900 space-y-2.5 border-t border-zinc-800">
                                    <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a title..." className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-red-500" />

                                    {hasBetaAccess && (
                                        <button type="button" onClick={() => setRecordEnabled(!recordEnabled)} className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl transition-colors">
                                            <div className="flex items-center gap-2.5">
                                                <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                                <span className="text-white text-sm">Record stream</span>
                                            </div>
                                            <div className={`w-10 h-5.5 rounded-full transition-colors relative ${recordEnabled ? 'bg-red-500' : 'bg-zinc-600'}`}><div className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white transition-transform ${recordEnabled ? 'translate-x-[1.125rem]' : 'translate-x-0.5'}`} /></div>
                                        </button>
                                    )}

                                    <button onClick={handleGoLive} disabled={!cameraReady || isStarting} className="w-full py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5">
                                        {isStarting ? (<><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Going live...</>) : (<><span className="w-3.5 h-3.5 bg-white rounded-full animate-pulse" />Go Live</>)}
                                    </button>

                                    <p className="text-zinc-500 text-xs text-center">{recordEnabled ? "Stream will be recorded for later playback" : "Live only \u2014 stream will not be saved"}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Ending overlay - always has an escape hatch */}
                {status === "ending" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-10">
                        <div className="text-center">
                            <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
                            <p className="text-white text-lg">
                                Ending stream...
                            </p>
                            {recordEnabled && (
                                <p className="text-white/60 text-sm mt-2">
                                    Saving your recording
                                </p>
                            )}
                            <button
                                onClick={handleForceClose}
                                className="mt-6 px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-white/80 text-sm rounded-xl transition-colors"
                            >
                                Force Close
                            </button>
                        </div>
                    </div>
                )}
        </>
    );

    if (embed) {
        return (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {content}
            </div>
        );
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black z-50 flex flex-col"
            >
                {content}
            </motion.div>
        </AnimatePresence>
    );
}
