/**
 * Hook for managing deterministic Messaging Encryption Keys (MEK)
 * 
 * Provides a unified interface for:
 * - Checking if messaging is enabled
 * - Deriving/activating messaging keys
 * - Getting the current keypair for encryption
 */

"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { supabase } from "@/config/supabase";
import {
  type AuthType,
  type DerivedMessagingKey,
  type MessagingKeyResult,
  getOrDeriveMessagingKey,
  hasCachedKey,
  getCachedKey,
  clearCachedKey,
  importKeypairToCache,
} from "@/lib/messagingKey";

// Storage key for legacy keypairs (for migration)
const LEGACY_KEYPAIR_STORAGE = "waku_messaging_keypair";

export interface UseMessagingKeyReturn {
  // State
  isReady: boolean;           // Key is derived and ready to use
  isLoading: boolean;         // Currently deriving key
  requiresPasskey: boolean;   // User needs to create passkey first
  requiresActivation: boolean; // User needs to activate messaging (sign/authenticate)
  error: string | null;
  
  // Current keypair (if ready)
  keypair: DerivedMessagingKey | null;
  publicKey: string | null;   // Convenience accessor
  
  // Actions
  activateMessaging: () => Promise<MessagingKeyResult>;
  deactivate: () => void;
  
  // Info
  derivedFrom: "eoa" | "passkey-prf" | "passkey-fallback" | null;
}

export interface UseMessagingKeyOptions {
  userAddress: string | null;
  authType: AuthType | null;
  passkeyCredentialId?: string | null;
}

