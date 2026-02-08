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
  hasPinSetup,
  deriveMekFromPin,
  getRemoteKeySource,
  verifyPinAgainstRemote,
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
  hasPinConfigured: boolean;     // User has PIN set up locally (needs to enter it)
  remoteKeySource: DerivedMessagingKey["derivedFrom"] | null; // Key source from Supabase (cross-device detection)
  error: string | null;
  
  // Current keypair
  keypair: DerivedMessagingKey | null;
  publicKey: string | null;
  
  // Derived from (for UI display)
  derivedFrom: DerivedMessagingKey["derivedFrom"] | null;
  
  // Actions
  activateMessaging: () => Promise<MessagingKeyResult>;
  activateWithPin: (pin: string) => Promise<MessagingKeyResult>;
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
  const [remoteKeySource, setRemoteKeySource] = useState<DerivedMessagingKey["derivedFrom"] | null>(null);
  
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
  
  // Fetch remote key source from Supabase when user has no local key
  // This detects if they set up a PIN or passkey on another device
  useEffect(() => {
    if (!userAddress || !localKeyLoaded) {
      setRemoteKeySource(null);
      return;
    }
    // Only check remote if we don't have a local key
    if (keypair) {
      setRemoteKeySource(null);
      return;
    }
    
    const checkRemote = async () => {
      try {
        const result = await getRemoteKeySource(userAddress);
        if (result.hasKey && result.source) {
          setRemoteKeySource(result.source);
          console.log("[MessagingKey] Remote key source detected:", result.source);
        }
      } catch {
        // Silently fail -- not critical
      }
    };
    
    checkRemote();
  }, [userAddress, localKeyLoaded, keypair]);
  
  // Determine if messaging requires activation
  const requiresActivation = useMemo(() => {
    if (!userAddress || !authType || !localKeyLoaded) return false;
    if (keypair || hasCachedKey(userAddress)) return false;
    return true;
  }, [userAddress, authType, keypair, localKeyLoaded]);
  
  // Check if user has PIN configured (locally or remotely)
  const hasPinConfigured = useMemo(() => {
    if (!userAddress) return false;
    // Check local first (same device)
    if (hasPinSetup(userAddress)) return true;
    // Check remote (another device set up PIN)
    if (remoteKeySource === "pin") return true;
    return false;
  }, [userAddress, remoteKeySource]);
  
  // Determine if user needs to create a passkey first
  // Now returns false if user has a PIN configured (PIN is an alternative)
  const requiresPasskey = useMemo(() => {
    if (!authType) return false;
    if (authType === "wallet" || authType === "passkey") return false;
    if (hasPinConfigured) return false; // PIN is set up, no passkey needed
    return !hasPasskey;
  }, [authType, hasPasskey, hasPinConfigured]);
  
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
        remoteKeySource,
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
  }, [userAddress, authType, walletClient, passkeyCredentialId, rpId, hasPasskey, remoteKeySource]);
  
  // Activate messaging with PIN (for email/digitalid/solana users without passkey)
  const activateWithPin = useCallback(async (pin: string): Promise<MessagingKeyResult> => {
    if (!userAddress) {
      return { success: false, error: "Not authenticated" };
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Safety check: if a PIN key already exists remotely, verify
      // the entered PIN produces the same key before overwriting
      if (remoteKeySource === "pin") {
        const matches = await verifyPinAgainstRemote(pin, userAddress);
        if (!matches) {
          setIsLoading(false);
          const err = "Wrong PIN. Enter the same PIN you set up on your other device.";
          setError(err);
          return { success: false, error: err };
        }
      }
      
      const result = await deriveMekFromPin(pin, userAddress);
      
      if (result.success && result.keypair) {
        setKeypair(result.keypair);
        
        // Persist to localStorage
        if (typeof window !== "undefined") {
          localStorage.setItem(MESSAGING_KEYPAIR_STORAGE, JSON.stringify({
            publicKey: result.keypair.publicKey,
            privateKey: result.keypair.privateKey,
          }));
          localStorage.setItem(MESSAGING_KEY_SOURCE_STORAGE, result.keypair.derivedFrom);
        }
        
        console.log("[MessagingKey] PIN-based keypair activated");
      } else {
        setError(result.error || "Failed to activate with PIN");
      }
      
      setIsLoading(false);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      setIsLoading(false);
      return { success: false, error: errorMessage };
    }
  }, [userAddress, remoteKeySource]);

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
    hasPinConfigured,
    remoteKeySource,
    error,
    keypair,
    publicKey,
    derivedFrom,
    activateMessaging,
    activateWithPin,
    deactivate,
    authType,
    hasPasskey,
    userAddress,
  }), [
    isReady,
    isLoading,
    requiresPasskey,
    requiresActivation,
    hasPinConfigured,
    remoteKeySource,
    error,
    keypair,
    publicKey,
    derivedFrom,
    activateMessaging,
    activateWithPin,
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
