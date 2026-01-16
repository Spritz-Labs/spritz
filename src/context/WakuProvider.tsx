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
// Address can be EVM (0x...) or Solana (base58)
import protobuf from "protobufjs";
import { supabase } from "@/config/supabase";
import { createLogger } from "@/lib/logger";

const log = createLogger("Waku");

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
    emoji?: string;
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
        log.error("[Waku] Failed to decrypt message:", err);
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
        log.debug("[Waku] Supabase not configured, skipping message save");
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
            log.error("[Waku] Failed to save message to Supabase:", error);
            return false;
        }

        log.debug("[Waku] Message saved to Supabase:", messageId);
        return true;
    } catch (err) {
        log.error("[Waku] Error saving to Supabase:", err);
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

        log.debug("[Waku] Fetched", data.length, "messages from Supabase");

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
        log.error("[Waku] Error fetching from Supabase:", err);
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
        log.debug("[Waku] Failed to persist messages:", e);
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
        log.debug("[Waku] Failed to load persisted messages:", e);
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
    setActiveChatPeer: (peerAddress: string | null) => void;
    onNewMessage: (callback: NewMessageCallback) => () => void;
    prefetchMessages: (peerAddress: string) => void;
    close: () => void;
    // Group methods
    createGroup: (
        memberAddresses: string[],
        groupName: string,
        emoji?: string
    ) => Promise<{
        success: boolean;
        groupId?: string;
        symmetricKey?: string;
        members?: string[];
        error?: string;
    }>;
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
        groupId: string,
        groupData?: {
            name: string;
            symmetricKey: string;
            members: string[];
        }
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
    emoji?: string;
    members: string[];
    createdAt: number;
    symmetricKey: string; // hex encoded
}

