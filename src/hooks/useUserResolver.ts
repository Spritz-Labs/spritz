"use client";

import { useState, useEffect, useCallback } from "react";
import { type Address, isAddress } from "viem";
import { normalize } from "viem/ens";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

import { getRpcUrl } from "@/lib/rpc";

// ENS resolution uses mainnet
const ensClient = createPublicClient({
    chain: mainnet,
    transport: http(getRpcUrl(1)),
});

export interface UseUserResolverReturn {
    // The input value
    input: string;
    // The resolved address (null if not resolved or invalid)
    resolvedAddress: Address | null;
    // The display name (ENS or Spritz username)
    displayName: string | null;
    // Type of resolution
    resolvedType: "address" | "ens" | "username" | null;
    // Whether currently resolving
    isResolving: boolean;
    // Error message if resolution failed
    error: string | null;
    // Whether the input is valid
    isValid: boolean;
    // Set the input value
    setInput: (value: string) => void;
    // Clear the input
    clear: () => void;
}

/**
 * Hook to resolve user identifiers to addresses
 * 
 * Supports:
 * - Wallet addresses (0x...)
 * - ENS names (e.g., "vitalik.eth")
 * - Spritz usernames (e.g., "@username" or "username")
 */
export function useUserResolver(): UseUserResolverReturn {
    const [input, setInputState] = useState("");
    const [resolvedAddress, setResolvedAddress] = useState<Address | null>(null);
    const [displayName, setDisplayName] = useState<string | null>(null);
    const [resolvedType, setResolvedType] = useState<"address" | "ens" | "username" | null>(null);
    const [isResolving, setIsResolving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setError(null);
        
        if (!input || input.trim() === "") {
            setResolvedAddress(null);
            setDisplayName(null);
            setResolvedType(null);
            setIsResolving(false);
            return;
        }

        const trimmedInput = input.trim();

        // Check if it's already a valid address
        if (isAddress(trimmedInput)) {
            setResolvedAddress(trimmedInput as Address);
            setDisplayName(null);
            setResolvedType("address");
            setIsResolving(false);
            return;
        }

        // Check if it looks like an ENS name (contains a dot)
        if (trimmedInput.includes(".")) {
            setIsResolving(true);
            setResolvedAddress(null);
            
            const timer = setTimeout(() => {
                resolveEnsName(trimmedInput);
            }, 500);

            return () => clearTimeout(timer);
        }

        // Otherwise, treat it as a Spritz username
        // Remove @ prefix if present
        const username = trimmedInput.startsWith("@") 
            ? trimmedInput.slice(1) 
            : trimmedInput;
        
        if (username.length >= 3) {
            setIsResolving(true);
            setResolvedAddress(null);
            
            const timer = setTimeout(() => {
                resolveSpritzUsername(username);
            }, 500);

            return () => clearTimeout(timer);
        } else {
            setResolvedAddress(null);
            setDisplayName(null);
            setResolvedType(null);
            setIsResolving(false);
        }
    }, [input]);

    // Resolve ENS name to address
    const resolveEnsName = async (name: string) => {
        try {
            const normalizedName = normalize(name);
            console.log("[UserResolver] Resolving ENS:", normalizedName);
            
            const address = await ensClient.getEnsAddress({
                name: normalizedName,
            });

            if (address) {
                console.log("[UserResolver] ENS resolved to:", address);
                setResolvedAddress(address);
                setDisplayName(normalizedName);
                setResolvedType("ens");
                setError(null);
            } else {
                console.log("[UserResolver] ENS name not found:", normalizedName);
                setResolvedAddress(null);
                setDisplayName(null);
                setResolvedType(null);
                setError("ENS name not found");
            }
        } catch (err) {
            console.error("[UserResolver] ENS resolution error:", err);
            setResolvedAddress(null);
            setDisplayName(null);
            setResolvedType(null);
            setError("Failed to resolve ENS name");
        } finally {
            setIsResolving(false);
        }
    };

    // Resolve Spritz username to address
    const resolveSpritzUsername = async (username: string) => {
        try {
            console.log("[UserResolver] Resolving Spritz username:", username);
            
            const response = await fetch(`/api/username/resolve?username=${encodeURIComponent(username)}`, {
                credentials: "include",
            });

            if (response.ok) {
                const data = await response.json();
                if (data.address) {
                    console.log("[UserResolver] Username resolved to:", data.address);
                    setResolvedAddress(data.address as Address);
                    setDisplayName(`@${data.username}`);
                    setResolvedType("username");
                    setError(null);
                } else {
                    console.log("[UserResolver] Username not found:", username);
                    setResolvedAddress(null);
                    setDisplayName(null);
                    setResolvedType(null);
                    setError("Username not found");
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                setResolvedAddress(null);
                setDisplayName(null);
                setResolvedType(null);
                setError(errorData.error || "Username not found");
            }
        } catch (err) {
            console.error("[UserResolver] Username resolution error:", err);
            setResolvedAddress(null);
            setDisplayName(null);
            setResolvedType(null);
            setError("Failed to resolve username");
        } finally {
            setIsResolving(false);
        }
    };

    const setInput = useCallback((value: string) => {
        setInputState(value);
    }, []);

    const clear = useCallback(() => {
        setInputState("");
        setResolvedAddress(null);
        setDisplayName(null);
        setResolvedType(null);
        setError(null);
        setIsResolving(false);
    }, []);

    return {
        input,
        resolvedAddress,
        displayName,
        resolvedType,
        isResolving,
        error,
        isValid: resolvedAddress !== null,
        setInput,
        clear,
    };
}
