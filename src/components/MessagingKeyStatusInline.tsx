"use client";

import { useState, useEffect, useCallback } from "react";
import { useWalletClient } from "wagmi";
import {
  getCachedKey,
  clearCachedKey,
  getOrDeriveMessagingKey,
  importKeypairToCache,
  type DerivedMessagingKey,
} from "@/lib/messagingKey";

// Storage keys
const MESSAGING_KEYPAIR_STORAGE = "waku_messaging_keypair";
const MESSAGING_KEY_SOURCE_STORAGE = "spritz_messaging_key_source";

interface MessagingKeyStatusProps {
  userAddress: string | null;
}

type KeyStatus = {
  hasKey: boolean;
  source: DerivedMessagingKey["derivedFrom"] | null;
  isDeterministic: boolean;
};

/**
 * Simplified messaging key status for settings
 * Shows current status and allows regeneration
 */
export function MessagingKeyStatus({ userAddress }: MessagingKeyStatusProps) {
  const [status, setStatus] = useState<KeyStatus>({
    hasKey: false,
    source: null,
    isDeterministic: false,
  });
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { data: walletClient } = useWalletClient();
  
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
        isDeterministic: cached.derivedFrom === "eoa" || cached.derivedFrom === "passkey-prf",
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
            isDeterministic: storedSource === "eoa" || storedSource === "passkey-prf",
          });
        }
      } catch {
        setStatus({ hasKey: false, source: null, isDeterministic: false });
      }
    }
  }, [userAddress]);
  
  const handleRegenerate = useCallback(async () => {
    if (!userAddress || !walletClient) return;
    
    setIsRegenerating(true);
    setError(null);
    
    try {
      // Clear old key
      localStorage.removeItem(MESSAGING_KEYPAIR_STORAGE);
      localStorage.removeItem(MESSAGING_KEY_SOURCE_STORAGE);
      clearCachedKey(userAddress);
      
      // Derive new deterministic key
      const result = await getOrDeriveMessagingKey({
        authType: "wallet",
        userAddress,
        walletClient,
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
          isDeterministic: true,
        });
      } else {
        setError(result.error || "Failed to regenerate key");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate");
    } finally {
      setIsRegenerating(false);
    }
  }, [userAddress, walletClient]);
  
  const getSourceLabel = (source: DerivedMessagingKey["derivedFrom"] | null) => {
    switch (source) {
      case "eoa": return "Wallet Signature";
      case "passkey-prf": return "Passkey";
      case "passkey-fallback": return "Passkey (Legacy)";
      case "legacy": return "Legacy";
      default: return "Not set";
    }
  };
  
  return (
    <div className="w-full px-4 py-3 rounded-xl bg-zinc-800/50 mt-2">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
          <svg
            className="w-4 h-4 text-purple-400"
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
                <span className={`inline-flex items-center gap-1 text-xs ${
                  status.isDeterministic ? "text-green-400" : "text-amber-400"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    status.isDeterministic ? "bg-green-400" : "bg-amber-400"
                  }`} />
                  {status.isDeterministic ? "Active" : "Legacy"}
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
      
      {/* Show upgrade option for legacy keys */}
      {status.hasKey && !status.isDeterministic && walletClient && (
        <div className="mt-3 pt-3 border-t border-zinc-700/50">
          <p className="text-xs text-zinc-400 mb-2">
            Upgrade to deterministic keys for seamless cross-device sync.
          </p>
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2"
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
      
      {/* Info for deterministic keys */}
      {status.hasKey && status.isDeterministic && (
        <p className="text-xs text-zinc-500 mt-2">
          ✓ Works on all devices with this wallet
        </p>
      )}
      
      {/* Enable option when no key */}
      {!status.hasKey && walletClient && (
        <div className="mt-3">
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2"
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
    </div>
  );
}
