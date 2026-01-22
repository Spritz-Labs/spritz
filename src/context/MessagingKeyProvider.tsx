"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
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
  clearAllCachedKeys,
  importKeypairToCache,
} from "@/lib/messagingKey";

// Storage keys for messaging keypairs
// We use the same key as the existing system for backward compatibility
const MESSAGING_KEYPAIR_STORAGE = "waku_messaging_keypair";

// Key to track how the keypair was derived (for UI display)
const MESSAGING_KEYPAIR_SOURCE_STORAGE = "spritz_messaging_key_source";

export interface MessagingKeyContextType {
  // Status
  isReady: boolean;              // Key is derived and ready to use
  isLoading: boolean;            // Currently deriving key
  requiresPasskey: boolean;      // User needs to create passkey first
  requiresActivation: boolean;   // User needs to activate messaging
  error: string | null;
  
  // Current keypair
  keypair: DerivedMessagingKey | null;
  publicKey: string | null;
  
  // Derived from (for UI display)
  derivedFrom: "eoa" | "passkey-prf" | "passkey-fallback" | "legacy" | null;
  
  // Actions
  activateMessaging: () => Promise<MessagingKeyResult>;
  deactivate: () => void;
  
  // Auth info
  authType: AuthType | null;
  hasPasskey: boolean;
}

const MessagingKeyContext = createContext<MessagingKeyContextType | null>(null);

interface MessagingKeyProviderProps {
  children: ReactNode;
  userAddress: string | null;
  authType: AuthType | null;
  passkeyCredentialId?: string | null;
}

