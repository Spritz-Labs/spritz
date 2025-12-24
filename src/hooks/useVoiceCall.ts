"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { agoraAppId, isAgoraConfigured, getAgoraToken } from "@/config/agora";

// Dynamic import for Agora SDK to avoid SSR issues
let AgoraRTC: typeof import("agora-rtc-sdk-ng").default | null = null;

export type CallState = "idle" | "joining" | "connected" | "leaving" | "error";

export type CallType = "audio" | "video";

export type VoiceCallState = {
    callState: CallState;
    callType: CallType;
    isMuted: boolean;
    isVideoOff: boolean;
    isScreenSharing: boolean;
    isRemoteMuted: boolean;
    isRemoteVideoOff: boolean;
    isRemoteScreenSharing: boolean;
    error: string | null;
    duration: number;
};

export function useVoiceCall() {
    const [state, setState] = useState<VoiceCallState>({
        callState: "idle",
        callType: "audio",
        isMuted: false,
        isVideoOff: true,
        isScreenSharing: false,
        isRemoteMuted: false,
        isRemoteVideoOff: true,
        isRemoteScreenSharing: false,
        error: null,
        duration: 0,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const localAudioTrackRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const localVideoTrackRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const localScreenTrackRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const remoteAudioTrackRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const remoteVideoTrackRef = useRef<any>(null);
    const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const startTimeRef = useRef<number | null>(null);
    const isJoiningRef = useRef<boolean>(false);
    const shouldAbortRef = useRef<boolean>(false);

    // Refs for video elements
    const localVideoRef = useRef<HTMLDivElement | null>(null);
    const remoteVideoRef = useRef<HTMLDivElement | null>(null);
    const screenShareRef = useRef<HTMLDivElement | null>(null);

    // Load Agora SDK dynamically on client side
    useEffect(() => {
        if (typeof window !== "undefined" && !AgoraRTC) {
            import("agora-rtc-sdk-ng").then((module) => {
                AgoraRTC = module.default;
            });
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (durationIntervalRef.current) {
                clearInterval(durationIntervalRef.current);
            }
        };
    }, []);

    const startDurationTimer = useCallback(() => {
        startTimeRef.current = Date.now();
        durationIntervalRef.current = setInterval(() => {
            if (startTimeRef.current) {
                setState((prev) => ({
                    ...prev,
                    duration: Math.floor(
                        (Date.now() - startTimeRef.current!) / 1000
                    ),
                }));
            }
        }, 1000);
    }, []);

    const stopDurationTimer = useCallback(() => {
        if (durationIntervalRef.current) {
            clearInterval(durationIntervalRef.current);
            durationIntervalRef.current = null;
        }
        startTimeRef.current = null;
    }, []);

    const joinCall = useCallback(
        async (
            channelName: string,
            uid?: number,
            withVideo: boolean = false
        ): Promise<boolean> => {
            if (!isAgoraConfigured) {
                setState((prev) => ({
                    ...prev,
                    callState: "error",
                    error: "Agora is not configured. Set NEXT_PUBLIC_AGORA_APP_ID.",
                }));
                return false;
            }

            if (!AgoraRTC) {
                setState((prev) => ({
                    ...prev,
                    callState: "error",
                    error: "Agora SDK not loaded yet. Please try again.",
                }));
                return false;
            }

            // Reset abort flag and set joining flag
            shouldAbortRef.current = false;
            isJoiningRef.current = true;

            setState((prev) => ({
                ...prev,
                callState: "joining",
                callType: withVideo ? "video" : "audio",
                isVideoOff: !withVideo,
                error: null,
            }));

            try {
                // Check permissions first (better mobile support)
                try {
                    const constraints: MediaStreamConstraints = { audio: true };
                    if (withVideo) {
                        constraints.video = true;
                    }
                    const permissionResult =
                        await navigator.mediaDevices.getUserMedia(constraints);
                    // Stop the test stream immediately
                    permissionResult
                        .getTracks()
                        .forEach((track) => track.stop());
                } catch (permError) {
                    const permMessage =
                        permError instanceof Error
                            ? permError.message
                            : String(permError);
                    if (
                        permMessage.includes("NotAllowed") ||
                        permMessage.includes("Permission denied")
                    ) {
                        const deviceType = withVideo
                            ? "Camera/Microphone"
                            : "Microphone";
                        throw new Error(
                            `${deviceType} access denied. Please allow permission in your browser/device settings and try again.`
                        );
                    } else if (permMessage.includes("NotFound")) {
                        throw new Error(
                            "No camera/microphone found. Please connect a device and try again."
                        );
                    } else {
                        throw new Error(`Media error: ${permMessage}`);
                    }
                }

                // Create Agora client
                const client = AgoraRTC.createClient({
                    mode: "rtc",
                    codec: "vp8",
                });
                clientRef.current = client;

                // Set up event handlers
                client.on("user-published", async (user, mediaType) => {
                    await client.subscribe(user, mediaType);

                    if (mediaType === "audio") {
                        const remoteAudioTrack = user.audioTrack;
                        remoteAudioTrackRef.current = remoteAudioTrack || null;
                        remoteAudioTrack?.play();
                        setState((prev) => ({ ...prev, isRemoteMuted: false }));
                    }

                    if (mediaType === "video") {
                        console.log("[Video] Remote video track received");
                        const remoteVideoTrack = user.videoTrack;
                        remoteVideoTrackRef.current = remoteVideoTrack || null;
                        // Switch to video layout when remote video arrives
                        setState((prev) => ({
                            ...prev,
                            isRemoteVideoOff: false,
                            callType: "video", // Auto-switch to video layout
                        }));
                        // Play in remote video container (with retry if container not ready)
                        if (remoteVideoTrack) {
                            let retryCount = 0;
                            const maxRetries = 50; // 5 seconds max
                            const playVideo = () => {
                                console.log(
                                    `[Video] Attempting to play remote video, retry ${retryCount}, container:`,
                                    !!remoteVideoRef.current
                                );
                                if (remoteVideoRef.current) {
                                    try {
                                        remoteVideoTrack.play(
                                            remoteVideoRef.current
                                        );
                                        console.log(
                                            "[Video] Remote video playing successfully"
                                        );
                                    } catch (e) {
                                        console.warn(
                                            "[Video] Error playing remote video:",
                                            e
                                        );
                                        if (retryCount < maxRetries) {
                                            retryCount++;
                                            setTimeout(playVideo, 100);
                                        }
                                    }
                                } else if (retryCount < maxRetries) {
                                    // Container not ready, retry in 100ms
                                    retryCount++;
                                    setTimeout(playVideo, 100);
                                } else {
                                    console.error(
                                        "[Video] Max retries reached, remote video container never became available"
                                    );
                                }
                            };
                            // Give React time to re-render with new callType
                            setTimeout(playVideo, 50);
                        }
                    }
                });

                client.on("user-unpublished", (user, mediaType) => {
                    if (mediaType === "audio") {
                        remoteAudioTrackRef.current = null;
                        setState((prev) => ({ ...prev, isRemoteMuted: true }));
                    }
                    if (mediaType === "video") {
                        remoteVideoTrackRef.current = null;
                        setState((prev) => ({
                            ...prev,
                            isRemoteVideoOff: true,
                        }));
                    }
                });

                client.on("user-left", () => {
                    remoteAudioTrackRef.current = null;
                    remoteVideoTrackRef.current = null;
                    setState((prev) => ({ ...prev, isRemoteVideoOff: true }));
                });

                // Generate UID if not provided
                const finalUid = uid || Math.floor(Math.random() * 100000);

                // Get token (null for testing mode)
                const token = await getAgoraToken(channelName, finalUid);

                // Join channel
                await client.join(agoraAppId, channelName, token, finalUid);

                // Create and publish local audio track
                const localAudioTrack =
                    await AgoraRTC.createMicrophoneAudioTrack();
                localAudioTrackRef.current = localAudioTrack;
                await client.publish([localAudioTrack]);

                // Create and publish video track if video call
                if (withVideo) {
                    const localVideoTrack =
                        await AgoraRTC.createCameraVideoTrack();
                    localVideoTrackRef.current = localVideoTrack;
                    await client.publish([localVideoTrack]);

                    // Play local video
                    if (localVideoRef.current) {
                        localVideoTrack.play(localVideoRef.current);
                    }
                }

                isJoiningRef.current = false;
                setState((prev) => ({ ...prev, callState: "connected" }));
                startDurationTimer();

                return true;
            } catch (error) {
                isJoiningRef.current = false;

                let message =
                    error instanceof Error
                        ? error.message
                        : "Failed to join call";

                // Handle abort/cancel errors gracefully (user cancelled before connected)
                if (
                    message.includes("WS_ABORT") ||
                    message.includes("LEAVE") ||
                    shouldAbortRef.current
                ) {
                    console.log("[Call] Join was cancelled by user");
                    // Reset to idle state without showing error
                    setState({
                        callState: "idle",
                        callType: "audio",
                        isMuted: false,
                        isVideoOff: true,
                        isScreenSharing: false,
                        isRemoteMuted: false,
                        isRemoteVideoOff: true,
                        isRemoteScreenSharing: false,
                        error: null,
                        duration: 0,
                    });
                    return false;
                }

                // Handle specific Agora errors
                if (message.includes("dynamic use static key")) {
                    message =
                        "Agora token required. Go to console.agora.io → Project → Configure → Disable 'App certificate' for testing mode, OR set up a token server.";
                }

                setState((prev) => ({
                    ...prev,
                    callState: "error",
                    error: message,
                }));
                return false;
            }
        },
        [startDurationTimer]
    );

    const leaveCall = useCallback(async () => {
        // Signal abort if join is in progress
        if (isJoiningRef.current) {
            console.log("[Call] Aborting join in progress");
            shouldAbortRef.current = true;
        }

        setState((prev) => ({ ...prev, callState: "leaving" }));
        stopDurationTimer();

        try {
            // Stop and close local audio track
            if (localAudioTrackRef.current) {
                localAudioTrackRef.current.stop();
                localAudioTrackRef.current.close();
                localAudioTrackRef.current = null;
            }

            // Stop and close local video track
            if (localVideoTrackRef.current) {
                localVideoTrackRef.current.stop();
                localVideoTrackRef.current.close();
                localVideoTrackRef.current = null;
            }

            // Stop and close screen share track
            if (localScreenTrackRef.current) {
                localScreenTrackRef.current.stop();
                localScreenTrackRef.current.close();
                localScreenTrackRef.current = null;
            }

            // Leave channel and destroy client
            if (clientRef.current) {
                try {
                    await clientRef.current.leave();
                } catch (leaveError) {
                    // Ignore errors when leaving (might already be disconnected)
                    console.log(
                        "[Call] Leave error (may be expected):",
                        leaveError
                    );
                }
                clientRef.current = null;
            }

            remoteAudioTrackRef.current = null;
            remoteVideoTrackRef.current = null;
            isJoiningRef.current = false;

            setState({
                callState: "idle",
                callType: "audio",
                isMuted: false,
                isVideoOff: true,
                isScreenSharing: false,
                isRemoteMuted: false,
                isRemoteVideoOff: true,
                isRemoteScreenSharing: false,
                error: null,
                duration: 0,
            });
        } catch (error) {
            console.error("Error leaving call:", error);
            isJoiningRef.current = false;
            setState((prev) => ({
                ...prev,
                callState: "idle",
            }));
        }
    }, [stopDurationTimer]);

    const toggleMute = useCallback(() => {
        if (localAudioTrackRef.current) {
            const newMutedState = !state.isMuted;
            localAudioTrackRef.current.setEnabled(!newMutedState);
            setState((prev) => ({ ...prev, isMuted: newMutedState }));
        }
    }, [state.isMuted]);

    // Use ref to track video state to avoid stale closures
    const isVideoOffRef = useRef(state.isVideoOff);
    useEffect(() => {
        isVideoOffRef.current = state.isVideoOff;
    }, [state.isVideoOff]);

    const toggleVideo = useCallback(async () => {
        if (!AgoraRTC || !clientRef.current) {
            console.log("[Video] Cannot toggle - AgoraRTC or client not ready");
            return;
        }

        const currentlyVideoOff = isVideoOffRef.current;
        console.log(
            "[Video] Toggle video called, currently off:",
            currentlyVideoOff
        );

        if (!currentlyVideoOff) {
            // Turn off video (currently on -> turn off)
            console.log("[Video] Turning OFF video");
            if (localVideoTrackRef.current) {
                try {
                    await clientRef.current.unpublish([
                        localVideoTrackRef.current,
                    ]);
                    localVideoTrackRef.current.stop();
                    localVideoTrackRef.current.close();
                    localVideoTrackRef.current = null;
                    console.log("[Video] Video track unpublished and closed");
                } catch (err) {
                    console.error("[Video] Error unpublishing video:", err);
                }
            }
            setState((prev) => ({ ...prev, isVideoOff: true }));
        } else {
            // Turn on video (currently off -> turn on)
            console.log("[Video] Turning ON video");
            try {
                // Agora only allows ONE video track at a time
                // If screen sharing is on, we need to stop it first
                if (localScreenTrackRef.current) {
                    console.log(
                        "[Video] Stopping screen share to enable camera"
                    );
                    await clientRef.current.unpublish([
                        localScreenTrackRef.current,
                    ]);
                    localScreenTrackRef.current.stop();
                    localScreenTrackRef.current.close();
                    localScreenTrackRef.current = null;
                }

                const localVideoTrack = await AgoraRTC.createCameraVideoTrack();
                localVideoTrackRef.current = localVideoTrack;
                await clientRef.current.publish([localVideoTrack]);
                console.log("[Video] Video track created and published");

                // Update state to video call mode and video on, screen share off
                setState((prev) => ({
                    ...prev,
                    isVideoOff: false,
                    isScreenSharing: false,
                    callType: "video", // Switch to video call layout
                }));

                // Play local video (with retry if container not ready yet)
                const playLocalVideo = () => {
                    if (localVideoRef.current && localVideoTrackRef.current) {
                        localVideoTrackRef.current.play(localVideoRef.current);
                        console.log("[Video] Local video playing");
                    } else if (localVideoTrackRef.current) {
                        // Container might not be ready yet after layout switch
                        setTimeout(playLocalVideo, 100);
                    }
                };
                playLocalVideo();
            } catch (error) {
                console.error("[Video] Error enabling video:", error);
                return; // Don't update state if failed
            }
        }
    }, []);

    const toggleScreenShare = useCallback(async () => {
        if (!AgoraRTC || !clientRef.current) return;

        if (state.isScreenSharing) {
            // Stop screen sharing
            if (localScreenTrackRef.current) {
                await clientRef.current.unpublish([
                    localScreenTrackRef.current,
                ]);
                localScreenTrackRef.current.stop();
                localScreenTrackRef.current.close();
                localScreenTrackRef.current = null;
            }
            setState((prev) => ({ ...prev, isScreenSharing: false }));
        } else {
            // Start screen sharing
            try {
                // Agora only allows ONE video track at a time
                // If camera is on, we need to stop it first
                const wasVideoOn = !state.isVideoOff;
                if (localVideoTrackRef.current) {
                    console.log(
                        "[Screen] Stopping camera to enable screen share"
                    );
                    await clientRef.current.unpublish([
                        localVideoTrackRef.current,
                    ]);
                    localVideoTrackRef.current.stop();
                    localVideoTrackRef.current.close();
                    localVideoTrackRef.current = null;
                }

                // Create screen share track
                const screenTrack = await AgoraRTC.createScreenVideoTrack(
                    {
                        encoderConfig: "1080p_2",
                        optimizationMode: "detail",
                    },
                    "disable" // Don't capture audio with screen
                );

                // Handle if array is returned (when audio is enabled)
                const videoTrack = Array.isArray(screenTrack)
                    ? screenTrack[0]
                    : screenTrack;
                localScreenTrackRef.current = videoTrack;

                // Listen for when user stops sharing via browser UI
                videoTrack.on("track-ended", async () => {
                    console.log(
                        "[Screen] User stopped screen share via browser"
                    );
                    if (clientRef.current && localScreenTrackRef.current) {
                        await clientRef.current
                            .unpublish([localScreenTrackRef.current])
                            .catch(console.error);
                        localScreenTrackRef.current.stop();
                        localScreenTrackRef.current.close();
                        localScreenTrackRef.current = null;
                    }
                    setState((prev) => ({
                        ...prev,
                        isScreenSharing: false,
                        isVideoOff: true,
                    }));
                });

                await clientRef.current.publish([videoTrack]);

                // Update state - camera is now off, screen share is on
                setState((prev) => ({
                    ...prev,
                    isScreenSharing: true,
                    isVideoOff: true, // Camera is off while screen sharing
                    callType: "video", // Switch to video layout to show screen
                }));

                // Play screen share in the screen share container
                const playScreen = () => {
                    if (screenShareRef.current && localScreenTrackRef.current) {
                        localScreenTrackRef.current.play(
                            screenShareRef.current
                        );
                    } else if (localScreenTrackRef.current) {
                        setTimeout(playScreen, 100);
                    }
                };
                playScreen();
            } catch (error) {
                console.error("Error starting screen share:", error);
                // User might have cancelled the picker
                return;
            }
        }
    }, [state.isScreenSharing, state.isVideoOff]);

    const formatDuration = useCallback((seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, "0")}:${secs
            .toString()
            .padStart(2, "0")}`;
    }, []);

    // Function to set video container refs
    const setLocalVideoContainer = useCallback(
        (element: HTMLDivElement | null) => {
            localVideoRef.current = element;
            // If we already have a video track, play it
            if (element && localVideoTrackRef.current) {
                localVideoTrackRef.current.play(element);
            }
        },
        []
    );

    const setRemoteVideoContainer = useCallback(
        (element: HTMLDivElement | null) => {
            console.log(
                "[Video] setRemoteVideoContainer called with element:",
                !!element
            );
            remoteVideoRef.current = element;
            // If we already have a remote video track, play it
            if (element && remoteVideoTrackRef.current) {
                console.log(
                    "[Video] Playing remote video from container callback"
                );
                try {
                    remoteVideoTrackRef.current.play(element);
                    console.log(
                        "[Video] Remote video started from container callback"
                    );
                } catch (e) {
                    console.warn(
                        "[Video] Failed to play remote video from container callback:",
                        e
                    );
                }
            }
        },
        []
    );

    const setScreenShareContainer = useCallback(
        (element: HTMLDivElement | null) => {
            screenShareRef.current = element;
            // If we already have a screen share track, play it
            if (element && localScreenTrackRef.current) {
                try {
                    localScreenTrackRef.current.play(element);
                } catch (e) {
                    console.warn("[Screen] Failed to play screen share:", e);
                }
            }
        },
        []
    );

    // Local screen share container (for Huddle01 compatibility, Agora uses screenShareRef for local)
    const setLocalScreenShareContainer = useCallback(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        (_element: HTMLDivElement | null) => {
            // No-op for Agora - local screen share uses screenShareRef
        },
        []
    );

    // Screenshot functionality - captures video call to image
    const takeScreenshot = useCallback(async (): Promise<boolean> => {
        try {
            // Find video elements in the containers
            const remoteVideo = remoteVideoRef.current?.querySelector("video");
            const localVideo = localVideoRef.current?.querySelector("video");

            if (!remoteVideo && !localVideo) {
                console.log("[Screenshot] No video elements found");
                return false;
            }

            // Determine canvas size - use remote video dimensions or fallback
            const width =
                remoteVideo?.videoWidth || localVideo?.videoWidth || 1280;
            const height =
                remoteVideo?.videoHeight || localVideo?.videoHeight || 720;

            // Create canvas
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) return false;

            // Fill with dark background
            ctx.fillStyle = "#18181b";
            ctx.fillRect(0, 0, width, height);

            // Draw remote video (main view)
            if (remoteVideo && remoteVideo.readyState >= 2) {
                ctx.drawImage(remoteVideo, 0, 0, width, height);
            }

            // Draw local video (picture-in-picture) in bottom-right
            if (localVideo && localVideo.readyState >= 2) {
                const pipWidth = Math.floor(width * 0.25);
                const pipHeight = Math.floor(height * 0.25);
                const pipX = width - pipWidth - 20;
                const pipY = 20;

                // Draw border
                ctx.fillStyle = "#3f3f46";
                ctx.fillRect(pipX - 2, pipY - 2, pipWidth + 4, pipHeight + 4);

                // Draw local video
                ctx.drawImage(localVideo, pipX, pipY, pipWidth, pipHeight);
            }

            // Add timestamp watermark
            const timestamp = new Date().toLocaleString();
            ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
            ctx.font = "16px sans-serif";
            ctx.fillText(timestamp, 20, height - 20);

            // Convert to blob
            const blob = await new Promise<Blob | null>((resolve) => {
                canvas.toBlob(resolve, "image/png", 1.0);
            });

            if (!blob) {
                console.error("[Screenshot] Failed to create blob");
                return false;
            }

            // Try Web Share API first (best for mobile)
            if (navigator.share && navigator.canShare) {
                const file = new File([blob], `reach-call-${Date.now()}.png`, {
                    type: "image/png",
                });
                const shareData = { files: [file] };

                if (navigator.canShare(shareData)) {
                    try {
                        await navigator.share(shareData);
                        console.log("[Screenshot] Shared via Web Share API");
                        return true;
                    } catch (e) {
                        // User cancelled or share failed, fall through to download
                        if ((e as Error).name !== "AbortError") {
                            console.log(
                                "[Screenshot] Share failed, falling back to download"
                            );
                        }
                    }
                }
            }

            // Fallback: Download the image
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `reach-call-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            console.log("[Screenshot] Downloaded image");
            return true;
        } catch (error) {
            console.error("[Screenshot] Error:", error);
            return false;
        }
    }, []);

    return {
        ...state,
        joinCall,
        leaveCall,
        toggleMute,
        toggleVideo,
        toggleScreenShare,
        takeScreenshot,
        formatDuration,
        setLocalVideoContainer,
        setRemoteVideoContainer,
        setScreenShareContainer,
        setLocalScreenShareContainer,
        isConfigured: isAgoraConfigured,
    };
}
