"use client";

import {
    createContext,
    useContext,
    useState,
    useCallback,
    useRef,
    useEffect,
    type ReactNode,
} from "react";
import { type Address } from "viem";
import { useWalletClient } from "wagmi";
import protobuf from "protobufjs";
import { supabase } from "@/config/supabase";

// Dynamic imports for Waku to avoid SSR issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wakuSdk: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wakuEncryption: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wakuUtils: any = null;

// Message structure using Protobuf
const MessageProto = new protobuf.Type("ChatMessage")
    .add(new protobuf.Field("timestamp", 1, "uint64"))
    .add(new protobuf.Field("sender", 2, "string"))
    .add(new protobuf.Field("content", 3, "string"))
    .add(new protobuf.Field("messageId", 4, "string"))
    .add(new protobuf.Field("messageType", 5, "string")); // text, pixel_art, system

type NewMessageCallback = (message: {
    senderAddress: string;
    content: string;
    conversationId: string;
}) => void;

export type WakuGroup = {
    id: string;
    name: string;
    memberCount: number;
    createdAt: Date;
};

// Storage keys
const WAKU_KEYS_STORAGE = "waku_encryption_keys";
const HIDDEN_GROUPS_KEY = "shout_hidden_groups";
const GROUPS_STORAGE_KEY = "waku_groups";
const DM_KEYS_STORAGE = "waku_dm_keys";
const MESSAGES_STORAGE_KEY = "waku_messages";

// Helper to encrypt content for Supabase storage using AES-GCM
async function encryptForStorage(
    content: string,
    symmetricKey: Uint8Array
): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);

    // Import the key for AES-GCM
    const keyBuffer = new Uint8Array(symmetricKey).buffer;
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyBuffer,
        { name: "AES-GCM" },
        false,
        ["encrypt"]
    );

    // Generate a random IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt
    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        cryptoKey,
        data
    );

    // Combine IV + encrypted data and convert to base64
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
}

// Helper to decrypt content from Supabase storage
async function decryptFromStorage(
    encryptedBase64: string,
    symmetricKey: Uint8Array
): Promise<string> {
    try {
        // Decode base64
        const combined = Uint8Array.from(atob(encryptedBase64), (c) =>
            c.charCodeAt(0)
        );

        // Extract IV and encrypted data
        const iv = combined.slice(0, 12);
        const encrypted = combined.slice(12);

        // Import the key for AES-GCM
        const keyBuffer = new Uint8Array(symmetricKey).buffer;
        const cryptoKey = await crypto.subtle.importKey(
            "raw",
            keyBuffer,
            { name: "AES-GCM" },
            false,
            ["decrypt"]
        );

        // Decrypt
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            cryptoKey,
            encrypted
        );

        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    } catch (err) {
        console.error("[Waku] Failed to decrypt message:", err);
        return "[Decryption failed]";
    }
}

// Save message to Supabase (encrypted)
async function saveMessageToSupabase(
    conversationId: string,
    senderAddress: string,
    recipientAddress: string | null,
    groupId: string | null,
    content: string,
    messageType: string,
    messageId: string,
    symmetricKey: Uint8Array,
    sentAt: Date
): Promise<boolean> {
    if (!supabase) {
        console.log("[Waku] Supabase not configured, skipping message save");
        return false;
    }

    try {
        const encryptedContent = await encryptForStorage(content, symmetricKey);

        const { error } = await supabase.from("shout_messages").insert({
            conversation_id: conversationId,
            sender_address: senderAddress.toLowerCase(),
            recipient_address: recipientAddress?.toLowerCase() || null,
            group_id: groupId,
            encrypted_content: encryptedContent,
            message_type: messageType,
            message_id: messageId,
            sent_at: sentAt.toISOString(),
        });

        if (error) {
            // Ignore duplicate key errors (message already exists)
            if (error.code === "23505") {
                console.log(
                    "[Waku] Message already exists in Supabase:",
                    messageId
                );
                return true;
            }
            console.error("[Waku] Failed to save message to Supabase:", error);
            return false;
        }

        console.log("[Waku] Message saved to Supabase:", messageId);
        return true;
    } catch (err) {
        console.error("[Waku] Error saving to Supabase:", err);
        return false;
    }
}

// Fetch messages from Supabase (decrypted)
async function fetchMessagesFromSupabase(
    conversationId: string,
    symmetricKey: Uint8Array
): Promise<
    Array<{
        id: string;
        content: string;
        senderInboxId: string;
        sentAtNs: bigint;
        conversationId: string;
    }>
> {
    if (!supabase) {
        return [];
    }

    try {
        const { data, error } = await supabase
            .from("shout_messages")
            .select("*")
            .eq("conversation_id", conversationId)
            .order("sent_at", { ascending: true });

        if (error) {
            console.error(
                "[Waku] Failed to fetch messages from Supabase:",
                error
            );
            return [];
        }

        if (!data || data.length === 0) {
            return [];
        }

        console.log("[Waku] Fetched", data.length, "messages from Supabase");

        // Decrypt messages
        const decrypted = await Promise.all(
            data.map(async (msg) => {
                const content = await decryptFromStorage(
                    msg.encrypted_content,
                    symmetricKey
                );
                return {
                    id: msg.message_id,
                    content,
                    senderInboxId: msg.sender_address,
                    sentAtNs:
                        BigInt(new Date(msg.sent_at).getTime()) *
                        BigInt(1000000),
                    conversationId: msg.conversation_id,
                };
            })
        );

        return decrypted;
    } catch (err) {
        console.error("[Waku] Error fetching from Supabase:", err);
        return [];
    }
}

// Helper to persist messages to localStorage
function persistMessages(topic: string, messages: unknown[]) {
    if (typeof window === "undefined") return;
    try {
        const allMessages = JSON.parse(
            localStorage.getItem(MESSAGES_STORAGE_KEY) || "{}"
        );
        // Convert BigInt to string for JSON serialization
        const serializable = messages.map((m: any) => ({
            ...m,
            sentAtNs: m.sentAtNs?.toString() || "0",
        }));
        allMessages[topic] = serializable;
        localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(allMessages));
    } catch (e) {
        console.log("[Waku] Failed to persist messages:", e);
    }
}

