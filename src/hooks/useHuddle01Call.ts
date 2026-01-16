"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
    huddle01ProjectId,
    isHuddle01Configured,
    getHuddle01Token,
} from "@/config/huddle01";
import { createLogger } from "@/lib/logger";

const log = createLogger("Huddle01");

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

// Force reload the SDK (clears any internal singleton state)
async function forceReloadHuddle01SDK(): Promise<void> {
    log.debug("[Huddle01] Force reloading SDK module...");
    HuddleClient = null;
    sdkLoadPromise = null;

    // Re-import fresh
    sdkLoadPromise = import("@huddle01/web-core").then((module) => {
        HuddleClient = module.HuddleClient;
        log.debug("[Huddle01] SDK module reloaded");
    });

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
    const screenShareRef = useRef<HTMLDivElement | null>(null); // For remote screen share display
    const localScreenShareRef = useRef<HTMLDivElement | null>(null); // For local screen share preview
    const localAudioRef = useRef<HTMLAudioElement | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

    // Guard against concurrent join attempts (React Strict Mode can cause duplicates)
    const isJoiningRef = useRef<boolean>(false);
    const currentRoomIdRef = useRef<string | null>(null);

    // Store pending tracks that couldn't be attached due to missing refs
    const pendingRemoteVideoTrackRef = useRef<MediaStreamTrack | null>(null);

    // Store polling interval for cleanup
    const pollIntervalIdRef = useRef<NodeJS.Timeout | null>(null);

    // Guard against processing streams after leaving call
    const isLeavingRef = useRef<boolean>(false);

    // Track video elements per peer for group calls (to avoid overwriting)
    const peerVideoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
    
    // Helper to add/update remote video for a specific peer (supports multiple peers)
    const addRemoteVideoForPeer = useCallback((peerId: string, track: MediaStreamTrack) => {
        if (!remoteVideoRef.current) {
            console.log(`[Huddle01] No remote video container, storing pending track for ${peerId}`);
            pendingRemoteVideoTrackRef.current = track;
            return;
        }

        // Check if we already have a video element for this peer
        let videoEl = peerVideoElementsRef.current.get(peerId);
        
        if (videoEl) {
            // Update existing element's stream
            console.log(`[Huddle01] Updating existing video element for peer ${peerId}`);
            const stream = new MediaStream([track]);
            videoEl.srcObject = stream;
            videoEl.play().catch((e) => console.warn("[Huddle01] Video play failed:", e));
        } else {
            // Create new video element for this peer
            console.log(`[Huddle01] Creating new video element for peer ${peerId}`);
            const stream = new MediaStream([track]);
            videoEl = document.createElement("video");
            videoEl.srcObject = stream;
            videoEl.autoplay = true;
            videoEl.playsInline = true;
            videoEl.setAttribute("webkit-playsinline", "true");
            videoEl.muted = false;
            videoEl.dataset.peerId = peerId; // Track which peer this belongs to
            videoEl.style.width = "100%";
            videoEl.style.height = "100%";
            videoEl.style.objectFit = "cover";
            videoEl.style.borderRadius = "12px";
            
            // For group calls, add as additional element (don't clear others)
            remoteVideoRef.current.appendChild(videoEl);
            peerVideoElementsRef.current.set(peerId, videoEl);
            
            videoEl.play().catch((e) => console.warn("[Huddle01] Video play failed:", e));
            console.log(`[Huddle01] Remote video element created for peer ${peerId}`);
        }
        
        setState((prev) => ({ ...prev, isRemoteVideoOff: false }));
    }, []);

    // Helper to remove video element for a peer
    const removeRemoteVideoForPeer = useCallback((peerId: string) => {
        const videoEl = peerVideoElementsRef.current.get(peerId);
        if (videoEl) {
            const stream = videoEl.srcObject as MediaStream;
            if (stream) {
                stream.getTracks().forEach((t) => t.stop());
            }
            videoEl.srcObject = null;
            videoEl.remove();
            peerVideoElementsRef.current.delete(peerId);
            console.log(`[Huddle01] Removed tracked video element for peer ${peerId}`);
        } else {
            // Fallback for videos not tracked in map (backward compatibility with 1-on-1 calls)
            // Try to find by data attribute or just clear all if only one video
            if (remoteVideoRef.current) {
                const videoByAttr = remoteVideoRef.current.querySelector(`video[data-peer-id="${peerId}"]`);
                if (videoByAttr) {
                    const stream = (videoByAttr as HTMLVideoElement).srcObject as MediaStream;
                    if (stream) {
                        stream.getTracks().forEach((t) => t.stop());
                    }
                    (videoByAttr as HTMLVideoElement).srcObject = null;
                    videoByAttr.remove();
                    console.log(`[Huddle01] Removed video by data-peer-id for ${peerId}`);
                } else {
                    // Last resort: if there's only one video, it must be the leaving peer's
                    const allVideos = remoteVideoRef.current.querySelectorAll("video");
                    if (allVideos.length === 1) {
                        const video = allVideos[0] as HTMLVideoElement;
                        const stream = video.srcObject as MediaStream;
                        if (stream) {
                            stream.getTracks().forEach((t) => t.stop());
                        }
                        video.srcObject = null;
                        video.remove();
                        console.log(`[Huddle01] Removed single video element (1-on-1 call cleanup)`);
                    }
                }
            }
        }
        
        // Update state if no more remote videos
        const remainingVideos = remoteVideoRef.current?.querySelectorAll("video").length || 0;
        if (peerVideoElementsRef.current.size === 0 && remainingVideos === 0) {
            setState((prev) => ({ ...prev, isRemoteVideoOff: true }));
        }
    }, []);

    // Load Huddle01 SDK dynamically
    useEffect(() => {
        if (typeof window !== "undefined") {
            loadHuddle01SDK();
        }
    }, []);

    // Function to attach pending remote video track
    const attachPendingRemoteVideo = useCallback(() => {
        if (pendingRemoteVideoTrackRef.current && remoteVideoRef.current) {
            log.debug("[Huddle01] Attaching pending remote video track");
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
            // Don't clear innerHTML - preserve other peer videos in group calls
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
            if (pollIntervalIdRef.current) {
                clearInterval(pollIntervalIdRef.current);
                pollIntervalIdRef.current = null;
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
        log.debug("[Huddle01] Duration timer started");
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
            // Generate unique call ID for logging this entire call attempt
            const callId = `${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 6)}`;
            console.log(
                `\n[Huddle01][${callId}] ============ NEW CALL ATTEMPT ============`
            );
            console.log(`[Huddle01][${callId}] Room: ${channelName}`);
            console.log(`[Huddle01][${callId}] Video: ${withVideo}`);
            console.log(
                `[Huddle01][${callId}] clientRef exists: ${!!clientRef.current}`
            );
            console.log(
                `[Huddle01][${callId}] Current call state: ${state.callState}`
            );
            console.log(
                `[Huddle01][${callId}] isJoiningRef: ${isJoiningRef.current}`
            );
            console.log(
                `[Huddle01][${callId}] currentRoomIdRef: ${currentRoomIdRef.current}`
            );

            // Guard against concurrent join attempts (React Strict Mode causes duplicates)
            if (isJoiningRef.current) {
                console.warn(
                    `[Huddle01][${callId}] Already joining a call, ignoring duplicate request`
                );
                return false;
            }

            // If already in a room, skip
            if (currentRoomIdRef.current === channelName && clientRef.current) {
                console.warn(
                    `[Huddle01][${callId}] Already in this room, ignoring duplicate request`
                );
                return true;
            }

            // Set the joining flag
            isJoiningRef.current = true;

            if (!isHuddle01Configured) {
                isJoiningRef.current = false;
                setState((prev) => ({
                    ...prev,
                    callState: "error",
                    error: "Huddle01 is not configured. Set NEXT_PUBLIC_HUDDLE01_PROJECT_ID and NEXT_PUBLIC_HUDDLE01_API_KEY.",
                }));
                return false;
            }

            // Wait for SDK to load (with 5 second timeout)
            if (!HuddleClient) {
                log.debug("[Huddle01] SDK not loaded, waiting...");
                const loaded = await waitForHuddle01SDK(5000);
                if (!loaded) {
                    isJoiningRef.current = false;
                    setState((prev) => ({
                        ...prev,
                        callState: "error",
                        error: "Huddle01 SDK failed to load. Please refresh the page.",
                    }));
                    return false;
                }
                log.debug("[Huddle01] SDK loaded successfully");
            }

            if (!userAddress) {
                isJoiningRef.current = false;
                setState((prev) => ({
                    ...prev,
                    callState: "error",
                    error: "Wallet not connected",
                }));
                return false;
            }

            // THOROUGH cleanup of any existing client from a previous call
            log.debug("[Huddle01] Starting pre-call cleanup...");

            // Clear any existing polling intervals (stored in our ref)
            if (pollIntervalIdRef.current) {
                clearInterval(pollIntervalIdRef.current);
                pollIntervalIdRef.current = null;
                log.debug("[Huddle01] Cleared existing poll interval");
            }

            // Clean up existing client - MUST be thorough to avoid state pollution
            if (clientRef.current) {
                console.log(
                    "[Huddle01] Cleaning up existing client before new call..."
                );
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const clientAny = clientRef.current as any;

                    // Try to disable media first
                    const oldLocalPeer = clientRef.current.localPeer;
                    if (oldLocalPeer) {
                        try {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            await (oldLocalPeer as any).disableAudio?.();
                        } catch {
                            /* ignore */
                        }
                        try {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            await (oldLocalPeer as any).disableVideo?.();
                        } catch {
                            /* ignore */
                        }
                    }

                    // Leave the room
                    try {
                        await clientRef.current.leaveRoom();
                        log.debug("[Huddle01] Pre-call: leaveRoom completed");
                    } catch (leaveErr) {
                        console.log(
                            "[Huddle01] Pre-call: leaveRoom error (continuing):",
                            leaveErr
                        );
                    }

                    // Close sockets
                    try {
                        if (clientAny._socket?.close) clientAny._socket.close();
                        if (clientAny.socket?.close) clientAny.socket.close();
                    } catch {
                        /* ignore */
                    }

                    // Close transports
                    try {
                        if (clientAny._sendTransport?.close)
                            clientAny._sendTransport.close();
                        if (clientAny._recvTransport?.close)
                            clientAny._recvTransport.close();
                    } catch {
                        /* ignore */
                    }
                } catch (e) {
                    log.debug("[Huddle01] Cleanup error (expected):", e);
                }
                clientRef.current = null;

                // Wait a bit for the old client to fully disconnect
                console.log(
                    "[Huddle01] Waiting 500ms for old client to fully disconnect..."
                );
                await new Promise((resolve) => setTimeout(resolve, 500));
            }

            // Clean up local video elements
            if (localVideoRef.current) {
                const videos = localVideoRef.current.querySelectorAll("video");
                videos.forEach((video) => {
                    const stream = video.srcObject as MediaStream;
                    if (stream) {
                        stream.getTracks().forEach((track) => track.stop());
                    }
                    video.srcObject = null;
                });
                localVideoRef.current.innerHTML = "";
                log.debug("[Huddle01] Cleared local video elements");
            }

            // Clean up remote video elements
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
                // Clear the peer video elements map
                peerVideoElementsRef.current.clear();
                log.debug("[Huddle01] Cleared remote video elements");
            }

            // Clean up remote audio elements
            if (remoteAudioRef.current) {
                const stream = remoteAudioRef.current.srcObject as MediaStream;
                if (stream) {
                    stream.getTracks().forEach((track) => track.stop());
                }
                remoteAudioRef.current.srcObject = null;
                remoteAudioRef.current.remove();
                remoteAudioRef.current = null;
                log.debug("[Huddle01] Cleared remote audio element");
            }

            // Clean up ALL orphaned audio elements in document.body from previous calls
            const orphanedAudio = document.body.querySelectorAll("audio");
            orphanedAudio.forEach((audioEl) => {
                const stream = audioEl.srcObject as MediaStream;
                if (stream) {
                    stream.getTracks().forEach((track) => track.stop());
                }
                audioEl.srcObject = null;
                audioEl.remove();
            });
            if (orphanedAudio.length > 0) {
                console.log(
                    `[Huddle01] Pre-call cleanup: removed ${orphanedAudio.length} orphaned audio elements`
                );
            }

            // Clear pending track
            pendingRemoteVideoTrackRef.current = null;

            // Force release ALL media devices - this is crucial for switching calls
            // The browser can cache media streams which prevents new calls from working
            log.debug("[Huddle01] Force releasing all media devices...");
            try {
                // Get all active media streams and stop them
                const mediaDevices =
                    await navigator.mediaDevices.enumerateDevices();
                log.debug("[Huddle01] Found devices:", mediaDevices.length);

                // Try to get and immediately release a stream to clear any cached state
                try {
                    const tempStream =
                        await navigator.mediaDevices.getUserMedia({
                            audio: true,
                            video: true,
                        });
                    tempStream.getTracks().forEach((track) => {
                        track.stop();
                        console.log(
                            "[Huddle01] Force-stopped track:",
                            track.kind,
                            track.label
                        );
                    });
                } catch (e) {
                    // Might fail if permissions denied, that's ok
                    console.log(
                        "[Huddle01] Could not get temp stream (expected if no permissions):",
                        e
                    );
                }
            } catch (e) {
                log.debug("[Huddle01] Device enumeration failed:", e);
            }

            // Longer delay to let the SDK fully reset (important for calling different people)
            console.log(
                "[Huddle01] Waiting 1500ms for SDK and browser to fully reset..."
            );
            await new Promise((resolve) => setTimeout(resolve, 1500));

            // Double-check that client is truly null
            if (clientRef.current) {
                console.warn(
                    "[Huddle01] Client still exists after cleanup, forcing null"
                );
                clientRef.current = null;
            }

            // Force reload the SDK module to clear any internal singleton state
            // This is the nuclear option but ensures clean state for new calls
            await forceReloadHuddle01SDK();

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
                console.log(
                    "[Huddle01] Joining room:",
                    roomId,
                    "- clientRef was:",
                    clientRef.current ? "NOT null (cleaned up)" : "null"
                );

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

                log.debug("[Huddle01] Token received for room:", roomId);
                console.log(
                    "[Huddle01] Creating fresh Huddle01 client instance..."
                );

                // Detect mobile/iOS
                const isMobile = /iPhone|iPad|iPod|Android/i.test(
                    navigator.userAgent
                );
                const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
                console.log(
                    "[Huddle01] Device detection - isMobile:",
                    isMobile,
                    "isIOS:",
                    isIOS
                );

                // Pre-request permissions for iOS Safari
                // This helps iOS properly prompt for permissions before the SDK tries to use them
                let permissionGranted = false;
                try {
                    console.log(
                        "[Huddle01] Pre-requesting media permissions..."
                    );

                    // Check if mediaDevices is available
                    if (
                        !navigator.mediaDevices ||
                        !navigator.mediaDevices.getUserMedia
                    ) {
                        console.error(
                            "[Huddle01] mediaDevices not available - HTTPS required"
                        );
                        throw new Error(
                            "Camera/microphone access requires HTTPS"
                        );
                    }

                    const mediaConstraints: MediaStreamConstraints = {
                        audio: true,
                        video: withVideo
                            ? {
                                  facingMode: "user", // Front camera on mobile
                                  width: { ideal: 640 },
                                  height: { ideal: 480 },
                              }
                            : false,
                    };

                    console.log(
                        "[Huddle01] Requesting with constraints:",
                        JSON.stringify(mediaConstraints)
                    );

                    const preStream = await navigator.mediaDevices.getUserMedia(
                        mediaConstraints
                    );

                    // Log what tracks we got
                    const tracks = preStream.getTracks();
                    console.log(
                        "[Huddle01] Got tracks:",
                        tracks.map((t) => ({
                            kind: t.kind,
                            label: t.label,
                            enabled: t.enabled,
                        }))
                    );

                    // Stop the tracks immediately - we just needed to prompt for permission
                    tracks.forEach((track) => track.stop());
                    permissionGranted = true;
                    log.debug("[Huddle01] Media permissions granted");
                } catch (permError) {
                    console.error(
                        "[Huddle01] Could not get media permissions:",
                        permError
                    );
                    // On mobile, this is more critical - show the actual error
                    if (isMobile) {
                        console.error(
                            "[Huddle01] Mobile permission error - user may need to allow camera/microphone access"
                        );
                    }
                }

                // Create Huddle01 client (HuddleClient is guaranteed to be loaded at this point)
                if (!HuddleClient) {
                    throw new Error("Huddle01 SDK not available");
                }
                const client = new HuddleClient({
                    projectId: huddle01ProjectId,
                });
                clientRef.current = client;

                // Helper to get remote peer streams using the official API
                const getRemotePeerStreams = (peerId: string) => {
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const roomAny = client.room as any;

                        // Try the official API first: getRemotePeerById
                        const remotePeer = roomAny.getRemotePeerById?.(peerId);
                        if (remotePeer) {
                            console.log(
                                `[Huddle01] Got remote peer via getRemotePeerById: ${peerId}`
                            );
                            const audioTrack =
                                remotePeer.getConsumer?.("audio")?.track;
                            const videoTrack =
                                remotePeer.getConsumer?.("video")?.track;
                            return { audioTrack, videoTrack, peer: remotePeer };
                        }

                        // Fallback: try remotePeers Map
                        const remotePeers = roomAny.remotePeers;
                        if (remotePeers) {
                            const peer = remotePeers.get(peerId);
                            if (peer) {
                                console.log(
                                    `[Huddle01] Got remote peer via remotePeers Map: ${peerId}`
                                );
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const peerAny = peer as any;
                                const audioTrack =
                                    peerAny.getConsumer?.("audio")?.track;
                                const videoTrack =
                                    peerAny.getConsumer?.("video")?.track;
                                return { audioTrack, videoTrack, peer };
                            }
                        }

                        console.log(
                            `[Huddle01] Could not find remote peer: ${peerId}`
                        );
                        return {
                            audioTrack: null,
                            videoTrack: null,
                            peer: null,
                        };
                    } catch (err) {
                        console.log(
                            "[Huddle01] Error getting remote peer streams:",
                            err
                        );
                        return {
                            audioTrack: null,
                            videoTrack: null,
                            peer: null,
                        };
                    }
                };

                // Helper to check and log remote peer's producer state
                const logRemotePeerState = (peerId: string) => {
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const roomAny = client.room as any;
                        const remotePeer =
                            roomAny.getRemotePeerById?.(peerId) ||
                            roomAny.remotePeers?.get(peerId);

                        if (remotePeer) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const peerAny = remotePeer as any;

                            // Log all properties for debugging
                            console.log(
                                `[Huddle01] Remote peer ${peerId} detailed state:`,
                                {
                                    // Basic info
                                    peerId: peerAny.peerId,
                                    role: peerAny.role,
                                    metadata: peerAny.metadata,

                                    // Producer info
                                    producersMap: peerAny.producers,
                                    producersSize: peerAny.producers?.size,
                                    hasAudioProducer:
                                        peerAny.producers?.has?.("audio"),
                                    hasVideoProducer:
                                        peerAny.producers?.has?.("video"),

                                    // Consumer info
                                    consumersMap: peerAny.consumers,
                                    consumersSize: peerAny.consumers?.size,
                                    audioConsumer:
                                        peerAny.getConsumer?.("audio"),
                                    videoConsumer:
                                        peerAny.getConsumer?.("video"),

                                    // Available keys
                                    keys: Object.keys(peerAny),
                                }
                            );
                        } else {
                            console.log(
                                `[Huddle01] Remote peer ${peerId} not found`
                            );
                        }
                    } catch (err) {
                        console.log(
                            "[Huddle01] Error logging remote peer state:",
                            err
                        );
                    }
                };

                // Set up event handlers (using type assertion for SDK compatibility)
                const room = client.room as {
                    on: (
                        event: string,
                        callback: (...args: unknown[]) => void
                    ) => void;
                    state?: string;
                };

                room.on("room-joined", () => {
                    log.debug("[Huddle01] Joined room successfully");
                    currentRoomIdRef.current = roomId;
                    isJoiningRef.current = false; // Clear joining flag on success
                    setState((prev) => ({
                        ...prev,
                        callState: "connected",
                        roomId,
                    }));
                    startDurationTimer();

                    // Start polling for remote streams - this handles the case where
                    // the other party enables audio/video AFTER we join
                    // On mobile, poll more frequently and for longer
                    const isMobilePolling = /iPhone|iPad|iPod|Android/i.test(
                        navigator.userAgent
                    );
                    let pollCount = 0;
                    const maxPolls = isMobilePolling ? 30 : 15; // 30 seconds on mobile, 15 on desktop
                    const pollInterval = isMobilePolling ? 1000 : 1000; // 1 second

                    console.log(
                        `[Huddle01] Starting polling (mobile: ${isMobilePolling}, maxPolls: ${maxPolls})`
                    );

                    // Clear any existing poll interval first
                    if (pollIntervalIdRef.current) {
                        clearInterval(pollIntervalIdRef.current);
                    }

                    pollIntervalIdRef.current = setInterval(() => {
                        pollCount++;

                        // Guard: Don't process if we're leaving the call
                        if (isLeavingRef.current) {
                            console.log(
                                "[Huddle01] Poll: Stopping - call is ending"
                            );
                            if (pollIntervalIdRef.current) {
                                clearInterval(pollIntervalIdRef.current);
                                pollIntervalIdRef.current = null;
                            }
                            return;
                        }

                        // Only stop polling if we have BOTH remote video AND audio
                        const hasRemoteVideo =
                            (remoteVideoRef.current?.children?.length ?? 0) > 0;
                        const hasRemoteAudio = remoteAudioRef.current !== null;

                        if (hasRemoteVideo && hasRemoteAudio) {
                            console.log(
                                "[Huddle01] Remote video AND audio found, stopping poll"
                            );
                            if (pollIntervalIdRef.current) {
                                clearInterval(pollIntervalIdRef.current);
                                pollIntervalIdRef.current = null;
                            }
                            return;
                        }

                        // Stop after max polls
                        if (pollCount > maxPolls) {
                            console.log(
                                `[Huddle01] Max polls (${maxPolls}) reached, stopping. hasVideo: ${hasRemoteVideo}, hasAudio: ${hasRemoteAudio}`
                            );
                            if (pollIntervalIdRef.current) {
                                clearInterval(pollIntervalIdRef.current);
                                pollIntervalIdRef.current = null;
                            }
                            return;
                        }

                        console.log(
                            `[Huddle01] Polling for remote streams (${pollCount}/${maxPolls})... hasVideo: ${hasRemoteVideo}, hasAudio: ${hasRemoteAudio}`
                        );

                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const remotePeers = (client.room as any)?.remotePeers;
                        if (remotePeers && remotePeers.size > 0) {
                            console.log(
                                `[Huddle01] Found ${remotePeers.size} remote peer(s)`
                            );
                            for (const [peerId, peer] of remotePeers) {
                                console.log(
                                    `[Huddle01] Checking peer: ${peerId}`
                                );

                                // If we don't have remote audio/video yet, log the peer state for debugging
                                if (
                                    !remoteAudioRef.current ||
                                    (remoteVideoRef.current?.children?.length ??
                                        0) === 0
                                ) {
                                    // Log detailed peer state for debugging
                                    if (pollCount <= 5) {
                                        console.log(
                                            `[Huddle01] Checking peer ${peerId} for streams...`
                                        );
                                        logRemotePeerState(peerId);
                                    }
                                }

                                // Check for audio FIRST (more important)
                                try {
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    const audioConsumer = (
                                        peer as any
                                    ).getConsumer?.("audio");
                                    if (
                                        audioConsumer?.track instanceof
                                            MediaStreamTrack &&
                                        !remoteAudioRef.current
                                    ) {
                                        console.log(
                                            "[Huddle01] Found AUDIO from peer via polling:",
                                            peerId
                                        );
                                        const audioStream = new MediaStream([
                                            audioConsumer.track,
                                        ]);
                                        const audioEl =
                                            document.createElement("audio");
                                        audioEl.srcObject = audioStream;
                                        audioEl.autoplay = true;
                                        // iOS-specific attributes
                                        audioEl.setAttribute(
                                            "playsinline",
                                            "true"
                                        );
                                        audioEl.setAttribute(
                                            "webkit-playsinline",
                                            "true"
                                        );
                                        document.body.appendChild(audioEl);
                                        remoteAudioRef.current = audioEl;
                                        // iOS requires explicit play() call
                                        audioEl.play().catch((e) => {
                                            console.warn(
                                                "[Huddle01] Audio play failed via polling:",
                                                e
                                            );
                                        });
                                        setState((prev) => ({
                                            ...prev,
                                            isRemoteMuted: false,
                                        }));
                                        console.log(
                                            "[Huddle01] Remote AUDIO created via polling!"
                                        );
                                    }
                                } catch (audioErr) {
                                    console.log(
                                        "[Huddle01] Audio consumer check failed:",
                                        audioErr
                                    );
                                }

                                // Check for video
                                try {
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    const peerAny = peer as any;

                                    // Log what methods/properties are available on peer
                                    if (pollCount === 1 || pollCount === 5) {
                                        console.log(
                                            "[Huddle01] Peer inspection:",
                                            {
                                                peerId,
                                                hasGetConsumer:
                                                    typeof peerAny.getConsumer ===
                                                    "function",
                                                consumers: peerAny.consumers,
                                                producers: peerAny.producers,
                                                // Try to list available methods
                                                methods: Object.keys(
                                                    peerAny
                                                ).filter(
                                                    (k) =>
                                                        typeof peerAny[k] ===
                                                        "function"
                                                ),
                                            }
                                        );
                                    }

                                    const videoConsumer =
                                        peerAny.getConsumer?.("video");

                                    // Log video consumer details
                                    if (pollCount <= 3) {
                                        console.log(
                                            "[Huddle01] Video consumer check:",
                                            {
                                                hasConsumer: !!videoConsumer,
                                                consumerType:
                                                    typeof videoConsumer,
                                                hasTrack:
                                                    !!videoConsumer?.track,
                                                trackType:
                                                    videoConsumer?.track instanceof
                                                    MediaStreamTrack
                                                        ? "MediaStreamTrack"
                                                        : typeof videoConsumer?.track,
                                            }
                                        );
                                    }

                                    if (
                                        videoConsumer?.track instanceof
                                        MediaStreamTrack
                                    ) {
                                        console.log(
                                            "[Huddle01] Found VIDEO from peer via polling:",
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
                                            // iOS-specific attributes
                                            videoEl.setAttribute(
                                                "webkit-playsinline",
                                                "true"
                                            );
                                            videoEl.style.width = "100%";
                                            videoEl.style.height = "100%";
                                            videoEl.style.objectFit = "cover";
                                            videoEl.style.borderRadius = "12px";
                                            remoteVideoRef.current.appendChild(
                                                videoEl
                                            );
                                            // iOS requires explicit play() call
                                            videoEl.play().catch((e) => {
                                                console.warn(
                                                    "[Huddle01] Video play failed via polling:",
                                                    e
                                                );
                                            });
                                            setState((prev) => ({
                                                ...prev,
                                                isRemoteVideoOff: false,
                                            }));
                                            console.log(
                                                "[Huddle01] Remote VIDEO created via polling!"
                                            );
                                            if (pollIntervalIdRef.current) {
                                                clearInterval(
                                                    pollIntervalIdRef.current
                                                );
                                                pollIntervalIdRef.current =
                                                    null;
                                            }
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
                                    } else {
                                        // Fallback: Try to find video track by iterating consumers
                                        const consumers =
                                            peerAny.consumers ||
                                            peerAny._consumers;
                                        if (
                                            consumers &&
                                            typeof consumers.forEach ===
                                                "function"
                                        ) {
                                            consumers.forEach(
                                                (
                                                    consumer: any,
                                                    label: string
                                                ) => {
                                                    if (
                                                        (label === "video" ||
                                                            consumer?.track
                                                                ?.kind ===
                                                                "video") &&
                                                        consumer?.track instanceof
                                                            MediaStreamTrack &&
                                                        remoteVideoRef.current &&
                                                        remoteVideoRef.current
                                                            .children.length ===
                                                            0
                                                    ) {
                                                        console.log(
                                                            "[Huddle01] Found VIDEO via consumers iteration:",
                                                            label
                                                        );
                                                        const stream =
                                                            new MediaStream([
                                                                consumer.track,
                                                            ]);
                                                        const videoEl =
                                                            document.createElement(
                                                                "video"
                                                            );
                                                        videoEl.srcObject =
                                                            stream;
                                                        videoEl.autoplay = true;
                                                        videoEl.playsInline =
                                                            true;
                                                        videoEl.setAttribute(
                                                            "webkit-playsinline",
                                                            "true"
                                                        );
                                                        videoEl.style.width =
                                                            "100%";
                                                        videoEl.style.height =
                                                            "100%";
                                                        videoEl.style.objectFit =
                                                            "cover";
                                                        videoEl.style.borderRadius =
                                                            "12px";
                                                        remoteVideoRef.current.appendChild(
                                                            videoEl
                                                        );
                                                        videoEl
                                                            .play()
                                                            .catch(() => {});
                                                        setState((prev) => ({
                                                            ...prev,
                                                            isRemoteVideoOff:
                                                                false,
                                                        }));
                                                    }
                                                }
                                            );
                                        }
                                    }
                                } catch (e) {
                                    console.log(
                                        "[Huddle01] Video check error:",
                                        e
                                    );
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
                    }, pollInterval);
                    // pollIntervalIdRef is already set above, no need to store on client
                });

                room.on("room-closed", () => {
                    log.debug("[Huddle01] Room closed");
                    stopDurationTimer();
                    // Clean up media elements
                    if (localVideoRef.current)
                        localVideoRef.current.innerHTML = "";
                    if (remoteVideoRef.current)
                        remoteVideoRef.current.innerHTML = "";
                    setState((prev) => ({ ...prev, callState: "idle" }));
                });

                // Add comprehensive event logging for debugging
                const debugEvents = [
                    "new-peer-joined",
                    "peer-left",
                    "peer-metadata-updated",
                    "remote-producer-added",
                    "remote-producer-closed",
                    "producer-added",
                    "producer-closed",
                    "consumer-created",
                    "consumer-closed",
                    "new-consumer",
                    "stream-started",
                    "stream-stopped",
                    "track-added",
                    "track-removed",
                    "receive-data",
                ];
                debugEvents.forEach((eventName) => {
                    room.on(eventName, (data: unknown) => {
                        console.log(`[Huddle01] EVENT: ${eventName}`, data);
                    });
                });

                room.on("peer-joined", (peer) => {
                    log.debug("[Huddle01] Peer joined:", peer);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const peerData = peer as any;
                    const peerId = peerData?.peerId;

                    // Log the peer state immediately for debugging
                    if (peerId) {
                        console.log(
                            `[Huddle01] New peer joined, logging state...`
                        );
                        logRemotePeerState(peerId);
                    }

                    // When a new peer joins, check for their streams after a delay
                    // (they might have already enabled video before joining our room)
                    setTimeout(async () => {
                        console.log(
                            "[Huddle01] Checking new peer for existing streams..."
                        );
                        if (peerId) {
                            // Log peer state again after delay
                            logRemotePeerState(peerId);

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
                                        // iOS-specific attributes
                                        audioEl.setAttribute(
                                            "playsinline",
                                            "true"
                                        );
                                        audioEl.setAttribute(
                                            "webkit-playsinline",
                                            "true"
                                        );
                                        document.body.appendChild(audioEl);
                                        remoteAudioRef.current = audioEl;
                                        // iOS requires explicit play() call
                                        audioEl.play().catch((e) => {
                                            console.warn(
                                                "[Huddle01] Audio play failed from peer-joined:",
                                                e
                                            );
                                        });
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
                                                // iOS-specific attributes
                                                videoEl.setAttribute(
                                                    "webkit-playsinline",
                                                    "true"
                                                );
                                                videoEl.style.width = "100%";
                                                videoEl.style.height = "100%";
                                                videoEl.style.objectFit =
                                                    "cover";
                                                videoEl.style.borderRadius =
                                                    "12px";
                                                remoteVideoRef.current.appendChild(
                                                    videoEl
                                                );
                                                // iOS requires explicit play() call
                                                videoEl.play().catch((e) => {
                                                    console.warn(
                                                        "[Huddle01] Video play failed from peer-joined:",
                                                        e
                                                    );
                                                });
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
                    log.debug("[Huddle01] Peer left:", peer);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const peerData = peer as any;
                    const peerId = peerData?.peerId || peerData?.id;
                    
                    // Remove only this peer's video (for group call support)
                    if (peerId) {
                        removeRemoteVideoForPeer(peerId);
                    } else {
                        // Fallback: clear all if we can't identify the peer
                        if (remoteVideoRef.current)
                            remoteVideoRef.current.innerHTML = "";
                        peerVideoElementsRef.current.clear();
                    }
                    
                    if (remoteAudioRef.current) {
                        remoteAudioRef.current.srcObject = null;
                        remoteAudioRef.current = null;
                    }
                    
                    // Only mark as no remote video if no peers left
                    if (peerVideoElementsRef.current.size === 0) {
                        setState((prev) => ({
                            ...prev,
                            isRemoteVideoOff: true,
                            isRemoteMuted: true,
                        }));
                    }
                });

                // Listen for local track production - SDK provides Producer object
                const localPeerEvents = client.localPeer as {
                    on: (
                        event: string,
                        callback: (...args: unknown[]) => void
                    ) => void;
                };

                localPeerEvents.on("stream-playable", (data: unknown) => {
                    // Guard: Don't process if we're leaving the call
                    if (isLeavingRef.current) {
                        console.log(
                            "[Huddle01] Ignoring local stream-playable - call is ending"
                        );
                        return;
                    }

                    log.debug("[Huddle01] Local stream playable:", data);
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
                            const existingVideo =
                                localVideoRef.current.querySelector("video");
                            if (existingVideo) {
                                // Update existing element's stream instead of creating new one
                                const stream = new MediaStream([track]);
                                existingVideo.srcObject = stream;
                                // iOS requires explicit play() call
                                existingVideo.play().catch((e) => {
                                    console.warn(
                                        "[Huddle01] Local video play failed:",
                                        e
                                    );
                                });
                                console.log(
                                    "[Huddle01] Updated existing local video element"
                                );
                            } else {
                                const stream = new MediaStream([track]);
                                const videoEl = document.createElement("video");
                                videoEl.srcObject = stream;
                                videoEl.autoplay = true;
                                videoEl.playsInline = true;
                                // iOS-specific attributes
                                videoEl.setAttribute(
                                    "webkit-playsinline",
                                    "true"
                                );
                                videoEl.muted = true;
                                videoEl.style.width = "100%";
                                videoEl.style.height = "100%";
                                videoEl.style.objectFit = "cover";
                                videoEl.style.borderRadius = "12px";
                                videoEl.style.transform = "scaleX(-1)";
                                localVideoRef.current.innerHTML = "";
                                localVideoRef.current.appendChild(videoEl);
                                // iOS requires explicit play() call
                                videoEl.play().catch((e) => {
                                    console.warn(
                                        "[Huddle01] Local video play failed:",
                                        e
                                    );
                                });
                                console.log(
                                    "[Huddle01] Local video element created"
                                );
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
                    // Guard: Don't process streams if we're leaving the call
                    if (isLeavingRef.current) {
                        console.log(
                            "[Huddle01] Ignoring stream-added - call is ending"
                        );
                        return;
                    }

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
                                        // iOS requires explicit play() call
                                        remoteAudioRef.current
                                            .play()
                                            .catch((e) => {
                                                console.warn(
                                                    "[Huddle01] Audio play failed (iOS may need user gesture):",
                                                    e
                                                );
                                            });
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
                                        // iOS-specific attributes
                                        audioEl.setAttribute(
                                            "playsinline",
                                            "true"
                                        );
                                        audioEl.setAttribute(
                                            "webkit-playsinline",
                                            "true"
                                        );
                                        document.body.appendChild(audioEl);
                                        remoteAudioRef.current = audioEl;
                                        // iOS requires explicit play() call
                                        audioEl.play().catch((e) => {
                                            console.warn(
                                                "[Huddle01] Audio play failed (iOS may need user gesture):",
                                                e
                                            );
                                        });
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
                                            // iOS requires explicit play() call
                                            existingVideo.play().catch((e) => {
                                                console.warn(
                                                    "[Huddle01] Video play failed:",
                                                    e
                                                );
                                            });
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
                                            // iOS-specific attributes
                                            videoEl.setAttribute(
                                                "webkit-playsinline",
                                                "true"
                                            );
                                            videoEl.muted = false; // Ensure not muted for remote
                                            videoEl.style.width = "100%";
                                            videoEl.style.height = "100%";
                                            videoEl.style.objectFit = "cover";
                                            videoEl.style.borderRadius = "12px";
                                            remoteVideoRef.current.appendChild(
                                                videoEl
                                            );
                                            // iOS requires explicit play() call
                                            videoEl.play().catch((e) => {
                                                console.warn(
                                                    "[Huddle01] Video play failed:",
                                                    e
                                                );
                                            });
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
                                } else if (
                                    label === "screen" ||
                                    label === "screen-share-video" ||
                                    label.includes("screen")
                                ) {
                                    // Handle remote screen share (Huddle01 uses 'screen-share-video' label)
                                    console.log(
                                        "[Huddle01] Remote screen share received! Label:",
                                        label
                                    );

                                    // Helper function to attach remote screen share with retries
                                    const attachRemoteScreenShare = (
                                        retryAttempt: number = 1
                                    ) => {
                                        if (screenShareRef.current) {
                                            console.log(
                                                `[Huddle01] Attaching remote screen share (attempt ${retryAttempt})`
                                            );
                                            // Clear any existing content
                                            screenShareRef.current.innerHTML =
                                                "";

                                            const videoEl =
                                                document.createElement("video");
                                            videoEl.srcObject = stream;
                                            videoEl.autoplay = true;
                                            videoEl.playsInline = true;
                                            videoEl.setAttribute(
                                                "webkit-playsinline",
                                                "true"
                                            );
                                            videoEl.muted = false;
                                            videoEl.style.width = "100%";
                                            videoEl.style.height = "100%";
                                            videoEl.style.objectFit = "contain";
                                            videoEl.style.borderRadius = "8px";
                                            videoEl.style.backgroundColor =
                                                "#000";
                                            screenShareRef.current.appendChild(
                                                videoEl
                                            );

                                            videoEl.play().catch((e) => {
                                                console.warn(
                                                    "[Huddle01] Screen share play failed:",
                                                    e
                                                );
                                            });

                                            console.log(
                                                "[Huddle01] Remote screen share element created"
                                            );
                                        } else if (retryAttempt < 15) {
                                            // Container not ready (waiting for React re-render after isRemoteScreenSharing: true)
                                            console.log(
                                                `[Huddle01] Screen share container not ready, retrying in 100ms (attempt ${retryAttempt})`
                                            );
                                            setTimeout(
                                                () =>
                                                    attachRemoteScreenShare(
                                                        retryAttempt + 1
                                                    ),
                                                100
                                            );
                                        } else {
                                            console.warn(
                                                "[Huddle01] Could not attach remote screen share - container never became available"
                                            );
                                        }
                                    };

                                    // Set state first to trigger re-render and create container
                                    setState((prev) => ({
                                        ...prev,
                                        isRemoteScreenSharing: true,
                                    }));

                                    // Start trying to attach with retries
                                    attachRemoteScreenShare(1);
                                    return true;
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
                    } else if (
                        label === "screen" ||
                        label === "screen-share-video" ||
                        label.includes("screen")
                    ) {
                        setState((prev) => ({
                            ...prev,
                            isRemoteScreenSharing: true,
                        }));
                    }
                });

                // Also listen for new-consumer event on localPeer
                localPeerEvents.on("new-consumer", (data: unknown) => {
                    log.debug("[Huddle01] New consumer event:", data);
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
                                    // iOS-specific attributes
                                    audioEl.setAttribute("playsinline", "true");
                                    audioEl.setAttribute(
                                        "webkit-playsinline",
                                        "true"
                                    );
                                    document.body.appendChild(audioEl);
                                    remoteAudioRef.current = audioEl;
                                    // iOS requires explicit play() call
                                    audioEl.play().catch((e) => {
                                        console.warn(
                                            "[Huddle01] Audio play failed via new-consumer:",
                                            e
                                        );
                                    });
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
                                    // iOS-specific attributes
                                    videoEl.setAttribute(
                                        "webkit-playsinline",
                                        "true"
                                    );
                                    videoEl.style.width = "100%";
                                    videoEl.style.height = "100%";
                                    videoEl.style.objectFit = "cover";
                                    videoEl.style.borderRadius = "12px";
                                    // Don't clear innerHTML - preserve other peer videos in group calls
                                    remoteVideoRef.current.appendChild(videoEl);
                                    // iOS requires explicit play() call
                                    videoEl.play().catch((e) => {
                                        console.warn(
                                            "[Huddle01] Video play failed via new-consumer:",
                                            e
                                        );
                                    });
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
                    log.debug("[Huddle01] Remote stream removed:", data);
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
                            (streamData.label === "screen" ||
                                streamData.label === "screen-share-video" ||
                                streamData.label?.includes("screen")) &&
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
                log.debug("[Huddle01] Joining room...");
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
                log.debug("[Huddle01] Join room completed");

                // Log detailed room/connection state after joining
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const roomAny = client.room as any;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const clientAny = client as any;
                    log.debug("[Huddle01] Connection state after join:", {
                        roomState: roomAny?.state,
                        roomId: roomAny?.roomId,
                        localPeerId: roomAny?.localPeer?.peerId,
                        remotePeersCount: roomAny?.remotePeers?.size,
                        // Check for transport/connection info
                        hasTransports:
                            !!clientAny._sendTransport ||
                            !!clientAny._recvTransport,
                        socketConnected: clientAny._socket?.connected,
                        socketState: clientAny._socket?.readyState,
                        // Check available methods
                        roomKeys: Object.keys(roomAny || {}),
                        clientKeys: Object.keys(clientAny || {}),
                        // Room methods
                        hasGetRemotePeerById:
                            typeof roomAny?.getRemotePeerById === "function",
                    });
                } catch (e) {
                    console.log(
                        "[Huddle01] Could not log connection state:",
                        e
                    );
                }

                // On mobile, wait longer for the room to fully initialize
                // This helps ensure the caller's streams are ready before the callee joins
                const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(
                    navigator.userAgent
                );
                if (isMobileDevice) {
                    console.log(
                        "[Huddle01] Mobile detected, waiting 1000ms before enabling media..."
                    );
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }

                // Enable audio (using type assertion for SDK compatibility)
                const localPeer = client.localPeer as {
                    enableAudio: () => Promise<void>;
                    disableAudio: () => Promise<void>;
                    enableVideo: () => Promise<void>;
                    disableVideo: () => Promise<void>;
                    startScreenShare: () => Promise<void>;
                    stopScreenShare: () => Promise<void>;
                };

                // Enable audio with retry on mobile
                let audioEnabled = false;
                for (
                    let attempt = 1;
                    attempt <= (isMobileDevice ? 3 : 1);
                    attempt++
                ) {
                    try {
                        console.log(
                            `[Huddle01] Enabling audio (attempt ${attempt})...`
                        );
                        await localPeer.enableAudio();
                        setState((prev) => ({ ...prev, isMuted: false }));
                        log.debug("[Huddle01] Audio enabled successfully");
                        audioEnabled = true;
                        break;
                    } catch (audioError) {
                        console.error(
                            `[Huddle01] FAILED to enable audio (attempt ${attempt}):`,
                            audioError
                        );
                        if (attempt < 3 && isMobileDevice) {
                            console.log(
                                "[Huddle01] Retrying audio in 500ms..."
                            );
                            await new Promise((resolve) =>
                                setTimeout(resolve, 500)
                            );
                        }
                    }
                }
                if (!audioEnabled) {
                    setState((prev) => ({ ...prev, isMuted: true }));
                }

                // Enable video if requested, with retry on mobile
                if (withVideo) {
                    let videoEnabled = false;
                    for (
                        let attempt = 1;
                        attempt <= (isMobileDevice ? 3 : 1);
                        attempt++
                    ) {
                        try {
                            console.log(
                                `[Huddle01] Enabling video (attempt ${attempt})...`
                            );
                            await localPeer.enableVideo();
                            setState((prev) => ({
                                ...prev,
                                isVideoOff: false,
                            }));
                            console.log(
                                "[Huddle01] Video enabled successfully"
                            );
                            videoEnabled = true;
                            break;
                        } catch (videoError) {
                            console.error(
                                `[Huddle01] FAILED to enable video (attempt ${attempt}):`,
                                videoError
                            );
                            if (attempt < 3 && isMobileDevice) {
                                console.log(
                                    "[Huddle01] Retrying video in 500ms..."
                                );
                                await new Promise((resolve) =>
                                    setTimeout(resolve, 500)
                                );
                            }
                        }
                    }
                    if (!videoEnabled) {
                        setState((prev) => ({ ...prev, isVideoOff: true }));
                    }
                }

                // Log our local producer state for debugging
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const localPeerAny = client.localPeer as any;
                    const producers =
                        localPeerAny.producers || localPeerAny._producers;
                    const producerLabels: string[] = [];
                    if (producers) {
                        if (producers.forEach) {
                            producers.forEach((_: unknown, label: string) =>
                                producerLabels.push(label)
                            );
                        } else if (typeof producers === "object") {
                            Object.keys(producers).forEach((k) =>
                                producerLabels.push(k)
                            );
                        }
                    }
                    console.log(
                        "[Huddle01] Local peer producer state after enabling media:",
                        {
                            hasProducers: !!producers,
                            producersSize: producers?.size,
                            producerLabels,
                            localPeerKeys: Object.keys(localPeerAny),
                            role: localPeerAny.role,
                            permissions: localPeerAny.permissions,
                        }
                    );
                } catch (e) {
                    console.log(
                        "[Huddle01] Could not log local peer state:",
                        e
                    );
                }

                // The room-joined event might not always fire, so ensure the timer is started here too
                // If it was already started by room-joined, starting again is fine (it will just restart)
                if (!startTimeRef.current) {
                    console.log(
                        "[Huddle01] Starting duration timer (fallback)"
                    );
                    startDurationTimer();
                }

                // CRITICAL: Also start polling as fallback if room-joined didn't fire
                // This ensures we can receive remote streams even when the event doesn't trigger
                if (!pollIntervalIdRef.current) {
                    console.log(
                        "[Huddle01] Starting polling (fallback - room-joined didn't fire)"
                    );
                    const isMobilePolling = /iPhone|iPad|iPod|Android/i.test(
                        navigator.userAgent
                    );
                    let pollCount = 0;
                    const maxPolls = isMobilePolling ? 30 : 15;
                    const pollInterval = 1000;

                    // Helper function to extract track from various consumer formats
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const extractTrack = (
                        consumer: any
                    ): MediaStreamTrack | null => {
                        if (!consumer) return null;

                        // Direct track property
                        if (consumer.track instanceof MediaStreamTrack) {
                            return consumer.track;
                        }

                        // Nested in _track
                        if (consumer._track instanceof MediaStreamTrack) {
                            return consumer._track;
                        }

                        // Check if consumer itself is a track
                        if (consumer instanceof MediaStreamTrack) {
                            return consumer;
                        }

                        // Check for getTrack method
                        if (typeof consumer.getTrack === "function") {
                            const track = consumer.getTrack();
                            if (track instanceof MediaStreamTrack) {
                                return track;
                            }
                        }

                        return null;
                    };

                    pollIntervalIdRef.current = setInterval(() => {
                        pollCount++;

                        // Guard: Don't process if we're leaving the call
                        if (isLeavingRef.current) {
                            console.log(
                                "[Huddle01] Fallback poll: Stopping - call is ending"
                            );
                            if (pollIntervalIdRef.current) {
                                clearInterval(pollIntervalIdRef.current);
                                pollIntervalIdRef.current = null;
                            }
                            return;
                        }

                        const hasRemoteVideo =
                            (remoteVideoRef.current?.children?.length ?? 0) > 0;
                        const hasRemoteAudio = remoteAudioRef.current !== null;

                        if (hasRemoteVideo && hasRemoteAudio) {
                            console.log(
                                "[Huddle01] Fallback poll: Remote A/V found, stopping"
                            );
                            if (pollIntervalIdRef.current) {
                                clearInterval(pollIntervalIdRef.current);
                                pollIntervalIdRef.current = null;
                            }
                            return;
                        }

                        if (pollCount > maxPolls) {
                            console.log(
                                `[Huddle01] Fallback poll: Max polls reached`
                            );
                            if (pollIntervalIdRef.current) {
                                clearInterval(pollIntervalIdRef.current);
                                pollIntervalIdRef.current = null;
                            }
                            return;
                        }

                        console.log(
                            `[Huddle01] Fallback polling (${pollCount}/${maxPolls})...`
                        );

                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const remotePeers = (client.room as any)?.remotePeers;
                        if (remotePeers && remotePeers.size > 0) {
                            console.log(
                                `[Huddle01] Fallback poll: Found ${remotePeers.size} peer(s)`
                            );
                            for (const [peerId, peer] of remotePeers) {
                                // Log peer state for debugging on first few polls
                                const hasRemoteStreams =
                                    remoteAudioRef.current ||
                                    (remoteVideoRef.current?.children?.length ??
                                        0) > 0;
                                if (!hasRemoteStreams && pollCount <= 5) {
                                    console.log(
                                        `[Huddle01] Fallback poll: Checking peer ${peerId} state...`
                                    );
                                    logRemotePeerState(peerId);
                                }

                                // Log peer structure for debugging
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const peerAny = peer as any;
                                if (pollCount <= 3) {
                                    // Get all properties of the peer for debugging
                                    const peerKeys = Object.keys(peerAny);
                                    const protoKeys =
                                        Object.getOwnPropertyNames(
                                            Object.getPrototypeOf(peerAny) || {}
                                        );

                                    // Check for producers
                                    const producers =
                                        peerAny.producers || peerAny._producers;
                                    const producerLabels: string[] = [];
                                    if (producers) {
                                        if (producers.forEach) {
                                            producers.forEach(
                                                (_: unknown, label: string) =>
                                                    producerLabels.push(label)
                                            );
                                        } else if (
                                            typeof producers === "object"
                                        ) {
                                            Object.keys(producers).forEach(
                                                (k) => producerLabels.push(k)
                                            );
                                        }
                                    }

                                    // Check role/permissions
                                    const role = peerAny.role;
                                    const permissions = peerAny.permissions;
                                    const metadata = peerAny.metadata;

                                    console.log(
                                        `[Huddle01] Fallback poll: Peer ${peerId} FULL structure:`,
                                        {
                                            hasGetConsumer:
                                                typeof peerAny.getConsumer ===
                                                "function",
                                            hasConsumers: !!peerAny.consumers,
                                            consumersSize:
                                                peerAny.consumers?.size,
                                            hasProducers: !!producers,
                                            producersSize: producers?.size,
                                            producerLabels,
                                            role,
                                            permissions,
                                            metadata,
                                            peerKeys,
                                            protoMethods: protoKeys.filter(
                                                (m) =>
                                                    typeof peerAny[m] ===
                                                    "function"
                                            ),
                                        }
                                    );
                                }

                                // Try to get audio via getConsumer
                                if (!remoteAudioRef.current) {
                                    try {
                                        const audioConsumer =
                                            peerAny.getConsumer?.("audio");
                                        if (pollCount <= 3) {
                                            console.log(
                                                `[Huddle01] Fallback poll: Audio consumer:`,
                                                {
                                                    exists: !!audioConsumer,
                                                    type: typeof audioConsumer,
                                                    hasTrack:
                                                        !!audioConsumer?.track,
                                                    trackType:
                                                        typeof audioConsumer?.track,
                                                }
                                            );
                                        }
                                        const audioTrack =
                                            extractTrack(audioConsumer);
                                        if (audioTrack) {
                                            console.log(
                                                "[Huddle01] Fallback poll: Found AUDIO from",
                                                peerId
                                            );
                                            const audioStream = new MediaStream(
                                                [audioTrack]
                                            );
                                            const audioEl =
                                                document.createElement("audio");
                                            audioEl.srcObject = audioStream;
                                            audioEl.autoplay = true;
                                            audioEl.setAttribute(
                                                "playsinline",
                                                "true"
                                            );
                                            audioEl.setAttribute(
                                                "webkit-playsinline",
                                                "true"
                                            );
                                            document.body.appendChild(audioEl);
                                            remoteAudioRef.current = audioEl;
                                            audioEl
                                                .play()
                                                .catch((e) =>
                                                    console.log(
                                                        "[Huddle01] Fallback audio play error:",
                                                        e
                                                    )
                                                );
                                            setState((prev) => ({
                                                ...prev,
                                                isRemoteMuted: false,
                                            }));
                                        }
                                    } catch (e) {
                                        console.log(
                                            "[Huddle01] Fallback poll: Audio consumer error:",
                                            e
                                        );
                                    }

                                    // Also try via consumers Map
                                    if (
                                        !remoteAudioRef.current &&
                                        peerAny.consumers
                                    ) {
                                        try {
                                            for (const [
                                                ,
                                                consumer,
                                            ] of peerAny.consumers) {
                                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                const consumerAny =
                                                    consumer as any;
                                                if (
                                                    consumerAny.kind ===
                                                        "audio" ||
                                                    consumerAny.label ===
                                                        "audio" ||
                                                    consumerAny.appData
                                                        ?.label === "audio"
                                                ) {
                                                    const audioTrack =
                                                        extractTrack(
                                                            consumerAny
                                                        );
                                                    if (audioTrack) {
                                                        console.log(
                                                            "[Huddle01] Fallback poll: Found AUDIO via consumers Map from",
                                                            peerId
                                                        );
                                                        const audioStream =
                                                            new MediaStream([
                                                                audioTrack,
                                                            ]);
                                                        const audioEl =
                                                            document.createElement(
                                                                "audio"
                                                            );
                                                        audioEl.srcObject =
                                                            audioStream;
                                                        audioEl.autoplay = true;
                                                        audioEl.setAttribute(
                                                            "playsinline",
                                                            "true"
                                                        );
                                                        audioEl.setAttribute(
                                                            "webkit-playsinline",
                                                            "true"
                                                        );
                                                        document.body.appendChild(
                                                            audioEl
                                                        );
                                                        remoteAudioRef.current =
                                                            audioEl;
                                                        audioEl
                                                            .play()
                                                            .catch((e) =>
                                                                console.log(
                                                                    "[Huddle01] Fallback audio play error:",
                                                                    e
                                                                )
                                                            );
                                                        setState((prev) => ({
                                                            ...prev,
                                                            isRemoteMuted:
                                                                false,
                                                        }));
                                                        break;
                                                    }
                                                }
                                            }
                                        } catch (e) {
                                            console.log(
                                                "[Huddle01] Fallback poll: Consumers Map audio error:",
                                                e
                                            );
                                        }
                                    }
                                }

                                // Try to get video via getConsumer
                                if (
                                    remoteVideoRef.current &&
                                    (remoteVideoRef.current?.children?.length ??
                                        0) === 0
                                ) {
                                    try {
                                        const videoConsumer =
                                            peerAny.getConsumer?.("video");
                                        if (pollCount <= 3) {
                                            console.log(
                                                `[Huddle01] Fallback poll: Video consumer:`,
                                                {
                                                    exists: !!videoConsumer,
                                                    type: typeof videoConsumer,
                                                    hasTrack:
                                                        !!videoConsumer?.track,
                                                    trackType:
                                                        typeof videoConsumer?.track,
                                                }
                                            );
                                        }
                                        const videoTrack =
                                            extractTrack(videoConsumer);
                                        if (videoTrack) {
                                            console.log(
                                                "[Huddle01] Fallback poll: Found VIDEO from",
                                                peerId
                                            );
                                            const videoStream = new MediaStream(
                                                [videoTrack]
                                            );
                                            const videoEl =
                                                document.createElement("video");
                                            videoEl.srcObject = videoStream;
                                            videoEl.autoplay = true;
                                            videoEl.playsInline = true;
                                            videoEl.muted = true;
                                            videoEl.setAttribute(
                                                "webkit-playsinline",
                                                "true"
                                            );
                                            videoEl.className =
                                                "w-full h-full object-cover rounded-lg";
                                            remoteVideoRef.current.appendChild(
                                                videoEl
                                            );
                                            videoEl
                                                .play()
                                                .catch((e) =>
                                                    console.log(
                                                        "[Huddle01] Fallback video play error:",
                                                        e
                                                    )
                                                );
                                            setState((prev) => ({
                                                ...prev,
                                                isRemoteVideoOff: false,
                                            }));
                                        }
                                    } catch (e) {
                                        console.log(
                                            "[Huddle01] Fallback poll: Video consumer error:",
                                            e
                                        );
                                    }

                                    // Also try via consumers Map
                                    if (
                                        (remoteVideoRef.current?.children
                                            ?.length ?? 0) === 0 &&
                                        peerAny.consumers
                                    ) {
                                        try {
                                            for (const [
                                                ,
                                                consumer,
                                            ] of peerAny.consumers) {
                                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                const consumerAny =
                                                    consumer as any;
                                                if (
                                                    consumerAny.kind ===
                                                        "video" ||
                                                    consumerAny.label ===
                                                        "video" ||
                                                    consumerAny.appData
                                                        ?.label === "video"
                                                ) {
                                                    const videoTrack =
                                                        extractTrack(
                                                            consumerAny
                                                        );
                                                    if (videoTrack) {
                                                        console.log(
                                                            "[Huddle01] Fallback poll: Found VIDEO via consumers Map from",
                                                            peerId
                                                        );
                                                        const videoStream =
                                                            new MediaStream([
                                                                videoTrack,
                                                            ]);
                                                        const videoEl =
                                                            document.createElement(
                                                                "video"
                                                            );
                                                        videoEl.srcObject =
                                                            videoStream;
                                                        videoEl.autoplay = true;
                                                        videoEl.playsInline =
                                                            true;
                                                        videoEl.muted = true;
                                                        videoEl.setAttribute(
                                                            "webkit-playsinline",
                                                            "true"
                                                        );
                                                        videoEl.className =
                                                            "w-full h-full object-cover rounded-lg";
                                                        remoteVideoRef.current.appendChild(
                                                            videoEl
                                                        );
                                                        videoEl
                                                            .play()
                                                            .catch((e) =>
                                                                console.log(
                                                                    "[Huddle01] Fallback video play error:",
                                                                    e
                                                                )
                                                            );
                                                        setState((prev) => ({
                                                            ...prev,
                                                            isRemoteVideoOff:
                                                                false,
                                                        }));
                                                        break;
                                                    }
                                                }
                                            }
                                        } catch (e) {
                                            console.log(
                                                "[Huddle01] Fallback poll: Consumers Map video error:",
                                                e
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    }, pollInterval);
                }

                setState((prev) => ({
                    ...prev,
                    roomId,
                    callState: "connected",
                }));

                return true;
            } catch (error) {
                log.error("[Huddle01] Error joining call:", error);
                // Clear refs on error
                isJoiningRef.current = false;
                currentRoomIdRef.current = null;
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
        // Set leaving guard immediately to prevent race conditions with stream handlers
        isLeavingRef.current = true;
        setState((prev) => ({ ...prev, callState: "leaving" }));
        stopDurationTimer();

        // Clear polling interval if it exists
        if (pollIntervalIdRef.current) {
            clearInterval(pollIntervalIdRef.current);
            pollIntervalIdRef.current = null;
            log.debug("[Huddle01] Cleared polling interval on leave");
        }

        try {
            if (clientRef.current) {
                // First, try to stop all local media tracks to release the microphone/camera
                // Only try to stop media if they were actually started
                // Check state to avoid "Cannot Find Producer" errors
                const localPeer = clientRef.current.localPeer;
                if (localPeer) {
                    log.debug("[Huddle01] Stopping local media tracks...");

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

                // ALWAYS try to leave the room and clean up, regardless of state
                // This ensures we don't have stale state affecting the next call
                try {
                    const roomState = clientRef.current.room?.state;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const clientAny = clientRef.current as any;
                    const socketState =
                        clientAny.socket?.state ||
                        clientAny._socket?.readyState;

                    console.log(
                        "[Huddle01] Leave call - room state:",
                        roomState,
                        "socket state:",
                        socketState
                    );

                    // Always attempt to leave the room
                    log.debug("[Huddle01] Attempting leaveRoom...");
                    try {
                        await clientRef.current.leaveRoom();
                        log.debug("[Huddle01] leaveRoom completed");
                    } catch (leaveErr) {
                        console.log(
                            "[Huddle01] leaveRoom error (continuing cleanup):",
                            leaveErr
                        );
                    }

                    // Try to disconnect any sockets
                    try {
                        if (clientAny._socket?.close) {
                            clientAny._socket.close();
                            log.debug("[Huddle01] Socket closed manually");
                        }
                        if (clientAny.socket?.close) {
                            clientAny.socket.close();
                            console.log(
                                "[Huddle01] Socket (alt) closed manually"
                            );
                        }
                    } catch (socketErr) {
                        console.log(
                            "[Huddle01] Socket close error:",
                            socketErr
                        );
                    }

                    // Try to disconnect transports
                    try {
                        if (clientAny._sendTransport?.close) {
                            clientAny._sendTransport.close();
                        }
                        if (clientAny._recvTransport?.close) {
                            clientAny._recvTransport.close();
                        }
                    } catch (transportErr) {
                        console.log(
                            "[Huddle01] Transport close error:",
                            transportErr
                        );
                    }
                } catch (leaveError) {
                    console.log(
                        "[Huddle01] Leave room error (continuing):",
                        leaveError
                    );
                }
            }
        } catch (error) {
            log.debug("[Huddle01] Cleanup error:", error);
        } finally {
            // ALWAYS null the client ref to ensure fresh instance on next call
            clientRef.current = null;

            // Reset pending track ref
            pendingRemoteVideoTrackRef.current = null;
            // Clean up media elements and stop any remaining tracks
            if (localVideoRef.current) {
                // Stop tracks from video elements
                const videos = localVideoRef.current.querySelectorAll("video");
                videos.forEach((video) => {
                    const stream = video.srcObject as MediaStream;
                    if (stream) {
                        stream.getTracks().forEach((track) => {
                            track.stop();
                            console.log(
                                "[Huddle01] Stopped local video track:",
                                track.kind
                            );
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
            if (localScreenShareRef.current) {
                const videos =
                    localScreenShareRef.current.querySelectorAll("video");
                videos.forEach((video) => {
                    const stream = video.srcObject as MediaStream;
                    if (stream) {
                        stream.getTracks().forEach((track) => track.stop());
                    }
                    video.srcObject = null;
                });
                localScreenShareRef.current.innerHTML = "";
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

            // Clean up ALL orphaned audio elements in document.body
            // (multiple can be created during a call from various event handlers)
            const orphanedAudioElements =
                document.body.querySelectorAll("audio");
            orphanedAudioElements.forEach((audioEl) => {
                const stream = audioEl.srcObject as MediaStream;
                if (stream) {
                    stream.getTracks().forEach((track) => {
                        track.stop();
                        log.debug("[Huddle01] Stopped orphaned audio track");
                    });
                }
                audioEl.srcObject = null;
                audioEl.remove();
            });
            if (orphanedAudioElements.length > 0) {
                console.log(
                    `[Huddle01] Cleaned up ${orphanedAudioElements.length} orphaned audio elements`
                );
            }

            // Clear join tracking refs
            isJoiningRef.current = false;
            currentRoomIdRef.current = null;

            // Reset leaving guard
            isLeavingRef.current = false;

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
    }, [
        stopDurationTimer,
        state.isMuted,
        state.isVideoOff,
        state.isScreenSharing,
    ]);

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
                    console.warn(
                        "[Huddle01] Could not enable audio:",
                        enableErr
                    );
                }
                setState((prev) => ({ ...prev, isMuted: false }));
            } else {
                try {
                    await localPeer.disableAudio();
                } catch (disableErr) {
                    console.warn(
                        "[Huddle01] Could not disable audio (may not be enabled):",
                        disableErr
                    );
                }
                setState((prev) => ({ ...prev, isMuted: true }));
            }
        } catch (error) {
            log.error("[Huddle01] Error toggling mute:", error);
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
                    console.warn(
                        "[Huddle01] Could not disable video (may not be enabled):",
                        disableErr
                    );
                }
                // Always update state even if disable fails
                setState((prev) => ({ ...prev, isVideoOff: true }));

                // Also clean up the local video element
                if (localVideoRef.current) {
                    const videos =
                        localVideoRef.current.querySelectorAll("video");
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
            log.error("[Huddle01] Error toggling video:", error);
        }
    }, [state.isVideoOff]);

    const toggleScreenShare = useCallback(async () => {
        if (!clientRef.current) return;

        try {
            const localPeer = clientRef.current.localPeer as {
                startScreenShare: () => Promise<MediaStream>;
                stopScreenShare: () => Promise<void>;
            };

            if (state.isScreenSharing) {
                try {
                    await localPeer.stopScreenShare();
                } catch (stopErr) {
                    console.warn(
                        "[Huddle01] Could not stop screen share:",
                        stopErr
                    );
                }
                setState((prev) => ({ ...prev, isScreenSharing: false }));

                // Clean up local screen share preview element
                if (localScreenShareRef.current) {
                    const videos =
                        localScreenShareRef.current.querySelectorAll("video");
                    videos.forEach((video) => {
                        const stream = video.srcObject as MediaStream;
                        if (stream) {
                            stream.getTracks().forEach((track) => track.stop());
                        }
                    });
                    localScreenShareRef.current.innerHTML = "";
                }
            } else {
                log.debug("[Huddle01] Starting screen share...");
                const screenStream = await localPeer.startScreenShare();
                console.log(
                    "[Huddle01] Screen share started, got stream:",
                    screenStream
                );

                setState((prev) => ({
                    ...prev,
                    isScreenSharing: true,
                    callType: "video",
                }));

                // Helper function to attach local screen share preview
                const attachLocalScreenShare = (attempt: number = 1) => {
                    if (!screenStream) return;

                    if (localScreenShareRef.current) {
                        console.log(
                            `[Huddle01] Attaching local screen share preview (attempt ${attempt})`
                        );
                        // Clear any existing content
                        localScreenShareRef.current.innerHTML = "";

                        const videoEl = document.createElement("video");
                        videoEl.srcObject = screenStream;
                        videoEl.autoplay = true;
                        videoEl.playsInline = true;
                        videoEl.muted = true; // Mute local preview to avoid echo
                        videoEl.style.width = "100%";
                        videoEl.style.height = "100%";
                        videoEl.style.objectFit = "contain";
                        videoEl.style.borderRadius = "8px";
                        videoEl.style.backgroundColor = "#000";
                        localScreenShareRef.current.appendChild(videoEl);

                        videoEl.play().catch((e) => {
                            console.warn(
                                "[Huddle01] Screen share preview play failed:",
                                e
                            );
                        });
                        console.log(
                            "[Huddle01] Local screen share preview created"
                        );
                    } else if (attempt < 10) {
                        // Container not available yet (waiting for React re-render), retry
                        console.log(
                            `[Huddle01] Local screen share container not ready, retrying in 100ms (attempt ${attempt})`
                        );
                        setTimeout(
                            () => attachLocalScreenShare(attempt + 1),
                            100
                        );
                    } else {
                        console.warn(
                            "[Huddle01] Could not attach local screen share preview - container never became available"
                        );
                    }
                };

                // Start trying to attach the local preview (with retries for React re-render)
                attachLocalScreenShare(1);

                // Listen for the screen share track ending (user clicked "Stop sharing")
                if (screenStream) {
                    const videoTrack = screenStream.getVideoTracks()[0];
                    if (videoTrack) {
                        videoTrack.onended = () => {
                            console.log(
                                "[Huddle01] Screen share track ended by user"
                            );
                            setState((prev) => ({
                                ...prev,
                                isScreenSharing: false,
                            }));
                            if (localScreenShareRef.current) {
                                localScreenShareRef.current.innerHTML = "";
                            }
                        };
                    }
                }
            }
        } catch (error) {
            log.error("[Huddle01] Error toggling screen share:", error);
            // Reset state if screen share failed (e.g., user cancelled)
            setState((prev) => ({ ...prev, isScreenSharing: false }));
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

    const setLocalScreenShareContainer = useCallback(
        (element: HTMLDivElement | null) => {
            localScreenShareRef.current = element;
        },
        []
    );

    const takeScreenshot = useCallback(async (): Promise<boolean> => {
        // Screenshot implementation similar to Agora
        log.debug("[Huddle01] Screenshot not yet implemented");
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
        setLocalScreenShareContainer,
        isConfigured: isHuddle01Configured,
    };
}


