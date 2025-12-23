"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
    huddle01ProjectId,
    isHuddle01Configured,
    getHuddle01Token,
} from "@/config/huddle01";

export type CallState = "idle" | "joining" | "connected" | "leaving" | "error";
export type CallType = "audio" | "video";

export type Huddle01CallState = {
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
    roomId: string | null;
};

// Dynamic imports for Huddle01
let HuddleClient: typeof import("@huddle01/web-core").HuddleClient | null =
    null;
let sdkLoadPromise: Promise<void> | null = null;

// Helper to load SDK with promise tracking
async function loadHuddle01SDK(): Promise<void> {
    if (HuddleClient) return;

    if (!sdkLoadPromise) {
        sdkLoadPromise = import("@huddle01/web-core").then((module) => {
            HuddleClient = module.HuddleClient;
        });
    }

    return sdkLoadPromise;
}

// Helper to wait for SDK with timeout
async function waitForHuddle01SDK(timeoutMs: number = 5000): Promise<boolean> {
    const startTime = Date.now();

    // First trigger the load
    loadHuddle01SDK();

    // Then wait for it
    while (!HuddleClient && Date.now() - startTime < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return !!HuddleClient;
}

export function useHuddle01Call(userAddress: string | null) {
    const [state, setState] = useState<Huddle01CallState>({
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
        roomId: null,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientRef = useRef<any>(null);
    const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const startTimeRef = useRef<number | null>(null);
    const localVideoRef = useRef<HTMLDivElement | null>(null);
    const remoteVideoRef = useRef<HTMLDivElement | null>(null);
    const screenShareRef = useRef<HTMLDivElement | null>(null);
    const localAudioRef = useRef<HTMLAudioElement | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

    // Store pending tracks that couldn't be attached due to missing refs
    const pendingRemoteVideoTrackRef = useRef<MediaStreamTrack | null>(null);

    // Load Huddle01 SDK dynamically
    useEffect(() => {
        if (typeof window !== "undefined") {
            loadHuddle01SDK();
        }
    }, []);

    // Function to attach pending remote video track
    const attachPendingRemoteVideo = useCallback(() => {
        if (pendingRemoteVideoTrackRef.current && remoteVideoRef.current) {
            console.log("[Huddle01] Attaching pending remote video track");
            const stream = new MediaStream([
                pendingRemoteVideoTrackRef.current,
            ]);
            const videoEl = document.createElement("video");
            videoEl.srcObject = stream;
            videoEl.autoplay = true;
            videoEl.playsInline = true;
            videoEl.style.width = "100%";
            videoEl.style.height = "100%";
            videoEl.style.objectFit = "cover";
            videoEl.style.borderRadius = "12px";
            remoteVideoRef.current.innerHTML = "";
            remoteVideoRef.current.appendChild(videoEl);
            pendingRemoteVideoTrackRef.current = null;
            console.log(
                "[Huddle01] Remote video element created (from pending)"
            );
        }
    }, []);

    // Effect to retry attaching pending tracks when refs might be ready
    useEffect(() => {
        if (
            state.callState === "connected" &&
            pendingRemoteVideoTrackRef.current
        ) {
            // Try immediately and then every 500ms for a few seconds
            const tryAttach = () => {
                if (
                    pendingRemoteVideoTrackRef.current &&
                    remoteVideoRef.current
                ) {
                    attachPendingRemoteVideo();
                    return true;
                }
                return false;
            };

            // Try immediately
            if (tryAttach()) return;

            // Set up interval to retry
            const interval = setInterval(() => {
                if (tryAttach()) {
                    clearInterval(interval);
                }
            }, 200);

            // Clean up after 5 seconds max
            const timeout = setTimeout(() => {
                clearInterval(interval);
            }, 5000);

            return () => {
                clearInterval(interval);
                clearTimeout(timeout);
            };
        }
    }, [state.callState, attachPendingRemoteVideo]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (durationIntervalRef.current) {
                clearInterval(durationIntervalRef.current);
            }
            // Clear polling interval if it exists
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pollIntervalId = (clientRef.current as any)?.__pollIntervalId;
            if (pollIntervalId) {
                clearInterval(pollIntervalId);
            }
            // Clean up Huddle01 client if it exists
            if (clientRef.current) {
                try {
                    const roomState = clientRef.current.room?.state;
                    if (
                        roomState === "connected" ||
                        roomState === "connecting"
                    ) {
                        clientRef.current.leaveRoom().catch(() => {
                            // Ignore errors during cleanup
                        });
                    }
                } catch {
                    // Ignore errors during cleanup
                }
                clientRef.current = null;
            }
        };
    }, []);

    const startDurationTimer = useCallback(() => {
        // Clear any existing timer first to prevent duplicates
        if (durationIntervalRef.current) {
            clearInterval(durationIntervalRef.current);
        }
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
        console.log("[Huddle01] Duration timer started");
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
            _uid?: number,
            withVideo: boolean = false
        ): Promise<boolean> => {
            if (!isHuddle01Configured) {
                setState((prev) => ({
                    ...prev,
                    callState: "error",
                    error: "Huddle01 is not configured. Set NEXT_PUBLIC_HUDDLE01_PROJECT_ID and NEXT_PUBLIC_HUDDLE01_API_KEY.",
                }));
                return false;
            }

            // Wait for SDK to load (with 5 second timeout)
            if (!HuddleClient) {
                console.log("[Huddle01] SDK not loaded, waiting...");
                const loaded = await waitForHuddle01SDK(5000);
                if (!loaded) {
                    setState((prev) => ({
                        ...prev,
                        callState: "error",
                        error: "Huddle01 SDK failed to load. Please refresh the page.",
                    }));
                    return false;
                }
                console.log("[Huddle01] SDK loaded successfully");
            }

            if (!userAddress) {
                setState((prev) => ({
                    ...prev,
                    callState: "error",
                    error: "Wallet not connected",
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
                // Use the channel name directly as the room ID
                // The room should already be created by the caller
                const roomId = channelName;
                console.log("[Huddle01] Joining room:", roomId);

                // Get access token with timeout
                const tokenPromise = getHuddle01Token(roomId, userAddress);
                const timeoutPromise = new Promise<null>((_, reject) =>
                    setTimeout(
                        () => reject(new Error("Token request timed out")),
                        15000
                    )
                );

                const token = await Promise.race([
                    tokenPromise,
                    timeoutPromise,
                ]);
                if (!token) {
                    throw new Error(
                        "Huddle01 unavailable. Please disable decentralized calls in settings and use Agora instead."
                    );
                }

                console.log("[Huddle01] Token received, creating client...");

                // Create Huddle01 client (HuddleClient is guaranteed to be loaded at this point)
                if (!HuddleClient) {
                    throw new Error("Huddle01 SDK not available");
                }
                const client = new HuddleClient({
                    projectId: huddle01ProjectId,
                });
                clientRef.current = client;

                // Set up event handlers (using type assertion for SDK compatibility)
                const room = client.room as {
                    on: (
                        event: string,
                        callback: (...args: unknown[]) => void
                    ) => void;
                    state?: string;
                };

                room.on("room-joined", () => {
                    console.log("[Huddle01] Joined room successfully");
                    setState((prev) => ({ ...prev, callState: "connected" }));
                    startDurationTimer();

                    // Start polling for remote video - this handles the case where
                    // the other party enables video AFTER we join
                    // Poll every 1 second for 15 seconds
                    let pollCount = 0;
                    const maxPolls = 15;
                    const pollIntervalId = setInterval(() => {
                        pollCount++;

                        // Stop polling if we already have remote video
                        if (remoteVideoRef.current?.children.length) {
                            console.log(
                                "[Huddle01] Remote video found, stopping poll"
                            );
                            clearInterval(pollIntervalId);
                            return;
                        }

                        // Stop after max polls
                        if (pollCount > maxPolls) {
                            console.log(
                                "[Huddle01] Max polls reached, stopping"
                            );
                            clearInterval(pollIntervalId);
                            return;
                        }

                        console.log(
                            `[Huddle01] Polling for remote video (${pollCount}/${maxPolls})...`
                        );

                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const remotePeers = (client.room as any)?.remotePeers;
                        if (remotePeers && remotePeers.size > 0) {
                            for (const [peerId, peer] of remotePeers) {
                                // Check for video
                                try {
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    const videoConsumer = (
                                        peer as any
                                    ).getConsumer?.("video");
                                    if (
                                        videoConsumer?.track instanceof
                                        MediaStreamTrack
                                    ) {
                                        console.log(
                                            "[Huddle01] Found video from peer via polling:",
                                            peerId
                                        );

                                        if (
                                            remoteVideoRef.current &&
                                            remoteVideoRef.current.children
                                                .length === 0
                                        ) {
                                            const stream = new MediaStream([
                                                videoConsumer.track,
                                            ]);
                                            const videoEl =
                                                document.createElement("video");
                                            videoEl.srcObject = stream;
                                            videoEl.autoplay = true;
                                            videoEl.playsInline = true;
                                            videoEl.style.width = "100%";
                                            videoEl.style.height = "100%";
                                            videoEl.style.objectFit = "cover";
                                            videoEl.style.borderRadius = "12px";
                                            remoteVideoRef.current.appendChild(
                                                videoEl
                                            );
                                            setState((prev) => ({
                                                ...prev,
                                                isRemoteVideoOff: false,
                                            }));
                                            console.log(
                                                "[Huddle01] Remote video created via polling!"
                                            );
                                            clearInterval(pollIntervalId);
                                            return;
                                        } else if (!remoteVideoRef.current) {
                                            pendingRemoteVideoTrackRef.current =
                                                videoConsumer.track;
                                            setState((prev) => ({
                                                ...prev,
                                                isRemoteVideoOff: false,
                                            }));
                                            console.log(
                                                "[Huddle01] Stored pending video track from polling"
                                            );
                                        }
                                    }
                                } catch (e) {
                                    // Ignore
                                }

                                // Also check for audio if we don't have it
                                if (!remoteAudioRef.current) {
                                    try {
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        const audioConsumer = (
                                            peer as any
                                        ).getConsumer?.("audio");
                                        if (
                                            audioConsumer?.track instanceof
                                            MediaStreamTrack
                                        ) {
                                            console.log(
                                                "[Huddle01] Found audio from peer via polling"
                                            );
                                            const stream = new MediaStream([
                                                audioConsumer.track,
                                            ]);
                                            const audioEl =
                                                document.createElement("audio");
                                            audioEl.srcObject = stream;
                                            audioEl.autoplay = true;
                                            document.body.appendChild(audioEl);
                                            remoteAudioRef.current = audioEl;
                                            setState((prev) => ({
                                                ...prev,
                                                isRemoteMuted: false,
                                            }));
                                        }
                                    } catch (e) {
                                        // Ignore
                                    }
                                }
                            }
                        }
                    }, 1000); // Poll every 1 second

                    // Store interval ID for cleanup
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (clientRef.current as any).__pollIntervalId =
                        pollIntervalId;
                });

                room.on("room-closed", () => {
                    console.log("[Huddle01] Room closed");
                    stopDurationTimer();
                    // Clean up media elements
                    if (localVideoRef.current)
                        localVideoRef.current.innerHTML = "";
                    if (remoteVideoRef.current)
                        remoteVideoRef.current.innerHTML = "";
                    setState((prev) => ({ ...prev, callState: "idle" }));
                });

                room.on("peer-joined", (peer) => {
                    console.log("[Huddle01] Peer joined:", peer);
                    // When a new peer joins, check for their streams after a delay
                    // (they might have already enabled video before joining our room)
                    setTimeout(() => {
                        console.log(
                            "[Huddle01] Checking new peer for existing streams..."
                        );
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const peerData = peer as any;
                        const peerId = peerData?.peerId;
                        if (peerId) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const remotePeers = (client.room as any)
                                ?.remotePeers;
                            const remotePeer = remotePeers?.get(peerId);
                            if (remotePeer) {
                                // Check for audio
                                try {
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    const audioConsumer = (
                                        remotePeer as any
                                    ).getConsumer?.("audio");
                                    if (
                                        audioConsumer?.track instanceof
                                            MediaStreamTrack &&
                                        !remoteAudioRef.current
                                    ) {
                                        console.log(
                                            "[Huddle01] Found audio from newly joined peer"
                                        );
                                        const stream = new MediaStream([
                                            audioConsumer.track,
                                        ]);
                                        const audioEl =
                                            document.createElement("audio");
                                        audioEl.srcObject = stream;
                                        audioEl.autoplay = true;
                                        document.body.appendChild(audioEl);
                                        remoteAudioRef.current = audioEl;
                                        setState((prev) => ({
                                            ...prev,
                                            isRemoteMuted: false,
                                        }));
                                    }
                                } catch (e) {
                                    /* ignore */
                                }
                                // Check for video
                                try {
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    const videoConsumer = (
                                        remotePeer as any
                                    ).getConsumer?.("video");
                                    if (
                                        videoConsumer?.track instanceof
                                        MediaStreamTrack
                                    ) {
                                        console.log(
                                            "[Huddle01] Found video from newly joined peer"
                                        );
                                        if (remoteVideoRef.current) {
                                            // Only add if not already showing video
                                            if (
                                                remoteVideoRef.current.children
                                                    .length === 0
                                            ) {
                                                const stream = new MediaStream([
                                                    videoConsumer.track,
                                                ]);
                                                const videoEl =
                                                    document.createElement(
                                                        "video"
                                                    );
                                                videoEl.srcObject = stream;
                                                videoEl.autoplay = true;
                                                videoEl.playsInline = true;
                                                videoEl.style.width = "100%";
                                                videoEl.style.height = "100%";
                                                videoEl.style.objectFit =
                                                    "cover";
                                                videoEl.style.borderRadius =
                                                    "12px";
                                                remoteVideoRef.current.appendChild(
                                                    videoEl
                                                );
                                                setState((prev) => ({
                                                    ...prev,
                                                    isRemoteVideoOff: false,
                                                }));
                                                console.log(
                                                    "[Huddle01] Remote video created from peer-joined"
                                                );
                                            }
                                        } else {
                                            pendingRemoteVideoTrackRef.current =
                                                videoConsumer.track;
                                            setState((prev) => ({
                                                ...prev,
                                                isRemoteVideoOff: false,
                                            }));
                                        }
                                    }
                                } catch (e) {
                                    /* ignore */
                                }
                            }
                        }
                    }, 1000); // Give the peer time to start producing
                });

                room.on("peer-left", (peer) => {
                    console.log("[Huddle01] Peer left:", peer);
                    // Clean up remote media
                    if (remoteVideoRef.current)
                        remoteVideoRef.current.innerHTML = "";
                    if (remoteAudioRef.current) {
                        remoteAudioRef.current.srcObject = null;
                        remoteAudioRef.current = null;
                    }
                    setState((prev) => ({
                        ...prev,
                        isRemoteVideoOff: true,
                        isRemoteMuted: true,
                    }));
                });

                // Listen for local track production - SDK provides Producer object
                const localPeerEvents = client.localPeer as {
                    on: (
                        event: string,
                        callback: (...args: unknown[]) => void
                    ) => void;
                };

                localPeerEvents.on("stream-playable", (data: unknown) => {
                    console.log("[Huddle01] Local stream playable:", data);
                    try {
                        const streamData = data as {
                            label?: string;
                            producer?: { track?: MediaStreamTrack };
                        };

                        // Extract track from producer
                        const track = streamData.producer?.track;

                        if (
                            streamData.label === "video" &&
                            localVideoRef.current &&
                            track
                        ) {
                            // Check if we already have a local video element
                            const existingVideo = localVideoRef.current.querySelector("video");
                            if (existingVideo) {
                                // Update existing element's stream instead of creating new one
                                const stream = new MediaStream([track]);
                                existingVideo.srcObject = stream;
                                console.log("[Huddle01] Updated existing local video element");
                            } else {
                                const stream = new MediaStream([track]);
                                const videoEl = document.createElement("video");
                                videoEl.srcObject = stream;
                                videoEl.autoplay = true;
                                videoEl.playsInline = true;
                                videoEl.muted = true;
                                videoEl.style.width = "100%";
                                videoEl.style.height = "100%";
                                videoEl.style.objectFit = "cover";
                                videoEl.style.borderRadius = "12px";
                                videoEl.style.transform = "scaleX(-1)";
                                localVideoRef.current.innerHTML = "";
                                localVideoRef.current.appendChild(videoEl);
                                console.log("[Huddle01] Local video element created");
                            }
                        }
                    } catch (err) {
                        console.warn(
                            "[Huddle01] Could not handle local stream:",
                            err
                        );
                    }
                });

                // Listen for remote peers' streams
                room.on("stream-added", (data: unknown) => {
                    console.log(
                        "[Huddle01] Remote stream added - full data:",
                        JSON.stringify(
                            data,
                            (key, value) => {
                                if (value instanceof MediaStreamTrack)
                                    return `[MediaStreamTrack: ${value.kind}]`;
                                if (value instanceof MediaStream)
                                    return `[MediaStream]`;
                                if (typeof value === "function")
                                    return "[Function]";
                                return value;
                            },
                            2
                        )
                    );

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const streamData = data as any;
                    const label = streamData?.label;
                    const peerId = streamData?.peerId;

                    // Function to try getting and attaching the track
                    const tryAttachTrack = (attempt: number = 1) => {
                        console.log(
                            `[Huddle01] Trying to attach ${label} track, attempt ${attempt}`
                        );

                        try {
                            let track: MediaStreamTrack | null = null;

                            // Method 1: Direct track property
                            if (streamData?.track instanceof MediaStreamTrack) {
                                track = streamData.track;
                                console.log(
                                    "[Huddle01] Found track directly in event data"
                                );
                            }

                            // Method 2: Consumer track property
                            if (
                                !track &&
                                streamData?.consumer?.track instanceof
                                    MediaStreamTrack
                            ) {
                                track = streamData.consumer.track;
                                console.log(
                                    "[Huddle01] Found track in consumer"
                                );
                            }

                            // Method 3: MediaStream in event
                            if (
                                !track &&
                                streamData?.stream instanceof MediaStream
                            ) {
                                const tracks =
                                    label === "audio"
                                        ? streamData.stream.getAudioTracks()
                                        : streamData.stream.getVideoTracks();
                                if (tracks.length > 0) {
                                    track = tracks[0];
                                    console.log(
                                        "[Huddle01] Found track in stream"
                                    );
                                }
                            }

                            // Method 4: Look in remotePeers via getConsumer
                            if (!track && peerId) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const remotePeers = (client.room as any)
                                    ?.remotePeers;
                                if (remotePeers) {
                                    const peer = remotePeers.get(peerId);
                                    if (peer) {
                                        try {
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            const consumer = (
                                                peer as any
                                            ).getConsumer?.(label);
                                            if (
                                                consumer?.track instanceof
                                                MediaStreamTrack
                                            ) {
                                                track = consumer.track;
                                                console.log(
                                                    "[Huddle01] Found track via getConsumer"
                                                );
                                            }
                                        } catch (e) {
                                            /* ignore */
                                        }
                                    }
                                }
                            }

                            // If we found a track, attach it
                            if (track) {
                                const stream = new MediaStream([track]);

                                if (label === "audio") {
                                    if (remoteAudioRef.current) {
                                        // Update existing audio element
                                        remoteAudioRef.current.srcObject =
                                            stream;
                                        setState((prev) => ({
                                            ...prev,
                                            isRemoteMuted: false,
                                        }));
                                        console.log(
                                            "[Huddle01] Remote audio element UPDATED with new track"
                                        );
                                    } else {
                                        // Create new audio element
                                        const audioEl =
                                            document.createElement("audio");
                                        audioEl.srcObject = stream;
                                        audioEl.autoplay = true;
                                        document.body.appendChild(audioEl);
                                        remoteAudioRef.current = audioEl;
                                        setState((prev) => ({
                                            ...prev,
                                            isRemoteMuted: false,
                                        }));
                                        console.log(
                                            "[Huddle01] Remote audio element created"
                                        );
                                    }
                                    return true;
                                } else if (label === "video") {
                                    if (remoteVideoRef.current) {
                                        // Check if video element already exists
                                        const existingVideo =
                                            remoteVideoRef.current.querySelector(
                                                "video"
                                            );
                                        if (existingVideo) {
                                            // Update existing video element with new track
                                            existingVideo.srcObject = stream;
                                            setState((prev) => ({
                                                ...prev,
                                                isRemoteVideoOff: false,
                                            }));
                                            console.log(
                                                "[Huddle01] Remote video element UPDATED with new track"
                                            );
                                            return true;
                                        } else {
                                            // Create new video element
                                            const videoEl =
                                                document.createElement("video");
                                            videoEl.srcObject = stream;
                                            videoEl.autoplay = true;
                                            videoEl.playsInline = true;
                                            videoEl.style.width = "100%";
                                            videoEl.style.height = "100%";
                                            videoEl.style.objectFit = "cover";
                                            videoEl.style.borderRadius = "12px";
                                            remoteVideoRef.current.appendChild(
                                                videoEl
                                            );
                                            setState((prev) => ({
                                                ...prev,
                                                isRemoteVideoOff: false,
                                            }));
                                            console.log(
                                                "[Huddle01] Remote video element created"
                                            );
                                            return true;
                                        }
                                    } else {
                                        // Store for later
                                        pendingRemoteVideoTrackRef.current =
                                            track;
                                        setState((prev) => ({
                                            ...prev,
                                            isRemoteVideoOff: false,
                                        }));
                                        console.log(
                                            "[Huddle01] Stored pending video track"
                                        );
                                        return true;
                                    }
                                }
                                return true; // Track found, even if not attached
                            }

                            // Track not found - retry if we haven't tried too many times
                            if (attempt < 5) {
                                console.log(
                                    `[Huddle01] Track not found, will retry in ${
                                        attempt * 200
                                    }ms`
                                );
                                setTimeout(
                                    () => tryAttachTrack(attempt + 1),
                                    attempt * 200
                                );
                                return false;
                            } else {
                                console.warn(
                                    `[Huddle01] Could not find ${label} track after ${attempt} attempts`
                                );
                                return false;
                            }
                        } catch (err) {
                            console.warn(
                                "[Huddle01] Error attaching track:",
                                err
                            );
                            if (attempt < 5) {
                                setTimeout(
                                    () => tryAttachTrack(attempt + 1),
                                    attempt * 200
                                );
                            }
                            return false;
                        }
                    };

                    // Start trying to attach the track
                    tryAttachTrack(1);

                    // Update state regardless
                    if (label === "audio") {
                        setState((prev) => ({ ...prev, isRemoteMuted: false }));
                    } else if (label === "video") {
                        setState((prev) => ({
                            ...prev,
                            isRemoteVideoOff: false,
                        }));
                    }
                });

                // Also listen for new-consumer event on localPeer
                localPeerEvents.on("new-consumer", (data: unknown) => {
                    console.log("[Huddle01] New consumer event:", data);
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const consumerData = data as any;
                        const track =
                            consumerData?.track ||
                            consumerData?.consumer?.track;
                        const label = consumerData?.label || consumerData?.kind;

                        if (track instanceof MediaStreamTrack) {
                            const stream = new MediaStream([track]);

                            if (track.kind === "audio" || label === "audio") {
                                if (!remoteAudioRef.current) {
                                    const audioEl =
                                        document.createElement("audio");
                                    audioEl.srcObject = stream;
                                    audioEl.autoplay = true;
                                    document.body.appendChild(audioEl);
                                    remoteAudioRef.current = audioEl;
                                    setState((prev) => ({
                                        ...prev,
                                        isRemoteMuted: false,
                                    }));
                                    console.log(
                                        "[Huddle01] Remote audio element created via new-consumer"
                                    );
                                }
                            } else if (
                                track.kind === "video" ||
                                label === "video"
                            ) {
                                if (
                                    remoteVideoRef.current &&
                                    remoteVideoRef.current.children.length === 0
                                ) {
                                    const videoEl =
                                        document.createElement("video");
                                    videoEl.srcObject = stream;
                                    videoEl.autoplay = true;
                                    videoEl.playsInline = true;
                                    videoEl.style.width = "100%";
                                    videoEl.style.height = "100%";
                                    videoEl.style.objectFit = "cover";
                                    videoEl.style.borderRadius = "12px";
                                    remoteVideoRef.current.innerHTML = "";
                                    remoteVideoRef.current.appendChild(videoEl);
                                    setState((prev) => ({
                                        ...prev,
                                        isRemoteVideoOff: false,
                                    }));
                                    console.log(
                                        "[Huddle01] Remote video element created via new-consumer"
                                    );
                                }
                            }
                        }
                    } catch (err) {
                        console.warn(
                            "[Huddle01] Could not handle new-consumer:",
                            err
                        );
                    }
                });

                room.on("stream-removed", (data: unknown) => {
                    console.log("[Huddle01] Remote stream removed:", data);
                    try {
                        const streamData = data as {
                            peerId?: string;
                            label?: string;
                        };

                        if (
                            streamData.label === "audio" &&
                            remoteAudioRef.current
                        ) {
                            remoteAudioRef.current.srcObject = null;
                            remoteAudioRef.current.remove();
                            remoteAudioRef.current = null;
                            setState((prev) => ({
                                ...prev,
                                isRemoteMuted: true,
                            }));
                        } else if (
                            streamData.label === "video" &&
                            remoteVideoRef.current
                        ) {
                            remoteVideoRef.current.innerHTML = "";
                            setState((prev) => ({
                                ...prev,
                                isRemoteVideoOff: true,
                            }));
                        } else if (
                            streamData.label === "screen" &&
                            screenShareRef.current
                        ) {
                            screenShareRef.current.innerHTML = "";
                            setState((prev) => ({
                                ...prev,
                                isRemoteScreenSharing: false,
                            }));
                        }
                    } catch (err) {
                        console.warn(
                            "[Huddle01] Could not handle stream removal:",
                            err
                        );
                    }
                });

                // Join the room with timeout
                console.log("[Huddle01] Joining room...");
                const joinPromise = client.joinRoom({
                    roomId,
                    token,
                });
                const joinTimeoutPromise = new Promise((_, reject) =>
                    setTimeout(
                        () =>
                            reject(new Error("Join room timed out after 30s")),
                        30000
                    )
                );

                await Promise.race([joinPromise, joinTimeoutPromise]);
                console.log("[Huddle01] Join room completed");

                // Enable audio (using type assertion for SDK compatibility)
                const localPeer = client.localPeer as {
                    enableAudio: () => Promise<void>;
                    disableAudio: () => Promise<void>;
                    enableVideo: () => Promise<void>;
                    disableVideo: () => Promise<void>;
                    startScreenShare: () => Promise<void>;
                    stopScreenShare: () => Promise<void>;
                };

                try {
                    await localPeer.enableAudio();
                    console.log("[Huddle01] Audio enabled");
                } catch (audioError) {
                    console.warn(
                        "[Huddle01] Could not enable audio:",
                        audioError
                    );
                }

                // Enable video if requested
                if (withVideo) {
                    try {
                        await localPeer.enableVideo();
                        setState((prev) => ({ ...prev, isVideoOff: false }));
                        console.log("[Huddle01] Video enabled");
                    } catch (videoError) {
                        console.warn(
                            "[Huddle01] Could not enable video:",
                            videoError
                        );
                    }
                }

                // The room-joined event might not always fire, so ensure the timer is started here too
                // If it was already started by room-joined, starting again is fine (it will just restart)
                if (!startTimeRef.current) {
                    console.log("[Huddle01] Starting duration timer (fallback)");
                    startDurationTimer();
                }

                setState((prev) => ({
                    ...prev,
                    roomId,
                    callState: "connected",
                }));

                return true;
            } catch (error) {
                console.error("[Huddle01] Error joining call:", error);
                setState((prev) => ({
                    ...prev,
                    callState: "error",
                    error:
                        error instanceof Error
                            ? error.message
                            : "Failed to join call",
                }));
                return false;
            }
        },
        [userAddress, startDurationTimer, stopDurationTimer]
    );

    const leaveCall = useCallback(async () => {
        setState((prev) => ({ ...prev, callState: "leaving" }));
        stopDurationTimer();

        // Clear polling interval if it exists
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pollIntervalId = (clientRef.current as any)?.__pollIntervalId;
        if (pollIntervalId) {
            clearInterval(pollIntervalId);
        }

        try {
            if (clientRef.current) {
                // First, try to stop all local media tracks to release the microphone/camera
                // Only try to stop media if they were actually started
                // Check state to avoid "Cannot Find Producer" errors
                const localPeer = clientRef.current.localPeer;
                if (localPeer) {
                    console.log("[Huddle01] Stopping local media tracks...");
                    
                    // Only disable audio if not already muted (producer exists)
                    if (!state.isMuted) {
                        try {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            await (localPeer as any).disableAudio?.();
                        } catch (e) {
                            // Silently ignore - producer may not exist
                        }
                    }
                    
                    // Only disable video if it was enabled (producer exists)
                    if (!state.isVideoOff) {
                        try {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            await (localPeer as any).disableVideo?.();
                        } catch (e) {
                            // Silently ignore - producer may not exist
                        }
                    }
                    
                    // Only stop screen share if it was active
                    if (state.isScreenSharing) {
                        try {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            await (localPeer as any).stopScreenShare?.();
                        } catch (e) {
                            // Silently ignore - producer may not exist
                        }
                    }
                }

                // Check if the room is actually connected before trying to leave
                // Also check if socket is still open
                try {
                    const roomState = clientRef.current.room?.state;
                    const socketState = clientRef.current.socket?.state;

                    console.log(
                        "[Huddle01] Leave call - room state:",
                        roomState,
                        "socket state:",
                        socketState
                    );

                    // Only try to leave if room is in a good state
                    // Skip if socket is already closed or undefined (indicates already disconnected)
                    if (
                        (roomState === "connected" ||
                            roomState === "connecting") &&
                        socketState &&
                        socketState !== "closed"
                    ) {
                        await clientRef.current.leaveRoom();
                    } else {
                        console.log(
                            "[Huddle01] Skipping leaveRoom - already disconnected"
                        );
                    }
                } catch (leaveError) {
                    // Ignore errors when leaving - the socket might already be closed
                    // This is expected when the remote party ends the call first
                }
                clientRef.current = null;
            }
        } catch (error) {
            // Ignore all errors during cleanup
        } finally {
            // Clean up media elements and stop any remaining tracks
            if (localVideoRef.current) {
                // Stop tracks from video elements
                const videos = localVideoRef.current.querySelectorAll("video");
                videos.forEach((video) => {
                    const stream = video.srcObject as MediaStream;
                    if (stream) {
                        stream.getTracks().forEach((track) => {
                            track.stop();
                            console.log("[Huddle01] Stopped local video track:", track.kind);
                        });
                    }
                    video.srcObject = null;
                });
                localVideoRef.current.innerHTML = "";
            }
            if (remoteVideoRef.current) {
                const videos = remoteVideoRef.current.querySelectorAll("video");
                videos.forEach((video) => {
                    const stream = video.srcObject as MediaStream;
                    if (stream) {
                        stream.getTracks().forEach((track) => track.stop());
                    }
                    video.srcObject = null;
                });
                remoteVideoRef.current.innerHTML = "";
            }
            if (screenShareRef.current) {
                const videos = screenShareRef.current.querySelectorAll("video");
                videos.forEach((video) => {
                    const stream = video.srcObject as MediaStream;
                    if (stream) {
                        stream.getTracks().forEach((track) => track.stop());
                    }
                    video.srcObject = null;
                });
                screenShareRef.current.innerHTML = "";
            }
            if (remoteAudioRef.current) {
                const stream = remoteAudioRef.current.srcObject as MediaStream;
                if (stream) {
                    stream.getTracks().forEach((track) => track.stop());
                }
                remoteAudioRef.current.srcObject = null;
                remoteAudioRef.current.remove();
                remoteAudioRef.current = null;
            }

            // Always reset state
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
                roomId: null,
            });
        }
    }, [stopDurationTimer, state.isMuted, state.isVideoOff, state.isScreenSharing]);

    const toggleMute = useCallback(async () => {
        if (!clientRef.current) return;

        try {
            const localPeer = clientRef.current.localPeer as {
                enableAudio: () => Promise<void>;
                disableAudio: () => Promise<void>;
            };

            if (state.isMuted) {
                try {
                    await localPeer.enableAudio();
                } catch (enableErr) {
                    console.warn("[Huddle01] Could not enable audio:", enableErr);
                }
                setState((prev) => ({ ...prev, isMuted: false }));
            } else {
                try {
                    await localPeer.disableAudio();
                } catch (disableErr) {
                    console.warn("[Huddle01] Could not disable audio (may not be enabled):", disableErr);
                }
                setState((prev) => ({ ...prev, isMuted: true }));
            }
        } catch (error) {
            console.error("[Huddle01] Error toggling mute:", error);
        }
    }, [state.isMuted]);

    const toggleVideo = useCallback(async () => {
        if (!clientRef.current) return;

        try {
            const localPeer = clientRef.current.localPeer as {
                enableVideo: () => Promise<void>;
                disableVideo: () => Promise<void>;
            };

            if (state.isVideoOff) {
                await localPeer.enableVideo();
                setState((prev) => ({
                    ...prev,
                    isVideoOff: false,
                    callType: "video",
                }));
            } else {
                // Wrap in try/catch - disableVideo can fail if producer doesn't exist
                try {
                    await localPeer.disableVideo();
                } catch (disableErr) {
                    console.warn("[Huddle01] Could not disable video (may not be enabled):", disableErr);
                }
                // Always update state even if disable fails
                setState((prev) => ({ ...prev, isVideoOff: true }));
                
                // Also clean up the local video element
                if (localVideoRef.current) {
                    const videos = localVideoRef.current.querySelectorAll("video");
                    videos.forEach((video) => {
                        const stream = video.srcObject as MediaStream;
                        if (stream) {
                            stream.getTracks().forEach((track) => {
                                if (track.kind === "video") {
                                    track.stop();
                                }
                            });
                        }
                    });
                    localVideoRef.current.innerHTML = "";
                }
            }
        } catch (error) {
            console.error("[Huddle01] Error toggling video:", error);
        }
    }, [state.isVideoOff]);

    const toggleScreenShare = useCallback(async () => {
        if (!clientRef.current) return;

        try {
            const localPeer = clientRef.current.localPeer as {
                startScreenShare: () => Promise<void>;
                stopScreenShare: () => Promise<void>;
            };

            if (state.isScreenSharing) {
                try {
                    await localPeer.stopScreenShare();
                } catch (stopErr) {
                    console.warn("[Huddle01] Could not stop screen share:", stopErr);
                }
                setState((prev) => ({ ...prev, isScreenSharing: false }));
                
                // Clean up screen share element
                if (screenShareRef.current) {
                    const videos = screenShareRef.current.querySelectorAll("video");
                    videos.forEach((video) => {
                        const stream = video.srcObject as MediaStream;
                        if (stream) {
                            stream.getTracks().forEach((track) => track.stop());
                        }
                    });
                    screenShareRef.current.innerHTML = "";
                }
            } else {
                await localPeer.startScreenShare();
                setState((prev) => ({
                    ...prev,
                    isScreenSharing: true,
                    callType: "video",
                }));
            }
        } catch (error) {
            console.error("[Huddle01] Error toggling screen share:", error);
        }
    }, [state.isScreenSharing]);

    const formatDuration = useCallback((seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, "0")}:${secs
            .toString()
            .padStart(2, "0")}`;
    }, []);

    const setLocalVideoContainer = useCallback(
        (element: HTMLDivElement | null) => {
            localVideoRef.current = element;
        },
        []
    );

    const setRemoteVideoContainer = useCallback(
        (element: HTMLDivElement | null) => {
            remoteVideoRef.current = element;
        },
        []
    );

    const setScreenShareContainer = useCallback(
        (element: HTMLDivElement | null) => {
            screenShareRef.current = element;
        },
        []
    );

    const takeScreenshot = useCallback(async (): Promise<boolean> => {
        // Screenshot implementation similar to Agora
        console.log("[Huddle01] Screenshot not yet implemented");
        return false;
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
        isConfigured: isHuddle01Configured,
    };
}