// Helper to load messages from localStorage (with cleanup of corrupt data)
function loadPersistedMessages(topic: string): unknown[] {
    if (typeof window === "undefined") return [];
    try {
        const allMessages = JSON.parse(
            localStorage.getItem(MESSAGES_STORAGE_KEY) || "{}"
        );
        const rawMessages = allMessages[topic] || [];

        // Deduplicate and filter out messages without IDs
        const seenIds = new Set<string>();
        const cleanedMessages: unknown[] = [];

        for (const m of rawMessages) {
            if (!m.id) continue; // Skip messages without ID
            if (seenIds.has(m.id)) continue; // Skip duplicates
            seenIds.add(m.id);
            cleanedMessages.push({
                ...m,
                sentAtNs: BigInt(m.sentAtNs || "0"),
            });
        }

        // If we cleaned up data, persist the cleaned version
        if (cleanedMessages.length < rawMessages.length) {
            console.log(
                "[Waku] Cleaned localStorage:",
                rawMessages.length,
                "→",
                cleanedMessages.length,
                "messages"
            );
            allMessages[topic] = cleanedMessages.map((m: any) => ({
                ...m,
                sentAtNs: m.sentAtNs.toString(),
            }));
            localStorage.setItem(
                MESSAGES_STORAGE_KEY,
                JSON.stringify(allMessages)
            );
        }

        return cleanedMessages;
    } catch (e) {
        console.log("[Waku] Failed to load persisted messages:", e);
        return [];
    }
}

type WakuContextType = {
    isInitialized: boolean;
    isInitializing: boolean;
    error: string | null;
    userInboxId: string | null;
    unreadCounts: Record<string, number>;
    initialize: () => Promise<boolean>;
    revokeAllInstallations: () => Promise<boolean>;
    sendMessage: (
        peerAddress: string,
        content: string
    ) => Promise<{
        success: boolean;
        error?: string;
        messageId?: string;
        message?: {
            id: string;
            content: string;
            senderInboxId: string;
            sentAtNs: bigint;
            conversationId: string;
        };
    }>;
    getMessages: (
        peerAddress: string,
        forceRefresh?: boolean
    ) => Promise<unknown[]>;
    streamMessages: (
        peerAddress: string,
        onMessage: (message: unknown) => void
    ) => Promise<unknown>;
    canMessage: (address: string) => Promise<boolean>;
    canMessageBatch: (addresses: string[]) => Promise<Record<string, boolean>>;
    markAsRead: (peerAddress: string) => void;
    onNewMessage: (callback: NewMessageCallback) => () => void;
    close: () => void;
    // Group methods
    createGroup: (
        memberAddresses: string[],
        groupName: string
    ) => Promise<{ success: boolean; groupId?: string; error?: string }>;
    getGroups: () => Promise<WakuGroup[]>;
    getGroupMessages: (groupId: string) => Promise<unknown[]>;
    sendGroupMessage: (
        groupId: string,
        content: string
    ) => Promise<{
        success: boolean;
        error?: string;
        messageId?: string;
        message?: {
            id: string;
            content: string;
            senderInboxId: string;
            sentAtNs: bigint;
            conversationId: string;
        };
    }>;
    streamGroupMessages: (
        groupId: string,
        onMessage: (message: unknown) => void
    ) => Promise<unknown>;
    getGroupMembers: (
        groupId: string
    ) => Promise<{ inboxId: string; addresses: string[] }[]>;
    addGroupMembers: (
        groupId: string,
        memberAddresses: string[]
    ) => Promise<{ success: boolean; error?: string }>;
    removeGroupMember: (
        groupId: string,
        memberAddress: string
    ) => Promise<{ success: boolean; error?: string }>;
    leaveGroup: (
        groupId: string
    ) => Promise<{ success: boolean; error?: string }>;
    joinGroupById: (
        groupId: string
    ) => Promise<{ success: boolean; error?: string }>;
    markGroupAsRead: (groupId: string) => void;
};

const WakuContext = createContext<WakuContextType | null>(null);

// Generate unique message ID
function generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Generate content topic for DM
function getDmContentTopic(address1: string, address2: string): string {
    const sorted = [address1.toLowerCase(), address2.toLowerCase()].sort();
    return `/spritz/1/dm/${sorted[0]}-${sorted[1]}/proto`;
}

// Generate content topic for group
function getGroupContentTopic(groupId: string): string {
    return `/spritz/1/group/${groupId}/proto`;
}

