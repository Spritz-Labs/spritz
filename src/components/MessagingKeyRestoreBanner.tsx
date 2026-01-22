"use client";

import { useState, useEffect, useCallback } from "react";
import { useWalletClient } from "wagmi";
import { motion, AnimatePresence } from "motion/react";
import {
  getOrDeriveMessagingKey,
  importKeypairToCache,
  type AuthType,
} from "@/lib/messagingKey";
import { supabase } from "@/config/supabase";

// Storage keys
const MESSAGING_KEYPAIR_STORAGE = "waku_messaging_keypair";
const MESSAGING_KEY_SOURCE_STORAGE = "spritz_messaging_key_source";
const RESTORE_DISMISSED_KEY = "spritz_messaging_restore_dismissed";

interface MessagingKeyRestoreBannerProps {
  userAddress: string | null;
  authType: AuthType;
  passkeyCredentialId?: string | null;
  rpId?: string;
  onOpenSettings?: () => void;
}

/**
 * Banner that prompts users to restore their messaging key when:
 * 1. They have no key (site data was cleared)
 * 2. They have a "legacy" or "passkey-fallback" key instead of deterministic
 * 3. Their public key isn't in Supabase (needed for ECDH)
 * 
 * For EOA users: Sign with wallet to derive deterministic key
 * For Passkey users: Authenticate to check PRF support and derive key if possible
 * 
 * This helps prevent "Decrypt Failed" messages after clearing site data.
 */
