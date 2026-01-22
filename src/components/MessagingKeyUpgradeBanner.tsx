"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useWalletClient } from "wagmi";
import { usePasskeyContext } from "@/context/PasskeyProvider";
import {
  getCachedKey,
  clearCachedKey,
  getOrDeriveMessagingKey,
  type AuthType,
} from "@/lib/messagingKey";

// Storage keys
const MESSAGING_KEYPAIR_STORAGE = "waku_messaging_keypair";
const MESSAGING_KEY_SOURCE_STORAGE = "spritz_messaging_key_source";
const UPGRADE_DISMISSED_KEY = "spritz_mek_upgrade_dismissed";

interface MessagingKeyUpgradeBannerProps {
  userAddress: string | null;
  authType: AuthType | null;
  passkeyCredentialId?: string | null;
}

/**
 * Shows a one-time banner for users with legacy (non-deterministic) keys
 * Prompts them to upgrade to the new deterministic key system
 */
export function MessagingKeyUpgradeBanner({
  userAddress,
  authType,
  passkeyCredentialId,
}: MessagingKeyUpgradeBannerProps) {
  const [showBanner, setShowBanner] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { data: walletClient } = useWalletClient();
  const passkeyContext = usePasskeyContext();
  
  // Determine rpId for passkey operations
  const rpId = typeof window !== "undefined" ? window.location.hostname : "";
  
  // Check if user has a legacy key that needs upgrade
  useEffect(() => {
    if (!userAddress || typeof window === "undefined") {
      setShowBanner(false);
      return;
    }
    
    // Check if user already dismissed the banner
    const dismissed = localStorage.getItem(UPGRADE_DISMISSED_KEY);
    if (dismissed === userAddress.toLowerCase()) {
      setShowBanner(false);
      return;
    }
    
    // Check for existing keypair and its source
    const storedJson = localStorage.getItem(MESSAGING_KEYPAIR_STORAGE);
    const storedSource = localStorage.getItem(MESSAGING_KEY_SOURCE_STORAGE);
    
    if (storedJson) {
      try {
        const stored = JSON.parse(storedJson);
        if (stored.publicKey && stored.privateKey) {
          // Check if it's a legacy key (no source or "legacy" source)
          const isLegacy = !storedSource || storedSource === "legacy" || storedSource === "passkey-fallback";
          
          // Only show banner for wallet users with legacy keys
          // Passkey users with fallback keys can't easily upgrade
          if (isLegacy && authType === "wallet") {
            setShowBanner(true);
          }
        }
      } catch {
        // Invalid stored data
      }
    }
  }, [userAddress, authType]);
  
  const handleUpgrade = useCallback(async () => {
    if (!userAddress || !authType) return;
    
    setIsUpgrading(true);
    setError(null);
    
    try {
      // Clear the old key
      localStorage.removeItem(MESSAGING_KEYPAIR_STORAGE);
      localStorage.removeItem(MESSAGING_KEY_SOURCE_STORAGE);
      clearCachedKey(userAddress);
      
      // Derive new deterministic key
      const result = await getOrDeriveMessagingKey({
        authType,
        userAddress,
        walletClient: walletClient ?? undefined,
        passkeyCredentialId: passkeyCredentialId ?? undefined,
        rpId,
        hasPasskey: !!passkeyCredentialId,
      });
      
      if (result.success && result.keypair) {
        // Save the new key
        localStorage.setItem(MESSAGING_KEYPAIR_STORAGE, JSON.stringify({
          publicKey: result.keypair.publicKey,
          privateKey: result.keypair.privateKey,
        }));
        localStorage.setItem(MESSAGING_KEY_SOURCE_STORAGE, result.keypair.derivedFrom);
        
        setShowBanner(false);
        
        // Show success (could use toast)
        console.log("[MessagingKey] ✅ Upgraded to deterministic key");
      } else {
        setError(result.error || "Failed to upgrade key");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upgrade failed");
    } finally {
      setIsUpgrading(false);
    }
  }, [userAddress, authType, walletClient, passkeyCredentialId, rpId]);
  
  const handleDismiss = useCallback(() => {
    if (userAddress) {
      localStorage.setItem(UPGRADE_DISMISSED_KEY, userAddress.toLowerCase());
    }
    setShowBanner(false);
  }, [userAddress]);
  
  if (!showBanner) return null;
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md"
      >
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="text-2xl">✨</div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-white mb-1">
                  Upgrade Available
                </h4>
                <p className="text-xs text-white/80 mb-3">
                  Enable seamless cross-device messaging. Sign once, works everywhere – no backup needed.
                </p>
                
                {error && (
                  <p className="text-xs text-red-200 mb-2">{error}</p>
                )}
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleUpgrade}
                    disabled={isUpgrading}
                    className="px-4 py-2 bg-white text-purple-600 text-sm font-medium rounded-lg hover:bg-white/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isUpgrading ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Signing...
                      </>
                    ) : (
                      "Upgrade Now"
                    )}
                  </button>
                  <button
                    onClick={handleDismiss}
                    disabled={isUpgrading}
                    className="px-4 py-2 text-white/70 text-sm hover:text-white transition-colors"
                  >
                    Later
                  </button>
                </div>
              </div>
              
              <button
                onClick={handleDismiss}
                className="text-white/50 hover:text-white transition-colors p-1"
                aria-label="Dismiss"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
