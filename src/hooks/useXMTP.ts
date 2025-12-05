"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { type Address } from "viem";
import { useWalletClient } from "wagmi";

// Dynamic import for XMTP to avoid SSR issues
let XMTPClient: typeof import("@xmtp/browser-sdk").Client | null = null;
let ConsentState: typeof import("@xmtp/browser-sdk").ConsentState | null = null;

export type XMTPState = {
  isInitialized: boolean;
  isInitializing: boolean;
  error: string | null;
};

export function useXMTP(userAddress: Address | null) {
  const [state, setState] = useState<XMTPState>({
    isInitialized: false,
    isInitializing: false,
    error: null,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientRef = useRef<any>(null);
  const { data: walletClient } = useWalletClient();

  // Load XMTP SDK dynamically
  useEffect(() => {
    if (typeof window !== "undefined" && !XMTPClient) {
      import("@xmtp/browser-sdk").then((module) => {
        XMTPClient = module.Client;
        ConsentState = module.ConsentState;
      });
    }
  }, []);

  // Initialize XMTP client
  const initialize = useCallback(async (): Promise<boolean> => {
    if (!userAddress || !walletClient) {
      setState((prev) => ({ ...prev, error: "Wallet not connected" }));
      return false;
    }

    if (!XMTPClient) {
      setState((prev) => ({ ...prev, error: "XMTP SDK not loaded yet" }));
      return false;
    }

    if (clientRef.current) {
      return true; // Already initialized
    }

    setState((prev) => ({ ...prev, isInitializing: true, error: null }));

    try {
      // Create signer from wallet client
      const signer = {
        type: "EOA" as const,
        getIdentifier: () => ({
          identifier: userAddress,
          identifierKind: "Ethereum" as const,
        }),
        signMessage: async (message: string) => {
          const signature = await walletClient.signMessage({
            message,
          });
          // Convert hex string to Uint8Array
          const bytes = new Uint8Array(
            signature
              .slice(2)
              .match(/.{1,2}/g)!
              .map((byte: string) => parseInt(byte, 16))
          );
          return bytes;
        },
      };

      // Create XMTP client
      // Using 'dev' environment for testing - both users must be on same network
      const client = await XMTPClient.create(signer, {
        env: "dev",
      });
      
      console.log("[XMTP] Client created successfully");
      console.log("[XMTP] Inbox ID:", client.inboxId);

      clientRef.current = client;
      setState({ isInitialized: true, isInitializing: false, error: null });
      return true;
    } catch (error) {
      console.error("[XMTP] Failed to initialize:", error);
      setState({
        isInitialized: false,
        isInitializing: false,
        error: error instanceof Error ? error.message : "Failed to initialize XMTP",
      });
      return false;
    }
  }, [userAddress, walletClient]);

  // Get or create DM conversation with an address
  const getOrCreateDm = useCallback(
    async (peerAddress: string) => {
      if (!clientRef.current || !XMTPClient) {
        throw new Error("XMTP not initialized");
      }

      try {
        console.log("[XMTP] getOrCreateDm for:", peerAddress);
        
        // Check if peer can be messaged using static canMessage
        const identifier = {
          identifier: peerAddress.toLowerCase(),
          identifierKind: "Ethereum" as const,
        };
        
        const canMessageResult = await XMTPClient.canMessage([identifier]);
        console.log("[XMTP] canMessage result:", canMessageResult);
        
        const canMsg = canMessageResult.get(peerAddress.toLowerCase());
        if (!canMsg) {
          throw new Error("Peer is not on XMTP network yet. They need to enable XMTP first.");
        }

        // Find peer's inbox ID
        console.log("[XMTP] Finding inbox ID for peer...");
        const inboxIds = await clientRef.current.findInboxIdByIdentifier(identifier);
        console.log("[XMTP] Inbox IDs result:", inboxIds);
        
        if (!inboxIds) {
          throw new Error("Could not find peer's inbox ID");
        }

        // Check for existing DM by inbox ID
        console.log("[XMTP] Checking for existing DM...");
        const existingDm = await clientRef.current.conversations.getDmByInboxId(inboxIds);
        if (existingDm) {
          console.log("[XMTP] Found existing DM");
          return existingDm;
        }

        // Create new DM
        console.log("[XMTP] Creating new DM with inbox:", inboxIds);
        const dm = await clientRef.current.conversations.newDm(inboxIds);
        console.log("[XMTP] New DM created successfully");
        return dm;
      } catch (error) {
        console.error("[XMTP] Error getting/creating DM:", error);
        throw error;
      }
    },
    []
  );

  // Send a message
  const sendMessage = useCallback(
    async (peerAddress: string, content: string): Promise<{ success: boolean; error?: string }> => {
      console.log("[XMTP] sendMessage called, client:", !!clientRef.current, "XMTPClient:", !!XMTPClient);
      
      if (!clientRef.current || !XMTPClient) {
        return { success: false, error: "XMTP client not initialized. Please click 'Enable Chat' first." };
      }

      try {
        console.log("[XMTP] Sending message to:", peerAddress);
        const dm = await getOrCreateDm(peerAddress);
        console.log("[XMTP] Got DM conversation, sending...");
        await dm.send(content);
        console.log("[XMTP] Message sent successfully!");
        return { success: true };
      } catch (error) {
        console.error("[XMTP] Failed to send message:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: errorMessage };
      }
    },
    [getOrCreateDm]
  );

  // Get messages from a conversation
  const getMessages = useCallback(
    async (peerAddress: string) => {
      if (!clientRef.current) {
        return [];
      }

      try {
        const dm = await getOrCreateDm(peerAddress);
        await dm.sync();
        const messages = await dm.messages();
        return messages;
      } catch (error) {
        console.error("[XMTP] Failed to get messages:", error);
        return [];
      }
    },
    [getOrCreateDm]
  );

  // Stream messages from a conversation
  const streamMessages = useCallback(
    async (peerAddress: string, onMessage: (message: unknown) => void) => {
      if (!clientRef.current) {
        return null;
      }

      try {
        const dm = await getOrCreateDm(peerAddress);
        const stream = await dm.streamMessages();
        
        // Process the async iterator
        (async () => {
          for await (const message of stream) {
            onMessage(message);
          }
        })();

        return stream;
      } catch (error) {
        console.error("[XMTP] Failed to stream messages:", error);
        return null;
      }
    },
    [getOrCreateDm]
  );

  // Check if an address is on XMTP
  const canMessage = useCallback(async (address: string): Promise<boolean> => {
    if (!XMTPClient) {
      console.log("[XMTP] canMessage: SDK not loaded");
      return false;
    }

    try {
      console.log("[XMTP] Checking if can message:", address);
      
      const identifier = {
        identifier: address.toLowerCase(),
        identifierKind: "Ethereum" as const,
      };
      
      const result = await XMTPClient.canMessage([identifier]);
      console.log("[XMTP] canMessage result:", result);
      
      const canMsg = result.get(address.toLowerCase());
      console.log("[XMTP] Can message", address, ":", canMsg);
      return !!canMsg;
    } catch (error) {
      console.error("[XMTP] canMessage error:", error);
      return false;
    }
  }, []);

  // Close client
  const close = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.close();
      clientRef.current = null;
      setState({ isInitialized: false, isInitializing: false, error: null });
    }
  }, []);

  return {
    ...state,
    client: clientRef.current,
    initialize,
    sendMessage,
    getMessages,
    streamMessages,
    canMessage,
    getOrCreateDm,
    close,
  };
}