export function WakuProvider({
    children,
    userAddress,
}: {
    children: ReactNode;
    userAddress: string | null; // Can be EVM (0x...) or Solana (base58)
}) {
    const [isInitialized, setIsInitialized] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>(
        {}
    );
    
    // Track which chat is currently open (to avoid incrementing unread for open chats)
    const activeChatPeerRef = useRef<string | null>(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscriptionsRef = useRef<Map<string, any>>(new Map());
    const newMessageCallbacksRef = useRef<Set<NewMessageCallback>>(new Set());
    const messagesCache = useRef<Map<string, unknown[]>>(new Map());
    const processedMessageIds = useRef<Set<string>>(new Set());

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
                    log.debug("[Waku] SDK loaded");
                    setSdkLoaded(true);
                })
                .catch((err) => {
                    log.error("[Waku] Failed to load SDK:", err);
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
            log.debug("[Waku] SDK not loaded yet, waiting...");
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
            log.debug("[Waku] Already initialized");
            return true; // Already initialized
        }

        // Prevent multiple simultaneous initializations
        if (isInitializing) {
            log.debug("[Waku] Already initializing...");
            return false;
        }

        setIsInitializing(true);
        setError(null);

        try {
            log.debug("[Waku] Creating light node...");

            // Create and start a Light Node
            const node = await wakuSdk.createLightNode({
                defaultBootstrap: true,
                networkConfig: {
                    clusterId: 1,
                },
            });

            await node.start();
            log.debug("[Waku] Node started");

            // Wait for peer connections with timeout
            log.debug("[Waku] Waiting for peers...");
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
            log.debug("[Waku] Connected to peers");

            nodeRef.current = node;
            setIsInitialized(true);
            setIsInitializing(false);
            setError(null);

            return true;
        } catch (err) {
            log.error("[Waku] Failed to initialize:", err);
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
            log.debug("[Waku] Auto-initializing...");
            initialize();
        }
    }, [sdkLoaded, userAddress, isInitialized, isInitializing, initialize]);

    // Revoke installations (no-op for Waku, but keeping for API compatibility)
    const revokeAllInstallations = useCallback(async (): Promise<boolean> => {
        // Waku doesn't have installation limits like XMTP
        // This is kept for API compatibility
        log.debug("[Waku] revokeAllInstallations called - no-op for Waku");
        return true;
    }, []);

    // Check if an address can receive messages (always true for Waku)
    const canMessage = useCallback(
        async (address: string): Promise<boolean> => {
            // Waku is a broadcast network, any address can receive messages
            // As long as they subscribe to the right content topic
            // Works with both EVM (0x...) and Solana (base58) addresses
            return Boolean(address && address.length > 0);
        },
        []
    );

    // Batch check canMessage
    const canMessageBatch = useCallback(
        async (addresses: string[]): Promise<Record<string, boolean>> => {
            const result: Record<string, boolean> = {};
            for (const addr of addresses) {
                // Waku supports any address format - both EVM and Solana
                // Use original case for Solana addresses (case-sensitive)
                const key = addr.startsWith("0x") ? addr.toLowerCase() : addr;
                result[key] = Boolean(addr && addr.length > 0);
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
                log.debug("[Waku] SDK not ready for sendMessage");
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
                log.debug("[Waku] Sending message to topic:", contentTopic);

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
                log.debug("[Waku] Message sent successfully!", result);

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
                // Include sender address so API can look up their name
                try {
                    fetch("/api/push/send", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            targetAddress: peerAddress,
                            senderAddress: userAddress,
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
                log.error("[Waku] Failed to send message:", err);
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
                    log.debug("[Waku] First Supabase message:", {
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
                log.error("[Waku] Failed to get messages:", err);
                // Return empty array on error - cache is already populated above
                return [];
            }
        },
        [userAddress, getDmSymmetricKey]
    );

    // Prefetch messages for a conversation (non-blocking, for notification pre-loading)
    const prefetchMessages = useCallback((peerAddress: string) => {
        if (!userAddress || !peerAddress) return;
        
        // Don't prefetch if chat is already open for this peer
        if (activeChatPeerRef.current?.toLowerCase() === peerAddress.toLowerCase()) {
            return;
        }

        log.debug("[Waku] Prefetching messages for", peerAddress);
        
        // Fire and forget - don't await, just trigger the fetch in background
        // This will populate the cache so when chat opens, messages are ready
        getMessages(peerAddress, true).catch(err => {
            log.debug("[Waku] Prefetch failed (non-critical):", err);
        });
    }, [userAddress, getMessages]);

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
                        log.debug("[Waku] Message has no payload");
                        return;
                    }
                    try {
                        const decoded = MessageProto.decode(
                            wakuMessage.payload
                        );
                        const msg = MessageProto.toObject(decoded);
                        log.debug("[Waku] Decoded message:", msg);

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
                            // Only increment unread count if this chat is NOT currently open
                            const senderLower = msg.sender.toLowerCase();
                            if (activeChatPeerRef.current !== senderLower) {
                                setUnreadCounts((prev) => ({
                                    ...prev,
                                    [senderLower]: (prev[senderLower] || 0) + 1,
                                }));
                            }

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
                log.error("[Waku] Failed to stream messages:", err);
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

    // Set the active chat peer (to prevent incrementing unread for open chats)
    const setActiveChatPeer = useCallback((peerAddress: string | null) => {
        activeChatPeerRef.current = peerAddress?.toLowerCase() || null;
        // If setting an active peer, also mark as read immediately
        if (peerAddress) {
            markAsRead(peerAddress);
        }
    }, [markAsRead]);

    // Register callback for new message notifications
    const onNewMessage = useCallback((callback: NewMessageCallback) => {
        newMessageCallbacksRef.current.add(callback);
        return () => {
            newMessageCallbacksRef.current.delete(callback);
        };
    }, []);

    // Load initial unread counts from database on startup
    // This ensures unread indicators persist across page refreshes
    useEffect(() => {
        if (!isInitialized || !userAddress || !supabase) return;

        const loadInitialUnreadCounts = async () => {
            if (!supabase) return;
            const client = supabase;
            const userAddrLower = userAddress.toLowerCase();
            
            log.debug("[Waku] Loading initial unread counts for:", userAddrLower);
            
            try {
                // Get all unread messages for this user (messages where they are recipient)
                // that don't have a read receipt
                const { data: unreadMessages, error: msgError } = await client
                    .from("shout_messages")
                    .select("sender_address, message_id, created_at")
                    .eq("recipient_address", userAddrLower)
                    .neq("sender_address", userAddrLower)
                    .order("created_at", { ascending: false });
                
                if (msgError) {
                    log.error("[Waku] Error loading unread messages:", msgError);
                    return;
                }
                
                if (!unreadMessages || unreadMessages.length === 0) {
                    log.debug("[Waku] No unread messages found");
                    return;
                }
                
                // Get read receipts for this user
                const { data: readReceipts, error: receiptError } = await client
                    .from("shout_read_receipts")
                    .select("message_id")
                    .eq("reader_address", userAddrLower);
                
                if (receiptError) {
                    log.error("[Waku] Error loading read receipts:", receiptError);
                }
                
                const readMessageIds = new Set(
                    (readReceipts || []).map((r: { message_id: string }) => r.message_id)
                );
                
                // Count unread messages per sender (skip if chat is already open)
                const counts: Record<string, number> = {};
                const activePeer = activeChatPeerRef.current;
                
                for (const msg of unreadMessages) {
                    if (!readMessageIds.has(msg.message_id)) {
                        const senderLower = msg.sender_address.toLowerCase();
                        // Skip counting for the currently open chat
                        if (senderLower !== activePeer) {
                            counts[senderLower] = (counts[senderLower] || 0) + 1;
                        }
                    }
                }
                
                log.debug("[Waku] Initial unread counts:", counts, "(active peer:", activePeer, ")");
                
                if (Object.keys(counts).length > 0) {
                    setUnreadCounts(counts);
                }
            } catch (err) {
                log.error("[Waku] Error loading initial unread counts:", err);
            }
        };
        
        loadInitialUnreadCounts();
    }, [isInitialized, userAddress]);

    // Global Supabase realtime subscription for new messages
    // This ensures we catch ALL incoming messages, even when no chat is open
    useEffect(() => {
        if (!isInitialized || !userAddress || !supabase) return;

        log.debug("[Waku] Setting up global message listener for:", userAddress.toLowerCase());
        
        const client = supabase; // Capture for closure
        const channel = client
            .channel("global-messages")
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "shout_messages",
                    filter: `recipient_address=eq.${userAddress.toLowerCase()}`,
                },
                (payload) => {
                    const msg = payload.new as any;
                    
                    // Skip if we've already processed this message
                    if (processedMessageIds.current.has(msg.message_id)) {
                        log.debug("[Waku] Skipping already processed message:", msg.message_id);
                        return;
                    }
                    processedMessageIds.current.add(msg.message_id);
                    
                    // Skip our own messages
                    if (msg.sender_address.toLowerCase() === userAddress.toLowerCase()) {
                        return;
                    }
                    
                    log.debug("[Waku] Global listener received message from:", msg.sender_address);
                    
                    const senderLower = msg.sender_address.toLowerCase();
                    
                    // Only increment unread if this chat is not currently open
                    if (activeChatPeerRef.current !== senderLower) {
                        log.debug("[Waku] Incrementing unread for:", senderLower);
                        setUnreadCounts((prev) => ({
                            ...prev,
                            [senderLower]: (prev[senderLower] || 0) + 1,
                        }));
                        
                        // Trigger notification callbacks with placeholder content
                        // (actual content will be decrypted when user opens the chat)
                        newMessageCallbacksRef.current.forEach((callback) => {
                            try {
                                callback({
                                    senderAddress: msg.sender_address,
                                    content: "New message received",
                                    conversationId: msg.conversation_id,
                                });
                            } catch (err) {
                                log.error("[Waku] Notification callback error:", err);
                            }
                        });
                    } else {
                        log.debug("[Waku] Chat is open, skipping unread increment");
                    }
                }
            )
            .subscribe((status) => {
                log.debug("[Waku] Global message subscription status:", status);
            });

        return () => {
            log.debug("[Waku] Removing global message listener");
            client.removeChannel(channel);
        };
    }, [isInitialized, userAddress]);

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
            groupName: string,
            emoji?: string
        ): Promise<{
            success: boolean;
            groupId?: string;
            symmetricKey?: string;
            members?: string[];
            error?: string;
        }> => {
            if (!nodeRef.current || !wakuEncryption || !userAddress) {
                return { success: false, error: "Waku not initialized" };
            }

            try {
                const groupId = generateGroupId();
                log.debug("[Waku] Creating group:", groupId, groupName, emoji);

                // Generate symmetric key for the group
                const symmetricKey = wakuEncryption.generateSymmetricKey();
                const symmetricKeyHex = wakuUtils.bytesToHex(symmetricKey);

                // Create group object with all members
                const allMembers = [
                    userAddress.toLowerCase(),
                    ...memberAddresses.map((a) => a.toLowerCase()),
                ];

                const group: StoredGroup = {
                    id: groupId,
                    name: groupName,
                    emoji: emoji,
                    members: allMembers,
                    createdAt: Date.now(),
                    symmetricKey: symmetricKeyHex,
                };

                // Save to localStorage (for offline access)
                const groups = getStoredGroups();
                groups.push(group);
                saveGroups(groups);

                // Save to Supabase (so all members can see it)
                if (supabase) {
                    try {
                        // Insert the group (try with emoji first, fallback without)
                        let groupError;
                        
                        // Try with emoji first
                        const insertData: Record<string, unknown> = {
                            id: groupId,
                            name: groupName,
                            created_by: userAddress.toLowerCase(),
                            symmetric_key: symmetricKeyHex,
                        };
                        
                        // Only include emoji if provided
                        if (emoji) {
                            insertData.emoji = emoji;
                        }
                        
                        const { error: err1 } = await supabase
                            .from("shout_groups")
                            .insert(insertData);
                        
                        groupError = err1;
                        
                        // If failed and we had emoji, try without emoji (column might not exist)
                        if (groupError && emoji) {
                            console.warn("[Waku] Insert with emoji failed, trying without:", groupError.message || groupError);
                            const { error: err2 } = await supabase
                                .from("shout_groups")
                                .insert({
                                    id: groupId,
                                    name: groupName,
                                    created_by: userAddress.toLowerCase(),
                                    symmetric_key: symmetricKeyHex,
                                });
                            groupError = err2;
                        }

                        if (groupError) {
                            log.error("[Waku] Error saving group to Supabase:", groupError.message || groupError);
                        } else {
                            // Insert all members
                            const memberInserts = allMembers.map((addr) => ({
                                group_id: groupId,
                                member_address: addr,
                                role: addr === userAddress.toLowerCase() ? "admin" : "member",
                            }));

                            const { error: membersError } = await supabase
                                .from("shout_group_members")
                                .insert(memberInserts);

                            if (membersError) {
                                log.error("[Waku] Error saving group members to Supabase:", membersError);
                            } else {
                                log.debug("[Waku] Group saved to Supabase successfully");
                            }
                        }
                    } catch (dbErr) {
                        log.error("[Waku] Database error saving group:", dbErr);
                    }
                }

                log.debug("[Waku] Group created successfully");
                return {
                    success: true,
                    groupId,
                    symmetricKey: symmetricKeyHex,
                    members: allMembers,
                };
            } catch (err) {
                log.error("[Waku] Failed to create group:", err);
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

    // Get all groups (from both localStorage and Supabase)
    const getGroups = useCallback(async (): Promise<WakuGroup[]> => {
        const hiddenGroups = getHiddenGroups();
        const storedGroups = getStoredGroups();
        const userAddrLower = userAddress?.toLowerCase() || "";
        
        log.debug("[Waku] getGroups called:", {
            userAddress: userAddrLower,
            storedGroupsCount: storedGroups.length,
        });

        // Start with localStorage groups (for offline support)
        const groupsMap = new Map<string, StoredGroup>();
        for (const g of storedGroups) {
            groupsMap.set(g.id, g);
        }

        // Fetch groups from Supabase (where user is a member)
        if (supabase && userAddrLower) {
            try {
                // Get all groups where the user is a member
                const { data: memberRows, error: memberError } = await supabase
                    .from("shout_group_members")
                    .select("group_id")
                    .eq("member_address", userAddrLower);

                if (memberError) {
                    log.error("[Waku] Error fetching group memberships:", memberError);
                } else if (memberRows && memberRows.length > 0) {
                    const groupIds = memberRows.map((r: { group_id: string }) => r.group_id);
                    
                    // Fetch full group details
                    const { data: dbGroups, error: groupsError } = await supabase
                        .from("shout_groups")
                        .select("id, name, emoji, symmetric_key, created_at")
                        .in("id", groupIds);

                    if (groupsError) {
                        log.error("[Waku] Error fetching groups:", groupsError);
                    } else if (dbGroups) {
                        // Fetch all members for these groups
                        const { data: allMembers, error: allMembersError } = await supabase
                            .from("shout_group_members")
                            .select("group_id, member_address")
                            .in("group_id", groupIds);

                        if (allMembersError) {
                            log.error("[Waku] Error fetching group members:", allMembersError);
                        }

                        // Build member lists per group
                        const membersByGroup: Record<string, string[]> = {};
                        for (const m of allMembers || []) {
                            if (!membersByGroup[m.group_id]) {
                                membersByGroup[m.group_id] = [];
                            }
                            membersByGroup[m.group_id].push(m.member_address);
                        }

                        // Merge Supabase groups into our map
                        let hasUpdates = false;
                        for (const dbGroup of dbGroups) {
                            if (!groupsMap.has(dbGroup.id)) {
                                const group: StoredGroup = {
                                    id: dbGroup.id,
                                    name: dbGroup.name,
                                    emoji: dbGroup.emoji || undefined,
                                    members: membersByGroup[dbGroup.id] || [],
                                    createdAt: new Date(dbGroup.created_at).getTime(),
                                    symmetricKey: dbGroup.symmetric_key,
                                };
                                groupsMap.set(dbGroup.id, group);
                                hasUpdates = true;
                                log.debug("[Waku] Found group from Supabase:", dbGroup.name, "emoji:", dbGroup.emoji);
                            } else {
                                // Update emoji if it exists in Supabase but not locally
                                const existingGroup = groupsMap.get(dbGroup.id);
                                if (existingGroup && dbGroup.emoji && existingGroup.emoji !== dbGroup.emoji) {
                                    existingGroup.emoji = dbGroup.emoji;
                                    groupsMap.set(dbGroup.id, existingGroup);
                                    hasUpdates = true;
                                    log.debug("[Waku] Updated emoji for group:", dbGroup.name, "to:", dbGroup.emoji);
                                }
                            }
                        }

                        // Update localStorage if there were any changes
                        if (hasUpdates) {
                            const updatedGroups = Array.from(groupsMap.values());
                            saveGroups(updatedGroups);
                            log.debug("[Waku] Saved groups to localStorage with emoji updates");
                        }
                    }
                }
            } catch (dbErr) {
                log.error("[Waku] Database error fetching groups:", dbErr);
            }
        }

        // Filter and return groups
        const allGroups = Array.from(groupsMap.values());
        const filteredGroups = allGroups
            .filter((g) => !hiddenGroups.has(g.id))
            .filter((g) => {
                const isUserMember = g.members.includes(userAddrLower);
                if (!isUserMember) {
                    log.debug("[Waku] User not in group:", g.name, "members:", g.members);
                }
                return isUserMember;
            })
            .map((g) => ({
                id: g.id,
                name: g.name,
                emoji: g.emoji,
                memberCount: g.members.length,
                createdAt: new Date(g.createdAt),
            }));
            
        log.debug("[Waku] Total groups found:", filteredGroups.length);
        return filteredGroups;
    }, [getHiddenGroups, getStoredGroups, saveGroups, userAddress]);

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
                log.error("[Waku] Failed to get group messages:", err);
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
                log.error("[Waku] Failed to send group message:", err);
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
                            // Increment unread count for this group
                            setUnreadCounts((prev) => ({
                                ...prev,
                                [groupId]: (prev[groupId] || 0) + 1,
                            }));

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
                log.error("[Waku] Failed to stream group messages:", err);
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

                // Also add to Supabase
                if (supabase && newMembers.length > 0) {
                    const memberInserts = newMembers.map((addr) => ({
                        group_id: groupId,
                        member_address: addr,
                        role: "member",
                    }));

                    const { error } = await supabase
                        .from("shout_group_members")
                        .insert(memberInserts);

                    if (error) {
                        log.error("[Waku] Error adding members to Supabase:", error);
                    }
                }

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

                // Also remove from Supabase
                if (supabase) {
                    const { error } = await supabase
                        .from("shout_group_members")
                        .delete()
                        .eq("group_id", groupId)
                        .eq("member_address", memberAddress.toLowerCase());

                    if (error) {
                        log.error("[Waku] Error removing member from Supabase:", error);
                    }
                }

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
                const decoder = subscriptionsRef.current.get(contentTopic);
                if (decoder && nodeRef.current) {
                    try {
                        await nodeRef.current.filter.unsubscribe(decoder);
                    } catch (unsubErr) {
                        console.warn("[Waku] Error unsubscribing from group:", unsubErr);
                    }
                    subscriptionsRef.current.delete(contentTopic);
                }

                // Also remove from Supabase
                if (supabase && userAddress) {
                    const { error } = await supabase
                        .from("shout_group_members")
                        .delete()
                        .eq("group_id", groupId)
                        .eq("member_address", userAddress.toLowerCase());

                    if (error) {
                        log.error("[Waku] Error leaving group in Supabase:", error);
                    }
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
        [getHiddenGroups, userAddress]
    );

    // Join a group by ID (with optional group data for new members)
    const joinGroupById = useCallback(
        async (
            groupId: string,
            groupData?: {
                name: string;
                symmetricKey: string;
                members: string[];
            }
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

                // If group data is provided and group doesn't exist, add it
                if (groupData) {
                    const groups = getStoredGroups();
                    const existingGroup = groups.find((g) => g.id === groupId);

                    if (!existingGroup) {
                        // Try to fetch emoji from Supabase
                        let emoji: string | undefined;
                        if (supabase) {
                            try {
                                const { data: groupInfo } = await supabase
                                    .from("shout_groups")
                                    .select("emoji")
                                    .eq("id", groupId)
                                    .single();
                                if (groupInfo?.emoji) {
                                    emoji = groupInfo.emoji;
                                }
                            } catch {
                                // Emoji column might not exist, ignore
                            }
                        }

                        // Add the group to localStorage
                        const newGroup: StoredGroup = {
                            id: groupId,
                            name: groupData.name,
                            emoji: emoji,
                            members: groupData.members.map((m) =>
                                m.toLowerCase()
                            ),
                            createdAt: Date.now(),
                            symmetricKey: groupData.symmetricKey,
                        };
                        groups.push(newGroup);
                        saveGroups(groups);
                        console.log(
                            "[Waku] Added group from invitation:",
                            groupId,
                            "emoji:",
                            emoji
                        );
                    }
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
        [getHiddenGroups, getStoredGroups, saveGroups]
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
                    log.debug("[Waku] Error unsubscribing:", err);
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
                setActiveChatPeer,
                onNewMessage,
                prefetchMessages,
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