export function useMessagingKey(options: UseMessagingKeyOptions): UseMessagingKeyReturn {
  const { userAddress, authType, passkeyCredentialId } = options;
  
  const { address: wagmiAddress } = useAccount();
  const { data: walletClient } = useWalletClient();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keypair, setKeypair] = useState<DerivedMessagingKey | null>(null);
  const [hasPasskey, setHasPasskey] = useState<boolean | null>(null);
  
  // Determine rpId for passkey operations
  const rpId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.hostname;
  }, []);
  
  // Check if user has a passkey registered
  useEffect(() => {
    if (!userAddress) {
      setHasPasskey(null);
      return;
    }
    
    if (!supabase) {
      setHasPasskey(null);
      return;
    }
    
    const db = supabase; // TypeScript now knows this is non-null
    
    const checkPasskey = async () => {
      try {
        const { data, error: fetchError } = await db
          .from("passkey_credentials")
          .select("credential_id")
          .eq("user_address", userAddress.toLowerCase())
          .limit(1);
        
        if (fetchError) {
          console.warn("[useMessagingKey] Error checking passkey:", fetchError);
          setHasPasskey(false);
          return;
        }
        
        setHasPasskey(data && data.length > 0);
      } catch (err) {
        console.warn("[useMessagingKey] Error checking passkey:", err);
        setHasPasskey(false);
      }
    };
    
    checkPasskey();
  }, [userAddress]);
  
  // Check for cached or legacy keypair on mount
  useEffect(() => {
    if (!userAddress) {
      setKeypair(null);
      return;
    }
    
    // Check session cache first
    const cached = getCachedKey(userAddress);
    if (cached) {
      setKeypair(cached);
      return;
    }
    
    // Check for legacy localStorage keypair (for migration)
    if (typeof window !== "undefined") {
      const legacyJson = localStorage.getItem(LEGACY_KEYPAIR_STORAGE);
      if (legacyJson) {
        try {
          const legacy = JSON.parse(legacyJson);
          if (legacy.publicKey && legacy.privateKey) {
            // Import legacy keypair into session cache
            importKeypairToCache(userAddress, legacy, "passkey-fallback");
            setKeypair({
              ...legacy,
              derivedFrom: "passkey-fallback" as const,
            });
            console.log("[useMessagingKey] Imported legacy keypair from localStorage");
          }
        } catch {
          // Invalid legacy data, ignore
        }
      }
    }
  }, [userAddress]);
  
  // Determine if messaging requires activation
  const requiresActivation = useMemo(() => {
    if (!userAddress || !authType) return false;
    // Has cached key? No activation needed
    if (keypair || hasCachedKey(userAddress)) return false;
    // Otherwise, needs activation
    return true;
  }, [userAddress, authType, keypair]);
  
  // Determine if user needs to create a passkey first
  const requiresPasskey = useMemo(() => {
    if (!authType) return false;
    // EOA and passkey users don't need to create a passkey
    if (authType === "wallet" || authType === "passkey") return false;
    // Email/Digital ID/Solana users need a passkey if they don't have one
    return hasPasskey === false;
  }, [authType, hasPasskey]);
  
  // Activate messaging (derive key)
  const activateMessaging = useCallback(async (): Promise<MessagingKeyResult> => {
    if (!userAddress || !authType) {
      return { success: false, error: "Not authenticated" };
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await getOrDeriveMessagingKey({
        authType,
        userAddress,
        walletClient: walletClient ?? undefined,
        passkeyCredentialId: passkeyCredentialId ?? undefined,
        rpId,
        hasPasskey: hasPasskey ?? false,
      });
      
      if (result.success && result.keypair) {
        setKeypair(result.keypair);
        
        // Upload public key to Supabase for ECDH key exchange
        if (supabase) {
          try {
            await supabase
              .from("shout_user_settings")
              .upsert({
                wallet_address: userAddress.toLowerCase(),
                messaging_public_key: result.keypair.publicKey,
                updated_at: new Date().toISOString(),
              }, {
                onConflict: "wallet_address",
              });
            console.log("[useMessagingKey] Public key uploaded to Supabase");
          } catch (uploadError) {
            console.warn("[useMessagingKey] Failed to upload public key:", uploadError);
            // Continue anyway - messaging will work locally
          }
        }
      } else if (result.requiresPasskey) {
        setError(result.error || "Please add a passkey to enable secure messaging");
      } else {
        setError(result.error || "Failed to activate messaging");
      }
      
      setIsLoading(false);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      setIsLoading(false);
      return { success: false, error: errorMessage };
    }
  }, [userAddress, authType, walletClient, passkeyCredentialId, rpId, hasPasskey]);
  
  // Deactivate messaging (clear session key)
  const deactivate = useCallback(() => {
    if (userAddress) {
      clearCachedKey(userAddress);
    }
    setKeypair(null);
    setError(null);
  }, [userAddress]);
  
  // Derived state
  const isReady = !!keypair;
  const publicKey = keypair?.publicKey || null;
  const derivedFrom = keypair?.derivedFrom || null;
  
  return {
    isReady,
    isLoading,
    requiresPasskey,
    requiresActivation,
    error,
    keypair,
    publicKey,
    activateMessaging,
    deactivate,
    derivedFrom,
  };
}

/**
 * Hook to check if a peer has messaging enabled (has public key in Supabase)
 */
export function usePeerMessagingStatus(peerAddress: string | null) {
  const [hasMessaging, setHasMessaging] = useState<boolean | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    if (!peerAddress) {
      setHasMessaging(null);
      setPublicKey(null);
      return;
    }
    
    if (!supabase) {
      setHasMessaging(null);
      setPublicKey(null);
      return;
    }
    
    const db = supabase; // TypeScript now knows this is non-null
    
    const checkPeer = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await db
          .from("shout_user_settings")
          .select("messaging_public_key")
          .eq("wallet_address", peerAddress.toLowerCase())
          .single();
        
        if (error || !data?.messaging_public_key) {
          setHasMessaging(false);
          setPublicKey(null);
        } else {
          setHasMessaging(true);
          setPublicKey(data.messaging_public_key);
        }
      } catch {
        setHasMessaging(false);
        setPublicKey(null);
      }
      setIsLoading(false);
    };
    
    checkPeer();
  }, [peerAddress]);
  
  return { hasMessaging, publicKey, isLoading };
}
