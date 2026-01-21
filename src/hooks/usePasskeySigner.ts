"use client";

import { useState, useCallback } from "react";
import { type Address, type Hex, keccak256, toHex } from "viem";

export interface PasskeyCredential {
    credentialId: string;
    publicKeyX: Hex;
    publicKeyY: Hex;
    safeSignerAddress: Address;
}

export interface PasskeySignerState {
    isReady: boolean;
    isLoading: boolean;
    isSigning: boolean;
    error: string | null;
    credential: PasskeyCredential | null;
}

export interface UsePasskeySignerReturn extends PasskeySignerState {
    loadCredential: (userAddress: Address) => Promise<void>;
    signChallenge: (challenge: Hex) => Promise<{
        authenticatorData: Uint8Array;
        clientDataJSON: string;
        signature: Uint8Array;
    } | null>;
    reset: () => void;
}

/**
 * Hook for signing with passkeys (WebAuthn)
 * 
 * This hook manages the passkey credential and provides signing functionality
 * for Safe WebAuthn transactions.
 */
export function usePasskeySigner(): UsePasskeySignerReturn {
    const [isReady, setIsReady] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSigning, setIsSigning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [credential, setCredential] = useState<PasskeyCredential | null>(null);

    /**
     * Load the user's passkey credential from the database
     */
    const loadCredential = useCallback(async (userAddress: Address) => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/passkey/credential?address=${userAddress}`, {
                credentials: "include",
            });

            if (!response.ok) {
                throw new Error("Failed to load passkey credential");
            }

            const data = await response.json();
            
            if (!data.credentialId || !data.publicKeyX || !data.publicKeyY) {
                throw new Error("Passkey not configured for Safe signing");
            }

            setCredential({
                credentialId: data.credentialId,
                publicKeyX: data.publicKeyX as Hex,
                publicKeyY: data.publicKeyY as Hex,
                safeSignerAddress: data.safeSignerAddress as Address,
            });
            
            setIsReady(true);
        } catch (err) {
            console.error("[PasskeySigner] Error loading credential:", err);
            setError(err instanceof Error ? err.message : "Failed to load credential");
            setIsReady(false);
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Sign a challenge using the passkey
     * 
     * This triggers the WebAuthn authentication ceremony and returns
     * the signature components needed for Safe verification.
     */
    const signChallenge = useCallback(async (challenge: Hex): Promise<{
        authenticatorData: Uint8Array;
        clientDataJSON: string;
        signature: Uint8Array;
    } | null> => {
        if (!credential) {
            setError("No passkey credential loaded");
            return null;
        }

        setIsSigning(true);
        setError(null);

        try {
            // Get the RP ID - must match where the passkey was registered
            // IMPORTANT: Use parent domain (spritz.chat) for all spritz.chat subdomains
            // to match the registration and login flow
            const getRpId = (): string => {
                const hostname = window.location.hostname;
                if (hostname.includes('spritz.chat')) {
                    return 'spritz.chat';
                }
                if (hostname === 'localhost' || hostname === '127.0.0.1') {
                    return 'localhost';
                }
                return hostname;
            };
            const rpId = getRpId();
            const challengeBytes = hexToBytes(challenge);
            
            // Create the assertion options
            // For iCloud/cloud-synced passkeys, don't specify transports
            // This lets the browser use the synced passkey directly without
            // showing QR code for cross-device authentication
            const options: PublicKeyCredentialRequestOptions = {
                challenge: challengeBytes.buffer.slice(
                    challengeBytes.byteOffset,
                    challengeBytes.byteOffset + challengeBytes.byteLength
                ) as ArrayBuffer,
                rpId,
                allowCredentials: [{
                    id: base64UrlToArrayBuffer(credential.credentialId),
                    type: "public-key",
                    // CRITICAL: Specify transports: ["internal"] to tell Safari to use
                    // the platform authenticator (Face ID/Touch ID) directly instead of
                    // showing the cross-device options (iPhone, iPad, Android, Security Key)
                    // This matches the login flow which uses ["internal"] and works correctly
                    // iCloud-synced passkeys still work with "internal" transport
                    transports: ["internal"],
                }],
                userVerification: "required",
                timeout: 60000,
            };

            // Request the assertion
            // Use mediation: "optional" to match the login flow behavior
            // This helps Safari/iOS show the passkey picker correctly
            const assertion = await navigator.credentials.get({
                publicKey: options,
                mediation: "optional",
            }) as PublicKeyCredential;

            if (!assertion) {
                throw new Error("No assertion returned");
            }

            const response = assertion.response as AuthenticatorAssertionResponse;
            
            return {
                authenticatorData: new Uint8Array(response.authenticatorData),
                clientDataJSON: new TextDecoder().decode(response.clientDataJSON),
                signature: new Uint8Array(response.signature),
            };
        } catch (err) {
            console.error("[PasskeySigner] Signing error:", err);
            
            // Handle user cancellation
            if (err instanceof DOMException && err.name === "NotAllowedError") {
                setError("Signing cancelled");
            } else {
                setError(err instanceof Error ? err.message : "Failed to sign");
            }
            
            return null;
        } finally {
            setIsSigning(false);
        }
    }, [credential]);

    /**
     * Reset the signer state
     */
    const reset = useCallback(() => {
        setIsReady(false);
        setIsLoading(false);
        setIsSigning(false);
        setError(null);
        setCredential(null);
    }, []);

    return {
        isReady,
        isLoading,
        isSigning,
        error,
        credential,
        loadCredential,
        signChallenge,
        reset,
    };
}

// Utility functions

function hexToBytes(hex: Hex): Uint8Array {
    const bytes = new Uint8Array((hex.length - 2) / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(2 + i * 2, 4 + i * 2), 16);
    }
    return bytes;
}

function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
    // Replace base64url characters with base64 characters
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    // Pad if necessary
    const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, "=");
    // Decode
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}
