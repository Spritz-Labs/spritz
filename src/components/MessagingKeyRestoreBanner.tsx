"use client";

import { useState, useEffect, useCallback } from "react";
import { useWalletClient } from "wagmi";
import { motion, AnimatePresence } from "motion/react";
import {
  getOrDeriveMessagingKey,
  importKeypairToCache,
  deriveMekFromPin,
  hasPinSetup,
  verifyPin,
  verifyPinAgainstRemote,
  getRemoteKeySource,
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
  const [bannerReason, setBannerReason] = useState<"no_key" | "legacy_key" | "key_mismatch" | "passkey_upgrade" | "needs_pin">("no_key");
  const [showPinInput, setShowPinInput] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinStep, setPinStep] = useState<"enter" | "confirm" | "unlock">("enter");
  
  const { data: walletClient } = useWalletClient();
  const needsPin = authType === "email" || authType === "digitalid" || authType === "solana";
  const localHasPin = userAddress ? hasPinSetup(userAddress) : false;
  const [remoteHasPin, setRemoteHasPin] = useState(false);
  const [remoteHasPasskey, setRemoteHasPasskey] = useState(false);
  const userHasPin = localHasPin || remoteHasPin;
  
  // Determine the effective rpId
  const effectiveRpId = rpId || (typeof window !== "undefined" ? window.location.hostname : "");
  
  // Check if user needs to restore their key
  useEffect(() => {
    if (!userAddress || typeof window === "undefined") {
      setShowBanner(false);
      return;
    }
    
    // Show for wallet, passkey, and email/digitalid/solana users (PIN-based)
    const supportedTypes = ["wallet", "passkey", "email", "digitalid", "solana"];
    if (!supportedTypes.includes(authType || "")) {
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
        // For email/digitalid/solana users without a key, check remote key source
        if (authType === "email" || authType === "digitalid" || authType === "solana") {
          const remote = await getRemoteKeySource(userAddress);
          if (remote.hasKey && remote.source === "pin") {
            // User set up a PIN on another device — prompt to enter it
            setRemoteHasPin(true);
            setPinStep("unlock");
          } else if (remote.hasKey && (remote.source === "passkey-prf" || remote.source === "passkey-fallback")) {
            // User has a passkey-derived key on another device
            // This device may not support passkeys, so warn about creating a new key
            setRemoteHasPasskey(true);
          }
          setBannerReason("needs_pin");
          setShowBanner(true);
          return;
        }
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
        
        // For email/digitalid/solana users with legacy key: prompt PIN upgrade
        if ((authType === "email" || authType === "digitalid" || authType === "solana") 
            && (!storedSource || storedSource === "legacy")) {
          setBannerReason("needs_pin");
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
  
  // Handle PIN submission for email/digitalid/solana users
  const handlePinSubmit = useCallback(async () => {
    if (!userAddress) return;
    
    if (pinStep === "enter" && !userHasPin) {
      if (pin.length < 6 || !/^\d+$/.test(pin)) {
        setError("PIN must be at least 6 digits (numbers only)");
        return;
      }
      setPinStep("confirm");
      setError(null);
      return;
    }
    
    if (pinStep === "confirm") {
      if (pin !== confirmPin) {
        setError("PINs don't match. Try again.");
        setConfirmPin("");
        return;
      }
    }
    
    if (pinStep === "unlock") {
      // Try local verification first
      const localValid = await verifyPin(pin, userAddress);
      if (localValid === false) {
        setError("Wrong PIN. Try again.");
        setPin("");
        return;
      }
      // If no local hash (new device), verify against Supabase public key
      if (localValid === null && remoteHasPin) {
        const remoteValid = await verifyPinAgainstRemote(pin, userAddress);
        if (!remoteValid) {
          setError("Wrong PIN. Try again.");
          setPin("");
          return;
        }
      }
    }
    
    setIsRestoring(true);
    setError(null);
    
    try {
      const result = await deriveMekFromPin(pin, userAddress);
      
      if (result.success && result.keypair) {
        localStorage.setItem(MESSAGING_KEYPAIR_STORAGE, JSON.stringify({
          publicKey: result.keypair.publicKey,
          privateKey: result.keypair.privateKey,
        }));
        localStorage.setItem(MESSAGING_KEY_SOURCE_STORAGE, result.keypair.derivedFrom);
        
        importKeypairToCache(userAddress, {
          publicKey: result.keypair.publicKey,
          privateKey: result.keypair.privateKey,
        }, result.keypair.derivedFrom);
        
        setShowBanner(false);
        setPin("");
        setConfirmPin("");
        window.location.reload();
      } else {
        setError(result.error || "Failed to set up PIN encryption");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setIsRestoring(false);
    }
  }, [userAddress, pin, confirmPin, pinStep, userHasPin, remoteHasPin]);

  const handleDismiss = () => {
    if (userAddress) {
      sessionStorage.setItem(RESTORE_DISMISSED_KEY, userAddress.toLowerCase());
    }
    setShowBanner(false);
  };
  
  // For wallet users, need walletClient
  // For passkey users, show banner but direct them to settings
  // For email/digitalid/solana users, show PIN setup
  const canRestoreDirectly = authType === "wallet" && !!walletClient;
  const isPasskeyUser = authType === "passkey";
  
  if (!showBanner) return null;
  if (!canRestoreDirectly && !isPasskeyUser && !needsPin) return null;
  
  const getMessage = () => {
    switch (bannerReason) {
      case "needs_pin":
        if (userHasPin) return "Enter your PIN to unlock encrypted messaging.";
        if (remoteHasPasskey) return "Your encryption key is tied to a passkey on another device. Setting up a PIN will create a new key — older messages from other devices won't be readable.";
        return "Set a PIN to enable encrypted messaging.";
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
    if (isRestoring) return "Setting up...";
    if (needsPin) return userHasPin ? "Unlock with PIN" : "Set Up PIN";
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
                    {bannerReason === "needs_pin" 
                      ? (userHasPin ? "Unlock Messaging" : remoteHasPasskey ? "⚠️ New Key Required" : "Enable Encrypted Messaging")
                      : bannerReason === "no_key" 
                      ? "Restore Encryption Key" 
                      : "Key Sync Required"}
                  </h4>
                  <p className="text-xs text-zinc-400 mb-3">
                    {getMessage()}
                  </p>
                  
                  {error && (
                    <p className="text-xs text-red-400 mb-2">{error}</p>
                  )}
                  
                  {/* PIN input for email/digitalid/solana users */}
                  {needsPin && showPinInput ? (
                    <div className="space-y-2">
                      <p className="text-xs text-zinc-500">
                        {pinStep === "enter" && !userHasPin && "Choose a PIN (6+ digits):"}
                        {pinStep === "confirm" && "Confirm your PIN:"}
                        {pinStep === "unlock" && "Enter your PIN:"}
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={pinStep === "confirm" ? confirmPin : pin}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, "");
                            if (pinStep === "confirm") {
                              setConfirmPin(digits);
                            } else {
                              setPin(digits);
                            }
                            setError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handlePinSubmit();
                          }}
                          placeholder={pinStep === "confirm" ? "Confirm PIN" : "Enter PIN"}
                          className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-white text-sm focus:outline-none focus:border-[#FF5500] placeholder:text-zinc-500"
                          autoFocus
                        />
                        <button
                          onClick={handlePinSubmit}
                          disabled={isRestoring || (pinStep === "confirm" ? !confirmPin : pin.length < 6)}
                          className="px-4 py-2 bg-[#FF5500] hover:bg-[#FF5500]/90 disabled:bg-zinc-600 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          {isRestoring ? (
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : pinStep === "confirm" ? "Confirm" : pinStep === "unlock" ? "Unlock" : "Next"}
                        </button>
                        <button
                          onClick={() => {
                            setShowPinInput(false);
                            setPin("");
                            setConfirmPin("");
                            setError(null);
                          }}
                          className="px-2 py-2 text-zinc-400 hover:text-white text-sm transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                      {pinStep === "enter" && !userHasPin && (
                        <p className="text-xs text-zinc-500">
                          Remember this PIN to decrypt messages on other devices.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (needsPin) {
                            setShowPinInput(true);
                            setPinStep(userHasPin ? "unlock" : "enter");
                            setPin("");
                            setConfirmPin("");
                            setError(null);
                          } else if (isPasskeyUser && onOpenSettings) {
                            onOpenSettings();
                          } else {
                            handleRestore();
                          }
                        }}
                        disabled={isRestoring}
                        className="px-4 py-2 bg-[#FF5500] text-white text-sm font-medium rounded-lg hover:bg-[#FF5500]/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {isRestoring ? (
                          <>
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            {needsPin ? "Setting up..." : "Signing..."}
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
                  )}
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