export function MessagingKeyProvider({
  children,
  userAddress,
  authType,
  passkeyCredentialId,
}: MessagingKeyProviderProps) {
  const { address: wagmiAddress } = useAccount();
  const { data: walletClient } = useWalletClient();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keypair, setKeypair] = useState<DerivedMessagingKey | null>(null);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [derivedFrom, setDerivedFrom] = useState<"eoa" | "passkey-prf" | "passkey-fallback" | "legacy" | null>(null);
  
  // Track if we've checked for legacy keypair
  const [legacyChecked, setLegacyChecked] = useState(false);
  
  // Determine rpId for passkey operations
  const rpId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.hostname;
  }, []);
  
  // Check if user has a passkey registered
  useEffect(() => {
    if (!userAddress) {
      setHasPasskey(false);
      return;
    }
    
    if (!supabase) {
      setHasPasskey(false);
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
          console.warn("[MessagingKey] Error checking passkey:", fetchError);
          setHasPasskey(false);
          return;
        }
        
        setHasPasskey(data && data.length > 0);
      } catch (err) {
        console.warn("[MessagingKey] Error checking passkey:", err);
        setHasPasskey(false);
      }
    };
    
    checkPasskey();
  }, [userAddress]);
  
  // Check for cached or persisted keypair on mount
  // This ensures users DON'T need to sign again after page refresh
  useEffect(() => {
    if (!userAddress) {
      setKeypair(null);
      setDerivedFrom(null);
      setLegacyChecked(false);
      return;
    }
    
    // Check session cache first (survives within same session)
    const cached = getCachedKey(userAddress);
    if (cached) {
      setKeypair(cached);
      setDerivedFrom(cached.derivedFrom);
      setLegacyChecked(true);
      console.log("[MessagingKey] ✅ Using cached keypair from session");
      return;
    }
    
    // Check localStorage for persisted keypair (survives page refresh/app restart)
    if (typeof window !== "undefined" && !legacyChecked) {
      const storedJson = localStorage.getItem(MESSAGING_KEYPAIR_STORAGE);
      if (storedJson) {
        try {
          const stored = JSON.parse(storedJson);
          if (stored.publicKey && stored.privateKey) {
            // Get the source from storage (if available)
            const storedSource = localStorage.getItem(MESSAGING_KEYPAIR_SOURCE_STORAGE) as 
              "eoa" | "passkey-prf" | "passkey-fallback" | null;
            
            // Import stored keypair into session cache
            const storedKeypair: DerivedMessagingKey = {
              publicKey: stored.publicKey,
              privateKey: stored.privateKey,
              derivedFrom: storedSource || "passkey-fallback",
            };
            importKeypairToCache(userAddress, storedKeypair, storedKeypair.derivedFrom);
            setKeypair(storedKeypair);
            setDerivedFrom(storedSource || "legacy");
            console.log("[MessagingKey] ✅ Loaded keypair from localStorage - NO SIGNING NEEDED");
            console.log("[MessagingKey] Key source:", storedSource || "legacy");
          }
        } catch {
          // Invalid stored data, will need to re-derive
          console.log("[MessagingKey] Invalid stored keypair, will need activation");
        }
      }
      setLegacyChecked(true);
    }
  }, [userAddress, legacyChecked]);
  
  // Determine if messaging requires activation
  const requiresActivation = useMemo(() => {
    if (!userAddress || !authType) return false;
    // Has cached/active key? No activation needed
    if (keypair || (userAddress && hasCachedKey(userAddress))) return false;
    // Has legacy key? No activation needed
    if (derivedFrom === "legacy") return false;
    // Otherwise, needs activation
    return true;
  }, [userAddress, authType, keypair, derivedFrom]);
  
  // Determine if user needs to create a passkey first
  const requiresPasskey = useMemo(() => {
    if (!authType) return false;
    // EOA and passkey users don't need to create a passkey
    if (authType === "wallet" || authType === "passkey") return false;
    // Email/Digital ID/Solana users need a passkey if they don't have one
    return !hasPasskey;
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
        hasPasskey,
      });
      
      if (result.success && result.keypair) {
        setKeypair(result.keypair);
        setDerivedFrom(result.keypair.derivedFrom);
        
        // ✅ PERSIST keypair to localStorage
        // This means users only need to sign ONCE - key survives page refresh/app restart
        if (typeof window !== "undefined") {
          localStorage.setItem(MESSAGING_KEYPAIR_STORAGE, JSON.stringify({
            publicKey: result.keypair.publicKey,
            privateKey: result.keypair.privateKey,
          }));
          // Also save the derivation source for UI display
          localStorage.setItem(MESSAGING_KEYPAIR_SOURCE_STORAGE, result.keypair.derivedFrom);
          console.log("[MessagingKey] ✅ Keypair saved to localStorage - won't need to sign again");
        }
        
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
            console.log("[MessagingKey] Public key uploaded to Supabase");
          } catch (uploadError) {
            console.warn("[MessagingKey] Failed to upload public key:", uploadError);
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
    setDerivedFrom(null);
    setError(null);
  }, [userAddress]);
  
  // Clear everything on logout
  useEffect(() => {
    return () => {
      clearAllCachedKeys();
    };
  }, []);
  
  // Derived state
  const isReady = !!keypair;
  const publicKey = keypair?.publicKey || null;
  
  const value = useMemo(() => ({
    isReady,
    isLoading,
    requiresPasskey,
    requiresActivation,
    error,
    keypair,
    publicKey,
    derivedFrom,
    activateMessaging,
    deactivate,
    authType,
    hasPasskey,
  }), [
    isReady,
    isLoading,
    requiresPasskey,
    requiresActivation,
    error,
    keypair,
    publicKey,
    derivedFrom,
    activateMessaging,
    deactivate,
    authType,
    hasPasskey,
  ]);
  
  return (
    <MessagingKeyContext.Provider value={value}>
      {children}
    </MessagingKeyContext.Provider>
  );
}

export function useMessagingKeyContext() {
  const context = useContext(MessagingKeyContext);
  if (!context) {
    throw new Error("useMessagingKeyContext must be used within a MessagingKeyProvider");
  }
  return context;
}

/**
 * Optional hook that doesn't throw if outside provider
 */
export function useMessagingKeyContextOptional(): MessagingKeyContextType | null {
  return useContext(MessagingKeyContext);
}
