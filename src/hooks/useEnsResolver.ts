"use client";

import { useState, useEffect, useCallback } from "react";
import { type Address, isAddress } from "viem";
import { normalize } from "viem/ens";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

import { getRpcUrl } from "@/lib/rpc";

// ENS resolution uses mainnet (ENS is deployed on Ethereum mainnet)
const ensClient = createPublicClient({
    chain: mainnet,
    transport: http(getRpcUrl(1)),
});

export interface UseEnsResolverReturn {
    // The input value (could be address or ENS name)
    input: string;
    // The resolved address (null if not resolved or invalid)
    resolvedAddress: Address | null;
    // The ENS name if input was an address that has reverse resolution
    ensName: string | null;
    // Whether currently resolving
    isResolving: boolean;
    // Error message if resolution failed
    error: string | null;
    // Whether the input is valid (either valid address or resolved ENS)
    isValid: boolean;
    // Set the input value
    setInput: (value: string) => void;
    // Clear the input
    clear: () => void;
}

/**
 * Hook to resolve ENS names to addresses and vice versa
 * 
 * Supports:
 * - ENS names (e.g., "vitalik.eth") -> resolves to address
 * - Addresses -> validates and optionally resolves to ENS name
 */
export function useEnsResolver(): UseEnsResolverReturn {
    const [input, setInputState] = useState("");
    const [resolvedAddress, setResolvedAddress] = useState<Address | null>(null);
    const [ensName, setEnsName] = useState<string | null>(null);
    const [isResolving, setIsResolving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Debounced ENS resolution
    useEffect(() => {
        // Reset state when input changes
        setError(null);
        
        // Empty input
        if (!input || input.trim() === "") {
            setResolvedAddress(null);
            setEnsName(null);
            setIsResolving(false);
            return;
        }

        const trimmedInput = input.trim();

        // Check if it's already a valid address
        if (isAddress(trimmedInput)) {
            setResolvedAddress(trimmedInput as Address);
            setEnsName(null);
            setIsResolving(false);
            
            // Optionally resolve reverse ENS (address -> name)
            // This is nice-to-have but not critical
            resolveReverseName(trimmedInput as Address);
            return;
        }

        // Check if it looks like an ENS name
        if (trimmedInput.includes(".")) {
            setIsResolving(true);
            setResolvedAddress(null);
            
            // Debounce the resolution
            const timer = setTimeout(() => {
                resolveEnsName(trimmedInput);
            }, 500);

            return () => clearTimeout(timer);
        }

        // Not a valid address or ENS name
        setResolvedAddress(null);
        setEnsName(null);
        setIsResolving(false);
    }, [input]);

    // Resolve ENS name to address
    const resolveEnsName = async (name: string) => {
        try {
            // Normalize the ENS name (handles unicode, etc.)
            const normalizedName = normalize(name);
            
            console.log("[ENS] Resolving:", normalizedName);
            
            const address = await ensClient.getEnsAddress({
                name: normalizedName,
            });

            if (address) {
                console.log("[ENS] Resolved to:", address);
                setResolvedAddress(address);
                setEnsName(normalizedName);
                setError(null);
            } else {
                console.log("[ENS] Name not found:", normalizedName);
                setResolvedAddress(null);
                setEnsName(null);
                setError("ENS name not found");
            }
        } catch (err) {
            console.error("[ENS] Resolution error:", err);
            setResolvedAddress(null);
            setEnsName(null);
            setError("Failed to resolve ENS name");
        } finally {
            setIsResolving(false);
        }
    };

    // Reverse resolve address to ENS name (optional, for display)
    const resolveReverseName = async (address: Address) => {
        try {
            const name = await ensClient.getEnsName({
                address,
            });
            
            if (name) {
                console.log("[ENS] Reverse resolved:", address.slice(0, 10), "->", name);
                setEnsName(name);
            }
        } catch (err) {
            // Ignore errors for reverse resolution - it's optional
            console.log("[ENS] Reverse resolution failed (this is fine):", err);
        }
    };

    const setInput = useCallback((value: string) => {
        setInputState(value);
    }, []);

    const clear = useCallback(() => {
        setInputState("");
        setResolvedAddress(null);
        setEnsName(null);
        setError(null);
        setIsResolving(false);
    }, []);

    return {
        input,
        resolvedAddress,
        ensName,
        isResolving,
        error,
        isValid: resolvedAddress !== null,
        setInput,
        clear,
    };
}
