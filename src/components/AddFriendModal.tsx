"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useENS, type ENSResolution } from "@/hooks/useENS";
import { useUsername } from "@/hooks/useUsername";
import { usePhoneVerification } from "@/hooks/usePhoneVerification";

type AddFriendModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (addressOrENS: string, nickname?: string) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
};

// Check if input looks like a phone number
function looksLikePhone(input: string): boolean {
  const digits = input.replace(/\D/g, "");
  return digits.length >= 10 && /^[\d\s\-\(\)\+]+$/.test(input);
}

export function AddFriendModal({
  isOpen,
  onClose,
  onAdd,
  isLoading,
  error,
}: AddFriendModalProps) {
  const [input, setInput] = useState("");
  const [nickname, setNickname] = useState("");
  const [resolved, setResolved] = useState<ENSResolution | null>(null);
  const [resolvedFromUsername, setResolvedFromUsername] = useState(false);
  const [resolvedFromPhone, setResolvedFromPhone] = useState(false);
  const { resolveAddressOrENS, isResolving, error: resolveError } = useENS();
  const { lookupUsername } = useUsername(null);
  const { lookupByPhone } = usePhoneVerification(null);

  // Debounced resolution as user types - check phone, username, then ENS/address
  useEffect(() => {
    if (!input.trim() || input.trim().length < 3) {
      setResolved(null);
      setResolvedFromUsername(false);
      setResolvedFromPhone(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const trimmedInput = input.trim();
        
        // First, check if it looks like a phone number
        if (looksLikePhone(trimmedInput)) {
          try {
            const phoneResult = await lookupByPhone(trimmedInput);
            if (phoneResult) {
              // Found a verified phone - resolve the address for ENS/avatar
              const ensResult = await resolveAddressOrENS(phoneResult.wallet_address);
              setResolved({
                address: phoneResult.wallet_address as `0x${string}`,
                ensName: ensResult?.ensName || null,
                avatar: ensResult?.avatar || null,
              });
              setResolvedFromPhone(true);
              setResolvedFromUsername(false);
              return;
            }
          } catch (err) {
            console.error("[AddFriend] Phone lookup failed:", err);
            // Continue to other lookups
          }
        }
        
        // Try to lookup as a Shout username (if it doesn't look like an address or ENS)
        const lowerInput = trimmedInput.toLowerCase();
        if (!lowerInput.startsWith("0x") && !lowerInput.includes(".")) {
          try {
            const usernameResult = await lookupUsername(lowerInput);
            if (usernameResult) {
              // Found a username - now resolve the address for ENS/avatar
              const ensResult = await resolveAddressOrENS(usernameResult.wallet_address);
              setResolved({
                address: usernameResult.wallet_address as `0x${string}`,
                ensName: ensResult?.ensName || null,
                avatar: ensResult?.avatar || null,
              });
              setResolvedFromUsername(true);
              setResolvedFromPhone(false);
              return;
            }
          } catch (err) {
            console.error("[AddFriend] Username lookup failed:", err);
            // Continue to ENS resolution
          }
        }
        
        // Fall back to ENS/address resolution
        const result = await resolveAddressOrENS(lowerInput);
        setResolved(result);
        setResolvedFromUsername(false);
        setResolvedFromPhone(false);
      } catch (err) {
        console.error("[AddFriend] Resolution failed:", err);
        setResolved(null);
        setResolvedFromUsername(false);
        setResolvedFromPhone(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [input, resolveAddressOrENS, lookupUsername, lookupByPhone]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setInput("");
      setNickname("");
      setResolved(null);
      setResolvedFromUsername(false);
      setResolvedFromPhone(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolved?.address) return;

    // Use the resolved address for the request
    const success = await onAdd(resolved.address, nickname.trim() || undefined);
    if (success) {
      setInput("");
      setNickname("");
      setResolved(null);
      onClose();
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
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
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md z-50"
          >
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Send Friend Request</h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
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

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Phone, Username, Address, or ENS
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="(555) 555-5555, kevin, 0x..., or vitalik.eth"
                      className="w-full py-3 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all"
                    />
                    {isResolving && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <svg
                          className="animate-spin h-5 w-5 text-violet-400"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>

                {/* Resolved Preview */}
                <AnimatePresence>
                  {resolved && resolved.address && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          {resolved.avatar ? (
                            <img
                              src={resolved.avatar}
                              alt="Avatar"
                              className="w-12 h-12 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                              <span className="text-white font-bold text-lg">
                                {(resolved.ensName || resolved.address)[0].toUpperCase()}
                              </span>
                            </div>
                          )}

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <svg
                                className="w-4 h-4 text-emerald-400"
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
                              <span className="text-emerald-400 text-sm font-medium">
                                {resolvedFromPhone 
                                  ? "Found by phone" 
                                  : resolvedFromUsername 
                                    ? "Found @" + input.trim().toLowerCase() 
                                    : "Resolved"}
                              </span>
                            </div>
                            {resolved.ensName && (
                              <p className="text-white font-medium truncate">
                                {resolved.ensName}
                              </p>
                            )}
                            <p className="text-zinc-400 text-sm font-mono truncate">
                              {formatAddress(resolved.address)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Resolution Error */}
                <AnimatePresence>
                  {resolveError && input.trim().length >= 3 && !isResolving && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3"
                    >
                      <p className="text-amber-400 text-sm">{resolveError}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Nickname (optional)
                  </label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Give them a nickname"
                    className="w-full py-3 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all"
                  />
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="bg-red-500/10 border border-red-500/30 rounded-xl p-3"
                    >
                      <p className="text-red-400 text-sm">{error}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading || !input.trim() || (!resolved?.address && !isResolving)}
                    className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-medium transition-all hover:shadow-lg hover:shadow-violet-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg
                          className="animate-spin h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Sending...
                      </span>
                    ) : (
                      "Send Request"
                    )}
                  </button>
                </div>
              </form>

              <p className="text-zinc-500 text-xs text-center mt-4">
                They&apos;ll need to accept your request before you can call
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