// Generate group ID
function generateGroupId(): string {
    return `g-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Local group storage interface
interface StoredGroup {
    id: string;
    name: string;
    members: string[];
    createdAt: number;
    symmetricKey: string; // hex encoded
}

export function WakuProvider({
    children,
    userAddress,
}: {
    children: ReactNode;
    userAddress: Address | null;
}) {
    const [isInitialized, setIsInitialized] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>(
        {}
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscriptionsRef = useRef<Map<string, any>>(new Map());
    const newMessageCallbacksRef = useRef<Set<NewMessageCallback>>(new Set());
    const messagesCache = useRef<Map<string, unknown[]>>(new Map());
    const processedMessageIds = useRef<Set<string>>(new Set());

    const { data: walletClient } = useWalletClient();

    // User's inbox ID (we use the address as the identifier)
    const userInboxId = userAddress?.toLowerCase() || null;

    // Track if SDK is loaded
    const [sdkLoaded, setSdkLoaded] = useState(false);

    // Load Waku SDK dynamically
    useEffect(() => {
        if (typeof window !== "undefined" && !wakuSdk) {
            Promise.all([
                import("@waku/sdk"),
                import("@waku/message-encryption/symmetric"),
                import("@waku/utils/bytes"),
            ])
                .then(([sdk, encryption, utils]) => {
                    wakuSdk = sdk;
                    wakuEncryption = encryption;
                    wakuUtils = utils;
                    console.log("[Waku] SDK loaded");
                    setSdkLoaded(true);
                })
                .catch((err) => {
                    console.error("[Waku] Failed to load SDK:", err);
                    setError("Failed to load Waku SDK");
                });
        } else if (wakuSdk) {
            setSdkLoaded(true);
        }
    }, []);

    // Get or create symmetric key for a DM conversation
    // IMPORTANT: Key must be deterministic so both users derive the same key
    const getDmSymmetricKey = useCallback(
        async (peerAddress: string): Promise<Uint8Array> => {
            // Sort addresses to ensure both users generate the same key
            const sortedAddresses = [
                (userAddress || "").toLowerCase(),
                peerAddress.toLowerCase(),
            ].sort();

            // Create a deterministic seed from both addresses
            // Using a simple hash-like approach with TextEncoder
            const seed = `spritz-dm-key-v1:${sortedAddresses[0]}:${sortedAddresses[1]}`;
            const encoder = new TextEncoder();
            const seedBytes = encoder.encode(seed);

            // Use Web Crypto API to derive a deterministic key
            const hashBuffer = await crypto.subtle.digest("SHA-256", seedBytes);
            const key = new Uint8Array(hashBuffer);

            return key;
        },
        [userAddress]
    );

    // Initialize Waku node
    const initialize = useCallback(async (): Promise<boolean> => {
        if (!userAddress) {
            setError("Wallet not connected");
            return false;
        }

        // Wait for SDK to load if not ready
        if (!wakuSdk || !wakuEncryption || !wakuUtils) {
            console.log("[Waku] SDK not loaded yet, waiting...");
            // Try to wait for SDK
            for (let i = 0; i < 50; i++) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                if (wakuSdk && wakuEncryption && wakuUtils) break;
            }
            if (!wakuSdk || !wakuEncryption || !wakuUtils) {
                setError("Waku SDK not loaded yet. Please try again.");
                return false;
            }
        }

        if (nodeRef.current && isInitialized) {
            console.log("[Waku] Already initialized");
            return true; // Already initialized
        }

        // Prevent multiple simultaneous initializations
        if (isInitializing) {
            console.log("[Waku] Already initializing...");
            return false;
        }

        setIsInitializing(true);
        setError(null);

        try {
            console.log("[Waku] Creating light node...");

            // Create and start a Light Node
            const node = await wakuSdk.createLightNode({
                defaultBootstrap: true,
                networkConfig: {
                    clusterId: 1,
                },
            });

            await node.start();
            console.log("[Waku] Node started");

            // Wait for peer connections with timeout
            console.log("[Waku] Waiting for peers...");
            const peerPromise = node.waitForPeers([
                wakuSdk.Protocols.LightPush,
                wakuSdk.Protocols.Filter,
            ]);

            // Add timeout for peer connection
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(
                    () => reject(new Error("Peer connection timeout")),
                    30000
                )
            );

            await Promise.race([peerPromise, timeoutPromise]);
            console.log("[Waku] Connected to peers");

            nodeRef.current = node;
            setIsInitialized(true);
            setIsInitializing(false);
            setError(null);

            return true;
        } catch (err) {
            console.error("[Waku] Failed to initialize:", err);
            setIsInitialized(false);
            setIsInitializing(false);
            setError(
                err instanceof Error ? err.message : "Failed to initialize Waku"
            );
            return false;
        }
    }, [userAddress, isInitialized, isInitializing]);

    // Auto-initialize Waku when SDK is loaded and we have a user address
    useEffect(() => {
        if (sdkLoaded && userAddress && !isInitialized && !isInitializing) {
            console.log("[Waku] Auto-initializing...");
            initialize();
        }
    }, [sdkLoaded, userAddress, isInitialized, isInitializing, initialize]);

    // Revoke installations (no-op for Waku, but keeping for API compatibility)
    const revokeAllInstallations = useCallback(async (): Promise<boolean> => {
        // Waku doesn't have installation limits like XMTP
        // This is kept for API compatibility
        console.log("[Waku] revokeAllInstallations called - no-op for Waku");
        return true;
    }, []);

    // Check if an address can receive messages (always true for Waku)
    const canMessage = useCallback(
        async (address: string): Promise<boolean> => {
            // Waku is a broadcast network, any address can receive messages
            // As long as they subscribe to the right content topic
            if (!address.startsWith("0x")) {
                console.log(
                    "[Waku] canMessage: Non-EVM address not supported:",
                    address
                );
                return false;
            }
            return true;
        },
        []
    );

    // Batch check canMessage
    const canMessageBatch = useCallback(
        async (addresses: string[]): Promise<Record<string, boolean>> => {
            const result: Record<string, boolean> = {};
            for (const addr of addresses) {
                result[addr.toLowerCase()] = addr.startsWith("0x");
            }
            return result;
        },
        []
    );

    // Send a DM message
    const sendMessage = useCallback(
        async (
            peerAddress: string,
            content: string
        ): Promise<{
            success: boolean;
            error?: string;
            messageId?: string;
            message?: {
                id: string;
                content: string;
                senderInboxId: string;
                sentAtNs: bigint;
                conversationId: string;
            };
        }> => {
            if (!userAddress) {
                return { success: false, error: "Wallet not connected" };
            }

            // Check if SDK modules are loaded
            if (!wakuSdk || !wakuEncryption || !wakuUtils) {
                console.log("[Waku] SDK not ready for sendMessage");
                return {
                    success: false,
                    error: "Waku SDK is loading. Please wait a moment and try again.",
                };
            }

            // Check if node is initialized, try to initialize if not
            if (!nodeRef.current) {
                console.log(
                    "[Waku] Node not initialized, attempting to initialize..."
                );
                const initResult = await initialize();
                if (!initResult || !nodeRef.current) {
                    return {
                        success: false,
                        error: "Failed to connect to Waku network. Please try again.",
                    };
                }
            }

            try {
                const contentTopic = getDmContentTopic(
                    userAddress,
                    peerAddress
                );
                console.log("[Waku] Sending message to topic:", contentTopic);

                // Get symmetric key for this conversation
                const symmetricKey = await getDmSymmetricKey(peerAddress);

                // Create routing info for the network (using shard 0)
                const routingInfo =
                    wakuSdk.utils.StaticShardingRoutingInfo.fromShard(0, {
                        clusterId: 1,
                    });

                // Create encoder with symmetric encryption
                const encoder = wakuEncryption.createEncoder({
                    contentTopic,
                    routingInfo,
                    symKey: symmetricKey,
                });

                // Create message
                const messageId = generateMessageId();
                const timestamp = Date.now();
                const messageObj = MessageProto.create({
                    timestamp,
                    sender: userAddress.toLowerCase(),
                    content,
                    messageId,
                    messageType: content.startsWith("[PIXEL_ART]")
                        ? "pixel_art"
                        : "text",
                });

                const payload = MessageProto.encode(messageObj).finish();

                // Send via Light Push
                const result = await nodeRef.current.lightPush.send(encoder, {
                    payload,
                });
                console.log("[Waku] Message sent successfully!", result);

                // Add to local cache immediately so it appears in UI
                const sentMessage = {
                    id: messageId,
                    content,
                    senderInboxId: userAddress.toLowerCase(),
                    sentAtNs: BigInt(timestamp) * BigInt(1000000),
                    conversationId: contentTopic,
                };

                // Add to cache
                const cached = messagesCache.current.get(contentTopic) || [];
                const updatedCache = [...cached, sentMessage];
                messagesCache.current.set(contentTopic, updatedCache);
                processedMessageIds.current.add(messageId);
                // Persist to localStorage
                persistMessages(contentTopic, updatedCache);

                // Save to Supabase for reliable delivery (fire and forget)
                saveMessageToSupabase(
                    contentTopic,
                    userAddress,
                    peerAddress,
                    null,
                    content,
                    content.startsWith("[PIXEL_ART]") ? "pixel_art" : "text",
                    messageId,
                    symmetricKey,
                    new Date(timestamp)
                ).catch(() => {});

                // Send push notification to recipient (fire and forget)
                try {
                    fetch("/api/push/send", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            targetAddress: peerAddress,
                            title: "New Message",
                            body: content.startsWith("[PIXEL_ART]")
                                ? "Sent you a pixel art"
                                : content.length > 100
                                ? content.slice(0, 100) + "..."
                                : content,
                            type: "message",
                            url: "/",
                        }),
                    }).catch(() => {
                        // Silently ignore push notification errors
                    });
                } catch {
                    // Silently ignore
                }

                return { success: true, messageId, message: sentMessage };
            } catch (err) {
                console.error("[Waku] Failed to send message:", err);
                return {
                    success: false,
                    error: err instanceof Error ? err.message : "Unknown error",
                };
            }
        },
        [userAddress, getDmSymmetricKey, initialize]
    );

    // Get messages from a DM conversation (from Supabase + Waku store)
    const getMessages = useCallback(
        async (
            peerAddress: string,
            forceRefresh = false
        ): Promise<unknown[]> => {
            if (!userAddress) {
                return [];
            }

            try {
                const contentTopic = getDmContentTopic(
                    userAddress,
                    peerAddress
                );
                const cacheKey = contentTopic;

                // Load from localStorage into cache if cache is empty
                if (!messagesCache.current.has(cacheKey)) {
                    const persisted = loadPersistedMessages(cacheKey);
                    if (persisted.length > 0) {
                        messagesCache.current.set(cacheKey, persisted);
                        // Also add to processedIds to prevent duplicates
                        persisted.forEach((m: any) => {
                            if (m.id) processedMessageIds.current.add(m.id);
                        });
                        console.log(
                            "[Waku] Loaded",
                            persisted.length,
                            "messages from localStorage"
                        );
                    }
                }

                // Return cached messages if available (unless force refresh)
                if (!forceRefresh && messagesCache.current.has(cacheKey)) {
                    return messagesCache.current.get(cacheKey) || [];
                }

                console.log(
                    "[Waku] Getting messages from topic:",
                    contentTopic,
                    forceRefresh ? "(force refresh)" : ""
                );

                // Get symmetric key for decryption
                const symmetricKey = await getDmSymmetricKey(peerAddress);

                // FETCH FROM SUPABASE FIRST (more reliable than Waku Store)
                console.log(
                    "[Waku] Fetching from Supabase for topic:",
                    contentTopic
                );
                const supabaseMessages = await fetchMessagesFromSupabase(
                    contentTopic,
                    symmetricKey
                );
                console.log(
                    "[Waku] Supabase returned:",
                    supabaseMessages.length,
                    "messages"
                );
                if (supabaseMessages.length > 0) {
                    console.log("[Waku] First Supabase message:", {
                        id: supabaseMessages[0].id,
                        sender: supabaseMessages[0].senderInboxId?.slice(0, 10),
                        content: supabaseMessages[0].content?.slice(0, 30),
                    });
                }

                // Start with Supabase messages
                const allMessages: unknown[] = [...supabaseMessages];
                const allMessageIds = new Set(
                    supabaseMessages.map((m) => m.id)
                );

                // Mark all Supabase messages as processed
                supabaseMessages.forEach((m) => {
                    processedMessageIds.current.add(m.id);
                });

                // Also try Waku Store as secondary source (only if Waku is initialized)
                if (nodeRef.current && wakuSdk && wakuEncryption) {
                    try {
                        const routingInfo =
                            wakuSdk.utils.StaticShardingRoutingInfo.fromShard(
                                0,
                                {
                                    clusterId: 1,
                                }
                            );
                        const decoder = wakuEncryption.createDecoder(
                            contentTopic,
                            routingInfo,
                            symmetricKey
                        );

                        const storeQuery =
                            nodeRef.current.store.queryWithOrderedCallback(
                                [decoder],
                                (wakuMessage: { payload?: Uint8Array }) => {
                                    if (!wakuMessage.payload) return;
                                    try {
                                        const decoded = MessageProto.decode(
                                            wakuMessage.payload
                                        );
                                        const msg =
                                            MessageProto.toObject(decoded);

                                        // Deduplicate against all sources
                                        if (
                                            !allMessageIds.has(msg.messageId) &&
                                            !processedMessageIds.current.has(
                                                msg.messageId
                                            )
                                        ) {
                                            processedMessageIds.current.add(
                                                msg.messageId
                                            );
                                            allMessageIds.add(msg.messageId);
                                            allMessages.push({
                                                id: msg.messageId,
                                                content: msg.content,
                                                senderInboxId: msg.sender,
                                                sentAtNs:
                                                    BigInt(msg.timestamp) *
                                                    BigInt(1000000),
                                            });
                                        }
                                    } catch (decodeErr) {
                                        console.log(
                                            "[Waku] Failed to decode message:",
                                            decodeErr
                                        );
                                    }
                                }
                            );

                        // Add timeout to prevent hanging forever
                        const timeout = new Promise((_, reject) =>
                            setTimeout(
                                () => reject(new Error("Store query timeout")),
                                5000
                            )
                        );

                        await Promise.race([storeQuery, timeout]);
                        console.log(
                            "[Waku] Store query completed, total messages:",
                            allMessages.length
                        );
                    } catch (storeErr) {
                        console.log(
                            "[Waku] Store query failed or timed out:",
                            storeErr
                        );
                    }
                }

                // For force refresh, prioritize Supabase messages and merge with cache
                // Build a map of all messages by ID, with fresh messages taking priority
                const messageMap = new Map<string, unknown>();

                // First add existing cache messages
                const existingCache = messagesCache.current.get(cacheKey) || [];
                let cacheWithIds = 0;
                existingCache.forEach((m: any) => {
                    if (m.id) {
                        messageMap.set(m.id, m);
                        cacheWithIds++;
                    }
                });

                // Then add/overwrite with fresh messages (Supabase + Waku Store)
                // This ensures new messages from other users are included
                let freshAdded = 0;
                allMessages.forEach((m: any) => {
                    if (m.id) {
                        if (!messageMap.has(m.id)) {
                            freshAdded++;
                        }
                        messageMap.set(m.id, m);
                    }
                });

                const mergedMessages = Array.from(messageMap.values());

                // Sort by timestamp
                mergedMessages.sort(
                    (a: any, b: any) => Number(a.sentAtNs) - Number(b.sentAtNs)
                );

                console.log(
                    "[Waku] Merged: cache=",
                    existingCache.length,
                    "(with IDs:",
                    cacheWithIds,
                    ") fresh=",
                    allMessages.length,
                    "newFromFresh=",
                    freshAdded,
                    "total=",
                    mergedMessages.length
                );

                messagesCache.current.set(cacheKey, mergedMessages);
                // Persist to localStorage
                persistMessages(cacheKey, mergedMessages);
                return mergedMessages;
            } catch (err) {
                console.error("[Waku] Failed to get messages:", err);
                // Return empty array on error - cache is already populated above
                return [];
            }
        },
        [userAddress, getDmSymmetricKey]
    );

    // Stream messages from a DM conversation
    const streamMessages = useCallback(
        async (peerAddress: string, onMessage: (message: unknown) => void) => {
            if (
                !nodeRef.current ||
                !wakuSdk ||
                !wakuEncryption ||
                !userAddress
            ) {
                return null;
            }

            try {
                const contentTopic = getDmContentTopic(
                    userAddress,
                    peerAddress
                );
                console.log(
                    "[Waku] Starting message stream for topic:",
                    contentTopic
                );

                // Get symmetric key and create routing info
                const symmetricKey = await getDmSymmetricKey(peerAddress);
                const routingInfo =
                    wakuSdk.utils.StaticShardingRoutingInfo.fromShard(0, {
                        clusterId: 1,
                    });
                const decoder = wakuEncryption.createDecoder(
                    contentTopic,
                    routingInfo,
                    symmetricKey
                );

                const callback = (wakuMessage: { payload?: Uint8Array }) => {
                    console.log(
                        "[Waku] Received message via filter!",
                        wakuMessage
                    );
                    if (!wakuMessage.payload) {
                        console.log("[Waku] Message has no payload");
                        return;
                    }
                    try {
                        const decoded = MessageProto.decode(
                            wakuMessage.payload
                        );
                        const msg = MessageProto.toObject(decoded);
                        console.log("[Waku] Decoded message:", msg);

                        // Deduplicate
                        if (processedMessageIds.current.has(msg.messageId)) {
                            console.log(
                                "[Waku] Duplicate message, skipping:",
                                msg.messageId
                            );
                            return;
                        }
                        processedMessageIds.current.add(msg.messageId);

                        const formattedMsg = {
                            id: msg.messageId,
                            content: msg.content,
                            senderInboxId: msg.sender,
                            sentAtNs: BigInt(msg.timestamp) * BigInt(1000000),
                            conversationId: contentTopic,
                        };

                        console.log(
                            "[Waku] Calling onMessage with:",
                            formattedMsg
                        );
                        onMessage(formattedMsg);

                        // Trigger global new message callbacks for notifications
                        // Only if message is from someone else (not self)
                        if (
                            msg.sender.toLowerCase() !==
                            userAddress?.toLowerCase()
                        ) {
                            newMessageCallbacksRef.current.forEach(
                                (callback) => {
                                    try {
                                        callback({
                                            senderAddress: msg.sender,
                                            content: msg.content,
                                            conversationId: contentTopic,
                                        });
                                    } catch (cbErr) {
                                        console.error(
                                            "[Waku] Callback error:",
                                            cbErr
                                        );
                                    }
                                }
                            );
                        }

                        // Update cache and persist
                        const cached =
                            messagesCache.current.get(contentTopic) || [];
                        const updatedCache = [...cached, formattedMsg];
                        messagesCache.current.set(contentTopic, updatedCache);
                        persistMessages(contentTopic, updatedCache);
                    } catch (decodeErr) {
                        console.log(
                            "[Waku] Failed to decode streamed message:",
                            decodeErr
                        );
                    }
                };

                // Subscribe directly using the new API
                console.log(
                    "[Waku] Setting up filter subscription for:",
                    contentTopic
                );
                const subscribeResult = await nodeRef.current.filter.subscribe(
                    decoder,
                    callback
                );
                console.log(
                    "[Waku] Filter subscription result:",
                    subscribeResult
                );
                subscriptionsRef.current.set(contentTopic, decoder);

                // Return the decoder for cleanup
                return decoder;
            } catch (err) {
                console.error("[Waku] Failed to stream messages:", err);
                return null;
            }
        },
        [userAddress, getDmSymmetricKey]
    );

    // Mark messages as read
    const markAsRead = useCallback((peerAddress: string) => {
        const normalizedAddress = peerAddress.toLowerCase();
        setUnreadCounts((prev) => {
            const newCounts = { ...prev };
            delete newCounts[normalizedAddress];
            return newCounts;
        });
    }, []);

    // Register callback for new message notifications
    const onNewMessage = useCallback((callback: NewMessageCallback) => {
        newMessageCallbacksRef.current.add(callback);
        return () => {
            newMessageCallbacksRef.current.delete(callback);
        };
    }, []);

    // ============ GROUP METHODS ============

    // Get stored groups from localStorage
    const getStoredGroups = useCallback((): StoredGroup[] => {
        if (typeof window === "undefined") return [];
        try {
            const stored = localStorage.getItem(GROUPS_STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    }, []);

    // Save groups to localStorage
    const saveGroups = useCallback((groups: StoredGroup[]) => {
        if (typeof window === "undefined") return;
        localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(groups));
    }, []);

    // Get hidden groups
    const getHiddenGroups = useCallback((): Set<string> => {
        if (typeof window === "undefined") return new Set();
        try {
            const hidden = localStorage.getItem(HIDDEN_GROUPS_KEY);
            return hidden ? new Set(JSON.parse(hidden)) : new Set();
        } catch {
            return new Set();
        }
    }, []);

    // Create a new group
    const createGroup = useCallback(
        async (
            memberAddresses: string[],
            groupName: string
        ): Promise<{ success: boolean; groupId?: string; error?: string }> => {
            if (!nodeRef.current || !wakuEncryption || !userAddress) {
                return { success: false, error: "Waku not initialized" };
            }

            try {
                const groupId = generateGroupId();
                console.log("[Waku] Creating group:", groupId, groupName);

                // Generate symmetric key for the group
                const symmetricKey = wakuEncryption.generateSymmetricKey();
                const symmetricKeyHex = wakuUtils.bytesToHex(symmetricKey);

                // Create group object
                const group: StoredGroup = {
                    id: groupId,
                    name: groupName,
                    members: [
                        userAddress.toLowerCase(),
                        ...memberAddresses.map((a) => a.toLowerCase()),
                    ],
                    createdAt: Date.now(),
                    symmetricKey: symmetricKeyHex,
                };

                // Save to localStorage
                const groups = getStoredGroups();
                groups.push(group);
                saveGroups(groups);

                console.log("[Waku] Group created successfully");
                return { success: true, groupId };
            } catch (err) {
                console.error("[Waku] Failed to create group:", err);
                return {
                    success: false,
                    error:
                        err instanceof Error
                            ? err.message
                            : "Failed to create group",
                };
            }
        },
        [userAddress, getStoredGroups, saveGroups]
    );

    // Get all groups
    const getGroups = useCallback(async (): Promise<WakuGroup[]> => {
        const hiddenGroups = getHiddenGroups();
        const storedGroups = getStoredGroups();

        return storedGroups
            .filter((g) => !hiddenGroups.has(g.id))
            .filter((g) => g.members.includes(userAddress?.toLowerCase() || ""))
            .map((g) => ({
                id: g.id,
                name: g.name,
                memberCount: g.members.length,
                createdAt: new Date(g.createdAt),
            }));
    }, [getHiddenGroups, getStoredGroups, userAddress]);

    // Get messages from a group (from Supabase + Waku store)
    const getGroupMessages = useCallback(
        async (groupId: string): Promise<unknown[]> => {
            try {
                const contentTopic = getGroupContentTopic(groupId);
                const cacheKey = contentTopic;

                // Load from localStorage into cache if cache is empty
                if (!messagesCache.current.has(cacheKey)) {
                    const persisted = loadPersistedMessages(cacheKey);
                    if (persisted.length > 0) {
                        messagesCache.current.set(cacheKey, persisted);
                        persisted.forEach((m: any) => {
                            if (m.id) processedMessageIds.current.add(m.id);
                        });
                        console.log(
                            "[Waku] Loaded",
                            persisted.length,
                            "group messages from localStorage"
                        );
                    }
                }

                if (messagesCache.current.has(cacheKey)) {
                    return messagesCache.current.get(cacheKey) || [];
                }

                // Get group's symmetric key
                const groups = getStoredGroups();
                const group = groups.find((g) => g.id === groupId);
                if (!group) return [];

                const symmetricKey = wakuUtils?.hexToBytes
                    ? wakuUtils.hexToBytes(group.symmetricKey)
                    : new Uint8Array(Buffer.from(group.symmetricKey, "hex"));

                // FETCH FROM SUPABASE FIRST (more reliable)
                const supabaseMessages = await fetchMessagesFromSupabase(
                    contentTopic,
                    symmetricKey
                );

                // Start with Supabase messages
                const allMessages: unknown[] = [...supabaseMessages];
                const allMessageIds = new Set(
                    supabaseMessages.map((m) => m.id)
                );

                // Mark all Supabase messages as processed
                supabaseMessages.forEach((m) => {
                    processedMessageIds.current.add(m.id);
                });

                // Also try Waku Store as secondary source
                if (nodeRef.current && wakuSdk && wakuEncryption) {
                    try {
                        const routingInfo =
                            wakuSdk.utils.StaticShardingRoutingInfo.fromShard(
                                0,
                                {
                                    clusterId: 1,
                                }
                            );
                        const decoder = wakuEncryption.createDecoder(
                            contentTopic,
                            routingInfo,
                            symmetricKey
                        );

                        await nodeRef.current.store.queryWithOrderedCallback(
                            [decoder],
                            (wakuMessage: { payload?: Uint8Array }) => {
                                if (!wakuMessage.payload) return;
                                try {
                                    const decoded = MessageProto.decode(
                                        wakuMessage.payload
                                    );
                                    const msg = MessageProto.toObject(decoded);

                                    if (
                                        !allMessageIds.has(msg.messageId) &&
                                        !processedMessageIds.current.has(
                                            msg.messageId
                                        )
                                    ) {
                                        processedMessageIds.current.add(
                                            msg.messageId
                                        );
                                        allMessageIds.add(msg.messageId);
                                        allMessages.push({
                                            id: msg.messageId,
                                            content: msg.content,
                                            senderInboxId: msg.sender,
                                            sentAtNs:
                                                BigInt(msg.timestamp) *
                                                BigInt(1000000),
                                        });
                                    }
                                } catch (decodeErr) {
                                    console.log(
                                        "[Waku] Failed to decode group message:",
                                        decodeErr
                                    );
                                }
                            }
                        );
                    } catch (storeErr) {
                        console.log(
                            "[Waku] Group store query failed:",
                            storeErr
                        );
                    }
                }

                // Build a map of all messages by ID, with fresh messages taking priority
                const messageMap = new Map<string, unknown>();

                // First add existing cache messages
                const existingCache = messagesCache.current.get(cacheKey) || [];
                existingCache.forEach((m: any) => {
                    if (m.id) messageMap.set(m.id, m);
                });

                // Then add/overwrite with fresh messages
                allMessages.forEach((m: any) => {
                    if (m.id) messageMap.set(m.id, m);
                });

                const mergedMessages = Array.from(messageMap.values());

                mergedMessages.sort(
                    (a: any, b: any) => Number(a.sentAtNs) - Number(b.sentAtNs)
                );

                messagesCache.current.set(cacheKey, mergedMessages);
                persistMessages(cacheKey, mergedMessages);
                return mergedMessages;
            } catch (err) {
                console.error("[Waku] Failed to get group messages:", err);
                return [];
            }
        },
        [getStoredGroups]
    );

    // Send message to group
    const sendGroupMessage = useCallback(
        async (
            groupId: string,
            content: string
        ): Promise<{
            success: boolean;
            error?: string;
            messageId?: string;
            message?: {
                id: string;
                content: string;
                senderInboxId: string;
                sentAtNs: bigint;
                conversationId: string;
            };
        }> => {
            if (!nodeRef.current || !wakuEncryption || !userAddress) {
                return { success: false, error: "Waku not initialized" };
            }

            try {
                const contentTopic = getGroupContentTopic(groupId);
                const groups = getStoredGroups();
                const group = groups.find((g) => g.id === groupId);

                if (!group) {
                    return { success: false, error: "Group not found" };
                }

                const symmetricKey = wakuUtils.hexToBytes(group.symmetricKey);
                const routingInfo =
                    wakuSdk.utils.StaticShardingRoutingInfo.fromShard(0, {
                        clusterId: 1,
                    });
                // Create encoder with symmetric encryption
                const encoder = wakuEncryption.createEncoder({
                    contentTopic,
                    routingInfo,
                    symKey: symmetricKey,
                });

                const messageId = generateMessageId();
                const timestamp = Date.now();
                const messageObj = MessageProto.create({
                    timestamp,
                    sender: userAddress.toLowerCase(),
                    content,
                    messageId,
                    messageType: content.startsWith("[PIXEL_ART]")
                        ? "pixel_art"
                        : "text",
                });

                const payload = MessageProto.encode(messageObj).finish();
                await nodeRef.current.lightPush.send(encoder, { payload });

                // Add to local cache immediately so it appears in UI
                const sentMessage = {
                    id: messageId,
                    content,
                    senderInboxId: userAddress.toLowerCase(),
                    sentAtNs: BigInt(timestamp) * BigInt(1000000),
                    conversationId: groupId,
                };

                const cached = messagesCache.current.get(contentTopic) || [];
                const updatedCache = [...cached, sentMessage];
                messagesCache.current.set(contentTopic, updatedCache);
                processedMessageIds.current.add(messageId);
                // Persist to localStorage
                persistMessages(contentTopic, updatedCache);

                // Save to Supabase for reliable delivery (fire and forget)
                saveMessageToSupabase(
                    contentTopic,
                    userAddress,
                    null, // No single recipient for groups
                    groupId,
                    content,
                    content.startsWith("[PIXEL_ART]") ? "pixel_art" : "text",
                    messageId,
                    symmetricKey,
                    new Date(timestamp)
                ).catch(() => {});

                // Send push notifications to all group members except sender
                try {
                    const notificationBody = content.startsWith("[PIXEL_ART]")
                        ? "Sent a pixel art"
                        : content.length > 100
                        ? content.slice(0, 100) + "..."
                        : content;

                    group.members.forEach((memberAddress) => {
                        if (
                            memberAddress.toLowerCase() !==
                            userAddress.toLowerCase()
                        ) {
                            fetch("/api/push/send", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    targetAddress: memberAddress,
                                    title: group.name || "Group Message",
                                    body: notificationBody,
                                    type: "group_message",
                                    url: "/",
                                }),
                            }).catch(() => {});
                        }
                    });
                } catch {
                    // Silently ignore
                }

                return { success: true, messageId, message: sentMessage };
            } catch (err) {
                console.error("[Waku] Failed to send group message:", err);
                return {
                    success: false,
                    error:
                        err instanceof Error ? err.message : "Failed to send",
                };
            }
        },
        [userAddress, getStoredGroups]
    );

    // Stream messages from a group
    const streamGroupMessages = useCallback(
        async (groupId: string, onMessage: (message: unknown) => void) => {
            if (!nodeRef.current || !wakuEncryption) {
                return null;
            }

            try {
                const contentTopic = getGroupContentTopic(groupId);
                const groups = getStoredGroups();
                const group = groups.find((g) => g.id === groupId);

                if (!group) return null;

                const symmetricKey = wakuUtils.hexToBytes(group.symmetricKey);
                const routingInfo =
                    wakuSdk.utils.StaticShardingRoutingInfo.fromShard(0, {
                        clusterId: 1,
                    });
                const decoder = wakuEncryption.createDecoder(
                    contentTopic,
                    routingInfo,
                    symmetricKey
                );

                const callback = (wakuMessage: { payload?: Uint8Array }) => {
                    if (!wakuMessage.payload) return;
                    try {
                        const decoded = MessageProto.decode(
                            wakuMessage.payload
                        );
                        const msg = MessageProto.toObject(decoded);

                        if (processedMessageIds.current.has(msg.messageId))
                            return;
                        processedMessageIds.current.add(msg.messageId);

                        const formattedMsg = {
                            id: msg.messageId,
                            content: msg.content,
                            senderInboxId: msg.sender,
                            sentAtNs: BigInt(msg.timestamp) * BigInt(1000000),
                            conversationId: groupId,
                        };

                        onMessage(formattedMsg);

                        // Trigger global new message callbacks for notifications
                        // Only if message is from someone else (not self)
                        if (
                            msg.sender.toLowerCase() !==
                            userAddress?.toLowerCase()
                        ) {
                            newMessageCallbacksRef.current.forEach(
                                (callback) => {
                                    try {
                                        callback({
                                            senderAddress: msg.sender,
                                            content: msg.content,
                                            conversationId: groupId,
                                        });
                                    } catch (cbErr) {
                                        console.error(
                                            "[Waku] Group callback error:",
                                            cbErr
                                        );
                                    }
                                }
                            );
                        }

                        // Update cache and persist
                        const cached =
                            messagesCache.current.get(contentTopic) || [];
                        const updatedCache = [...cached, formattedMsg];
                        messagesCache.current.set(contentTopic, updatedCache);
                        persistMessages(contentTopic, updatedCache);
                    } catch (decodeErr) {
                        console.log(
                            "[Waku] Failed to decode group streamed message:",
                            decodeErr
                        );
                    }
                };

                // Subscribe directly using the new API
                await nodeRef.current.filter.subscribe(decoder, callback);
                subscriptionsRef.current.set(contentTopic, decoder);

                return decoder;
            } catch (err) {
                console.error("[Waku] Failed to stream group messages:", err);
                return null;
            }
        },
        [getStoredGroups]
    );

    // Get group members
    const getGroupMembers = useCallback(
        async (
            groupId: string
        ): Promise<{ inboxId: string; addresses: string[] }[]> => {
            const groups = getStoredGroups();
            const group = groups.find((g) => g.id === groupId);
            if (!group) return [];

            return group.members.map((addr) => ({
                inboxId: addr,
                addresses: [addr],
            }));
        },
        [getStoredGroups]
    );

    // Add members to group
    const addGroupMembers = useCallback(
        async (
            groupId: string,
            memberAddresses: string[]
        ): Promise<{ success: boolean; error?: string }> => {
            try {
                const groups = getStoredGroups();
                const groupIndex = groups.findIndex((g) => g.id === groupId);

                if (groupIndex === -1) {
                    return { success: false, error: "Group not found" };
                }

                const newMembers = memberAddresses
                    .map((a) => a.toLowerCase())
                    .filter((a) => !groups[groupIndex].members.includes(a));

                groups[groupIndex].members.push(...newMembers);
                saveGroups(groups);

                return { success: true };
            } catch (err) {
                return {
                    success: false,
                    error:
                        err instanceof Error
                            ? err.message
                            : "Failed to add members",
                };
            }
        },
        [getStoredGroups, saveGroups]
    );

    // Remove member from group
    const removeGroupMember = useCallback(
        async (
            groupId: string,
            memberAddress: string
        ): Promise<{ success: boolean; error?: string }> => {
            try {
                const groups = getStoredGroups();
                const groupIndex = groups.findIndex((g) => g.id === groupId);

                if (groupIndex === -1) {
                    return { success: false, error: "Group not found" };
                }

                groups[groupIndex].members = groups[groupIndex].members.filter(
                    (m) => m !== memberAddress.toLowerCase()
                );
                saveGroups(groups);

                return { success: true };
            } catch (err) {
                return {
                    success: false,
                    error:
                        err instanceof Error
                            ? err.message
                            : "Failed to remove member",
                };
            }
        },
        [getStoredGroups, saveGroups]
    );

    // Leave a group
    const leaveGroup = useCallback(
        async (
            groupId: string
        ): Promise<{ success: boolean; error?: string }> => {
            try {
                // Hide the group locally
                const hidden = getHiddenGroups();
                hidden.add(groupId);
                localStorage.setItem(
                    HIDDEN_GROUPS_KEY,
                    JSON.stringify([...hidden])
                );

                // Unsubscribe from the group topic
                const contentTopic = getGroupContentTopic(groupId);
                const subscription = subscriptionsRef.current.get(contentTopic);
                if (subscription) {
                    await subscription.unsubscribe([contentTopic]);
                    subscriptionsRef.current.delete(contentTopic);
                }

                return { success: true };
            } catch (err) {
                return {
                    success: false,
                    error:
                        err instanceof Error
                            ? err.message
                            : "Failed to leave group",
                };
            }
        },
        [getHiddenGroups]
    );

    // Join a group by ID
    const joinGroupById = useCallback(
        async (
            groupId: string
        ): Promise<{ success: boolean; error?: string }> => {
            try {
                // Remove from hidden groups if it was hidden
                const hidden = getHiddenGroups();
                if (hidden.has(groupId)) {
                    hidden.delete(groupId);
                    localStorage.setItem(
                        HIDDEN_GROUPS_KEY,
                        JSON.stringify([...hidden])
                    );
                }

                return { success: true };
            } catch (err) {
                return {
                    success: false,
                    error:
                        err instanceof Error
                            ? err.message
                            : "Failed to join group",
                };
            }
        },
        [getHiddenGroups]
    );

    // Mark group as read
    const markGroupAsRead = useCallback((groupId: string) => {
        setUnreadCounts((prev) => {
            const newCounts = { ...prev };
            delete newCounts[groupId];
            return newCounts;
        });
    }, []);

    // Close Waku node
    const close = useCallback(() => {
        // Unsubscribe from all subscriptions
        if (nodeRef.current) {
            subscriptionsRef.current.forEach(async (decoder) => {
                try {
                    await nodeRef.current.filter.unsubscribe(decoder);
                } catch (err) {
                    console.log("[Waku] Error unsubscribing:", err);
                }
            });
        }
        subscriptionsRef.current.clear();

        // Stop the node
        if (nodeRef.current) {
            nodeRef.current.stop();
            nodeRef.current = null;
        }

        setIsInitialized(false);
        setIsInitializing(false);
        setError(null);
        setUnreadCounts({});
        messagesCache.current.clear();
        processedMessageIds.current.clear();
    }, []);

    return (
        <WakuContext.Provider
            value={{
                isInitialized,
                isInitializing,
                error,
                userInboxId,
                unreadCounts,
                initialize,
                revokeAllInstallations,
                sendMessage,
                getMessages,
                streamMessages,
                canMessage,
                canMessageBatch,
                markAsRead,
                onNewMessage,
                close,
                // Group methods
                createGroup,
                getGroups,
                getGroupMessages,
                sendGroupMessage,
                streamGroupMessages,
                getGroupMembers,
                addGroupMembers,
                removeGroupMember,
                leaveGroup,
                joinGroupById,
                markGroupAsRead,
            }}
        >
            {children}
        </WakuContext.Provider>
    );
}

export function useWakuContext() {
    const context = useContext(WakuContext);
    if (!context) {
        throw new Error("useWakuContext must be used within a WakuProvider");
    }
    return context;
}

// Alias for backward compatibility with XMTP code
export const useXMTPContext = useWakuContext;
export const XMTPProvider = WakuProvider;
export type XMTPGroup = WakuGroup;

