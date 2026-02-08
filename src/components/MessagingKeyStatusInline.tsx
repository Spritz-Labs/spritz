"use client";

import { useState, useEffect, useCallback } from "react";
import { useWalletClient } from "wagmi";
import {
  getCachedKey,
  clearCachedKey,
  getOrDeriveMessagingKey,
  importKeypairToCache,
  deriveMekFromPin,
  hasPinSetup,
  verifyPin,
  verifyPinAgainstRemote,
  getRemoteKeySource,
  type DerivedMessagingKey,
  type AuthType,
} from "@/lib/messagingKey";

// Storage keys
const MESSAGING_KEYPAIR_STORAGE = "waku_messaging_keypair";
const MESSAGING_KEY_SOURCE_STORAGE = "spritz_messaging_key_source";

interface MessagingKeyStatusProps {
  userAddress: string | null;
  authType?: AuthType;
  passkeyCredentialId?: string | null;
}

type KeyStatus = {
  hasKey: boolean;
  source: DerivedMessagingKey["derivedFrom"] | null;
  isDeterministic: boolean;
};

/**
 * Simplified messaging key status for settings
 * Shows current status and allows regeneration for wallet users
 */
export function MessagingKeyStatus({ 
  userAddress, 
  authType = "wallet",
  passkeyCredentialId,
}: MessagingKeyStatusProps) {
  const [status, setStatus] = useState<KeyStatus>({
    hasKey: false,
    source: null,
    isDeterministic: false,
  });
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPinInput, setShowPinInput] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinStep, setPinStep] = useState<"enter" | "confirm" | "unlock">("enter");
  
  const { data: walletClient } = useWalletClient();
  const rpId = typeof window !== "undefined" ? window.location.hostname : "";
  
  // Check if user already has a PIN set up (locally or on another device)
  const localHasPin = userAddress ? hasPinSetup(userAddress) : false;
  const [remoteHasPin, setRemoteHasPin] = useState(false);
  const userHasPin = localHasPin || remoteHasPin;
  
  // Check remote key source for cross-device PIN detection
  useEffect(() => {
    if (!userAddress || localHasPin) return;
    const check = async () => {
      try {
        const remote = await getRemoteKeySource(userAddress);
        if (remote.hasKey && remote.source === "pin") {
          setRemoteHasPin(true);
        }
      } catch { /* ignore */ }
    };
    check();
  }, [userAddress, localHasPin]);
  
  // Determine if key is "good enough" based on source and auth type
  // For passkey users, ANY key is acceptable - they can't easily regenerate
  // For wallet users, only eoa is truly deterministic (can regenerate by signing)
  const isKeyGood = (source: DerivedMessagingKey["derivedFrom"] | null, userAuthType: AuthType) => {
    if (!source) return false;
    if (source === "eoa") return true;
    if (source === "passkey-prf") return true;
    if (source === "pin") return true;
    // For passkey users, any key source is acceptable - they can't sign with a wallet
    // This includes "passkey-fallback" and "legacy" keys
    if (userAuthType === "passkey") return true;
    return false;
  };

  // Check current key status
  useEffect(() => {
    if (!userAddress || typeof window === "undefined") {
      setStatus({ hasKey: false, source: null, isDeterministic: false });
      return;
    }
    
    // Check session cache first
    const cached = getCachedKey(userAddress);
    if (cached) {
      setStatus({
        hasKey: true,
        source: cached.derivedFrom,
        isDeterministic: isKeyGood(cached.derivedFrom, authType),
      });
      return;
    }
    
    // Check localStorage
    const storedJson = localStorage.getItem(MESSAGING_KEYPAIR_STORAGE);
    const storedSource = localStorage.getItem(MESSAGING_KEY_SOURCE_STORAGE) as DerivedMessagingKey["derivedFrom"] | null;
    
    if (storedJson) {
      try {
        const stored = JSON.parse(storedJson);
        if (stored.publicKey && stored.privateKey) {
          // Import to cache
          importKeypairToCache(userAddress, stored, storedSource || "legacy");
          
          setStatus({
            hasKey: true,
            source: storedSource || "legacy",
            isDeterministic: isKeyGood(storedSource, authType),
          });
        }
      } catch {
        setStatus({ hasKey: false, source: null, isDeterministic: false });
      }
    }
  }, [userAddress, authType]);
  
  const handleRegenerate = useCallback(async () => {
    if (!userAddress) return;
    
    // For wallet users, require wallet client
    if (authType === "wallet" && !walletClient) return;
    
    // For passkey users, require credential
    if (authType === "passkey" && !passkeyCredentialId) {
      setError("Passkey required");
      return;
    }
    
    setIsRegenerating(true);
    setError(null);
    
    try {
      // Clear old key
      localStorage.removeItem(MESSAGING_KEYPAIR_STORAGE);
      localStorage.removeItem(MESSAGING_KEY_SOURCE_STORAGE);
      clearCachedKey(userAddress);
      
      // Derive new deterministic key based on auth type
      const result = await getOrDeriveMessagingKey({
        authType,
        userAddress,
        walletClient: walletClient ?? undefined,
        passkeyCredentialId: passkeyCredentialId ?? undefined,
        rpId,
        hasPasskey: !!passkeyCredentialId,
      });
      
      if (result.success && result.keypair) {
        localStorage.setItem(MESSAGING_KEYPAIR_STORAGE, JSON.stringify({
          publicKey: result.keypair.publicKey,
          privateKey: result.keypair.privateKey,
        }));
        localStorage.setItem(MESSAGING_KEY_SOURCE_STORAGE, result.keypair.derivedFrom);
        
        setStatus({
          hasKey: true,
          source: result.keypair.derivedFrom,
          isDeterministic: isKeyGood(result.keypair.derivedFrom, authType),
        });
      } else if (result.requiresPasskey) {
        setError("Add a passkey first to enable messaging");
      } else {
        setError(result.error || "Failed to enable");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setIsRegenerating(false);
    }
  }, [userAddress, authType, walletClient, passkeyCredentialId, rpId]);
  
  // Handle PIN submission (setup or unlock)
  const handlePinSubmit = useCallback(async () => {
    if (!userAddress) return;
    
    if (pinStep === "enter" && !userHasPin) {
      // Setting up new PIN - go to confirm step
      if (pin.length < 6 || !/^\d+$/.test(pin)) {
        setError("PIN must be at least 6 digits (numbers only)");
        return;
      }
      setPinStep("confirm");
      setError(null);
      return;
    }
    
    if (pinStep === "confirm") {
      // Confirm PIN matches
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
      if (localValid === null) {
        const remoteValid = await verifyPinAgainstRemote(pin, userAddress);
        if (!remoteValid) {
          setError("Wrong PIN. Try again.");
          setPin("");
          return;
        }
      }
    }
    
    setIsRegenerating(true);
    setError(null);
    
    try {
      const result = await deriveMekFromPin(pin, userAddress);
      
      if (result.success && result.keypair) {
        localStorage.setItem(MESSAGING_KEYPAIR_STORAGE, JSON.stringify({
          publicKey: result.keypair.publicKey,
          privateKey: result.keypair.privateKey,
        }));
        localStorage.setItem(MESSAGING_KEY_SOURCE_STORAGE, result.keypair.derivedFrom);
        
        setStatus({
          hasKey: true,
          source: result.keypair.derivedFrom,
          isDeterministic: true,
        });
        
        setShowPinInput(false);
        setPin("");
        setConfirmPin("");
      } else {
        setError(result.error || "Failed to set up PIN encryption");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setIsRegenerating(false);
    }
  }, [userAddress, pin, confirmPin, pinStep, userHasPin]);

  const getSourceLabel = (source: DerivedMessagingKey["derivedFrom"] | null) => {
    switch (source) {
      case "eoa": return "Wallet Signature";
      case "passkey-prf": return "Passkey";
      case "passkey-fallback": return authType === "passkey" ? "Passkey" : "Passkey (Legacy)";
      case "pin": return "PIN Protected";
      // For passkey users, don't show "Legacy" - just say "Passkey" since that's their auth
      case "legacy": return authType === "passkey" ? "Passkey" : "Legacy";
      default: return "Not set";
    }
  };
  
  // Determine if user can enable/upgrade messaging
  const canEnable = authType === "wallet" 
    ? !!walletClient 
    : authType === "passkey" 
    ? !!passkeyCredentialId 
    : true; // Email/DigitalID/Solana users can use PIN
  
  return (
    <div className="w-full px-4 py-3 rounded-xl bg-zinc-800/50 mt-2">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#FF5500]/20 flex items-center justify-center">
          <svg
            className="w-4 h-4 text-[#FF5500]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium">Message Encryption</p>
          <div className="flex items-center gap-2 mt-0.5">
            {status.hasKey ? (
              <>
                {/* For passkey users, any key is valid - always show Active */}
                {/* For wallet users, check if source is deterministic (eoa) */}
                <span className={`inline-flex items-center gap-1 text-xs ${
                  (authType === "passkey" || status.isDeterministic) ? "text-emerald-400" : "text-amber-400"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    (authType === "passkey" || status.isDeterministic) ? "bg-emerald-400" : "bg-amber-400"
                  }`} />
                  {(authType === "passkey" || status.isDeterministic) ? "Active" : "Legacy"}
                </span>
                <span className="text-zinc-500 text-xs">
                  · {getSourceLabel(status.source)}
                </span>
              </>
            ) : (
              <span className="text-zinc-500 text-xs">Not enabled</span>
            )}
          </div>
        </div>
      </div>
      
      {/* Show upgrade option for legacy keys - wallet users only (passkey users always "Active") */}
      {status.hasKey && !status.isDeterministic && authType === "wallet" && canEnable && (
        <div className="mt-3 pt-3 border-t border-zinc-700/50">
          <p className="text-xs text-zinc-400 mb-2">
            Upgrade for seamless cross-device sync.
          </p>
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="px-3 py-1.5 bg-[#FF5500] hover:bg-[#FF5500]/90 disabled:bg-[#FF5500]/50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {isRegenerating ? (
              <>
                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Signing...
              </>
            ) : (
              "Upgrade Key"
            )}
          </button>
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </div>
      )}
      
      {/* Info for good keys - show based on actual key source, not authType */}
      {status.hasKey && (authType === "passkey" || status.isDeterministic) && status.source !== "pin" && (
        <p className="text-xs text-zinc-500 mt-2">
          {status.source === "eoa" 
            ? "Secured by your wallet" 
            : status.source === "passkey-prf" || status.source === "passkey-fallback"
            ? "Secured by your passkey"
            : "Works on all your devices"}
        </p>
      )}
      
      {/* Enable option when no key - wallet users */}
      {!status.hasKey && authType === "wallet" && canEnable && (
        <div className="mt-3">
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="px-3 py-1.5 bg-[#FF5500] hover:bg-[#FF5500]/90 disabled:bg-[#FF5500]/50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {isRegenerating ? (
              <>
                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Enabling...
              </>
            ) : (
              "Enable Secure Messaging"
            )}
          </button>
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </div>
      )}
      
      {/* Enable option for passkey users */}
      {!status.hasKey && authType === "passkey" && canEnable && (
        <div className="mt-3">
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="px-3 py-1.5 bg-[#FF5500] hover:bg-[#FF5500]/90 disabled:bg-[#FF5500]/50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {isRegenerating ? (
              <>
                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Enabling...
              </>
            ) : (
              "Enable with Passkey"
            )}
          </button>
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </div>
      )}
      
      {/* Show upgrade to PIN for email/digitalid/solana users with legacy keys */}
      {status.hasKey && !status.isDeterministic && (authType === "email" || authType === "digitalid" || authType === "solana") && (
        <div className="mt-3 pt-3 border-t border-zinc-700/50">
          {!showPinInput ? (
            <>
              <p className="text-xs text-zinc-400 mb-2">
                Upgrade to PIN-protected encryption for better security.
              </p>
              <button
                onClick={() => {
                  setShowPinInput(true);
                  setPinStep("enter");
                  setPin("");
                  setConfirmPin("");
                  setError(null);
                }}
                className="px-3 py-1.5 bg-[#FF5500] hover:bg-[#FF5500]/90 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Upgrade with PIN
              </button>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-zinc-400">
                {pinStep === "enter" && "Choose a PIN (6+ digits):"}
                {pinStep === "confirm" && "Confirm your PIN:"}
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
                  className="flex-1 px-3 py-1.5 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-xs focus:outline-none focus:border-[#FF5500] placeholder:text-zinc-500"
                  autoFocus
                />
                <button
                  onClick={handlePinSubmit}
                  disabled={isRegenerating || (pinStep === "confirm" ? !confirmPin : pin.length < 6)}
                  className="px-3 py-1.5 bg-[#FF5500] hover:bg-[#FF5500]/90 disabled:bg-zinc-600 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  {isRegenerating ? (
                    <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : pinStep === "confirm" ? "Confirm" : "Next"}
                </button>
                <button
                  onClick={() => {
                    setShowPinInput(false);
                    setPin("");
                    setConfirmPin("");
                    setError(null);
                  }}
                  className="px-2 py-1.5 text-zinc-400 hover:text-white text-xs transition-colors"
                >
                  Cancel
                </button>
              </div>
              {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
              {pinStep === "enter" && !error && (
                <p className="text-xs text-zinc-500 mt-1">
                  Your existing messages will still be readable.
                </p>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* PIN setup/unlock for email/digitalid/solana users without any key */}
      {!status.hasKey && (authType === "email" || authType === "digitalid" || authType === "solana") && (
        <div className="mt-3 pt-3 border-t border-zinc-700/50">
          {!showPinInput ? (
            <div>
              <p className="text-xs text-zinc-400 mb-2">
                {userHasPin 
                  ? "Enter your PIN to unlock messaging" 
                  : "Set a PIN to enable encrypted messaging"}
              </p>
              <button
                onClick={() => {
                  setShowPinInput(true);
                  setPinStep(userHasPin ? "unlock" : "enter");
                  setPin("");
                  setConfirmPin("");
                  setError(null);
                }}
                className="px-3 py-1.5 bg-[#FF5500] hover:bg-[#FF5500]/90 text-white text-xs font-medium rounded-lg transition-colors"
              >
                {userHasPin ? "Unlock with PIN" : "Set Up PIN"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-zinc-400">
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
                  className="flex-1 px-3 py-1.5 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-xs focus:outline-none focus:border-[#FF5500] placeholder:text-zinc-500"
                  autoFocus
                />
                <button
                  onClick={handlePinSubmit}
                  disabled={isRegenerating || (pinStep === "confirm" ? !confirmPin : pin.length < 6)}
                  className="px-3 py-1.5 bg-[#FF5500] hover:bg-[#FF5500]/90 disabled:bg-zinc-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
                >
                  {isRegenerating ? (
                    <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
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
                    setPinStep("enter");
                    setError(null);
                  }}
                  className="px-2 py-1.5 text-zinc-400 hover:text-white text-xs transition-colors"
                >
                  Cancel
                </button>
              </div>
              {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
              {pinStep === "enter" && !userHasPin && !error && (
                <p className="text-xs text-zinc-500 mt-1">
                  Remember this PIN - you&apos;ll need it on other devices to decrypt messages.
                </p>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Show PIN info when active */}
      {status.hasKey && status.source === "pin" && (
        <p className="text-xs text-zinc-500 mt-2">
          Secured by your PIN. Use the same PIN on other devices to read messages.
        </p>
      )}
    </div>
  );
}
