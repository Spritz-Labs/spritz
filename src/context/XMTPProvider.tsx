"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { type Address } from "viem";
import { useWalletClient } from "wagmi";

// Dynamic import for XMTP to avoid SSR issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let XMTPClient: any = null;

type NewMessageCallback = (message: {
  senderAddress: string;
  content: string;
  conversationId: string;
}) => void;

type XMTPContextType = {
  isInitialized: boolean;
  isInitializing: boolean;
  error: string | null;
  userInboxId: string | null;
  unreadCounts: Record<string, number>; // peer address -> unread count
  initialize: () => Promise<boolean>;
  revokeAllInstallations: () => Promise<boolean>;
  sendMessage: (peerAddress: string, content: string) => Promise<{ success: boolean; error?: string }>;
  getMessages: (peerAddress: string) => Promise<unknown[]>;
  streamMessages: (peerAddress: string, onMessage: (message: unknown) => void) => Promise<unknown>;
  canMessage: (address: string) => Promise<boolean>;
  markAsRead: (peerAddress: string) => void;
  onNewMessage: (callback: NewMessageCallback) => () => void;
  close: () => void;
};

const XMTPContext = createContext<XMTPContextType | null>(null);

export function XMTPProvider({ children, userAddress }: { children: ReactNode; userAddress: Address | null }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userInboxId, setUserInboxId] = useState<string | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalStreamRef = useRef<any>(null);
  const newMessageCallbacksRef = useRef<Set<NewMessageCallback>>(new Set());
  // Track conversation ID to peer address mapping
  const conversationToPeerRef = useRef<Record<string, string>>({});
  // Track inbox ID to address mapping (for reverse lookups)
  const inboxIdToAddressRef = useRef<Record<string, string>>({});
  const { data: walletClient } = useWalletClient();

  // Load XMTP SDK dynamically
  useEffect(() => {
    if (typeof window !== "undefined" && !XMTPClient) {
      import("@xmtp/browser-sdk").then((module) => {
        XMTPClient = module.Client;
        console.log("[XMTP] SDK loaded");
      });
    }
  }, []);

  // Initialize XMTP client
  const initialize = useCallback(async (): Promise<boolean> => {
    if (!userAddress || !walletClient) {
      setError("Wallet not connected");
      return false;
    }

    if (!XMTPClient) {
      setError("XMTP SDK not loaded yet. Please try again.");
      return false;
    }

    if (clientRef.current) {
      return true; // Already initialized
    }

    setIsInitializing(true);
    setError(null);

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

      // Create XMTP client - using 'dev' environment for testing
      const client = await XMTPClient.create(signer, {
        env: "dev",
      });

      clientRef.current = client;
      
      console.log("[XMTP] Client created successfully");
      console.log("[XMTP] Inbox ID:", client.inboxId);
      
      // Sync existing conversations to build the mapping
      try {
        console.log("[XMTP] Syncing existing conversations...");
        await client.conversations.sync();
        const conversations = await client.conversations.list();
        console.log("[XMTP] Found", conversations.length, "existing conversations");
        
        for (const convo of conversations) {
          try {
            // Get members of the conversation
            const members = await convo.members();
            // Find the peer (not ourselves)
            const peer = members.find((m: { inboxId: string }) => m.inboxId !== client.inboxId);
            if (peer && peer.addresses && peer.addresses.length > 0) {
              const peerAddress = peer.addresses[0].toLowerCase();
              conversationToPeerRef.current[convo.id] = peerAddress;
              inboxIdToAddressRef.current[peer.inboxId] = peerAddress;
              console.log("[XMTP] Mapped conversation", convo.id, "to peer", peerAddress);
            }
          } catch (err) {
            console.log("[XMTP] Could not get members for conversation:", err);
          }
        }
      } catch (err) {
        console.log("[XMTP] Could not sync conversations:", err);
      }
      
      setUserInboxId(client.inboxId);
      setIsInitialized(true);
      setIsInitializing(false);
      setError(null);
      return true;
    } catch (err) {
      console.error("[XMTP] Failed to initialize:", err);
      setIsInitialized(false);
      setIsInitializing(false);
      setError(err instanceof Error ? err.message : "Failed to initialize XMTP");
      return false;
    }
  }, [userAddress, walletClient]);

  // Revoke all other installations to free up space
  const revokeAllInstallations = useCallback(async (): Promise<boolean> => {
    if (!userAddress || !walletClient) {
      setError("Wallet not connected");
      return false;
    }

    if (!XMTPClient) {
      setError("XMTP SDK not loaded yet");
      return false;
    }

    setIsInitializing(true);
    setError(null);

    try {
      // Create signer
      const signer = {
        type: "EOA" as const,
        getIdentifier: () => ({
          identifier: userAddress,
          identifierKind: "Ethereum" as const,
        }),
        signMessage: async (message: string) => {
          const signature = await walletClient.signMessage({ message });
          const bytes = new Uint8Array(
            signature.slice(2).match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16))
          );
          return bytes;
        },
      };

      console.log("[XMTP] Revoking all other installations...");
      
      // Create client with revokeAllOtherInstallations option
      const client = await XMTPClient.create(signer, {
        env: "dev",
        revokeAllOtherInstallations: true,
      });

      clientRef.current = client;
      setUserInboxId(client.inboxId);
      setIsInitialized(true);
      setIsInitializing(false);
      
      console.log("[XMTP] Successfully revoked installations and created new client");
      return true;
    } catch (err) {
      console.error("[XMTP] Failed to revoke installations:", err);
      setError(err instanceof Error ? err.message : "Failed to revoke installations");
      setIsInitializing(false);
      return false;
    }
  }, [userAddress, walletClient]);

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
    } catch (err) {
      console.error("[XMTP] canMessage error:", err);
      return false;
    }
  }, []);

  // Get or create DM conversation with an address
  const getOrCreateDm = useCallback(
    async (peerAddress: string) => {
      if (!clientRef.current || !XMTPClient) {
        throw new Error("XMTP not initialized. Please click 'Enable Chat' first.");
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
        const inboxId = await clientRef.current.findInboxIdByIdentifier(identifier);
        console.log("[XMTP] Inbox ID result:", inboxId);
        
        if (!inboxId) {
          throw new Error("Could not find peer's inbox ID");
        }
        
        // Store the inboxId → address mapping for notifications
        inboxIdToAddressRef.current[inboxId] = peerAddress.toLowerCase();

        // Check for existing DM by inbox ID
        console.log("[XMTP] Checking for existing DM...");
        const existingDm = await clientRef.current.conversations.getDmByInboxId(inboxId);
        if (existingDm) {
          console.log("[XMTP] Found existing DM");
          // Track conversation to peer mapping
          conversationToPeerRef.current[existingDm.id] = peerAddress.toLowerCase();
          return existingDm;
        }

        // Create new DM
        console.log("[XMTP] Creating new DM with inbox:", inboxId);
        const dm = await clientRef.current.conversations.newDm(inboxId);
        console.log("[XMTP] New DM created successfully");
        
        // Track conversation to peer mapping
        conversationToPeerRef.current[dm.id] = peerAddress.toLowerCase();
        
        return dm;
      } catch (err) {
        console.error("[XMTP] Error getting/creating DM:", err);
        throw err;
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
      } catch (err) {
        console.error("[XMTP] Failed to send message:", err);
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
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
        console.log("[XMTP] Syncing DM...");
        await dm.sync();
        console.log("[XMTP] Getting messages...");
        const messages = await dm.messages();
        console.log("[XMTP] Got", messages.length, "messages");
        return messages;
      } catch (err) {
        console.error("[XMTP] Failed to get messages:", err);
        return [];
      }
    },
    [getOrCreateDm]
  );

  // Stream all messages (filters to specific peer in callback)
  const streamMessages = useCallback(
    async (peerAddress: string, onMessage: (message: unknown) => void) => {
      if (!clientRef.current) {
        return null;
      }

      try {
        console.log("[XMTP] Starting message stream for peer:", peerAddress);
        
        // Get the DM to know its ID for filtering
        const dm = await getOrCreateDm(peerAddress);
        const dmId = dm.id;
        console.log("[XMTP] DM ID for filtering:", dmId);
        
        // Stream all messages and filter to this conversation
        const stream = await clientRef.current.conversations.streamAllMessages({
          onValue: (message: unknown) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = message as any;
            // Only process messages from this conversation
            if (msg.conversationId === dmId) {
              console.log("[XMTP] New message in DM:", msg);
              onMessage(message);
            }
          },
          onError: (error: unknown) => {
            console.error("[XMTP] Stream error:", error);
          },
        });

        return stream;
      } catch (err) {
        console.error("[XMTP] Failed to stream messages:", err);
        return null;
      }
    },
    [getOrCreateDm]
  );

  // Mark messages from a peer as read
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
    // Return unsubscribe function
    return () => {
      newMessageCallbacksRef.current.delete(callback);
    };
  }, []);

  // Start global message stream to track all incoming messages
  const startGlobalStream = useCallback(async () => {
    if (!clientRef.current || globalStreamRef.current) return;

    try {
      console.log("[XMTP] Starting global message stream...");
      
      // Sync conversations first
      await clientRef.current.conversations.sync();
      
      // Get the stream - this returns an async iterator in the browser SDK
      const stream = await clientRef.current.conversations.streamAllMessages();
      globalStreamRef.current = stream;
      
      console.log("[XMTP] Global stream started, listening for messages...");
      
      // Process messages from the async iterator
      (async () => {
        try {
          for await (const message of stream) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = message as any;
            
            console.log("[XMTP] Stream received message:", msg);
            
            // Only process text messages, not from ourselves
            if (typeof msg.content !== "string" || msg.content.trim() === "") {
              console.log("[XMTP] Skipping non-text message");
              continue;
            }
            if (msg.senderInboxId === clientRef.current?.inboxId) {
              console.log("[XMTP] Skipping own message");
              continue;
            }

            console.log("[XMTP] Processing incoming message:", msg.content);

            // Find peer address from conversation mapping or inbox ID mapping
            let peerAddress = conversationToPeerRef.current[msg.conversationId];
            
            // Fallback: try to get address from sender's inbox ID
            if (!peerAddress && msg.senderInboxId) {
              peerAddress = inboxIdToAddressRef.current[msg.senderInboxId];
            }
            
            if (peerAddress) {
              console.log("[XMTP] Notification for peer:", peerAddress);
              
              // Increment unread count
              setUnreadCounts((prev) => ({
                ...prev,
                [peerAddress.toLowerCase()]: (prev[peerAddress.toLowerCase()] || 0) + 1,
              }));

              // Notify all callbacks
              newMessageCallbacksRef.current.forEach((callback) => {
                callback({
                  senderAddress: peerAddress,
                  content: msg.content,
                  conversationId: msg.conversationId,
                });
              });
            } else {
              console.log("[XMTP] Could not find peer address for message");
              console.log("[XMTP] conversationId:", msg.conversationId);
              console.log("[XMTP] senderInboxId:", msg.senderInboxId);
              console.log("[XMTP] Known conversations:", Object.keys(conversationToPeerRef.current));
              console.log("[XMTP] Known inboxIds:", Object.keys(inboxIdToAddressRef.current));
            }
          }
        } catch (streamErr) {
          console.error("[XMTP] Stream iteration error:", streamErr);
        }
      })();
      
    } catch (err) {
      console.error("[XMTP] Failed to start global stream:", err);
    }
  }, []);

  // Start global stream when initialized
  useEffect(() => {
    console.log("[XMTP] Effect running - isInitialized:", isInitialized, "clientRef:", !!clientRef.current);
    
    if (isInitialized && clientRef.current) {
      console.log("[XMTP] Starting streams and polling...");
      startGlobalStream();
      
      // Also start a polling fallback every 5 seconds
      const pollInterval = setInterval(async () => {
        console.log("[XMTP Poll] Checking for new messages...");
        if (!clientRef.current) {
          console.log("[XMTP Poll] No client, skipping");
          return;
        }
        
        try {
          console.log("[XMTP Poll] Syncing conversations...");
          await clientRef.current.conversations.sync();
          const conversations = await clientRef.current.conversations.list();
          console.log("[XMTP Poll] Found", conversations.length, "conversations");
          
          for (const convo of conversations) {
            console.log("[XMTP Poll] Checking conversation:", convo.id);
            await convo.sync();
            const messages = await convo.messages({ limit: BigInt(1) });
            
            if (messages.length > 0) {
              const latestMsg = messages[0];
              // Check if it's a new message from someone else
              if (
                typeof latestMsg.content === "string" &&
                latestMsg.senderInboxId !== clientRef.current.inboxId
              ) {
                const msgKey = `${convo.id}-${latestMsg.id}`;
                const seenKey = `xmtp_seen_${msgKey}`;
                
                // Check if we've already notified about this message
                if (!sessionStorage.getItem(seenKey)) {
                  sessionStorage.setItem(seenKey, "1");
                  
                  // Find peer address
                  let peerAddress = conversationToPeerRef.current[convo.id];
                  if (!peerAddress && latestMsg.senderInboxId) {
                    peerAddress = inboxIdToAddressRef.current[latestMsg.senderInboxId];
                  }
                  
                  if (peerAddress) {
                    console.log("[XMTP Poll] New message detected from:", peerAddress);
                    
                    setUnreadCounts((prev) => ({
                      ...prev,
                      [peerAddress.toLowerCase()]: (prev[peerAddress.toLowerCase()] || 0) + 1,
                    }));

                    newMessageCallbacksRef.current.forEach((callback) => {
                      callback({
                        senderAddress: peerAddress,
                        content: latestMsg.content,
                        conversationId: convo.id,
                      });
                    });
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error("[XMTP Poll] Error:", err);
        }
      }, 5000);
      
      return () => clearInterval(pollInterval);
    }
  }, [isInitialized, startGlobalStream]);

  // Close client
  const close = useCallback(() => {
    if (globalStreamRef.current) {
      globalStreamRef.current = null;
    }
    if (clientRef.current) {
      clientRef.current.close();
      clientRef.current = null;
      setIsInitialized(false);
      setIsInitializing(false);
      setError(null);
      setUserInboxId(null);
      setUnreadCounts({});
    }
  }, []);

  return (
    <XMTPContext.Provider
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
        markAsRead,
        onNewMessage,
        close,
      }}
    >
      {children}
    </XMTPContext.Provider>
  );
}

export function useXMTPContext() {
  const context = useContext(XMTPContext);
  if (!context) {
    throw new Error("useXMTPContext must be used within an XMTPProvider");
  }
  return context;
}

