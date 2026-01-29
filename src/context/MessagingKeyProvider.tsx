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

// Storage keys for backward compatibility with existing system
const MESSAGING_KEYPAIR_STORAGE = "waku_messaging_keypair";
const MESSAGING_KEY_SOURCE_STORAGE = "spritz_messaging_key_source";

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
  derivedFrom: DerivedMessagingKey["derivedFrom"] | null;
  
  // Actions
  activateMessaging: () => Promise<MessagingKeyResult>;
  deactivate: () => void;
  
  // Auth info
  authType: AuthType | null;
  hasPasskey: boolean;
  userAddress: string | null;
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
  const { data: walletClient } = useWalletClient();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keypair, setKeypair] = useState<DerivedMessagingKey | null>(null);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [localKeyLoaded, setLocalKeyLoaded] = useState(false);
  
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
    
    const db = supabase; // Captured for TypeScript
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
  
  // Load existing keypair from localStorage on mount
  // This provides instant access without re-authentication
  useEffect(() => {
    if (!userAddress) {
      setKeypair(null);
      setLocalKeyLoaded(false);
      return;
    }
    
    // Check session cache first
    const cached = getCachedKey(userAddress);
    if (cached) {
      setKeypair(cached);
      setLocalKeyLoaded(true);
      return;
    }
    
    // Check localStorage for persisted keypair
    if (typeof window !== "undefined") {
      const storedJson = localStorage.getItem(MESSAGING_KEYPAIR_STORAGE);
      if (storedJson) {
        try {
          const stored = JSON.parse(storedJson);
          if (stored.publicKey && stored.privateKey) {
            const storedSource = localStorage.getItem(MESSAGING_KEY_SOURCE_STORAGE) as 
              DerivedMessagingKey["derivedFrom"] | null;
            
            const storedKeypair: DerivedMessagingKey = {
              publicKey: stored.publicKey,
              privateKey: stored.privateKey,
              derivedFrom: storedSource || "legacy",
            };
            
            // Import to session cache
            importKeypairToCache(userAddress, storedKeypair, storedKeypair.derivedFrom);
            setKeypair(storedKeypair);
            console.log("[MessagingKey] ✅ Loaded keypair from localStorage");
          }
        } catch {
          console.log("[MessagingKey] Invalid stored keypair");
        }
      }
      setLocalKeyLoaded(true);
    }
  }, [userAddress]);
  
  // Determine if messaging requires activation
  const requiresActivation = useMemo(() => {
    if (!userAddress || !authType || !localKeyLoaded) return false;
    if (keypair || hasCachedKey(userAddress)) return false;
    return true;
  }, [userAddress, authType, keypair, localKeyLoaded]);
  
  // Determine if user needs to create a passkey first
  const requiresPasskey = useMemo(() => {
    if (!authType) return false;
    if (authType === "wallet" || authType === "passkey") return false;
    return !hasPasskey;
  }, [authType, hasPasskey]);
  
  // Activate messaging (derive/restore key)
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
        
        // Persist to localStorage for fast loading on next visit
        if (typeof window !== "undefined") {
          localStorage.setItem(MESSAGING_KEYPAIR_STORAGE, JSON.stringify({
            publicKey: result.keypair.publicKey,
            privateKey: result.keypair.privateKey,
          }));
          localStorage.setItem(MESSAGING_KEY_SOURCE_STORAGE, result.keypair.derivedFrom);
        }
        
        if (result.isNewKey) {
          console.log("[MessagingKey] ✅ Deterministic keypair derived");
        } else {
          console.log("[MessagingKey] ✅ Keypair loaded from cache");
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
  
  // Deactivate messaging (clear local key)
  const deactivate = useCallback(() => {
    if (userAddress) {
      clearCachedKey(userAddress);
    }
    // Clear localStorage - key can be re-derived deterministically
    if (typeof window !== "undefined") {
      localStorage.removeItem(MESSAGING_KEYPAIR_STORAGE);
      localStorage.removeItem(MESSAGING_KEY_SOURCE_STORAGE);
    }
    setKeypair(null);
    setError(null);
  }, [userAddress]);
  
  // Clear cache on unmount
  useEffect(() => {
    return () => {
      clearAllCachedKeys();
    };
  }, []);
  
  // Derived state
  const isReady = !!keypair;
  const publicKey = keypair?.publicKey || null;
  const derivedFrom = keypair?.derivedFrom || null;
  
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
    userAddress,
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
    userAddress,
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

export function useMessagingKeyContextOptional(): MessagingKeyContextType | null {
  return useContext(MessagingKeyContext);
}
