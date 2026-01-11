"use client";

import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
    type ReactNode,
} from "react";
import {
    startRegistration,
    startAuthentication,
} from "@simplewebauthn/browser";
import { type Address } from "viem";

// Storage keys (new system)
const SESSION_STORAGE_KEY = "spritz_passkey_session";
const USER_ADDRESS_KEY = "spritz_passkey_address";

// OLD storage keys (pre-migration, for backwards compatibility)
const OLD_CREDENTIAL_STORAGE_KEY = "spritz_passkey_credential";
const OLD_DEVICE_ID_STORAGE_KEY = "spritz_device_id";
const OLD_DEVICE_ADDRESS_STORAGE_KEY = "spritz_passkey_address"; // Same as new
const OLD_SESSION_STORAGE_KEY = "spritz_passkey_session"; // Same as new

// Types
export type PasskeyState = {
    isLoading: boolean;
    isAuthenticated: boolean;
    smartAccountAddress: Address | null;
    error: string | null;
    hasStoredSession: boolean;
};

export type LoginOptions = {
    useDevicePasskey?: boolean;
};

export type PasskeyContextType = PasskeyState & {
    register: (username: string) => Promise<void>;
    login: (options?: LoginOptions) => Promise<void>;
    logout: () => void;
    clearError: () => void;
};

const PasskeyContext = createContext<PasskeyContextType | null>(null);

// Validate and decode session token (handles both JWT format and simple base64)
function validateSession(token: string): { userAddress: string; exp: number } | null {
    try {
        let payload;
        
        // Check if it's a JWT (has 3 parts separated by dots)
        const parts = token.split(".");
        if (parts.length === 3) {
            // JWT format: header.payload.signature - decode the payload (middle part)
            payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
        } else {
            // Simple base64url encoded JSON (legacy format)
            payload = JSON.parse(Buffer.from(token, "base64url").toString());
        }
        
        // exp from server JWT is in seconds, Date.now() is in milliseconds
        // Handle both formats for backwards compatibility
        const expMs = payload.exp > 1e12 ? payload.exp : payload.exp * 1000;
        
        // Server JWT uses 'userAddress' in payload, legacy uses 'sub'
        const userAddress = payload.userAddress || payload.sub;
        
        if (payload.exp && expMs > Date.now() && userAddress) {
            return { userAddress, exp: expMs };
        }
        return null;
    } catch (e) {
        console.error("[Passkey] Session validation error:", e);
        return null;
    }
}

// Check for OLD passkey credentials (pre-migration system)
// Old system stored: { id, publicKey, raw: { id, type } } in localStorage
// Address was derived from: hash(publicKey + deviceId)
type OldCredential = {
    id: string;
    publicKey: string;
    raw: { id: string; type: string };
};

