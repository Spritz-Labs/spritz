"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { type Address } from "viem";
import { useXMTPContext } from "@/context/XMTPProvider";

type ChatModalProps = {
  isOpen: boolean;
  onClose: () => void;
  userAddress: Address;
  peerAddress: Address;
  peerName?: string | null;
  peerAvatar?: string | null;
};

type Message = {
  id: string;
  content: string;
  senderAddress: string;
  sentAt: Date;
};

type ChatState = "checking" | "ready" | "error" | "loading";

export function ChatModal({
  isOpen,
  onClose,
  userAddress,
  peerAddress,
  peerName,
  peerAvatar,
}: ChatModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatState, setChatState] = useState<ChatState>("checking");
  const [bypassCheck, setBypassCheck] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const streamRef = useRef<any>(null);

  const {
    isInitialized,
    isInitializing,
    error: xmtpError,
    userInboxId,
    initialize,
    sendMessage,
    getMessages,
    streamMessages,
    canMessage,
    markAsRead,
  } = useXMTPContext();

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const displayName = peerName || formatAddress(peerAddress);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initialize XMTP when modal opens
  useEffect(() => {
    if (isOpen && !isInitialized && !isInitializing) {
      initialize();
    }
  }, [isOpen, isInitialized, isInitializing, initialize]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setMessages([]);
      setChatError(null);
      setChatState("checking");
      setBypassCheck(false);
    }
  }, [isOpen]);

  // Load messages and start streaming when initialized
  useEffect(() => {
    if (!isOpen || !isInitialized) return;

    const loadMessages = async () => {
      setChatState("checking");
      
      try {
        // Check if peer can receive messages (unless bypassed)
        if (!bypassCheck) {
          const canChat = await canMessage(peerAddress);
          console.log("[Chat] canMessage result for", peerAddress, ":", canChat);
          if (!canChat) {
            setChatState("error");
            setChatError(`${displayName} hasn't enabled XMTP yet. They need to click "Enable Chat" in Shout first.`);
            return;
          }
        }

        setChatState("loading");
        setChatError(null);
        
        console.log("[Chat] Loading messages for", peerAddress);
        const existingMessages = await getMessages(peerAddress);
        console.log("[Chat] Got messages:", existingMessages.length);
        
        // Filter and format messages - only include text messages, not system messages
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const formattedMessages: Message[] = existingMessages
          .filter((msg: any) => {
            // Only include messages with string content (actual text messages)
            // Filter out system messages (membership changes, etc.) which have object content
            return typeof msg.content === "string" && msg.content.trim() !== "";
          })
          .map((msg: any) => ({
            id: msg.id,
            content: msg.content,
            senderAddress: msg.senderInboxId,
            // Handle BigInt timestamp - convert to Number first
            sentAt: new Date(Number(msg.sentAtNs) / 1000000),
          }));

        setMessages(formattedMessages);
        setChatState("ready");
        
        // Mark messages as read since chat is now open
        markAsRead(peerAddress);

        // Start streaming new messages
        const stream = await streamMessages(peerAddress, (message: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const msg = message as any;
          
          // Only process text messages, skip system messages
          if (typeof msg.content !== "string" || msg.content.trim() === "") {
            return;
          }
          
          const newMsg: Message = {
            id: msg.id,
            content: msg.content,
            senderAddress: msg.senderInboxId,
            // Handle BigInt timestamp
            sentAt: new Date(Number(msg.sentAtNs) / 1000000),
          };
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          
          // Mark as read immediately since chat is open
          markAsRead(peerAddress);
        });

        streamRef.current = stream;
      } catch (error) {
        console.error("[Chat] Error loading messages:", error);
        setChatState("error");
        setChatError(error instanceof Error ? error.message : "Failed to load messages. Please try again.");
      }
    };

    loadMessages();

    return () => {
      // Cleanup stream on unmount
      if (streamRef.current) {
        streamRef.current = null;
      }
    };
  }, [isOpen, isInitialized, peerAddress, getMessages, streamMessages, canMessage, displayName, bypassCheck, markAsRead]);

  const handleSend = useCallback(async () => {
    if (!newMessage.trim() || isSending) return;

    setIsSending(true);
    setChatError(null);
    try {
      const result = await sendMessage(peerAddress, newMessage.trim());
      if (result.success) {
        setNewMessage("");
      } else {
        setChatError(`Failed to send: ${result.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("[Chat] Send error:", error);
      setChatError(`Failed to send: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsSending(false);
    }
  }, [newMessage, isSending, sendMessage, peerAddress]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-lg h-[600px] max-h-[80vh] z-50"
          >
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col h-full overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-3 p-4 border-b border-zinc-800">
                {peerAvatar ? (
                  <img
                    src={peerAvatar}
                    alt={displayName}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                    <span className="text-white font-bold">
                      {displayName[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-white font-semibold truncate">{displayName}</h2>
                  <p className="text-zinc-500 text-xs font-mono truncate">
                    {formatAddress(peerAddress)}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {isInitializing && (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <svg className="animate-spin h-8 w-8 text-blue-500 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <p className="text-zinc-400">Initializing XMTP...</p>
                      <p className="text-zinc-500 text-sm mt-1">Please sign the message in your wallet</p>
                    </div>
                  </div>
                )}

                {(xmtpError || chatError) && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
                    <p className="text-red-400">{xmtpError || chatError}</p>
                    {chatState === "error" && !bypassCheck && (
                      <button
                        onClick={() => setBypassCheck(true)}
                        className="mt-3 py-2 px-4 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-sm transition-colors"
                      >
                        Try Anyway
                      </button>
                    )}
                  </div>
                )}

                {isInitialized && !chatError && messages.length === 0 && (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <p className="text-zinc-400">No messages yet</p>
                      <p className="text-zinc-500 text-sm mt-1">Say hello to start the conversation!</p>
                    </div>
                  </div>
                )}

                {messages.map((msg) => {
                  const isOwn = userInboxId ? msg.senderAddress === userInboxId : false;
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                          isOwn
                            ? "bg-blue-600 text-white rounded-br-md"
                            : "bg-zinc-800 text-white rounded-bl-md"
                        }`}
                      >
                        <p className="break-words">{msg.content}</p>
                        <p className={`text-xs mt-1 ${isOwn ? "text-blue-200" : "text-zinc-500"}`}>
                          {msg.sentAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 border-t border-zinc-800">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={isInitialized ? "Type a message..." : "Initializing..."}
                    disabled={!isInitialized || !!chatError}
                    className="flex-1 py-3 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!newMessage.trim() || isSending || !isInitialized || !!chatError}
                    className="p-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSending ? (
                      <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="text-zinc-600 text-xs text-center mt-2">
                  Powered by <span className="text-blue-400">XMTP</span> • End-to-end encrypted
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

