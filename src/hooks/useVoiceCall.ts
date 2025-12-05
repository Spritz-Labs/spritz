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
    isRemoteMuted: boolean;
    isRemoteVideoOff: boolean;
    error: string | null;
    duration: number;
};

export function useVoiceCall() {
    const [state, setState] = useState<VoiceCallState>({
        callState: "idle",
        callType: "audio",
        isMuted: false,
        isVideoOff: true,
        isRemoteMuted: false,
        isRemoteVideoOff: true,
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
    const remoteAudioTrackRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const remoteVideoTrackRef = useRef<any>(null);
    const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const startTimeRef = useRef<number | null>(null);

    // Refs for video elements
    const localVideoRef = useRef<HTMLDivElement | null>(null);
    const remoteVideoRef = useRef<HTMLDivElement | null>(null);

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

                setState((prev) => ({ ...prev, callState: "connected" }));
                startDurationTimer();

                return true;
            } catch (error) {
                let message =
                    error instanceof Error
                        ? error.message
                        : "Failed to join call";

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

            // Leave channel and destroy client
            if (clientRef.current) {
                await clientRef.current.leave();
                clientRef.current = null;
            }

            remoteAudioTrackRef.current = null;
            remoteVideoTrackRef.current = null;

            setState({
                callState: "idle",
                callType: "audio",
                isMuted: false,
                isVideoOff: true,
                isRemoteMuted: false,
                isRemoteVideoOff: true,
                error: null,
                duration: 0,
            });
        } catch (error) {
            console.error("Error leaving call:", error);
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

    const toggleVideo = useCallback(async () => {
        if (!AgoraRTC || !clientRef.current) return;

        const newVideoOffState = !state.isVideoOff;

        if (newVideoOffState) {
            // Turn off video
            if (localVideoTrackRef.current) {
                await clientRef.current.unpublish([localVideoTrackRef.current]);
                localVideoTrackRef.current.stop();
                localVideoTrackRef.current.close();
                localVideoTrackRef.current = null;
            }
            setState((prev) => ({ ...prev, isVideoOff: true }));
        } else {
            // Turn on video
            try {
                const localVideoTrack = await AgoraRTC.createCameraVideoTrack();
                localVideoTrackRef.current = localVideoTrack;
                await clientRef.current.publish([localVideoTrack]);

                // Update state to video call mode and video on
                setState((prev) => ({
                    ...prev,
                    isVideoOff: false,
                    callType: "video", // Switch to video call layout
                }));

                // Play local video (with retry if container not ready yet)
                const playLocalVideo = () => {
                    if (localVideoRef.current && localVideoTrackRef.current) {
                        localVideoTrackRef.current.play(localVideoRef.current);
                    } else if (localVideoTrackRef.current) {
                        // Container might not be ready yet after layout switch
                        setTimeout(playLocalVideo, 100);
                    }
                };
                playLocalVideo();
            } catch (error) {
                console.error("Error enabling video:", error);
                return; // Don't update state if failed
            }
        }
    }, [state.isVideoOff]);

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

    return {
        ...state,
        joinCall,
        leaveCall,
        toggleMute,
        toggleVideo,
        formatDuration,
        setLocalVideoContainer,
        setRemoteVideoContainer,
        isConfigured: isAgoraConfigured,
    };
}
