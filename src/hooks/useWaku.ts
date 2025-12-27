"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { type Address } from "viem";
import { useWalletClient } from "wagmi";
import protobuf from "protobufjs";

// Dynamic import for Waku to avoid SSR issues
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
    .add(new protobuf.Field("messageType", 5, "string"));

export type WakuState = {
    isInitialized: boolean;
    isInitializing: boolean;
    error: string | null;
};

// Generate unique message ID
function generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Generate content topic for DM
function getDmContentTopic(address1: string, address2: string): string {
    const sorted = [address1.toLowerCase(), address2.toLowerCase()].sort();
    return `/spritz/1/dm/${sorted[0]}-${sorted[1]}/proto`;
}

const DM_KEYS_STORAGE = "waku_dm_keys";

export function useWaku(userAddress: Address | null) {
    const [state, setState] = useState<WakuState>({
        isInitialized: false,
        isInitializing: false,
        error: null,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeRef = useRef<any>(null);
    const { data: walletClient } = useWalletClient();

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
                })
                .catch((err) => {
                    console.error("[Waku] Failed to load SDK:", err);
                });
        }
    }, []);

    // Get or create symmetric key for a DM conversation
    const getDmSymmetricKey = useCallback(
        async (peerAddress: string): Promise<Uint8Array> => {
            const topic = getDmContentTopic(userAddress || "", peerAddress);
            const storageKey = `${DM_KEYS_STORAGE}_${topic}`;

            const stored = localStorage.getItem(storageKey);
            if (stored && wakuUtils) {
                return wakuUtils.hexToBytes(stored);
            }

            if (!wakuEncryption) {
                throw new Error("Waku encryption not loaded");
            }
            const key = wakuEncryption.generateSymmetricKey();

            if (wakuUtils) {
                localStorage.setItem(storageKey, wakuUtils.bytesToHex(key));
            }

            return key;
        },
        [userAddress]
    );

    // Initialize Waku node
    const initialize = useCallback(async (): Promise<boolean> => {
        if (!userAddress || !walletClient) {
            setState((prev) => ({ ...prev, error: "Wallet not connected" }));
            return false;
        }

        if (!wakuSdk) {
            setState((prev) => ({ ...prev, error: "Waku SDK not loaded yet" }));
            return false;
        }

        if (nodeRef.current) {
            return true;
        }

        setState((prev) => ({ ...prev, isInitializing: true, error: null }));

        try {
            const node = await wakuSdk.createLightNode({
                defaultBootstrap: true,
                networkConfig: {
                    clusterId: 1,
                },
            });

            await node.start();
            await node.waitForPeers([
                wakuSdk.Protocols.LightPush,
                wakuSdk.Protocols.Filter,
            ]);

            nodeRef.current = node;
            setState({
                isInitialized: true,
                isInitializing: false,
                error: null,
            });
            return true;
        } catch (error) {
            console.error("[Waku] Failed to initialize:", error);
            setState({
                isInitialized: false,
                isInitializing: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to initialize Waku",
            });
            return false;
        }
    }, [userAddress, walletClient]);

    // Get or create DM "conversation"
    const getOrCreateDm = useCallback(
        async (peerAddress: string) => {
            if (!nodeRef.current || !wakuSdk) {
                throw new Error("Waku not initialized");
            }

            const contentTopic = getDmContentTopic(
                userAddress || "",
                peerAddress
            );
            const symmetricKey = await getDmSymmetricKey(peerAddress);

            return {
                id: contentTopic,
                peerAddress,
                symmetricKey,
                send: async (content: string) => {
                    const encoder = wakuEncryption.createEncoder({
                        contentTopic,
                        symKey: symmetricKey,
                    });

                    const messageObj = MessageProto.create({
                        timestamp: Date.now(),
                        sender: userAddress?.toLowerCase(),
                        content,
                        messageId: generateMessageId(),
                        messageType: content.startsWith("[PIXEL_ART]")
                            ? "pixel_art"
                            : "text",
                    });

                    const payload = MessageProto.encode(messageObj).finish();
                    await nodeRef.current.lightPush.send(encoder, { payload });
                },
                sync: async () => {
                    // No-op for Waku
                },
                messages: async () => {
                    const decoder = wakuEncryption.createDecoder(
                        contentTopic,
                        symmetricKey
                    );
                    const messages: unknown[] = [];

                    try {
                        await nodeRef.current.store.queryWithOrderedCallback(
                            [decoder],
                            (wakuMessage: { payload?: Uint8Array }) => {
                                if (!wakuMessage.payload) return;
                                try {
                                    const decoded = MessageProto.decode(
                                        wakuMessage.payload
                                    );
                                    const msg = MessageProto.toObject(decoded);
                                    messages.push({
                                        id: msg.messageId,
                                        content: msg.content,
                                        senderInboxId: msg.sender,
                                        sentAtNs:
                                            BigInt(msg.timestamp) *
                                            BigInt(1000000),
                                    });
                                } catch (e) {
                                    console.log("[Waku] Decode error:", e);
                                }
                            }
                        );
                    } catch (e) {
                        console.log("[Waku] Store query error:", e);
                    }

                    return messages;
                },
            };
        },
        [userAddress, getDmSymmetricKey]
    );

    // Send a message
    const sendMessage = useCallback(
        async (
            peerAddress: string,
            content: string
        ): Promise<{ success: boolean; error?: string }> => {
            if (!nodeRef.current || !wakuSdk) {
                return {
                    success: false,
                    error: "Waku not initialized. Please click 'Enable Chat' first.",
                };
            }

            try {
                const dm = await getOrCreateDm(peerAddress);
                await dm.send(content);
                return { success: true };
            } catch (error) {
                console.error("[Waku] Failed to send message:", error);
                return {
                    success: false,
                    error:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                };
            }
        },
        [getOrCreateDm]
    );

    // Get messages from a conversation
    const getMessages = useCallback(
        async (peerAddress: string) => {
            if (!nodeRef.current) {
                return [];
            }

            try {
                const dm = await getOrCreateDm(peerAddress);
                return await dm.messages();
            } catch (error) {
                console.error("[Waku] Failed to get messages:", error);
                return [];
            }
        },
        [getOrCreateDm]
    );

    // Stream messages from a conversation
    const streamMessages = useCallback(
        async (peerAddress: string, onMessage: (message: unknown) => void) => {
            if (!nodeRef.current || !wakuEncryption) {
                return null;
            }

            try {
                const contentTopic = getDmContentTopic(
                    userAddress || "",
                    peerAddress
                );
                const symmetricKey = await getDmSymmetricKey(peerAddress);
                const decoder = wakuEncryption.createDecoder(
                    contentTopic,
                    symmetricKey
                );

                const { subscription } =
                    await nodeRef.current.filter.createSubscription({
                        contentTopics: [contentTopic],
                    });

                await subscription.subscribe(
                    [decoder],
                    (wakuMessage: { payload?: Uint8Array }) => {
                        if (!wakuMessage.payload) return;
                        try {
                            const decoded = MessageProto.decode(
                                wakuMessage.payload
                            );
                            const msg = MessageProto.toObject(decoded);
                            onMessage({
                                id: msg.messageId,
                                content: msg.content,
                                senderInboxId: msg.sender,
                                sentAtNs:
                                    BigInt(msg.timestamp) * BigInt(1000000),
                            });
                        } catch (e) {
                            console.log("[Waku] Stream decode error:", e);
                        }
                    }
                );

                return subscription;
            } catch (error) {
                console.error("[Waku] Failed to stream messages:", error);
                return null;
            }
        },
        [userAddress, getDmSymmetricKey]
    );

    // Check if an address can receive messages
    const canMessage = useCallback(
        async (address: string): Promise<boolean> => {
            // Waku is permissionless - any address can receive messages
            return address.startsWith("0x");
        },
        []
    );

    // Close node
    const close = useCallback(() => {
        if (nodeRef.current) {
            nodeRef.current.stop();
            nodeRef.current = null;
            setState({
                isInitialized: false,
                isInitializing: false,
                error: null,
            });
        }
    }, []);

    return {
        ...state,
        client: nodeRef.current,
        initialize,
        sendMessage,
        getMessages,
        streamMessages,
        canMessage,
        getOrCreateDm,
        close,
    };
}