async function hashWithDeviceEntropy(publicKey: string, deviceId: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(publicKey + deviceId);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function checkForOldCredentials(): { 
    hasOldCredentials: boolean; 
    credential?: OldCredential; 
    deviceId?: string;
    storedAddress?: string;
} {
    try {
        const storedCredential = localStorage.getItem(OLD_CREDENTIAL_STORAGE_KEY);
        const deviceId = localStorage.getItem(OLD_DEVICE_ID_STORAGE_KEY);
        const storedAddress = localStorage.getItem(OLD_DEVICE_ADDRESS_STORAGE_KEY);
        
        if (storedCredential && deviceId) {
            const credential = JSON.parse(storedCredential) as OldCredential;
            console.log("[Passkey] Found OLD credential from pre-migration system");
            console.log("[Passkey] Old credential ID:", credential.id?.slice(0, 20) + "...");
            console.log("[Passkey] Old device ID:", deviceId?.slice(0, 8) + "...");
            console.log("[Passkey] Stored address:", storedAddress);
            return { 
                hasOldCredentials: true, 
                credential, 
                deviceId,
                storedAddress: storedAddress || undefined
            };
        }
        return { hasOldCredentials: false };
    } catch (e) {
        console.error("[Passkey] Error checking old credentials:", e);
        return { hasOldCredentials: false };
    }
}

// Migrate old credential to new system by deriving the same address
async function migrateOldCredential(credential: OldCredential, deviceId: string): Promise<string | null> {
    try {
        // Derive the wallet address the same way the old system did
        const deviceHash = await hashWithDeviceEntropy(credential.publicKey, deviceId);
        const walletAddress = `0x${deviceHash.slice(0, 40)}`;
        
        console.log("[Passkey] Derived address from old credential:", walletAddress);
        return walletAddress;
    } catch (e) {
        console.error("[Passkey] Error migrating old credential:", e);
        return null;
    }
}

export function PasskeyProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<PasskeyState>({
        isLoading: false,
        isAuthenticated: false,
        smartAccountAddress: null,
        error: null,
        hasStoredSession: false,
    });

    // Check for stored session on mount (including backwards compatibility for old system)
    useEffect(() => {
        const restoreSession = async () => {
            const storedSession = localStorage.getItem(SESSION_STORAGE_KEY);
            const storedAddress = localStorage.getItem(USER_ADDRESS_KEY);

            // First, check for valid new-system session
            if (storedSession && storedAddress) {
                const session = validateSession(storedSession);
                if (session) {
                    console.log("[Passkey] Restored valid session, expires:", 
                        new Date(session.exp).toLocaleDateString());
                    
                    // Refresh the server session cookie
                    try {
                        const res = await fetch("/api/auth/session", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ 
                                userAddress: session.userAddress,
                                authMethod: "passkey",
                            }),
                            credentials: "include",
                        });
                        if (res.ok) {
                            console.log("[Passkey] Server session refreshed");
                        }
                    } catch (e) {
                        console.warn("[Passkey] Failed to refresh server session:", e);
                    }
                    
                    setState({
                        isLoading: false,
                        isAuthenticated: true,
                        smartAccountAddress: session.userAddress as Address,
                        error: null,
                        hasStoredSession: true,
                    });
                    return;
                } else {
                    console.log("[Passkey] Session expired or invalid");
                }
            }

            // Check for OLD credentials (pre-migration system)
            const oldCredCheck = checkForOldCredentials();
            if (oldCredCheck.hasOldCredentials && oldCredCheck.credential && oldCredCheck.deviceId) {
                console.log("[Passkey] Attempting to restore from OLD credential system...");
                
                // Derive the wallet address from old credentials
                const derivedAddress = await migrateOldCredential(
                    oldCredCheck.credential, 
                    oldCredCheck.deviceId
                );
                
                if (derivedAddress) {
                    // Check if the derived address matches what was stored
                    const addressMatches = oldCredCheck.storedAddress?.toLowerCase() === derivedAddress.toLowerCase();
                    console.log("[Passkey] Address derivation:", addressMatches ? "MATCHES" : "MISMATCH");
                    
                    const finalAddress = oldCredCheck.storedAddress || derivedAddress;
                    
                    // Create a new-style session token for the old user
                    const newSessionToken = Buffer.from(JSON.stringify({
                        sub: finalAddress.toLowerCase(),
                        iat: Date.now(),
                        exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
                        type: "passkey_migrated",
                    })).toString("base64url");
                    
                    // Store in new format
                    localStorage.setItem(SESSION_STORAGE_KEY, newSessionToken);
                    localStorage.setItem(USER_ADDRESS_KEY, finalAddress.toLowerCase());
                    
                    console.log("[Passkey] ✅ Migrated old credential to new session format");
                    console.log("[Passkey] User address:", finalAddress);
                    
                    setState({
                        isLoading: false,
                        isAuthenticated: true,
                        smartAccountAddress: finalAddress.toLowerCase() as Address,
                        error: null,
                        hasStoredSession: true,
                    });
                    return;
                }
            }

            // No valid session found
            console.log("[Passkey] No valid session found");
            localStorage.removeItem(SESSION_STORAGE_KEY);
            localStorage.removeItem(USER_ADDRESS_KEY);
            setState((prev) => ({ ...prev, hasStoredSession: false }));
        };

        restoreSession();
    }, []);

    const clearError = useCallback(() => {
        setState((prev) => ({ ...prev, error: null }));
    }, []);

    // Generate a deterministic wallet address from credential
    const generateWalletAddress = useCallback(async (credentialId: string): Promise<Address> => {
        const encoder = new TextEncoder();
        const data = encoder.encode(`spritz-passkey-wallet:${credentialId}`);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
        return `0x${hashHex.slice(0, 40)}` as Address;
    }, []);

    const register = useCallback(
        async (username: string) => {
            setState((prev) => ({ ...prev, isLoading: true, error: null }));

            try {
                // Generate a temporary address based on username for registration
                const tempAddress = await generateWalletAddress(username || "spritz-user");
                
                // Step 1: Get registration options from server
                console.log("[Passkey] Fetching registration options...");
                const optionsResponse = await fetch("/api/passkey/register/options", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userAddress: tempAddress,
                        displayName: username || "Spritz User",
                    }),
                });

                if (!optionsResponse.ok) {
                    const error = await optionsResponse.json();
                    throw new Error(error.error || "Failed to get registration options");
                }

                const { options } = await optionsResponse.json();
                console.log("[Passkey] Got registration options, starting WebAuthn...");

                // Step 2: Create credential using WebAuthn
                const credential = await startRegistration({ optionsJSON: options });
                console.log("[Passkey] WebAuthn registration complete, verifying with server...");

                // Step 3: Verify with server and store credential
                const verifyResponse = await fetch("/api/passkey/register/verify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userAddress: tempAddress,
                        displayName: username || "Spritz User",
                        credential,
                        challenge: options.challenge,
                    }),
                    credentials: "include", // Important for PWA to receive/store cookies
                });

                if (!verifyResponse.ok) {
                    const error = await verifyResponse.json();
                    throw new Error(error.error || "Failed to verify registration");
                }

                const { sessionToken, userAddress, credentialId } = await verifyResponse.json();
                console.log("[Passkey] Registration verified! Credential ID:", credentialId?.slice(0, 20) + "...");

                // Generate the final wallet address from credential ID
                const walletAddress = await generateWalletAddress(credentialId);

                // Store session
                localStorage.setItem(SESSION_STORAGE_KEY, sessionToken);
                localStorage.setItem(USER_ADDRESS_KEY, walletAddress);

                setState({
                    isLoading: false,
                    isAuthenticated: true,
                    smartAccountAddress: walletAddress,
                    error: null,
                    hasStoredSession: true,
                });

                console.log("[Passkey] Registration complete! Address:", walletAddress);
            } catch (error) {
                console.error("[Passkey] Registration error:", error);
                const errorMessage =
                    error instanceof Error
                        ? error.message
                        : "Failed to register passkey";
                setState((prev) => ({
                    ...prev,
                    isLoading: false,
                    error: errorMessage,
                }));
            }
        },
        [generateWalletAddress]
    );

    const login = useCallback(async (options?: LoginOptions) => {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        const useDevicePasskey = options?.useDevicePasskey || false;

        try {
            // Step 1: Get authentication options from server
            console.log("[Passkey] Fetching auth options, useDevicePasskey:", useDevicePasskey);
            const optionsResponse = await fetch("/api/passkey/login/options", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ useDevicePasskey }),
            });

            if (!optionsResponse.ok) {
                const error = await optionsResponse.json();
                throw new Error(error.error || "Failed to get authentication options");
            }

            const { options, useDevicePasskey: serverUseDevice } = await optionsResponse.json();
            console.log("[Passkey] Got auth options, useDevicePasskey:", serverUseDevice);

            // Step 2: Authenticate using WebAuthn
            let credential;
            
            if (serverUseDevice) {
                // For device passkey mode, we need to trigger the platform authenticator
                // The challenge is that non-discoverable credentials won't show up with empty allowCredentials
                console.log("[Passkey] Using device passkey mode...");
                
                // Helper to convert ArrayBuffer to base64url
                const toBase64url = (buffer: ArrayBuffer): string => {
                    const bytes = new Uint8Array(buffer);
                    let binary = '';
                    for (let i = 0; i < bytes.length; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    return btoa(binary)
                        .replace(/\+/g, '-')
                        .replace(/\//g, '_')
                        .replace(/=+$/, '');
                };

                // Helper to decode base64url to ArrayBuffer
                const fromBase64url = (str: string): ArrayBuffer => {
                    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
                    const padding = '='.repeat((4 - base64.length % 4) % 4);
                    const binary = atob(base64 + padding);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) {
                        bytes[i] = binary.charCodeAt(i);
                    }
                    return bytes.buffer;
                };
                
                // Build allowCredentials from server response if available
                // This allows non-discoverable credentials to be used
                const allowCredentials: PublicKeyCredentialDescriptor[] = 
                    options.allowCredentials?.map((cred: { id: string; type: string; transports?: string[] }) => ({
                        id: fromBase64url(cred.id),
                        type: cred.type as PublicKeyCredentialType,
                        transports: (cred.transports || ["internal"]) as AuthenticatorTransport[],
                    })) || [];

                const publicKeyOptions: PublicKeyCredentialRequestOptions = {
                    challenge: fromBase64url(options.challenge),
                    rpId: options.rpId,
                    timeout: options.timeout || 120000,
                    userVerification: options.userVerification || "preferred",
                    // Use server-provided credentials (or empty for discoverable-only)
                    allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
                };
                
                console.log("[Passkey] allowCredentials count:", allowCredentials.length);
                
                try {
                    // Try with signal to allow cancellation
                    const abortController = new AbortController();
                    
                    const nativeCredential = await navigator.credentials.get({
                        publicKey: publicKeyOptions,
                        signal: abortController.signal,
                        // Try mediation: "optional" which should show platform authenticator UI
                        mediation: "optional",
                    }) as PublicKeyCredential;
                    
                    if (!nativeCredential) {
                        throw new Error("No credential selected");
                    }
                    
                    console.log("[Passkey] Got credential from device");
                    
                    // Convert to the format expected by the verify endpoint (base64url encoded)
                    const response = nativeCredential.response as AuthenticatorAssertionResponse;
                    credential = {
                        id: nativeCredential.id,
                        rawId: toBase64url(nativeCredential.rawId),
                        type: nativeCredential.type,
                        response: {
                            authenticatorData: toBase64url(response.authenticatorData),
                            clientDataJSON: toBase64url(response.clientDataJSON),
                            signature: toBase64url(response.signature),
                            userHandle: response.userHandle 
                                ? toBase64url(response.userHandle)
                                : null,
                        },
                        clientExtensionResults: nativeCredential.getClientExtensionResults(),
                    };
                } catch (nativeError) {
                    console.log("[Passkey] Native WebAuthn error:", nativeError);
                    // Fallback to library method
                    console.log("[Passkey] Falling back to library method...");
                    credential = await startAuthentication({ optionsJSON: options });
                }
            } else {
                // Standard authentication using the library
                credential = await startAuthentication({ optionsJSON: options });
            }
            
            console.log("[Passkey] WebAuthn authentication complete, verifying with server...");

            // Step 3: Verify with server
            const verifyResponse = await fetch("/api/passkey/login/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    credential,
                    challenge: options.challenge,
                }),
                credentials: "include", // Important for PWA to receive/store cookies
            });

            if (!verifyResponse.ok) {
                const errorData = await verifyResponse.json();
                const errorMsg = errorData.error || "Failed to verify authentication";
                
                // Check if this is a "credential not found" error - might be an old user
                if (errorMsg.includes("not found") || errorMsg.includes("register first")) {
                    console.log("[Passkey] Server credential not found, checking for old localStorage credentials...");
                    
                    // Try to restore from old credentials
                    const oldCredCheck = checkForOldCredentials();
                    if (oldCredCheck.hasOldCredentials && oldCredCheck.credential && oldCredCheck.deviceId) {
                        console.log("[Passkey] Found old credentials! Attempting migration...");
                        
                        const derivedAddress = await migrateOldCredential(
                            oldCredCheck.credential, 
                            oldCredCheck.deviceId
                        );
                        
                        if (derivedAddress) {
                            const finalAddress = oldCredCheck.storedAddress || derivedAddress;
                            
                            // Create a new-style session token
                            const newSessionToken = Buffer.from(JSON.stringify({
                                sub: finalAddress.toLowerCase(),
                                iat: Date.now(),
                                exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
                                type: "passkey_migrated",
                            })).toString("base64url");
                            
                            localStorage.setItem(SESSION_STORAGE_KEY, newSessionToken);
                            localStorage.setItem(USER_ADDRESS_KEY, finalAddress.toLowerCase());
                            
                            console.log("[Passkey] ✅ Migrated old credential during login!");
                            console.log("[Passkey] User address:", finalAddress);
                            
                            setState({
                                isLoading: false,
                                isAuthenticated: true,
                                smartAccountAddress: finalAddress.toLowerCase() as Address,
                                error: null,
                                hasStoredSession: true,
                            });
                            return;
                        }
                    }
                }
                
                throw new Error(errorMsg);
            }

            const { sessionToken, credentialId } = await verifyResponse.json();
            console.log("[Passkey] Authentication verified! Credential ID:", credentialId?.slice(0, 20) + "...");

            // Generate wallet address from credential ID
            const walletAddress = await generateWalletAddress(credentialId);

            // Store session
            localStorage.setItem(SESSION_STORAGE_KEY, sessionToken);
            localStorage.setItem(USER_ADDRESS_KEY, walletAddress);

            setState({
                isLoading: false,
                isAuthenticated: true,
                smartAccountAddress: walletAddress,
                error: null,
                hasStoredSession: true,
            });

            console.log("[Passkey] Login complete! Address:", walletAddress);
        } catch (error) {
            console.error("[Passkey] Login error:", error);
            const errorMessage =
                error instanceof Error
                    ? error.message
                    : "Failed to login with passkey";
            setState((prev) => ({
                ...prev,
                isLoading: false,
                error: errorMessage,
            }));
        }
    }, [generateWalletAddress]);

    const logout = useCallback(() => {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        localStorage.removeItem(USER_ADDRESS_KEY);
        console.log("[Passkey] Logged out");
        
        setState({
            isLoading: false,
            isAuthenticated: false,
            smartAccountAddress: null,
            error: null,
            hasStoredSession: false,
        });
    }, []);

    return (
        <PasskeyContext.Provider
            value={{
                ...state,
                register,
                login,
                logout,
                clearError,
            }}
        >
            {children}
        </PasskeyContext.Provider>
    );
}

export function usePasskeyContext() {
    const context = useContext(PasskeyContext);
    if (!context) {
        throw new Error(
            "usePasskeyContext must be used within a PasskeyProvider"
        );
    }
    return context;
}
