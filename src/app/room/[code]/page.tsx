"use client";

import { useState, useEffect, use, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { huddle01ProjectId, isHuddle01Configured } from "@/config/huddle01";
import { InstantRoomChat } from "@/components/InstantRoomChat";
import { useWalletType } from "@/hooks/useWalletType";
import { usePasskeyContext } from "@/context/PasskeyProvider";
import { useEmailAuthContext } from "@/context/EmailAuthProvider";

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
    screenShareTrack: MediaStreamTrack | null;
};

// Dynamic imports for Huddle01
let HuddleClient: typeof import("@huddle01/web-core").HuddleClient | null =
    null;

async function loadHuddle01SDK(): Promise<void> {
    if (HuddleClient) return;
    const module = await import("@huddle01/web-core");
    HuddleClient = module.HuddleClient;
}

export default function RoomPage({
    params,
}: {
    params: Promise<{ code: string }>;
}) {
    const { code } = use(params);
    const { address: walletAddress } = useWalletType();
    const { smartAccountAddress: passkeyAddress } = usePasskeyContext();
    const { smartAccountAddress: emailAddress } = useEmailAuthContext();
    
    // Support passkey, email, and wallet authentication
    const userWalletAddress = emailAddress || passkeyAddress || walletAddress || null;
    const [room, setRoom] = useState<RoomInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [displayName, setDisplayName] = useState("");
    const [joiningRoom, setJoiningRoom] = useState(false);
    const [inCall, setInCall] = useState(false);
    const [isHost, setIsHost] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [remotePeers, setRemotePeers] = useState<Map<string, RemotePeer>>(
        new Map()
    );
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [unreadMessages, setUnreadMessages] = useState(0);
    const [selectedPeerMenu, setSelectedPeerMenu] = useState<string | null>(
        null
    );
    const [showDeviceMenu, setShowDeviceMenu] = useState(false);
    const [audioInputDevices, setAudioInputDevices] = useState<
        MediaDeviceInfo[]
    >([]);
    const [audioOutputDevices, setAudioOutputDevices] = useState<
        MediaDeviceInfo[]
    >([]);
    const [selectedMicId, setSelectedMicId] = useState<string | null>(null);
    const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(
        null
    );
    const selectedSpeakerIdRef = useRef<string | null>(null);
    const [micPermissionStatus, setMicPermissionStatus] = useState<
        "granted" | "denied" | "prompt" | "checking"
    >("checking");
    const [showMicPermissionAlert, setShowMicPermissionAlert] = useState(false);
    const [copiedShareUrl, setCopiedShareUrl] = useState(false);
    const [fetchingUserInfo, setFetchingUserInfo] = useState(false);
    const [hasUserDisplayName, setHasUserDisplayName] = useState(false);
    const [isPWA, setIsPWA] = useState(false);

    // Check if running as PWA
    useEffect(() => {
        if (typeof window !== "undefined") {
            const standalone =
                window.matchMedia("(display-mode: standalone)").matches ||
                // @ts-expect-error - iOS Safari specific
                window.navigator.standalone === true;
            setIsPWA(standalone);
        }
    }, []);

    // Safari-specific: Update video elements when tracks change
    // Safari needs explicit srcObject updates when tracks are added/updated
    // Use a ref to track which tracks we've already attached to avoid flickering
    const attachedVideoTracksRef = useRef<Map<string, MediaStreamTrack>>(new Map());
    
    useEffect(() => {
        if (!inCall) return;

        remotePeers.forEach((peer, peerId) => {
            if (peer.videoTrack) {
                const videoEl = remoteVideoRefs.current.get(peerId);
                if (videoEl) {
                    const previousTrack = attachedVideoTracksRef.current.get(peerId);
                    const currentStream = videoEl.srcObject as MediaStream;
                    
                    // Check if we need to update - track changed, no stream, or stream has no video tracks
                    const needsUpdate = 
                        previousTrack !== peer.videoTrack ||
                        !currentStream ||
                        currentStream.getVideoTracks().length === 0 ||
                        currentStream.getVideoTracks()[0] !== peer.videoTrack;
                    
                    if (needsUpdate) {
                        const stream = new MediaStream([peer.videoTrack]);
                        videoEl.srcObject = stream;
                        videoEl.play().catch((e) => {
                            console.warn(`[Room] Video play failed for ${peerId}:`, e);
                        });
                        attachedVideoTracksRef.current.set(peerId, peer.videoTrack);
                        console.log(`[Room] Attached/reattached video for ${peerId}`);
                    }
                }
            } else {
                // Clean up if track was removed
                attachedVideoTracksRef.current.delete(peerId);
            }
        });
    }, [remotePeers, inCall, isScreenSharing]); // Add isScreenSharing to trigger reattachment when screen share stops

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientRef = useRef<any>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const localScreenShareRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
    const remoteScreenShareRefs = useRef<Map<string, HTMLVideoElement>>(
        new Map()
    );
    const remoteAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
    const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (code) {
            fetchRoom();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code]);

    // Fetch user display name if signed in
    useEffect(() => {
        const fetchUserDisplayName = async () => {
            if (!userWalletAddress) {
                setHasUserDisplayName(false);
                return;
            }

            setFetchingUserInfo(true);
            try {
                const res = await fetch(
                    `/api/public/user?address=${encodeURIComponent(
                        userWalletAddress
                    )}`
                );
                if (res.ok) {
                    const data = await res.json();
                    if (data.user) {
                        // Determine best display name: username > display_name > ens_name
                        const bestDisplayName = data.user.username
                            ? `@${data.user.username}`
                            : data.user.display_name ||
                              data.user.ens_name ||
                              null;

                        if (bestDisplayName) {
                            setDisplayName(bestDisplayName);
                            setHasUserDisplayName(true);
                        } else {
                            setHasUserDisplayName(false);
                        }
                    } else {
                        setHasUserDisplayName(false);
                    }
                } else {
                    setHasUserDisplayName(false);
                }
            } catch (err) {
                console.error("[Room] Error fetching user info:", err);
                setHasUserDisplayName(false);
            } finally {
                setFetchingUserInfo(false);
            }
        };

        fetchUserDisplayName();
    }, [userWalletAddress]);

    // Helper to check if code is a wallet address
    const isWalletAddress = (str: string): boolean => {
        return /^0x[a-fA-F0-9]{40}$/.test(str);
    };

    const fetchRoom = async () => {
        try {
            // If it's a wallet address, ensure permanent room exists first
            if (isWalletAddress(code)) {
                // Try to get or create permanent room
                const permanentRes = await fetch(
                    `/api/rooms/permanent?wallet_address=${code}`
                );
                if (!permanentRes.ok) {
                    setError("Failed to get permanent room");
                    setLoading(false);
                    return;
                }
            }

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
            // Check microphone permissions before joining
            await checkMicPermissions();

            console.log("[Room] Getting token for room:", room.roomId);

            // Get token
            const tokenRes = await fetch(`/api/rooms/${code}/token`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    displayName: displayName.trim(),
                    walletAddress: userWalletAddress || null,
                }),
            });

            const tokenData = await tokenRes.json();
            console.log("[Room] Token response:", tokenRes.ok, tokenData);

            if (!tokenRes.ok) {
                setError(tokenData.error || "Failed to get access token");
                setJoiningRoom(false);
                return;
            }

            // Store host status
            setIsHost(tokenData.isHost || false);

            console.log("[Room] Loading Huddle01 SDK...");

            // Load Huddle01 SDK
            await loadHuddle01SDK();
            if (!HuddleClient) {
                setError("Failed to load video SDK");
                setJoiningRoom(false);
                return;
            }

            console.log(
                "[Room] Creating Huddle01 client with projectId:",
                huddle01ProjectId
            );

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

            localPeerEvents.on(
                "stream-playable",
                (data: {
                    label?: string;
                    producer?: { track?: MediaStreamTrack };
                }) => {
                    console.log("[Room] Local stream playable:", data);
                    if (
                        data.label === "video" &&
                        data.producer?.track &&
                        localVideoRef.current
                    ) {
                        const stream = new MediaStream([data.producer.track]);
                        localVideoRef.current.srcObject = stream;
                        localVideoRef.current
                            .play()
                            .catch((e) =>
                                console.warn("[Room] Video play failed:", e)
                            );
                    } else if (
                        (data.label === "screen" ||
                            data.label === "screen-share-video" ||
                            data.label?.includes("screen")) &&
                        data.producer?.track &&
                        localScreenShareRef.current
                    ) {
                        console.log(
                            "[Room] Local screen share stream playable, label:",
                            data.label
                        );
                        const stream = new MediaStream([data.producer.track]);
                        localScreenShareRef.current.srcObject = stream;
                        localScreenShareRef.current
                            .play()
                            .catch((e) =>
                                console.warn(
                                    "[Room] Screen share play failed:",
                                    e
                                )
                            );
                        setIsScreenSharing(true);
                    }
                }
            );

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const roomEvents = client.room as any;

            // Helper to extract track from various sources with retry
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const extractTrack = (
                data: any,
                label: string,
                peerId: string
            ): MediaStreamTrack | null => {
                // Method 1: Direct track property
                if (data?.track instanceof MediaStreamTrack) {
                    console.log("[Room] Found track directly in event data");
                    return data.track;
                }
                // Method 2: Consumer track property
                if (data?.consumer?.track instanceof MediaStreamTrack) {
                    console.log("[Room] Found track in consumer");
                    return data.consumer.track;
                }
                // Method 3: MediaStream in event
                if (data?.stream instanceof MediaStream) {
                    const tracks =
                        label === "audio"
                            ? data.stream.getAudioTracks()
                            : data.stream.getVideoTracks();
                    if (tracks.length > 0) {
                        console.log("[Room] Found track in stream");
                        return tracks[0];
                    }
                }
                // Method 4: Look in remotePeers via getConsumer (most common case)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const remotePeers = (client.room as any)?.remotePeers;
                if (remotePeers && peerId) {
                    const peer = remotePeers.get(peerId);
                    if (peer) {
                        try {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const consumer = (peer as any).getConsumer?.(label);
                            if (consumer?.track instanceof MediaStreamTrack) {
                                console.log(
                                    "[Room] Found track via getConsumer"
                                );
                                return consumer.track;
                            }
                        } catch (e) {
                            console.warn("[Room] getConsumer error:", e);
                        }
                    }
                }
                return null;
            };

            // Helper to extract a short display name from peerId
            const getShortId = (peerId: string): string => {
                // peerId format is often "peerId-xxxxx" - extract the unique part
                if (peerId.includes("-")) {
                    const parts = peerId.split("-");
                    return parts[parts.length - 1].slice(0, 6);
                }
                return peerId.slice(-6);
            };

            // Helper to get display name from various sources
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const getDisplayName = (
                peerId: string,
                eventMetadata?: any
            ): string => {
                // 1. Try event metadata (check multiple possible locations)
                if (eventMetadata?.displayName) {
                    return eventMetadata.displayName;
                }
                // Also check if metadata is nested
                if (eventMetadata?.metadata?.displayName) {
                    return eventMetadata.metadata.displayName;
                }
                // Check if it's in the data object directly
                if (eventMetadata?.data?.displayName) {
                    return eventMetadata.data.displayName;
                }

                // 2. Try to get from remotePeers Map in Huddle01 client
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const remotePeersMap = (client.room as any)?.remotePeers;
                    if (remotePeersMap) {
                        const remotePeer = remotePeersMap.get(peerId);
                        if (remotePeer) {
                            // Try multiple ways to access metadata
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const peerMetadata = (remotePeer as any)?.metadata;
                            if (peerMetadata?.displayName) {
                                return peerMetadata.displayName;
                            }
                            // Try direct property access
                            if ((remotePeer as any)?.displayName) {
                                return (remotePeer as any).displayName;
                            }
                            // Try getMetadata method if it exists
                            if (
                                typeof (remotePeer as any)?.getMetadata ===
                                "function"
                            ) {
                                try {
                                    const meta = (
                                        remotePeer as any
                                    ).getMetadata();
                                    if (meta?.displayName) {
                                        return meta.displayName;
                                    }
                                } catch (e) {
                                    // Ignore
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn("[Room] Error accessing peer metadata:", e);
                }

                // 3. Fallback to short ID
                return `Guest ${getShortId(peerId)}`;
            };

            // Function to update peer display name
            const updatePeerDisplayName = (peerId: string) => {
                const newName = getDisplayName(peerId);
                setRemotePeers((prev) => {
                    const existing = prev.get(peerId);
                    if (existing && existing.displayName !== newName) {
                        console.log(
                            "[Room] Updating display name for",
                            peerId,
                            "from",
                            existing.displayName,
                            "to",
                            newName
                        );
                        const updated = new Map(prev);
                        updated.set(peerId, {
                            ...existing,
                            displayName: newName,
                        });
                        return updated;
                    }
                    return prev;
                });
            };

            // Handle new peer joining (try both event names)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const handlePeerJoined = (data: any) => {
                console.log(
                    "[Room] New peer joined - raw data:",
                    JSON.stringify(
                        data,
                        (key, value) => {
                            // Filter out MediaStreamTrack and other non-serializable objects
                            if (value instanceof MediaStreamTrack)
                                return "[MediaStreamTrack]";
                            if (value instanceof MediaStream)
                                return "[MediaStream]";
                            if (typeof value === "function")
                                return "[Function]";
                            return value;
                        },
                        2
                    )
                );

                // Handle both { peer: {...} } and direct peer object structures
                const peerData = data?.peer || data;
                const peerId = peerData?.peerId || peerData?.id || data?.peerId;

                // Try multiple ways to extract metadata
                let metadata = peerData?.metadata || data?.metadata || {};
                // Also check if metadata is nested
                if (!metadata || Object.keys(metadata).length === 0) {
                    metadata =
                        peerData?.data?.metadata || data?.data?.metadata || {};
                }

                if (!peerId) {
                    console.warn(
                        "[Room] Could not extract peerId from peer joined event"
                    );
                    return;
                }

                const peerName = getDisplayName(peerId, metadata);
                console.log(
                    "[Room] Adding peer:",
                    peerId,
                    "Name:",
                    peerName,
                    "Metadata:",
                    metadata
                );

                setRemotePeers((prev) => {
                    const updated = new Map(prev);
                    updated.set(peerId, {
                        peerId,
                        displayName: peerName,
                        audioTrack: null,
                        videoTrack: null,
                        screenShareTrack: null,
                    });
                    return updated;
                });

                // Try to refresh display name after a short delay in case metadata loads asynchronously
                setTimeout(() => {
                    updatePeerDisplayName(peerId);
                }, 500);
            };

            // Try both event names (Huddle01 SDK uses different names in different versions)
            roomEvents.on("new-peer-joined", handlePeerJoined);
            roomEvents.on("peer-joined", handlePeerJoined);

            // Handle peer leaving
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const handlePeerLeft = (data: any) => {
                console.log("[Room] Peer left - raw data:", data);
                const peerData = data?.peer || data;
                const peerId = peerData?.peerId || peerData?.id || data?.peerId;

                if (!peerId) {
                    console.warn(
                        "[Room] Could not extract peerId from peer left event"
                    );
                    return;
                }

                setRemotePeers((prev) => {
                    const updated = new Map(prev);
                    updated.delete(peerId);
                    return updated;
                });
                remoteVideoRefs.current.delete(peerId);
                remoteAudioRefs.current.delete(peerId);
            };

            roomEvents.on("peer-left", handlePeerLeft);

            // Handle metadata updates
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            roomEvents.on("peer-metadata-updated", (data: any) => {
                console.log("[Room] Peer metadata updated:", data);
                const peerId = data?.peerId || data?.peer?.peerId || data?.id;
                if (peerId) {
                    updatePeerDisplayName(peerId);
                }
            });

            // Also listen for any peer updates that might include metadata
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            roomEvents.on("peer-updated", (data: any) => {
                console.log("[Room] Peer updated:", data);
                const peerId = data?.peerId || data?.peer?.peerId || data?.id;
                if (peerId) {
                    updatePeerDisplayName(peerId);
                }
            });

            // Handle remote stream becoming available
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            roomEvents.on("stream-added", (data: any) => {
                console.log(
                    "[Room] Remote stream added - raw data:",
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

                const peerId = data?.peerId;
                const label = data?.label;
                // Try to extract metadata from stream-added event
                const metadata = data?.metadata || data?.peer?.metadata || {};

                if (!peerId || !label) {
                    console.warn(
                        "[Room] Missing peerId or label in stream-added"
                    );
                    return;
                }

                // Try to update display name if metadata is available
                if (metadata?.displayName) {
                    updatePeerDisplayName(peerId);
                }

                // Function to try getting and attaching the track with retries
                const tryAttachTrack = (attempt: number = 1) => {
                    console.log(
                        `[Room] Trying to attach ${label} track for ${peerId}, attempt ${attempt}`
                    );

                    const track = extractTrack(data, label, peerId);

                    if (track) {
                        console.log(
                            `[Room] Successfully got ${label} track for ${peerId}`
                        );

                        // Ensure peer exists in our map and update track
                        setRemotePeers((prev) => {
                            const updated = new Map(prev);
                            let peer = updated.get(peerId);

                            // Create peer entry if it doesn't exist
                            if (!peer) {
                                const displayName = getDisplayName(peerId);
                                console.log(
                                    "[Room] Creating peer entry for:",
                                    peerId,
                                    "Name:",
                                    displayName
                                );
                                peer = {
                                    peerId,
                                    displayName,
                                    audioTrack: null,
                                    videoTrack: null,
                                    screenShareTrack: null,
                                };
                            }

                            if (label === "audio") {
                                peer.audioTrack = track;
                                // Try to play audio immediately and also with a small delay
                                const playAudio = () => {
                                    const audioEl =
                                        remoteAudioRefs.current.get(peerId);
                                    if (audioEl) {
                                        const stream = new MediaStream([track]);
                                        audioEl.srcObject = stream;

                                        // Set speaker if one is selected
                                        const speakerId =
                                            selectedSpeakerIdRef.current;
                                        if (
                                            speakerId &&
                                            "setSinkId" in audioEl
                                        ) {
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            (audioEl as any)
                                                .setSinkId(speakerId)
                                                .catch((err: Error) => {
                                                    console.warn(
                                                        "[Room] Failed to set sink ID:",
                                                        err
                                                    );
                                                });
                                        }

                                        audioEl
                                            .play()
                                            .catch((e) =>
                                                console.warn(
                                                    "[Room] Audio play failed:",
                                                    e
                                                )
                                            );
                                        console.log(
                                            "[Room] Audio element updated for peer:",
                                            peerId
                                        );
                                    }
                                };
                                playAudio();
                                setTimeout(playAudio, 200);
                            } else if (label === "video") {
                                peer.videoTrack = track;
                                // Try to play video immediately and also with a small delay
                                const playVideo = () => {
                                    const videoEl =
                                        remoteVideoRefs.current.get(peerId);
                                    if (videoEl) {
                                        const stream = new MediaStream([track]);
                                        videoEl.srcObject = stream;
                                        videoEl
                                            .play()
                                            .catch((e) =>
                                                console.warn(
                                                    "[Room] Video play failed:",
                                                    e
                                                )
                                            );
                                        console.log(
                                            "[Room] Video element updated for peer:",
                                            peerId
                                        );
                                    }
                                };
                                playVideo();
                                setTimeout(playVideo, 200);
                            } else if (
                                label === "screen" ||
                                label === "screen-share-video" ||
                                label?.includes("screen")
                            ) {
                                peer.screenShareTrack = track;
                                
                                // IMPORTANT: Ensure audio track remains active when screen sharing starts
                                // Re-attach audio if it exists to prevent it from being stopped
                                if (peer.audioTrack) {
                                    const audioEl = remoteAudioRefs.current.get(peerId);
                                    if (audioEl && peer.audioTrack) {
                                        // Re-attach audio track to ensure it keeps playing
                                        const audioStream = new MediaStream([peer.audioTrack]);
                                        audioEl.srcObject = audioStream;
                                        audioEl.play().catch((e) =>
                                            console.warn(
                                                "[Room] Audio re-attach failed during screen share:",
                                                e
                                            )
                                        );
                                        console.log(
                                            "[Room] Re-attached audio track for screen sharing peer:",
                                            peerId
                                        );
                                    }
                                }
                                
                                // Try to play screen share immediately and also with a small delay
                                const playScreenShare = () => {
                                    const screenEl =
                                        remoteScreenShareRefs.current.get(
                                            peerId
                                        );
                                    if (screenEl) {
                                        const stream = new MediaStream([track]);
                                        screenEl.srcObject = stream;
                                        screenEl
                                            .play()
                                            .catch((e) =>
                                                console.warn(
                                                    "[Room] Screen share play failed:",
                                                    e
                                                )
                                            );
                                        console.log(
                                            "[Room] Screen share element updated for peer:",
                                            peerId
                                        );
                                    }
                                };
                                playScreenShare();
                                setTimeout(playScreenShare, 200);
                            }

                            updated.set(peerId, { ...peer });
                            return updated;
                        });
                    } else if (attempt < 5) {
                        // Track not found - retry with increasing delay
                        const delay = attempt * 200;
                        console.log(
                            `[Room] Track not found, will retry in ${delay}ms`
                        );
                        setTimeout(() => tryAttachTrack(attempt + 1), delay);
                    } else {
                        console.warn(
                            `[Room] Could not find ${label} track after ${attempt} attempts for ${peerId}`
                        );

                        // Still create the peer entry so they show in the UI
                        setRemotePeers((prev) => {
                            const updated = new Map(prev);
                            if (!updated.has(peerId)) {
                                const displayName = getDisplayName(peerId);
                                updated.set(peerId, {
                                    peerId,
                                    displayName,
                                    audioTrack: null,
                                    videoTrack: null,
                                    screenShareTrack: null,
                                });
                            }
                            return updated;
                        });
                    }
                };

                // Start trying to attach the track
                tryAttachTrack(1);
            });

            // Handle remote stream being removed
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            roomEvents.on("stream-closed", (data: any) => {
                console.log("[Room] Remote stream closed:", data);
                const peerId = data?.peerId;
                const label = data?.label;

                if (!peerId) return;

                setRemotePeers((prev) => {
                    const updated = new Map(prev);
                    const peer = updated.get(peerId);
                    if (peer) {
                        if (label === "audio") {
                            peer.audioTrack = null;
                        } else if (label === "video") {
                            peer.videoTrack = null;
                        } else if (
                            label === "screen" ||
                            label === "screen-share-video" ||
                            label?.includes("screen")
                        ) {
                            peer.screenShareTrack = null;
                            // Clean up screen share ref
                            const screenEl =
                                remoteScreenShareRefs.current.get(peerId);
                            if (screenEl) {
                                screenEl.srcObject = null;
                            }
                            
                            // IMPORTANT: When screen share stops, reattach the remote peer's video track
                            // This ensures the person who stopped sharing can still see the other person's camera
                            if (peer.videoTrack) {
                                setTimeout(() => {
                                    const videoEl = remoteVideoRefs.current.get(peerId);
                                    if (videoEl && peer.videoTrack) {
                                        const videoStream = new MediaStream([peer.videoTrack]);
                                        videoEl.srcObject = videoStream;
                                        videoEl.play().catch((e) =>
                                            console.warn(
                                                "[Room] Video reattach after screen share stop failed:",
                                                e
                                            )
                                        );
                                        console.log(
                                            "[Room] Reattached remote video after screen share stopped for peer:",
                                            peerId
                                        );
                                    }
                                }, 300); // Small delay to ensure screen share cleanup is complete
                            }
                        }
                        updated.set(peerId, { ...peer });
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
                
                // Fallback: If stream-playable doesn't fire within 2 seconds, try to get video manually
                setTimeout(async () => {
                    if (localVideoRef.current && !localVideoRef.current.srcObject) {
                        console.log("[Room] Video stream not attached after 2s, attempting manual attach...");
                        try {
                            // Try to get the video track from the local peer
                            const localPeer = client.localPeer;
                            
                            // Method 1: Try getStream
                            if (typeof localPeer.getStream === "function") {
                                const videoStream = await localPeer.getStream({ label: "video" });
                                if (videoStream && localVideoRef.current) {
                                    localVideoRef.current.srcObject = videoStream;
                                    await localVideoRef.current.play().catch(() => {});
                                    console.log("[Room] Manual video attach successful via getStream");
                                    return;
                                }
                            }
                            
                            // Method 2: Try to get from getUserMedia directly as last resort
                            console.log("[Room] Trying direct getUserMedia as fallback...");
                            const stream = await navigator.mediaDevices.getUserMedia({ 
                                video: true, 
                                audio: false 
                            });
                            if (stream && localVideoRef.current) {
                                localVideoRef.current.srcObject = stream;
                                await localVideoRef.current.play().catch(() => {});
                                console.log("[Room] Manual video attach successful via getUserMedia fallback");
                            }
                        } catch (manualErr) {
                            console.warn("[Room] Manual video attach failed:", manualErr);
                        }
                    }
                }, 2000);
            } catch (videoErr) {
                console.warn("[Room] Could not enable video:", videoErr);
                // Try getUserMedia directly as a fallback for email/passkey users
                try {
                    console.log("[Room] Trying direct getUserMedia fallback...");
                    const stream = await navigator.mediaDevices.getUserMedia({ 
                        video: true, 
                        audio: false 
                    });
                    if (stream && localVideoRef.current) {
                        localVideoRef.current.srcObject = stream;
                        await localVideoRef.current.play().catch(() => {});
                        console.log("[Room] getUserMedia fallback successful");
                    }
                } catch (fallbackErr) {
                    console.warn("[Room] getUserMedia fallback also failed:", fallbackErr);
                }
            }

            // Start duration timer
            durationIntervalRef.current = setInterval(() => {
                setCallDuration((d) => d + 1);
            }, 1000);

            setInCall(true);
            setJoiningRoom(false);
        } catch (err) {
            console.error("[Room] Join error:", err);
            const errorMessage =
                err instanceof Error ? err.message : "Unknown error";
            setError(`Failed to join room: ${errorMessage}`);
            setJoiningRoom(false);
        }
    };

    // Aggressive media track cleanup (similar to Go Live)
    const stopAllMediaTracks = useCallback(() => {
        const allTracks: MediaStreamTrack[] = [];
        const trackIds = new Set<string>();

        // Collect tracks from local video element
        if (localVideoRef.current) {
            const stream = localVideoRef.current.srcObject as MediaStream;
            if (stream) {
                stream.getTracks().forEach((track) => {
                    if (!trackIds.has(track.id)) {
                        allTracks.push(track);
                        trackIds.add(track.id);
                    }
                });
                localVideoRef.current.srcObject = null;
            }
        }

        // Collect tracks from local screen share
        if (localScreenShareRef.current) {
            const stream = localScreenShareRef.current.srcObject as MediaStream;
            if (stream) {
                stream.getTracks().forEach((track) => {
                    if (!trackIds.has(track.id)) {
                        allTracks.push(track);
                        trackIds.add(track.id);
                    }
                });
                localScreenShareRef.current.srcObject = null;
            }
        }

        // Collect tracks from all remote video elements
        remoteVideoRefs.current.forEach((video) => {
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

        // Collect tracks from all remote screen share elements
        remoteScreenShareRefs.current.forEach((video) => {
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

        // Collect tracks from all audio elements
        remoteAudioRefs.current.forEach((audio) => {
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

        // AGGRESSIVE: Collect from all video/audio elements in DOM
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
            console.error("[Room] Error collecting video streams:", e);
        }

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
            console.error("[Room] Error collecting audio streams:", e);
        }

        // Stop ALL tracks immediately with iOS-specific handling
        // Stop audio tracks FIRST (they're often the ones that stick around)
        const audioTracks = allTracks.filter((t) => t.kind === "audio");
        const videoTracks = allTracks.filter((t) => t.kind === "video");

        // Stop audio tracks first
        audioTracks.forEach((track) => {
            try {
                if (track.readyState !== "ended") {
                    track.enabled = false;
                    track.stop();
                    if (typeof (track as any).close === "function") {
                        (track as any).close();
                    }
                    console.log("[Room] Stopped AUDIO track:", track.id, track.label);
                }
            } catch (e) {
                console.error("[Room] Error stopping audio track:", e);
            }
        });

        // Then stop video tracks
        videoTracks.forEach((track) => {
            try {
                if (track.readyState !== "ended") {
                    track.enabled = false;
                    track.stop();
                    if (typeof (track as any).close === "function") {
                        (track as any).close();
                    }
                    console.log("[Room] Stopped VIDEO track:", track.id, track.label);
                }
            } catch (e) {
                console.error("[Room] Error stopping video track:", e);
            }
        });

        // Force garbage collection hint (iOS Safari sometimes needs this)
        if (typeof window !== "undefined") {
            requestAnimationFrame(() => {
                document.body.style.display = "none";
                document.body.offsetHeight; // Trigger reflow
                document.body.style.display = "";
            });
        }

        console.log(`[Room] Stopped ${allTracks.length} media tracks`);
    }, []);

    const handleLeave = useCallback(async () => {
        if (durationIntervalRef.current) {
            clearInterval(durationIntervalRef.current);
        }

        // Stop screen share if active
        if (isScreenSharing && clientRef.current) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const localPeer = clientRef.current.localPeer as any;
                await localPeer.stopScreenShare();
            } catch (err) {
                console.error(
                    "[Room] Error stopping screen share on leave:",
                    err
                );
            }
        }

        if (clientRef.current) {
            try {
                await clientRef.current.leaveRoom();
            } catch (err) {
                console.error("[Room] Leave error:", err);
            }
            clientRef.current = null;
        }

        // IMMEDIATE cleanup - don't wait for anything
        stopAllMediaTracks();

        // Additional aggressive cleanup passes with delays for iOS (non-blocking)
        setTimeout(() => {
            console.log("[Room] Cleanup pass 1 (200ms)");
            stopAllMediaTracks();
        }, 200);

        setTimeout(() => {
            console.log("[Room] Cleanup pass 2 (400ms)");
            stopAllMediaTracks();
        }, 400);

        setTimeout(() => {
            console.log("[Room] Cleanup pass 3 (600ms)");
            stopAllMediaTracks();
        }, 600);

        setTimeout(() => {
            console.log("[Room] Cleanup pass 4 (1000ms)");
            stopAllMediaTracks();
        }, 1000);

        setTimeout(() => {
            console.log("[Room] Cleanup pass 5 (2000ms)");
            stopAllMediaTracks();
        }, 2000);

        setInCall(false);
        setCallDuration(0);
        setIsScreenSharing(false);
    }, [isScreenSharing, stopAllMediaTracks]);

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
                    const stream = localVideoRef.current
                        .srcObject as MediaStream;
                    if (stream) {
                        stream.getTracks().forEach((t) => t.stop());
                    }
                    localVideoRef.current.srcObject = null;
                }
            }
            setIsVideoOff(!isVideoOff);
        } catch (err) {
            console.error("[Room] Toggle video error:", err);
        }
    }, [isVideoOff]);

    const toggleScreenShare = useCallback(async () => {
        if (!clientRef.current) return;
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const localPeer = clientRef.current.localPeer as any;

            if (isScreenSharing) {
                // Stop screen share - try multiple methods
                try {
                    if (typeof localPeer.stopScreenShare === "function") {
                        await localPeer.stopScreenShare();
                    } else if (typeof localPeer.stopProducing === "function") {
                        // Try to find and stop screen share producer
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const producers = (clientRef.current.room as any)
                            ?.producers;
                        if (producers) {
                            for (const producer of Array.from(
                                producers.values()
                            )) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                if ((producer as any)?.kind === "screen") {
                                    await localPeer.stopProducing(
                                        (producer as any).id
                                    );
                                    break;
                                }
                            }
                        }
                    }
                } catch (stopErr) {
                    console.warn(
                        "[Room] Error stopping screen share:",
                        stopErr
                    );
                }

                setIsScreenSharing(false);

                // Clean up local screen share ref
                if (localScreenShareRef.current) {
                    const stream = localScreenShareRef.current
                        .srcObject as MediaStream;
                    if (stream) {
                        stream.getTracks().forEach((t) => t.stop());
                    }
                    localScreenShareRef.current.srcObject = null;
                }

                // Reattach local video stream if video is enabled
                // Use a delay to ensure screen share is fully stopped, then re-enable camera
                setTimeout(async () => {
                    if (!isVideoOff && localVideoRef.current) {
                        try {
                            // First, explicitly re-enable video to ensure the track is active
                            console.log("[Room] Re-enabling video after screen share stopped");
                            await localPeer.enableVideo();
                            
                            // Wait a bit for the track to be ready
                            await new Promise(resolve => setTimeout(resolve, 300));
                            
                            // Method 1: Try to get video stream from local peer's getStream method
                            if (typeof localPeer.getStream === "function") {
                                try {
                                    const videoStream =
                                        await localPeer.getStream("video");
                                    if (videoStream && localVideoRef.current) {
                                        localVideoRef.current.srcObject =
                                            videoStream;
                                        localVideoRef.current
                                            .play()
                                            .catch((e) =>
                                                console.warn(
                                                    "[Room] Video reattach play failed:",
                                                    e
                                                )
                                            );
                                        console.log(
                                            "[Room] Reattached local video via getStream"
                                        );
                                        return; // Success, exit early
                                    }
                                } catch (getStreamErr) {
                                    console.log(
                                        "[Room] getStream('video') failed, trying alternatives:",
                                        getStreamErr
                                    );
                                }
                            }

                            // Method 2: Try to get the current video track from producers
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const producers = (clientRef.current.room as any)
                                ?.producers;
                            if (producers) {
                                for (const producer of Array.from(
                                    producers.values()
                                )) {
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    const prod = producer as any;
                                    // Check for video producer (not screen share)
                                    if (
                                        prod?.kind === "video" &&
                                        prod?.track &&
                                        !prod?.appData?.source?.includes(
                                            "screen"
                                        )
                                    ) {
                                        const videoStream = new MediaStream([
                                            prod.track,
                                        ]);
                                        if (localVideoRef.current) {
                                            localVideoRef.current.srcObject =
                                                videoStream;
                                            localVideoRef.current
                                                .play()
                                                .catch((e) =>
                                                    console.warn(
                                                        "[Room] Video reattach play failed:",
                                                        e
                                                    )
                                                );
                                            console.log(
                                                "[Room] Reattached local video from producer"
                                            );
                                            return; // Success, exit early
                                        }
                                    }
                                }
                            }

                            // Method 3: Fallback - re-enable video again to trigger stream-playable event
                            console.log(
                                "[Room] Re-enabling video again to trigger stream-playable event"
                            );
                            await localPeer.enableVideo();
                        } catch (err) {
                            console.warn(
                                "[Room] Error reattaching video after screen share:",
                                err
                            );
                            // Last resort: try to enable video again
                            try {
                                await localPeer.enableVideo();
                            } catch (enableErr) {
                                console.warn(
                                    "[Room] Error re-enabling video:",
                                    enableErr
                                );
                            }
                        }
                    }
                }, 500); // Increased delay to ensure screen share is fully stopped
            } else {
                // Start screen share - try multiple methods
                console.log("[Room] Attempting to start screen share...");
                console.log(
                    "[Room] localPeer methods:",
                    Object.keys(localPeer)
                );

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const room = clientRef.current.room as any;
                console.log(
                    "[Room] room methods:",
                    room ? Object.keys(room) : "room is null"
                );

                try {
                    // Ensure microphone audio is enabled before starting screen share
                    try {
                        await localPeer.enableAudio();
                        console.log("[Room] Ensured microphone audio is enabled before screen share");
                    } catch (audioErr) {
                        console.warn("[Room] Could not ensure audio is enabled:", audioErr);
                    }

                    // Ensure camera video is still enabled (if not already off)
                    if (!isVideoOff) {
                        try {
                            await localPeer.enableVideo();
                            console.log("[Room] Ensured camera video is enabled before screen share");
                        } catch (videoErr) {
                            console.warn("[Room] Could not ensure video is enabled:", videoErr);
                        }
                    }

                    // Method 1: Try startScreenShare on localPeer
                    if (typeof localPeer.startScreenShare === "function") {
                        console.log(
                            "[Room] Using localPeer.startScreenShare method"
                        );
                        const result = await localPeer.startScreenShare();
                        console.log("[Room] startScreenShare result:", result);
                        setIsScreenSharing(true);
                        // Stream will come through stream-playable event
                        
                        // Re-ensure audio/video after screen share starts
                        setTimeout(async () => {
                            try {
                                await localPeer.enableAudio();
                                if (!isVideoOff) {
                                    await localPeer.enableVideo();
                                }
                                console.log("[Room] Re-ensured audio/video after screen share started");
                            } catch (err) {
                                console.warn("[Room] Could not re-ensure audio/video:", err);
                            }
                        }, 500);
                    }
                    // Method 2: Try produceScreenShare on localPeer
                    else if (
                        typeof localPeer.produceScreenShare === "function"
                    ) {
                        console.log(
                            "[Room] Using localPeer.produceScreenShare method"
                        );
                        const result = await localPeer.produceScreenShare();
                        console.log(
                            "[Room] produceScreenShare result:",
                            result
                        );
                        setIsScreenSharing(true);
                        // Stream will come through stream-playable event
                        
                        // Re-ensure audio/video after screen share starts
                        setTimeout(async () => {
                            try {
                                await localPeer.enableAudio();
                                if (!isVideoOff) {
                                    await localPeer.enableVideo();
                                }
                                console.log("[Room] Re-ensured audio/video after screen share started");
                            } catch (err) {
                                console.warn("[Room] Could not re-ensure audio/video:", err);
                            }
                        }, 500);
                    }
                    // Method 3: Try startScreenShare on room
                    else if (
                        room &&
                        typeof room.startScreenShare === "function"
                    ) {
                        console.log(
                            "[Room] Using room.startScreenShare method"
                        );
                        await room.startScreenShare();
                        setIsScreenSharing(true);
                        // Stream will come through stream-playable event
                        
                        // Re-ensure audio/video after screen share starts
                        setTimeout(async () => {
                            try {
                                await localPeer.enableAudio();
                                if (!isVideoOff) {
                                    await localPeer.enableVideo();
                                }
                                console.log("[Room] Re-ensured audio/video after screen share started");
                            } catch (err) {
                                console.warn("[Room] Could not re-ensure audio/video:", err);
                            }
                        }, 500);
                    }
                    // Method 4: Manual getDisplayMedia + produce
                    else {
                        console.log(
                            "[Room] Using manual getDisplayMedia + produce method"
                        );
                        // Method 3: Get screen stream manually and produce it
                        // IMPORTANT: Don't request audio from screen share - we want to keep microphone audio separate
                        const screenStream =
                            await navigator.mediaDevices.getDisplayMedia({
                                video: {
                                    displaySurface: "monitor",
                                } as MediaTrackConstraints,
                                audio: false, // Don't capture screen audio - keep microphone audio separate
                            });
                        console.log(
                            "[Room] Got screen stream via getDisplayMedia"
                        );

                        // Produce the screen stream - try different produce methods
                        const videoTrack = screenStream.getVideoTracks()[0];
                        // Note: We're NOT using screen share audio - microphone audio should remain active

                        if (!videoTrack) {
                            screenStream.getTracks().forEach((t) => t.stop());
                            throw new Error("No video track in screen stream");
                        }

                        // Ensure microphone audio is still enabled before producing screen share
                        try {
                            await localPeer.enableAudio();
                            console.log("[Room] Ensured microphone audio is enabled before screen share");
                        } catch (audioErr) {
                            console.warn("[Room] Could not ensure audio is enabled:", audioErr);
                        }

                        // Ensure camera video is still enabled (if not already off)
                        if (!isVideoOff) {
                            try {
                                await localPeer.enableVideo();
                                console.log("[Room] Ensured camera video is enabled before screen share");
                            } catch (videoErr) {
                                console.warn("[Room] Could not ensure video is enabled:", videoErr);
                            }
                        }

                        let produced = false;

                        // Try produce with track
                        if (typeof localPeer.produce === "function") {
                            try {
                                await localPeer.produce({
                                    track: videoTrack,
                                    appData: { source: "screen" },
                                });
                                console.log(
                                    "[Room] Produced screen track via produce()"
                                );
                                produced = true;
                            } catch (produceErr) {
                                console.warn(
                                    "[Room] produce() failed, trying alternatives:",
                                    produceErr
                                );
                            }
                        }

                        // Try produceScreen if produce failed
                        if (
                            !produced &&
                            typeof localPeer.produceScreen === "function"
                        ) {
                            try {
                                await localPeer.produceScreen(videoTrack);
                                console.log(
                                    "[Room] Produced screen track via produceScreen()"
                                );
                                produced = true;
                            } catch (produceErr) {
                                console.warn(
                                    "[Room] produceScreen() failed:",
                                    produceErr
                                );
                            }
                        }

                        // Try shareScreen if still not produced
                        if (
                            !produced &&
                            typeof localPeer.shareScreen === "function"
                        ) {
                            try {
                                await localPeer.shareScreen(screenStream);
                                console.log(
                                    "[Room] Shared screen via shareScreen()"
                                );
                                produced = true;
                            } catch (produceErr) {
                                console.warn(
                                    "[Room] shareScreen() failed:",
                                    produceErr
                                );
                            }
                        }

                        if (!produced) {
                            screenStream.getTracks().forEach((t) => t.stop());
                            throw new Error(
                                "Could not produce screen share - no compatible method found"
                            );
                        }

                        // Display local preview
                        if (localScreenShareRef.current) {
                            localScreenShareRef.current.srcObject =
                                screenStream;
                            localScreenShareRef.current
                                .play()
                                .catch((e) =>
                                    console.warn(
                                        "[Room] Screen share preview play failed:",
                                        e
                                    )
                                );
                        }
                        setIsScreenSharing(true);
                        
                        // Re-ensure audio/video after screen share starts (screen share shouldn't stop them)
                        setTimeout(async () => {
                            try {
                                await localPeer.enableAudio();
                                if (!isVideoOff) {
                                    await localPeer.enableVideo();
                                }
                                console.log("[Room] Re-ensured audio/video after manual screen share started");
                            } catch (err) {
                                console.warn("[Room] Could not re-ensure audio/video:", err);
                            }
                        }, 500);
                    }
                } catch (shareErr: any) {
                    console.error("[Room] Screen share error:", shareErr);
                    throw shareErr;
                }
            }
        } catch (err: any) {
            console.error("[Room] Toggle screen share error:", err);
            const errorMsg = err?.message || String(err);
            if (
                errorMsg.includes("NotAllowed") ||
                errorMsg.includes("permission")
            ) {
                alert(
                    "Screen sharing permission denied. Please allow screen sharing in your browser."
                );
            } else {
                alert("Failed to share screen. Please try again.");
            }
            setIsScreenSharing(false);
        }
    }, [isScreenSharing]);

    // Check microphone permissions
    const checkMicPermissions = useCallback(async (): Promise<boolean> => {
        try {
            setMicPermissionStatus("checking");

            // Check if permissions API is available
            if (navigator.permissions && navigator.permissions.query) {
                try {
                    const result = await navigator.permissions.query({
                        name: "microphone" as PermissionName,
                    });
                    if (result.state === "denied") {
                        setMicPermissionStatus("denied");
                        setShowMicPermissionAlert(true);
                        return false;
                    } else if (result.state === "granted") {
                        setMicPermissionStatus("granted");
                        setShowMicPermissionAlert(false);
                        return true;
                    }
                } catch (permErr) {
                    // Permissions API might not support microphone query, fall through to getUserMedia check
                    console.log(
                        "[Room] Permissions API not available, using getUserMedia check"
                    );
                }
            }

            // Fallback: Try to get user media to check permissions
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                });
                // Stop the test stream immediately
                stream.getTracks().forEach((track) => track.stop());
                setMicPermissionStatus("granted");
                setShowMicPermissionAlert(false);
                return true;
            } catch (err: any) {
                const errorMessage = err?.message || String(err);
                if (
                    errorMessage.includes("NotAllowed") ||
                    errorMessage.includes("Permission denied") ||
                    errorMessage.includes("permission")
                ) {
                    setMicPermissionStatus("denied");
                    setShowMicPermissionAlert(true);
                    return false;
                } else if (
                    errorMessage.includes("NotFound") ||
                    errorMessage.includes("no device")
                ) {
                    setMicPermissionStatus("denied");
                    setShowMicPermissionAlert(true);
                    return false;
                } else {
                    setMicPermissionStatus("prompt");
                    return false;
                }
            }
        } catch (err) {
            console.error("[Room] Error checking mic permissions:", err);
            setMicPermissionStatus("denied");
            setShowMicPermissionAlert(true);
            return false;
        }
    }, []);

    // Enumerate available audio devices
    const enumerateDevices = useCallback(async () => {
        try {
            // Request permission first if needed
            await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false,
            });

            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter((d) => d.kind === "audioinput");
            const audioOutputs = devices.filter(
                (d) => d.kind === "audiooutput"
            );

            setAudioInputDevices(audioInputs);
            setAudioOutputDevices(audioOutputs);

            // Set default devices if not already set
            if (!selectedMicId && audioInputs.length > 0) {
                setSelectedMicId(audioInputs[0].deviceId);
            }
            if (!selectedSpeakerId && audioOutputs.length > 0) {
                const defaultSpeakerId = audioOutputs[0].deviceId;
                setSelectedSpeakerId(defaultSpeakerId);
                selectedSpeakerIdRef.current = defaultSpeakerId;
            }
        } catch (err) {
            console.error("[Room] Error enumerating devices:", err);
        }
    }, [selectedMicId, selectedSpeakerId]);

    // Request microphone permissions
    const requestMicPermissions = useCallback(async () => {
        try {
            setMicPermissionStatus("checking");
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });
            // Stop the test stream immediately
            stream.getTracks().forEach((track) => track.stop());
            setMicPermissionStatus("granted");
            setShowMicPermissionAlert(false);

            // Refresh device list
            await enumerateDevices();

            // If in call, try to enable audio
            if (inCall && clientRef.current && isMuted) {
                try {
                    await clientRef.current.localPeer.enableAudio();
                    setIsMuted(false);
                } catch (err) {
                    console.error(
                        "[Room] Failed to enable audio after permission grant:",
                        err
                    );
                }
            }
        } catch (err: any) {
            const errorMessage = err?.message || String(err);
            if (
                errorMessage.includes("NotAllowed") ||
                errorMessage.includes("Permission denied")
            ) {
                setMicPermissionStatus("denied");
                setShowMicPermissionAlert(true);
                alert(
                    "Microphone permission denied. Please allow microphone access in your browser settings and try again."
                );
            } else {
                setMicPermissionStatus("denied");
                setShowMicPermissionAlert(true);
                alert(
                    "Failed to access microphone. Please check your device settings."
                );
            }
        }
    }, [inCall, isMuted, enumerateDevices]);

    // Switch microphone
    const switchMicrophone = useCallback(async (deviceId: string) => {
        if (!clientRef.current) return;
        try {
            setSelectedMicId(deviceId);

            // Get new audio track with selected device
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: { exact: deviceId } },
            });

            const audioTrack = stream.getAudioTracks()[0];

            // Replace the audio track in Huddle01
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const localPeer = clientRef.current.localPeer as any;
            if (localPeer.replaceTrack) {
                await localPeer.replaceTrack(audioTrack, "audio");
            } else if (localPeer.updateAudioTrack) {
                await localPeer.updateAudioTrack(audioTrack);
            }

            // Stop the old track
            stream.getTracks().forEach((track) => {
                if (track !== audioTrack) track.stop();
            });

            console.log("[Room] Switched to microphone:", deviceId);
        } catch (err) {
            console.error("[Room] Error switching microphone:", err);
            alert("Failed to switch microphone. Please try again.");
        }
    }, []);

    // Switch speaker (audio output)
    const switchSpeaker = useCallback((deviceId: string) => {
        setSelectedSpeakerId(deviceId);
        selectedSpeakerIdRef.current = deviceId;

        // Set sink ID for all remote audio elements
        remoteAudioRefs.current.forEach((audioEl) => {
            if (audioEl && "setSinkId" in audioEl) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (audioEl as any).setSinkId(deviceId).catch((err: Error) => {
                    console.warn("[Room] Failed to set sink ID:", err);
                });
            }
        });

        console.log("[Room] Switched to speaker:", deviceId);
    }, []);

    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, "0")}:${secs
            .toString()
            .padStart(2, "0")}`;
    };

    // Kick/remove a participant (host only)
    const handleKickPeer = useCallback(
        async (peerId: string) => {
            if (!isHost || !clientRef.current) return;

            try {
                console.log("[Room] Kicking peer:", peerId);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const room = clientRef.current.room as any;

                // Try different methods to kick a peer
                if (room.kickPeer) {
                    await room.kickPeer(peerId);
                } else if (room.removePeer) {
                    await room.removePeer(peerId);
                } else if (room.closePeerConnection) {
                    await room.closePeerConnection(peerId);
                } else {
                    // Fallback: try to get the peer and close their connection
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const remotePeers = room.remotePeers;
                    if (remotePeers) {
                        const peer = remotePeers.get(peerId);
                        if (peer) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const peerAny = peer as any;
                            if (peerAny.close) {
                                await peerAny.close();
                            }
                        }
                    }
                    console.warn(
                        "[Room] No kick method available, peer may not be removed"
                    );
                }

                // Remove from our local state
                setRemotePeers((prev) => {
                    const updated = new Map(prev);
                    updated.delete(peerId);
                    return updated;
                });
                remoteVideoRefs.current.delete(peerId);
                remoteAudioRefs.current.delete(peerId);
                setSelectedPeerMenu(null);
            } catch (err) {
                console.error("[Room] Error kicking peer:", err);
            }
        },
        [isHost]
    );

    // Enumerate devices when joining call
    useEffect(() => {
        if (inCall) {
            enumerateDevices();

            // Check microphone permissions after joining
            checkMicPermissions();

            // Listen for device changes
            const handleDeviceChange = () => {
                enumerateDevices();
            };

            navigator.mediaDevices.addEventListener(
                "devicechange",
                handleDeviceChange
            );

            return () => {
                navigator.mediaDevices.removeEventListener(
                    "devicechange",
                    handleDeviceChange
                );
            };
        }
    }, [inCall, enumerateDevices, checkMicPermissions]);

    // Periodically refresh display names for all peers (in case metadata loads asynchronously)
    useEffect(() => {
        if (!inCall || !clientRef.current) return;

        const refreshDisplayNames = () => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const remotePeersMap = (clientRef.current.room as any)
                    ?.remotePeers;
                if (remotePeersMap) {
                    remotePeersMap.forEach((peer: any, peerId: string) => {
                        const metadata = peer?.metadata;
                        if (metadata?.displayName) {
                            setRemotePeers((prev) => {
                                const existing = prev.get(peerId);
                                if (
                                    existing &&
                                    existing.displayName !==
                                        metadata.displayName
                                ) {
                                    console.log(
                                        "[Room] Refreshing display name for",
                                        peerId,
                                        "to",
                                        metadata.displayName
                                    );
                                    const updated = new Map(prev);
                                    updated.set(peerId, {
                                        ...existing,
                                        displayName: metadata.displayName,
                                    });
                                    return updated;
                                }
                                return prev;
                            });
                        }
                    });
                }
            } catch (e) {
                // Ignore errors
            }
        };

        // Refresh immediately and then every 2 seconds for the first 10 seconds
        refreshDisplayNames();
        const interval1 = setInterval(refreshDisplayNames, 2000);
        const timeout1 = setTimeout(() => clearInterval(interval1), 10000);

        // Then refresh every 5 seconds after that
        const interval2 = setInterval(refreshDisplayNames, 5000);
        const timeout2 = setTimeout(() => clearInterval(interval2), 60000); // Stop after 1 minute

        return () => {
            clearInterval(interval1);
            clearInterval(interval2);
            clearTimeout(timeout1);
            clearTimeout(timeout2);
        };
    }, [inCall]);

    // Enumerate devices when device menu is opened
    useEffect(() => {
        if (showDeviceMenu && inCall) {
            enumerateDevices();
        }
    }, [showDeviceMenu, inCall, enumerateDevices]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (durationIntervalRef.current) {
                clearInterval(durationIntervalRef.current);
            }
            if (clientRef.current) {
                clientRef.current.leaveRoom().catch(() => {});
            }
            // Cleanup media tracks on unmount
            stopAllMediaTracks();
        };
    }, [stopAllMediaTracks]);

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
                        <span className="text-4xl">
                            {isJoinError ? "⚠️" : "🚫"}
                        </span>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-3">
                        {error === "Room not found"
                            ? "Room Not Found"
                            : error === "This room has ended"
                            ? "Room Ended"
                            : error === "This room has expired"
                            ? "Room Expired"
                            : isJoinError
                            ? "Connection Issue"
                            : "Error"}
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
        const totalParticipants = remotePeerArray.length + 1;

        // Check if anyone is screen sharing (local or remote)
        const hasAnyScreenShare =
            isScreenSharing ||
            remotePeerArray.some((peer) => peer.screenShareTrack);
        const screenSharingPeer = remotePeerArray.find(
            (peer) => peer.screenShareTrack
        );

        // Calculate grid layout based on participants and screen sharing
        const getGridClass = () => {
            if (hasAnyScreenShare) {
                // When screen sharing, use a layout with screen share on top and small videos below
                return "grid-cols-1";
            }
            if (totalParticipants === 1) return "grid-cols-1";
            if (totalParticipants === 2) return "grid-cols-2";
            if (totalParticipants <= 4) return "grid-cols-2 grid-rows-2";
            return "grid-cols-2 grid-rows-2"; // Max 4 shown
        };

        return (
            <div className="h-screen h-[100dvh] bg-zinc-950 flex flex-col overflow-hidden">
                {/* Header - fixed height */}
                <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                        {isPWA && (
                            <Link
                                href="/"
                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                                title="Back to Dashboard"
                            >
                                <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M15 19l-7-7 7-7"
                                    />
                                </svg>
                            </Link>
                        )}
                        <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-white font-medium text-sm truncate max-w-[150px]">
                            {room.title}
                        </span>
                        <span className="text-zinc-500 text-xs">
                            {formatDuration(callDuration)}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <span>👥 {totalParticipants}</span>
                        <span className="hidden sm:inline">
                            🔗 {room.joinCode}
                        </span>
                        {/* Chat Toggle in Header */}
                        <button
                            onClick={() => setIsChatOpen(!isChatOpen)}
                            className={`relative p-1.5 rounded-lg transition-colors ${
                                isChatOpen
                                    ? "bg-orange-500/20 text-orange-400"
                                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                            }`}
                            title="Toggle chat"
                        >
                            <svg
                                className="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                />
                            </svg>
                            {unreadMessages > 0 && !isChatOpen && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full text-[10px] text-white flex items-center justify-center font-medium">
                                    {unreadMessages > 9 ? "9+" : unreadMessages}
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                {/* Microphone Permission Alert */}
                <AnimatePresence>
                    {showMicPermissionAlert &&
                        micPermissionStatus === "denied" && (
                            <motion.div
                                initial={{ opacity: 0, y: -20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="flex-shrink-0 mx-4 mt-3 mb-2 p-4 bg-red-500/10 border border-red-500/30 rounded-xl"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="flex-shrink-0 w-5 h-5 text-red-400 mt-0.5">
                                        <svg
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                            />
                                        </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-red-400 font-semibold text-sm mb-1">
                                            Microphone Access Denied
                                        </h4>
                                        <p className="text-red-300/80 text-xs mb-3">
                                            Others cannot hear you. Please allow
                                            microphone access in your browser
                                            settings.
                                        </p>
                                        <button
                                            onClick={requestMicPermissions}
                                            className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded-lg text-red-400 text-xs font-medium transition-colors"
                                        >
                                            Grant Microphone Permission
                                        </button>
                                    </div>
                                    <button
                                        onClick={() =>
                                            setShowMicPermissionAlert(false)
                                        }
                                        className="flex-shrink-0 text-red-400/60 hover:text-red-400 transition-colors"
                                        title="Dismiss"
                                    >
                                        <svg
                                            className="w-4 h-4"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M6 18L18 6M6 6l12 12"
                                            />
                                        </svg>
                                    </button>
                                </div>
                            </motion.div>
                        )}
                </AnimatePresence>

                {/* Main content area - fills remaining space */}
                <div className="flex-1 flex min-h-0 max-h-full overflow-hidden">
                    {/* Video Area - shrinks when chat is open */}
                    <div
                        className={`p-2 sm:p-3 overflow-hidden transition-all duration-300 min-h-0 ${
                            isChatOpen
                                ? "flex-1 sm:w-[calc(100%-320px)]"
                                : "flex-1"
                        }`}
                    >
                        {hasAnyScreenShare ? (
                            // Screen sharing layout: large screen share on top, small videos below
                            <div className="h-full min-h-0 max-h-full flex flex-col gap-2 sm:gap-3">
                                {/* Screen Share - takes up most of the space */}
                                <div className="flex-1 min-h-0 relative bg-zinc-900 rounded-2xl overflow-hidden flex items-center justify-center">
                                    {isScreenSharing ? (
                                        <video
                                            ref={localScreenShareRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            className="max-w-full max-h-full w-auto h-auto object-contain"
                                        />
                                    ) : screenSharingPeer ? (
                                        <video
                                            ref={(el) => {
                                                if (el) {
                                                    remoteScreenShareRefs.current.set(
                                                        screenSharingPeer.peerId,
                                                        el
                                                    );
                                                    if (
                                                        screenSharingPeer.screenShareTrack &&
                                                        !el.srcObject
                                                    ) {
                                                        el.srcObject =
                                                            new MediaStream([
                                                                screenSharingPeer.screenShareTrack,
                                                            ]);
                                                        el.play().catch(
                                                            () => {}
                                                        );
                                                    }
                                                }
                                            }}
                                            autoPlay
                                            playsInline
                                            className="max-w-full max-h-full w-auto h-auto object-contain"
                                        />
                                    ) : null}
                                    <div className="absolute bottom-3 left-3 flex items-center gap-2">
                                        <span className="px-2 py-1 bg-black/60 rounded-lg text-white text-xs sm:text-sm">
                                            {isScreenSharing
                                                ? `${displayName} (You) - Sharing Screen`
                                                : screenSharingPeer
                                                ? `${screenSharingPeer.displayName} - Sharing Screen`
                                                : "Screen Share"}
                                        </span>
                                    </div>
                                </div>

                                {/* Small video feeds row at bottom */}
                                <div className="flex-shrink-0 h-24 sm:h-32 flex gap-2 sm:gap-3 overflow-x-auto">
                                    {/* Local video - always show when video is enabled */}
                                    <div className="flex-shrink-0 w-32 sm:w-40 relative bg-zinc-900 rounded-xl overflow-hidden">
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
                                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                                                    <span className="text-lg text-white font-bold">
                                                        {displayName[0]?.toUpperCase() ||
                                                            "?"}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                        <div className="absolute bottom-1 left-1">
                                            <span className="px-1.5 py-0.5 bg-black/60 rounded text-white text-[10px]">
                                                {displayName} (You)
                                            </span>
                                        </div>
                                    </div>

                                    {/* Remote peers (excluding the one sharing screen) */}
                                    {remotePeerArray
                                        .filter(
                                            (peer) =>
                                                peer.peerId !==
                                                screenSharingPeer?.peerId
                                        )
                                        .map((peer) => (
                                            <div
                                                key={peer.peerId}
                                                className="flex-shrink-0 w-32 sm:w-40 relative bg-zinc-900 rounded-xl overflow-hidden"
                                            >
                                                {peer.videoTrack ? (
                                                    <video
                                                        ref={(el) => {
                                                            if (el) {
                                                                remoteVideoRefs.current.set(
                                                                    peer.peerId,
                                                                    el
                                                                );
                                                                if (
                                                                    peer.videoTrack &&
                                                                    !el.srcObject
                                                                ) {
                                                                    el.srcObject =
                                                                        new MediaStream(
                                                                            [
                                                                                peer.videoTrack,
                                                                            ]
                                                                        );
                                                                    el.play().catch(
                                                                        () => {}
                                                                    );
                                                                }
                                                            }
                                                        }}
                                                        autoPlay
                                                        playsInline
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                                                            <span className="text-lg text-white font-bold">
                                                                {peer.displayName[0]?.toUpperCase() ||
                                                                    "?"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="absolute bottom-1 left-1">
                                                    <span className="px-1.5 py-0.5 bg-black/60 rounded text-white text-[10px]">
                                                        {peer.displayName}
                                                    </span>
                                                </div>
                                                {/* Remote Audio Element (hidden) - Always update when track is available */}
                                                <audio
                                                    ref={(el) => {
                                                        if (el) {
                                                            remoteAudioRefs.current.set(
                                                                peer.peerId,
                                                                el
                                                            );
                                                            const speakerId =
                                                                selectedSpeakerIdRef.current;
                                                            if (
                                                                speakerId &&
                                                                "setSinkId" in
                                                                    el
                                                            ) {
                                                                (el as any)
                                                                    .setSinkId(
                                                                        speakerId
                                                                    )
                                                                    .catch(
                                                                        () => {}
                                                                    );
                                                            }
                                                            // Always update audio track when available (even if srcObject exists)
                                                            if (peer.audioTrack) {
                                                                const currentStream = el.srcObject as MediaStream;
                                                                const currentTrack = currentStream?.getAudioTracks()[0];
                                                                
                                                                // Only update if track changed
                                                                if (!currentTrack || currentTrack.id !== peer.audioTrack.id) {
                                                                    el.srcObject =
                                                                        new MediaStream(
                                                                            [
                                                                                peer.audioTrack,
                                                                            ]
                                                                        );
                                                                    el.play().catch(
                                                                        () => {}
                                                                    );
                                                                }
                                                            }
                                                        }
                                                    }}
                                                    autoPlay
                                                    className="hidden"
                                                />
                                            </div>
                                        ))}
                                </div>
                            </div>
                        ) : (
                            // Normal grid layout when no screen sharing
                            <div
                                className={`h-full min-h-0 max-h-full grid gap-2 sm:gap-3 ${getGridClass()}`}
                            >
                                {/* Local Video / Screen Share */}
                                <div className="relative bg-zinc-900 rounded-2xl overflow-hidden flex items-center justify-center">
                                    {isScreenSharing ? (
                                        <video
                                            ref={localScreenShareRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            className="max-w-full max-h-full w-auto h-auto object-contain"
                                        />
                                    ) : !isVideoOff ? (
                                        <video
                                            ref={localVideoRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            className="max-w-full max-h-full w-auto h-auto object-contain"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                                            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                                                <span className="text-3xl sm:text-4xl text-white font-bold">
                                                    {displayName[0]?.toUpperCase() ||
                                                        "?"}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                    <div className="absolute bottom-3 left-3 flex items-center gap-2">
                                        <span className="px-2 py-1 bg-black/60 rounded-lg text-white text-xs sm:text-sm">
                                            {displayName} (You)
                                            {isScreenSharing &&
                                                " - Sharing Screen"}
                                        </span>
                                        {isHost && (
                                            <span className="px-2 py-1 bg-orange-500/80 rounded-lg text-white text-xs font-medium">
                                                👑 Host
                                            </span>
                                        )}
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
                                            className="relative bg-zinc-900 rounded-2xl overflow-hidden flex items-center justify-center"
                                        >
                                            {peer.screenShareTrack ? (
                                                <video
                                                    ref={(el) => {
                                                        if (el) {
                                                            remoteScreenShareRefs.current.set(
                                                                peer.peerId,
                                                                el
                                                            );
                                                            // Try to play if we have a track
                                                            if (
                                                                peer.screenShareTrack &&
                                                                !el.srcObject
                                                            ) {
                                                                el.srcObject =
                                                                    new MediaStream(
                                                                        [
                                                                            peer.screenShareTrack,
                                                                        ]
                                                                    );
                                                                el.play().catch(
                                                                    () => {}
                                                                );
                                                            }
                                                        }
                                                    }}
                                                    autoPlay
                                                    playsInline
                                                    className="max-w-full max-h-full w-auto h-auto object-contain"
                                                />
                                            ) : peer.videoTrack ? (
                                                <video
                                                    ref={(el) => {
                                                        if (el) {
                                                            remoteVideoRefs.current.set(
                                                                peer.peerId,
                                                                el
                                                            );
                                                            // Always update srcObject for Safari compatibility
                                                            if (peer.videoTrack) {
                                                                const stream = new MediaStream([peer.videoTrack]);
                                                                el.srcObject = stream;
                                                                el.play().catch((e) => {
                                                                    console.warn("[Room] Video play failed:", e);
                                                                });
                                                            }
                                                        }
                                                    }}
                                                    autoPlay
                                                    playsInline
                                                    muted={false}
                                                    className="max-w-full max-h-full w-auto h-auto object-contain"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                                                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                                                        <span className="text-3xl sm:text-4xl text-white font-bold">
                                                            {peer.displayName[0]?.toUpperCase() ||
                                                                "?"}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                            {/* Remote Audio Element (hidden) */}
                                            <audio
                                                ref={(el) => {
                                                    if (el) {
                                                        remoteAudioRefs.current.set(
                                                            peer.peerId,
                                                            el
                                                        );

                                                        // Set speaker if one is selected
                                                        const speakerId =
                                                            selectedSpeakerIdRef.current;
                                                        if (
                                                            speakerId &&
                                                            "setSinkId" in el
                                                        ) {
                                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                            (el as any)
                                                                .setSinkId(
                                                                    speakerId
                                                                )
                                                                .catch(
                                                                    (
                                                                        err: Error
                                                                    ) => {
                                                                        console.warn(
                                                                            "[Room] Failed to set sink ID:",
                                                                            err
                                                                        );
                                                                    }
                                                                );
                                                        }

                                                        // Try to play if we have a track
                                                        if (
                                                            peer.audioTrack &&
                                                            !el.srcObject
                                                        ) {
                                                            el.srcObject =
                                                                new MediaStream(
                                                                    [
                                                                        peer.audioTrack,
                                                                    ]
                                                                );
                                                            el.play().catch(
                                                                () => {}
                                                            );
                                                        }
                                                    }
                                                }}
                                                autoPlay
                                                className="hidden"
                                            />
                                            <div className="absolute bottom-3 left-3 flex items-center gap-2">
                                                <span className="px-2 py-1 bg-black/60 rounded-lg text-white text-xs sm:text-sm">
                                                    {peer.displayName}
                                                    {peer.screenShareTrack &&
                                                        " - Sharing Screen"}
                                                </span>
                                            </div>

                                            {/* Host Controls - Menu Button */}
                                            {isHost && (
                                                <div className="absolute top-3 right-3">
                                                    <div className="relative">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedPeerMenu(
                                                                    selectedPeerMenu ===
                                                                        peer.peerId
                                                                        ? null
                                                                        : peer.peerId
                                                                );
                                                            }}
                                                            className="p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white transition-colors"
                                                            title="Manage participant"
                                                        >
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
                                                                    d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                                                                />
                                                            </svg>
                                                        </button>

                                                        {/* Dropdown Menu */}
                                                        <AnimatePresence>
                                                            {selectedPeerMenu ===
                                                                peer.peerId && (
                                                                <>
                                                                    <div
                                                                        className="fixed inset-0 z-40"
                                                                        onClick={() =>
                                                                            setSelectedPeerMenu(
                                                                                null
                                                                            )
                                                                        }
                                                                    />
                                                                    <motion.div
                                                                        initial={{
                                                                            opacity: 0,
                                                                            y: -10,
                                                                        }}
                                                                        animate={{
                                                                            opacity: 1,
                                                                            y: 0,
                                                                        }}
                                                                        exit={{
                                                                            opacity: 0,
                                                                            y: -10,
                                                                        }}
                                                                        className="absolute right-0 top-full mt-2 w-48 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-50 overflow-hidden"
                                                                    >
                                                                        <button
                                                                            onClick={() =>
                                                                                handleKickPeer(
                                                                                    peer.peerId
                                                                                )
                                                                            }
                                                                            className="w-full px-4 py-3 text-left text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                                                                        >
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
                                                                                    d="M18 12H6"
                                                                                />
                                                                            </svg>
                                                                            <span className="text-sm font-medium">
                                                                                Remove
                                                                                from
                                                                                room
                                                                            </span>
                                                                        </button>
                                                                    </motion.div>
                                                                </>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                </div>
                                            )}
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
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

                {/* Controls - fixed height */}
                <div className="flex-shrink-0 px-4 py-3 border-t border-zinc-800">
                    <div className="flex items-center justify-center gap-3">
                        {/* Mic Toggle */}
                        <button
                            onClick={() => {
                                if (micPermissionStatus === "denied") {
                                    requestMicPermissions();
                                } else {
                                    toggleMute();
                                }
                            }}
                            className={`relative p-3 rounded-full transition-all ${
                                micPermissionStatus === "denied"
                                    ? "bg-red-500/50 hover:bg-red-500/70 text-white border-2 border-red-400"
                                    : !isMuted
                                    ? "bg-zinc-800 hover:bg-zinc-700 text-white"
                                    : "bg-red-500 hover:bg-red-600 text-white"
                            }`}
                            title={
                                micPermissionStatus === "denied"
                                    ? "Microphone permission denied - Click to grant"
                                    : isMuted
                                    ? "Unmute"
                                    : "Mute"
                            }
                        >
                            {micPermissionStatus === "denied" ? (
                                <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                    />
                                </svg>
                            ) : !isMuted ? (
                                <svg
                                    className="w-5 h-5"
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
                            ) : (
                                <svg
                                    className="w-5 h-5"
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
                            )}
                        </button>

                        {/* Camera Toggle */}
                        <button
                            onClick={toggleVideo}
                            className={`p-3 rounded-full transition-all ${
                                !isVideoOff
                                    ? "bg-zinc-800 hover:bg-zinc-700 text-white"
                                    : "bg-red-500 hover:bg-red-600 text-white"
                            }`}
                            title={
                                isVideoOff
                                    ? "Turn on camera"
                                    : "Turn off camera"
                            }
                        >
                            {!isVideoOff ? (
                                <svg
                                    className="w-5 h-5"
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
                            ) : (
                                <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                                    />
                                </svg>
                            )}
                        </button>

                        {/* Screen Share Toggle */}
                        <button
                            onClick={toggleScreenShare}
                            className={`p-3 rounded-full transition-all ${
                                isScreenSharing
                                    ? "bg-orange-500 hover:bg-orange-600 text-white"
                                    : "bg-zinc-800 hover:bg-zinc-700 text-white"
                            }`}
                            title={
                                isScreenSharing
                                    ? "Stop sharing screen"
                                    : "Share screen"
                            }
                        >
                            {isScreenSharing ? (
                                <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            ) : (
                                <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                    />
                                </svg>
                            )}
                        </button>

                        {/* Device Selection */}
                        <div className="relative">
                            <button
                                onClick={() => {
                                    setShowDeviceMenu(!showDeviceMenu);
                                    if (!showDeviceMenu) {
                                        enumerateDevices();
                                    }
                                }}
                                className="p-3 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white transition-all"
                                title="Audio devices"
                            >
                                <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                                    />
                                </svg>
                            </button>

                            {/* Device Menu Dropdown */}
                            <AnimatePresence>
                                {showDeviceMenu && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-40"
                                            onClick={() =>
                                                setShowDeviceMenu(false)
                                            }
                                        />
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 10 }}
                                            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 overflow-hidden"
                                        >
                                            <div className="p-3 border-b border-zinc-800">
                                                <h3 className="text-sm font-semibold text-white">
                                                    Audio Devices
                                                </h3>
                                            </div>

                                            {/* Microphone Selection */}
                                            <div className="p-3 border-b border-zinc-800">
                                                <label className="block text-xs text-zinc-400 mb-2">
                                                    Microphone
                                                </label>
                                                <select
                                                    value={selectedMicId || ""}
                                                    onChange={(e) => {
                                                        if (e.target.value) {
                                                            switchMicrophone(
                                                                e.target.value
                                                            );
                                                        }
                                                    }}
                                                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                                >
                                                    {audioInputDevices.map(
                                                        (device) => (
                                                            <option
                                                                key={
                                                                    device.deviceId
                                                                }
                                                                value={
                                                                    device.deviceId
                                                                }
                                                            >
                                                                {device.label ||
                                                                    `Microphone ${device.deviceId.slice(
                                                                        0,
                                                                        8
                                                                    )}`}
                                                            </option>
                                                        )
                                                    )}
                                                    {audioInputDevices.length ===
                                                        0 && (
                                                        <option value="">
                                                            No microphones found
                                                        </option>
                                                    )}
                                                </select>
                                            </div>

                                            {/* Speaker Selection */}
                                            <div className="p-3">
                                                <label className="block text-xs text-zinc-400 mb-2">
                                                    Speaker
                                                </label>
                                                <select
                                                    value={
                                                        selectedSpeakerId || ""
                                                    }
                                                    onChange={(e) => {
                                                        if (e.target.value) {
                                                            switchSpeaker(
                                                                e.target.value
                                                            );
                                                        }
                                                    }}
                                                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                                >
                                                    {audioOutputDevices.map(
                                                        (device) => (
                                                            <option
                                                                key={
                                                                    device.deviceId
                                                                }
                                                                value={
                                                                    device.deviceId
                                                                }
                                                            >
                                                                {device.label ||
                                                                    `Speaker ${device.deviceId.slice(
                                                                        0,
                                                                        8
                                                                    )}`}
                                                            </option>
                                                        )
                                                    )}
                                                    {audioOutputDevices.length ===
                                                        0 && (
                                                        <option value="">
                                                            No speakers found
                                                        </option>
                                                    )}
                                                </select>
                                            </div>
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Chat Toggle */}
                        <button
                            onClick={() => setIsChatOpen(!isChatOpen)}
                            className={`relative p-3 rounded-full transition-all hidden sm:block ${
                                isChatOpen
                                    ? "bg-orange-500 hover:bg-orange-600 text-white"
                                    : "bg-zinc-800 hover:bg-zinc-700 text-white"
                            }`}
                            title={isChatOpen ? "Close chat" : "Open chat"}
                        >
                            <svg
                                className="w-5 h-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                />
                            </svg>
                            {unreadMessages > 0 && !isChatOpen && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full text-[10px] text-white flex items-center justify-center font-medium animate-pulse">
                                    {unreadMessages > 9 ? "9+" : unreadMessages}
                                </span>
                            )}
                        </button>

                        {/* Leave Call */}
                        <button
                            onClick={handleLeave}
                            className="p-3 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all"
                            title="Leave meeting"
                        >
                            <svg
                                className="w-5 h-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"
                                />
                            </svg>
                        </button>

                        {/* Copy Share URL */}
                        <button
                            onClick={async () => {
                                const shareUrl = `https://app.spritz.chat/room/${room.joinCode}`;
                                try {
                                    await navigator.clipboard.writeText(
                                        shareUrl
                                    );
                                    setCopiedShareUrl(true);
                                    setTimeout(
                                        () => setCopiedShareUrl(false),
                                        2000
                                    );
                                } catch (err) {
                                    console.error("Failed to copy:", err);
                                }
                            }}
                            className="p-3 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white transition-all"
                            title="Copy share link"
                        >
                            {copiedShareUrl ? (
                                <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M5 13l4 4L19 7"
                                    />
                                </svg>
                            ) : (
                                <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                    />
                                </svg>
                            )}
                        </button>
                    </div>
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
                    <div className="flex items-center justify-between mb-6">
                        {isPWA && (
                            <Link
                                href="/"
                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                                title="Back to Dashboard"
                            >
                                <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M15 19l-7-7 7-7"
                                    />
                                </svg>
                            </Link>
                        )}
                        <Link href="/" className={`inline-block ${isPWA ? "flex-1 text-center" : ""}`}>
                            <span className="text-3xl font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
                                Spritz
                            </span>
                        </Link>
                        {isPWA && <div className="w-[42px]" />}
                    </div>
                </div>

                {/* Room Card */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                    {/* Room Info */}
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                            <span className="text-3xl">🎥</span>
                        </div>
                        <h1 className="text-xl font-bold text-white mb-2">
                            {room.title}
                        </h1>
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
                        {fetchingUserInfo ? (
                            <div className="flex items-center justify-center py-4">
                                <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                                <span className="ml-2 text-sm text-zinc-400">
                                    Loading your profile...
                                </span>
                            </div>
                        ) : hasUserDisplayName ? (
                            <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4">
                                <p className="text-xs text-zinc-400 mb-1">
                                    Joining as
                                </p>
                                <p className="text-white font-medium">
                                    {displayName}
                                </p>
                            </div>
                        ) : (
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                    Your Name
                                </label>
                                <input
                                    type="text"
                                    value={displayName}
                                    onChange={(e) =>
                                        setDisplayName(e.target.value)
                                    }
                                    placeholder="Enter your name"
                                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                    maxLength={30}
                                    onKeyDown={(e) => {
                                        if (
                                            e.key === "Enter" &&
                                            displayName.trim()
                                        ) {
                                            handleJoin();
                                        }
                                    }}
                                />
                            </div>
                        )}

                        <button
                            onClick={handleJoin}
                            disabled={
                                !displayName.trim() ||
                                joiningRoom ||
                                !isHuddle01Configured ||
                                fetchingUserInfo
                            }
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
                    <Link
                        href="/"
                        className="text-orange-500 hover:text-orange-400"
                    >
                        Spritz
                    </Link>
                </p>
            </motion.div>
        </div>
    );
}
