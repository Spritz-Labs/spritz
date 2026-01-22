"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useMessagingKeyContextOptional } from "@/context/MessagingKeyProvider";
import { EnableMessagingModal } from "./EnableMessagingModal";

interface MessagingStatusProps {
  compact?: boolean;
  showDetails?: boolean;
  className?: string;
}

/**
 * Displays the current messaging status and provides controls to enable/disable
 * Use in settings or profile pages
 */
export function MessagingStatus({ compact = false, showDetails = false, className = "" }: MessagingStatusProps) {
  const messagingKey = useMessagingKeyContextOptional();
  const [showModal, setShowModal] = useState(false);
  
  if (!messagingKey) {
    return null;
  }
  
  const {
    isReady,
    isLoading,
    requiresPasskey,
    requiresActivation,
    error,
    derivedFrom,
    activateMessaging,
    authType,
  } = messagingKey;
  
  // Compact badge for inline use
  if (compact) {
    return (
      <>
        <button
          onClick={() => !isReady && setShowModal(true)}
          disabled={isLoading || isReady}
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
            isReady
              ? "bg-green-500/10 text-green-400"
              : requiresPasskey
              ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 cursor-pointer"
              : "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 cursor-pointer"
          } ${className}`}
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Enabling...
            </>
          ) : isReady ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              Secure
            </>
          ) : requiresPasskey ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Add Passkey
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              Enable
            </>
          )}
        </button>
        
        {showModal && authType && (
          <EnableMessagingModal
            isOpen={showModal}
            onClose={() => setShowModal(false)}
            authType={authType}
            userAddress={messagingKey.publicKey || ""}
            onActivate={activateMessaging}
            isLoading={isLoading}
          />
        )}
      </>
    );
  }
  
  // Full card for settings page
  return (
    <div className={`bg-zinc-800/50 rounded-xl p-4 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-white flex items-center gap-2">
            🔐 Message Encryption
            {isReady && (
              <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                Active
              </span>
            )}
          </h3>
          
          <p className="mt-1 text-xs text-zinc-400">
            {isReady ? (
              <>
                Your messages are end-to-end encrypted.
                {derivedFrom && showDetails && (
                  <span className="text-zinc-500 ml-1">
                    (Key derived from {derivedFrom === "eoa" ? "wallet signature" : derivedFrom === "passkey-prf" ? "passkey" : derivedFrom === "legacy" ? "legacy backup" : "passkey signature"})
                  </span>
                )}
              </>
            ) : requiresPasskey ? (
              "Add a passkey to enable secure messaging."
            ) : requiresActivation ? (
              "Enable encryption to send secure messages."
            ) : (
              "Checking encryption status..."
            )}
          </p>
          
          {error && (
            <p className="mt-2 text-xs text-red-400">{error}</p>
          )}
        </div>
        
        {!isReady && (
          <button
            onClick={() => setShowModal(true)}
            disabled={isLoading}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isLoading ? "Enabling..." : requiresPasskey ? "Add Passkey" : "Enable"}
          </button>
        )}
      </div>
      
      {showDetails && isReady && (
        <div className="mt-3 pt-3 border-t border-zinc-700/50">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-500">Key Source</span>
            <span className="text-zinc-300 capitalize">
              {derivedFrom === "eoa" ? "Wallet Signature" : 
               derivedFrom === "passkey-prf" ? "Passkey (PRF)" :
               derivedFrom === "passkey-fallback" ? "Passkey (Signature)" :
               derivedFrom === "legacy" ? "Legacy Backup" : "Unknown"}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-zinc-500">Multi-Device</span>
            <span className="text-green-400">
              {derivedFrom === "eoa" || derivedFrom === "passkey-prf" ? "✓ Synced" : "○ This device only"}
            </span>
          </div>
        </div>
      )}
      
      {showModal && authType && (
        <EnableMessagingModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          authType={authType}
          userAddress={messagingKey.publicKey || ""}
          onActivate={activateMessaging}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}

/**
 * Inline prompt that appears when trying to send a message without encryption enabled
 */
export function MessagingActivationRequired({
  onClose,
}: {
  onClose?: () => void;
}) {
  const messagingKey = useMessagingKeyContextOptional();
  const [showModal, setShowModal] = useState(false);
  
  if (!messagingKey) {
    return null;
  }
  
  const { isReady, requiresPasskey, activateMessaging, authType, isLoading } = messagingKey;
  
  // If already ready, nothing to show
  if (isReady) return null;
  
  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl p-4"
        >
          <div className="flex items-start gap-3">
            <div className="text-2xl">🔐</div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-white mb-1">
                {requiresPasskey ? "Add a passkey to message" : "Enable secure messaging"}
              </h4>
              <p className="text-xs text-zinc-400 mb-3">
                {requiresPasskey 
                  ? "You need to add a passkey to send encrypted messages."
                  : "Enable end-to-end encryption to send messages."}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowModal(true)}
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
                  ) : requiresPasskey ? (
                    "Add Passkey"
                  ) : (
                    "Enable Messaging"
                  )}
                </button>
                {onClose && (
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-zinc-400 hover:text-zinc-300 text-sm transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
      
      {showModal && authType && (
        <EnableMessagingModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          authType={authType}
          userAddress={messagingKey.publicKey || ""}
          onActivate={activateMessaging}
          isLoading={isLoading}
        />
      )}
    </>
  );
}
