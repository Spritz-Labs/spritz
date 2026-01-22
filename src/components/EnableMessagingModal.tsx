"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { usePasskeyContext } from "@/context/PasskeyProvider";

type AuthType = "wallet" | "passkey" | "email" | "digitalid" | "solana";

interface EnableMessagingModalProps {
  isOpen: boolean;
  onClose: () => void;
  authType: AuthType;
  userAddress: string;
  onActivate: () => Promise<{ success: boolean; error?: string; requiresPasskey?: boolean }>;
  onAddPasskey?: () => void;
  isLoading?: boolean;
}

/**
 * Modal that guides users through enabling secure messaging
 * 
 * Different flows based on auth type:
 * - Wallet: Sign message to derive key
 * - Passkey: Authenticate to derive key
 * - Email/Digital ID: Must create passkey first
 */
export function EnableMessagingModal({
  isOpen,
  onClose,
  authType,
  userAddress,
  onActivate,
  onAddPasskey,
  isLoading: externalLoading,
}: EnableMessagingModalProps) {
  const [isActivating, setIsActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPasskeyPrompt, setShowPasskeyPrompt] = useState(false);
  
  const passkeyContext = usePasskeyContext();
  
  const isLoading = externalLoading || isActivating || passkeyContext.isLoading;
  
  const handleActivate = useCallback(async () => {
    setIsActivating(true);
    setError(null);
    
    try {
      const result = await onActivate();
      
      if (result.success) {
        onClose();
      } else if (result.requiresPasskey) {
        setShowPasskeyPrompt(true);
      } else {
        setError(result.error || "Failed to enable messaging");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsActivating(false);
    }
  }, [onActivate, onClose]);
  
  const handleAddPasskey = useCallback(async () => {
    if (onAddPasskey) {
      onAddPasskey();
      onClose();
      return;
    }
    
    // Use built-in passkey registration
    setIsActivating(true);
    setError(null);
    
    try {
      // Register passkey using the context
      await passkeyContext.register(userAddress);
      
      if (!passkeyContext.error) {
        // Now try to activate messaging with the new passkey
        setShowPasskeyPrompt(false);
        const result = await onActivate();
        if (result.success) {
          onClose();
        } else {
          setError(result.error || "Passkey created, but messaging activation failed");
        }
      } else {
        setError(passkeyContext.error || "Failed to create passkey");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create passkey");
    } finally {
      setIsActivating(false);
    }
  }, [onAddPasskey, onClose, passkeyContext, userAddress, onActivate]);
  
  // Get content based on auth type and state
  const getContent = () => {
    if (showPasskeyPrompt) {
      return {
        icon: "🔑",
        title: "Add a Passkey",
        description: (
          <>
            <p className="text-zinc-400 mb-4">
              To enable secure messaging, you need to add a passkey to your account.
            </p>
            <div className="space-y-3 text-sm text-zinc-500">
              <div className="flex items-start gap-3">
                <span className="text-lg">✨</span>
                <span>Creates encryption keys only you control</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-lg">☁️</span>
                <span>Syncs automatically via iCloud or Google</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-lg">🔒</span>
                <span>Protected by Face ID / Touch ID</span>
              </div>
            </div>
          </>
        ),
        primaryAction: "Add Passkey",
        onPrimary: handleAddPasskey,
      };
    }
    
    switch (authType) {
      case "wallet":
        return {
          icon: "✍️",
          title: "Enable Secure Messaging",
          description: (
            <>
              <p className="text-zinc-400 mb-4">
                Sign a message to generate your encryption key.
              </p>
              <div className="space-y-3 text-sm text-zinc-500">
                <div className="flex items-start gap-3">
                  <span className="text-lg">🔄</span>
                  <span>Same key on all devices using this wallet</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-lg">🚫</span>
                  <span>No keys stored – derived from your wallet</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-lg">🔐</span>
                  <span>Only you can decrypt your messages</span>
                </div>
              </div>
            </>
          ),
          primaryAction: "Sign with Wallet",
          onPrimary: handleActivate,
        };
        
      case "passkey":
        return {
          icon: "🔐",
          title: "Enable Secure Messaging",
          description: (
            <>
              <p className="text-zinc-400 mb-4">
                Verify your passkey to enable end-to-end encrypted messaging.
              </p>
              <div className="space-y-3 text-sm text-zinc-500">
                <div className="flex items-start gap-3">
                  <span className="text-lg">☁️</span>
                  <span>Same key synced via iCloud / Google</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-lg">🚫</span>
                  <span>No keys stored – derived from passkey</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-lg">🛡️</span>
                  <span>Protected by Face ID / Touch ID</span>
                </div>
              </div>
            </>
          ),
          primaryAction: "Verify with Passkey",
          onPrimary: handleActivate,
        };
        
      case "email":
      case "digitalid":
      case "solana":
        return {
          icon: "🔒",
          title: "Set Up Secure Messaging",
          description: (
            <>
              <p className="text-zinc-400 mb-4">
                To send encrypted messages, you need to add a passkey to your account.
              </p>
              <div className="bg-zinc-800/50 rounded-lg p-4 mb-4">
                <p className="text-sm text-zinc-400">
                  <span className="text-amber-400 font-medium">Why a passkey?</span>
                  <br />
                  Your {authType === "email" ? "email" : authType === "solana" ? "Solana wallet" : "digital ID"} can&apos;t generate encryption keys.
                  A passkey provides the cryptographic material needed for secure messaging.
                </p>
              </div>
              <div className="space-y-3 text-sm text-zinc-500">
                <div className="flex items-start gap-3">
                  <span className="text-lg">⚡</span>
                  <span>Takes about 30 seconds</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-lg">☁️</span>
                  <span>Syncs automatically across your devices</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-lg">🔐</span>
                  <span>Uses Face ID / Touch ID</span>
                </div>
              </div>
            </>
          ),
          primaryAction: "Add Passkey to Continue",
          onPrimary: handleAddPasskey,
          secondaryAction: "Skip for Now",
          onSecondary: onClose,
          secondaryNote: "(You won't be able to message until you add one)",
        };
        
      default:
        return {
          icon: "🔐",
          title: "Enable Secure Messaging",
          description: <p className="text-zinc-400">Enable end-to-end encryption for your messages.</p>,
          primaryAction: "Enable",
          onPrimary: handleActivate,
        };
    }
  };
  
  const content = getContent();
  
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
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
              {/* Header */}
              <div className="relative p-6 pb-4 text-center">
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-2 rounded-full hover:bg-zinc-800 transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                
                <motion.div
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  className="text-5xl mb-4"
                >
                  {content.icon}
                </motion.div>
                
                <h2 className="text-xl font-semibold text-white">
                  {content.title}
                </h2>
              </div>
              
              {/* Content */}
              <div className="px-6 pb-6">
                {content.description}
                
                {/* Error */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg"
                  >
                    <p className="text-sm text-red-400">{error}</p>
                  </motion.div>
                )}
                
                {/* Actions */}
                <div className="mt-6 space-y-3">
                  <button
                    onClick={content.onPrimary}
                    disabled={isLoading}
                    className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Processing...
                      </>
                    ) : (
                      content.primaryAction
                    )}
                  </button>
                  
                  {content.secondaryAction && content.onSecondary && (
                    <div className="text-center">
                      <button
                        onClick={content.onSecondary}
                        disabled={isLoading}
                        className="text-sm text-zinc-500 hover:text-zinc-400 transition-colors"
                      >
                        {content.secondaryAction}
                      </button>
                      {content.secondaryNote && (
                        <p className="text-xs text-zinc-600 mt-1">
                          {content.secondaryNote}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Footer info */}
              <div className="px-6 py-4 bg-zinc-800/30 border-t border-zinc-800">
                <p className="text-xs text-zinc-500 text-center">
                  🔒 Your encryption keys are never stored on our servers
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Inline prompt for enabling messaging (for use in chat UI)
 */
export function EnableMessagingPrompt({
  authType,
  onEnable,
  isLoading,
}: {
  authType: AuthType;
  onEnable: () => void;
  isLoading?: boolean;
}) {
  const getPromptText = () => {
    switch (authType) {
      case "wallet":
        return {
          title: "Sign to enable secure messaging",
          description: "Your messages will be end-to-end encrypted.",
          action: "Sign with Wallet",
        };
      case "passkey":
        return {
          title: "Verify to enable secure messaging",
          description: "Your messages will be end-to-end encrypted.",
          action: "Verify with Passkey",
        };
      default:
        return {
          title: "Add a passkey to message securely",
          description: "Required for end-to-end encrypted messaging.",
          action: "Add Passkey",
        };
    }
  };
  
  const prompt = getPromptText();
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl p-4"
    >
      <div className="flex items-start gap-3">
        <div className="text-2xl">🔐</div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-white mb-1">
            {prompt.title}
          </h4>
          <p className="text-xs text-zinc-400 mb-3">
            {prompt.description}
          </p>
          <button
            onClick={onEnable}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </>
            ) : (
              prompt.action
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