export function MessagingKeyRestoreBanner({
  userAddress,
  authType,
  passkeyCredentialId,
  rpId,
  onOpenSettings,
}: MessagingKeyRestoreBannerProps) {
  const [showBanner, setShowBanner] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bannerReason, setBannerReason] = useState<"no_key" | "legacy_key" | "key_mismatch" | "passkey_upgrade">("no_key");
  
  const { data: walletClient } = useWalletClient();
  
  // Determine the effective rpId
  const effectiveRpId = rpId || (typeof window !== "undefined" ? window.location.hostname : "");
  
  // Check if user needs to restore their key
  useEffect(() => {
    if (!userAddress || typeof window === "undefined") {
      setShowBanner(false);
      return;
    }
    
    // Only for wallet (EOA) and passkey users - they can restore via signing/authentication
    if (authType !== "wallet" && authType !== "passkey") {
      setShowBanner(false);
      return;
    }
    
    // Check if user dismissed this for this session
    const dismissed = sessionStorage.getItem(RESTORE_DISMISSED_KEY);
    if (dismissed === userAddress.toLowerCase()) {
      setShowBanner(false);
      return;
    }
    
    const checkKeyStatus = async () => {
      // Check for existing keypair
      const storedJson = localStorage.getItem(MESSAGING_KEYPAIR_STORAGE);
      const storedSource = localStorage.getItem(MESSAGING_KEY_SOURCE_STORAGE);
      
      if (!storedJson) {
        // No key at all - definitely need to restore
        setBannerReason("no_key");
        setShowBanner(true);
        return;
      }
      
      try {
        const stored = JSON.parse(storedJson);
        if (!stored.publicKey || !stored.privateKey) {
          setBannerReason("no_key");
          setShowBanner(true);
          return;
        }
        
        // For wallet users: check if it's a legacy (non-deterministic) key
        if (authType === "wallet" && (!storedSource || storedSource === "legacy")) {
          setBannerReason("legacy_key");
          setShowBanner(true);
          return;
        }
        
        // For passkey users: check if they have passkey-fallback (non-deterministic)
        // They might be able to upgrade if their passkey now supports PRF
        if (authType === "passkey" && storedSource === "passkey-fallback") {
          setBannerReason("passkey_upgrade");
          setShowBanner(true);
          return;
        }
        
        // If we have a deterministic key, check if public key is in Supabase
        if ((storedSource === "eoa" || storedSource === "passkey-prf") && supabase) {
          const { data } = await supabase
            .from("shout_user_settings")
            .select("messaging_public_key")
            .eq("wallet_address", userAddress.toLowerCase())
            .single();
          
          if (!data?.messaging_public_key) {
            // Key not in Supabase - need to re-upload
            setBannerReason("key_mismatch");
            setShowBanner(true);
            return;
          }
          
          // Check if stored key matches Supabase
          if (data.messaging_public_key !== stored.publicKey) {
            setBannerReason("key_mismatch");
            setShowBanner(true);
            return;
          }
        }
        
        // Key looks good
        setShowBanner(false);
      } catch {
        // Error parsing - need new key
        setBannerReason("no_key");
        setShowBanner(true);
      }
    };
    
    checkKeyStatus();
  }, [userAddress, authType]);
  
  const handleRestore = useCallback(async () => {
    if (!userAddress) return;
    
    // For wallet users, require wallet client
    if (authType === "wallet" && !walletClient) return;
    
    // For passkey users, require credential ID
    if (authType === "passkey" && !passkeyCredentialId) {
      setError("Passkey not found");
      return;
    }
    
    setIsRestoring(true);
    setError(null);
    
    try {
      // Clear old key first so we derive fresh
      localStorage.removeItem(MESSAGING_KEYPAIR_STORAGE);
      localStorage.removeItem(MESSAGING_KEY_SOURCE_STORAGE);
      
      // Derive deterministic key based on auth type
      const result = await getOrDeriveMessagingKey({
        authType,
        userAddress,
        walletClient: authType === "wallet" ? walletClient ?? undefined : undefined,
        passkeyCredentialId: authType === "passkey" ? passkeyCredentialId ?? undefined : undefined,
        rpId: effectiveRpId,
        hasPasskey: authType === "passkey",
      });
      
      if (result.success && result.keypair) {
        // Store in localStorage
        localStorage.setItem(MESSAGING_KEYPAIR_STORAGE, JSON.stringify({
          publicKey: result.keypair.publicKey,
          privateKey: result.keypair.privateKey,
        }));
        localStorage.setItem(MESSAGING_KEY_SOURCE_STORAGE, result.keypair.derivedFrom);
        
        // Import to session cache
        importKeypairToCache(userAddress, {
          publicKey: result.keypair.publicKey,
          privateKey: result.keypair.privateKey,
        }, result.keypair.derivedFrom);
        
        // Upload public key to Supabase
        if (supabase) {
          await supabase
            .from("shout_user_settings")
            .upsert({
              wallet_address: userAddress.toLowerCase(),
              messaging_public_key: result.keypair.publicKey,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: "wallet_address",
            });
        }
        
        // Check if we got a deterministic key
        if (result.keypair.derivedFrom === "passkey-fallback") {
          // PRF not supported - warn user but keep the key
          setError("Your passkey doesn't support deterministic keys. Key saved but won't sync across devices.");
          setTimeout(() => {
            setShowBanner(false);
          }, 3000);
        } else {
          setShowBanner(false);
          // Reload to decrypt messages with restored key
          window.location.reload();
        }
      } else if (result.prfNotSupported) {
        setError("Your passkey doesn't support deterministic keys yet. Try again later or use a different passkey.");
      } else {
        setError(result.error || "Failed to restore key");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore");
    } finally {
      setIsRestoring(false);
    }
  }, [userAddress, walletClient, authType, passkeyCredentialId, effectiveRpId]);
  
  const handleDismiss = () => {
    if (userAddress) {
      sessionStorage.setItem(RESTORE_DISMISSED_KEY, userAddress.toLowerCase());
    }
    setShowBanner(false);
  };
  
  // For wallet users, need walletClient
  // For passkey users, show banner but direct them to settings
  const canRestoreDirectly = authType === "wallet" && !!walletClient;
  const isPasskeyUser = authType === "passkey";
  
  if (!showBanner) return null;
  if (!canRestoreDirectly && !isPasskeyUser) return null;
  
  const getMessage = () => {
    switch (bannerReason) {
      case "no_key":
        return isPasskeyUser
          ? "Go to Settings to restore your message encryption key."
          : "Sign to restore your message encryption key and decrypt your messages.";
      case "legacy_key":
        return isPasskeyUser
          ? "Go to Settings to upgrade your encryption key."
          : "Upgrade to a deterministic key for seamless cross-device messaging.";
      case "passkey_upgrade":
        return "Your passkey may now support better encryption. Go to Settings to check and upgrade.";
      case "key_mismatch":
        return isPasskeyUser
          ? "Your encryption key needs to be synced. Go to Settings to restore access."
          : "Your encryption key needs to be synced. Sign to restore access to messages.";
      default:
        return "Restore your encryption key to decrypt messages.";
    }
  };
  
  const getButtonText = () => {
    if (isRestoring) return "Signing...";
    if (isPasskeyUser) return "Open Settings";
    return "Sign to Restore";
  };
  
  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md"
        >
          <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="text-2xl">🔐</div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-white mb-1">
                    {bannerReason === "no_key" ? "Restore Encryption Key" : "Key Sync Required"}
                  </h4>
                  <p className="text-xs text-zinc-400 mb-3">
                    {getMessage()}
                  </p>
                  
                  {error && (
                    <p className="text-xs text-red-400 mb-2">{error}</p>
                  )}
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={isPasskeyUser && onOpenSettings ? onOpenSettings : handleRestore}
                      disabled={isRestoring}
                      className="px-4 py-2 bg-[#FF5500] text-white text-sm font-medium rounded-lg hover:bg-[#FF5500]/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {isRestoring ? (
                        <>
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Signing...
                        </>
                      ) : (
                        getButtonText()
                      )}
                    </button>
                    <button
                      onClick={handleDismiss}
                      disabled={isRestoring}
                      className="px-4 py-2 text-zinc-400 text-sm hover:text-white transition-colors"
                    >
                      Later
                    </button>
                  </div>
                </div>
                
                <button
                  onClick={handleDismiss}
                  className="text-zinc-500 hover:text-white transition-colors p-1"
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
      )}
    </AnimatePresence>
  );
}
