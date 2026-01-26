"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const DRAFT_STORAGE_KEY = "spritz_chat_drafts";
const DRAFT_EXPIRY_HOURS = 24; // Drafts expire after 24 hours

type DraftData = {
    text: string;
    replyToId?: string;
    replyToPreview?: string;
    savedAt: number;
};

type DraftsStore = Record<string, DraftData>;

// Get all drafts from localStorage
function getDrafts(): DraftsStore {
    if (typeof window === "undefined") return {};
    
    try {
        const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (!stored) return {};
        
        const drafts: DraftsStore = JSON.parse(stored);
        const now = Date.now();
        const expiryMs = DRAFT_EXPIRY_HOURS * 60 * 60 * 1000;
        
        // Filter out expired drafts
        const validDrafts: DraftsStore = {};
        for (const [key, draft] of Object.entries(drafts)) {
            if (now - draft.savedAt < expiryMs) {
                validDrafts[key] = draft;
            }
        }
        
        // Save back if we removed any
        if (Object.keys(validDrafts).length !== Object.keys(drafts).length) {
            localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(validDrafts));
        }
        
        return validDrafts;
    } catch {
        return {};
    }
}

// Save drafts to localStorage
function saveDrafts(drafts: DraftsStore) {
    if (typeof window === "undefined") return;
    
    try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
    } catch (e) {
        console.warn("[Drafts] Failed to save:", e);
    }
}

// Generate a unique key for a conversation
function getConversationKey(
    type: "dm" | "group" | "channel" | "alpha" | "room",
    id: string,
    userAddress?: string
): string {
    const normalizedId = id.toLowerCase();
    const prefix = userAddress ? userAddress.toLowerCase().slice(0, 8) : "";
    return `${prefix}_${type}_${normalizedId}`;
}

export function useDraftMessages(
    conversationType: "dm" | "group" | "channel" | "alpha" | "room",
    conversationId: string,
    userAddress?: string
) {
    const [draft, setDraft] = useState<DraftData | null>(null);
    const key = getConversationKey(conversationType, conversationId, userAddress);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastSavedTextRef = useRef<string>("");

    // Load draft on mount
    useEffect(() => {
        const drafts = getDrafts();
        const existingDraft = drafts[key];
        
        if (existingDraft && existingDraft.text) {
            setDraft(existingDraft);
            lastSavedTextRef.current = existingDraft.text;
        }
    }, [key]);

    // Save draft (debounced)
    const saveDraft = useCallback((
        text: string,
        replyToId?: string,
        replyToPreview?: string
    ) => {
        // Clear existing timeout
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        // Debounce saves to avoid excessive writes
        saveTimeoutRef.current = setTimeout(() => {
            const trimmedText = text.trim();
            
            // Don't save empty drafts
            if (!trimmedText && !replyToId) {
                // Remove draft if empty
                const drafts = getDrafts();
                delete drafts[key];
                saveDrafts(drafts);
                setDraft(null);
                lastSavedTextRef.current = "";
                return;
            }

            // Don't save if nothing changed
            if (trimmedText === lastSavedTextRef.current) {
                return;
            }

            const draftData: DraftData = {
                text: trimmedText,
                replyToId,
                replyToPreview,
                savedAt: Date.now(),
            };

            const drafts = getDrafts();
            drafts[key] = draftData;
            saveDrafts(drafts);
            setDraft(draftData);
            lastSavedTextRef.current = trimmedText;
        }, 500); // 500ms debounce
    }, [key]);

    // Clear draft (call after sending)
    const clearDraft = useCallback(() => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        
        const drafts = getDrafts();
        delete drafts[key];
        saveDrafts(drafts);
        setDraft(null);
        lastSavedTextRef.current = "";
    }, [key]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    return {
        draft,
        saveDraft,
        clearDraft,
        hasDraft: !!draft?.text,
    };
}

// Hook to get draft count for display in chat list
export function useDraftCount(userAddress?: string): number {
    const [count, setCount] = useState(0);

    useEffect(() => {
        const drafts = getDrafts();
        const prefix = userAddress ? userAddress.toLowerCase().slice(0, 8) : "";
        
        const userDrafts = Object.entries(drafts).filter(([key, draft]) => 
            key.startsWith(prefix) && draft.text
        );
        
        setCount(userDrafts.length);
    }, [userAddress]);

    return count;
}

// Get draft indicator for a specific conversation
export function getDraftForConversation(
    conversationType: "dm" | "group" | "channel" | "alpha" | "room",
    conversationId: string,
    userAddress?: string
): string | null {
    const key = getConversationKey(conversationType, conversationId, userAddress);
    const drafts = getDrafts();
    return drafts[key]?.text || null;
}
