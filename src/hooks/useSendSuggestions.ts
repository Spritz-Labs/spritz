"use client";

import { useState, useEffect, useCallback } from "react";
import type { SendSuggestion, SuggestionType } from "@/app/api/send-suggestions/route";
import type { AddressBookEntry } from "@/app/api/address-book/route";

export type { SendSuggestion, SuggestionType, AddressBookEntry };

interface UseSendSuggestionsReturn {
    suggestions: SendSuggestion[];
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    filter: (query: string) => SendSuggestion[];
}

/**
 * Hook for fetching and filtering send suggestions
 * (friends, vaults, address book entries)
 */
export function useSendSuggestions(enabled: boolean = true): UseSendSuggestionsReturn {
    const [suggestions, setSuggestions] = useState<SendSuggestion[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchSuggestions = useCallback(async () => {
        if (!enabled) return;
        
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/send-suggestions", {
                credentials: "include",
            });

            if (!response.ok) {
                throw new Error("Failed to fetch suggestions");
            }

            const data = await response.json();
            setSuggestions(data.suggestions || []);
        } catch (err) {
            console.error("[useSendSuggestions] Error:", err);
            setError(err instanceof Error ? err.message : "Failed to fetch");
        } finally {
            setIsLoading(false);
        }
    }, [enabled]);

    useEffect(() => {
        if (enabled) {
            fetchSuggestions();
        }
    }, [enabled, fetchSuggestions]);

    // Filter suggestions by query (matches label, address, ENS)
    const filter = useCallback((query: string): SendSuggestion[] => {
        if (!query || query.length < 1) return suggestions;
        
        const q = query.toLowerCase();
        return suggestions.filter(s => 
            s.label.toLowerCase().includes(q) ||
            s.address.toLowerCase().includes(q) ||
            s.ensName?.toLowerCase().includes(q) ||
            s.sublabel?.toLowerCase().includes(q)
        );
    }, [suggestions]);

    return {
        suggestions,
        isLoading,
        error,
        refresh: fetchSuggestions,
        filter,
    };
}

interface UseAddressBookReturn {
    entries: AddressBookEntry[];
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    addEntry: (entry: { 
        address: string; 
        label: string; 
        ensName?: string; 
        notes?: string; 
        isFavorite?: boolean;
    }) => Promise<AddressBookEntry | null>;
    updateEntry: (id: string, updates: { 
        label?: string; 
        notes?: string; 
        isFavorite?: boolean;
    }) => Promise<boolean>;
    deleteEntry: (id: string) => Promise<boolean>;
    incrementUseCount: (id: string) => Promise<void>;
}

/**
 * Hook for managing the user's address book
 */
export function useAddressBook(): UseAddressBookReturn {
    const [entries, setEntries] = useState<AddressBookEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchEntries = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/address-book", {
                credentials: "include",
            });

            if (!response.ok) {
                throw new Error("Failed to fetch address book");
            }

            const data = await response.json();
            setEntries(data.entries || []);
        } catch (err) {
            console.error("[useAddressBook] Error:", err);
            setError(err instanceof Error ? err.message : "Failed to fetch");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchEntries();
    }, [fetchEntries]);

    const addEntry = useCallback(async (entry: { 
        address: string; 
        label: string; 
        ensName?: string; 
        notes?: string; 
        isFavorite?: boolean;
    }): Promise<AddressBookEntry | null> => {
        try {
            const response = await fetch("/api/address-book", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(entry),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to add");
            }

            const data = await response.json();
            setEntries(prev => [data.entry, ...prev]);
            return data.entry;
        } catch (err) {
            console.error("[useAddressBook] Add error:", err);
            throw err;
        }
    }, []);

    const updateEntry = useCallback(async (id: string, updates: { 
        label?: string; 
        notes?: string; 
        isFavorite?: boolean;
    }): Promise<boolean> => {
        try {
            const response = await fetch("/api/address-book", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ id, ...updates }),
            });

            if (!response.ok) {
                return false;
            }

            const data = await response.json();
            setEntries(prev => prev.map(e => e.id === id ? data.entry : e));
            return true;
        } catch (err) {
            console.error("[useAddressBook] Update error:", err);
            return false;
        }
    }, []);

    const deleteEntry = useCallback(async (id: string): Promise<boolean> => {
        try {
            const response = await fetch(`/api/address-book?id=${id}`, {
                method: "DELETE",
                credentials: "include",
            });

            if (!response.ok) {
                return false;
            }

            setEntries(prev => prev.filter(e => e.id !== id));
            return true;
        } catch (err) {
            console.error("[useAddressBook] Delete error:", err);
            return false;
        }
    }, []);

    const incrementUseCount = useCallback(async (id: string): Promise<void> => {
        try {
            await fetch("/api/address-book", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ id, incrementUseCount: true }),
            });
        } catch (err) {
            console.error("[useAddressBook] Increment error:", err);
        }
    }, []);

    return {
        entries,
        isLoading,
        error,
        refresh: fetchEntries,
        addEntry,
        updateEntry,
        deleteEntry,
        incrementUseCount,
    };
}
