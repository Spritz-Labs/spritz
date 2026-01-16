"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase, isSupabaseConfigured } from "@/config/supabase";

// Default emoji folders that users can use - organized by category
export const DEFAULT_FOLDER_EMOJIS = [
    // Most Popular
    { emoji: "⭐", label: "Favorites", category: "popular" },
    { emoji: "📌", label: "Pinned", category: "popular" },
    { emoji: "🔔", label: "Important", category: "popular" },
    { emoji: "💬", label: "General", category: "popular" },
    
    // People & Social
    { emoji: "👨‍👩‍👧", label: "Family", category: "people" },
    { emoji: "❤️", label: "Close Friends", category: "people" },
    { emoji: "🤝", label: "Colleagues", category: "people" },
    { emoji: "👥", label: "Team", category: "people" },
    { emoji: "🎉", label: "Party", category: "people" },
    
    // Work & Productivity
    { emoji: "💼", label: "Work", category: "work" },
    { emoji: "📊", label: "Projects", category: "work" },
    { emoji: "💰", label: "Finance", category: "work" },
    { emoji: "🏢", label: "Business", category: "work" },
    { emoji: "📝", label: "Notes", category: "work" },
    
    // Interests
    { emoji: "🎮", label: "Gaming", category: "interests" },
    { emoji: "🎨", label: "Creative", category: "interests" },
    { emoji: "🎵", label: "Music", category: "interests" },
    { emoji: "📚", label: "Learning", category: "interests" },
    { emoji: "🏋️", label: "Fitness", category: "interests" },
    { emoji: "✈️", label: "Travel", category: "interests" },
    { emoji: "🍔", label: "Food", category: "interests" },
    
    // Tech & Crypto
    { emoji: "🤖", label: "Bots", category: "tech" },
    { emoji: "💎", label: "Crypto", category: "tech" },
    { emoji: "🔗", label: "Web3", category: "tech" },
    { emoji: "⚡", label: "Tech", category: "tech" },
    { emoji: "🛠️", label: "Dev", category: "tech" },
    
    // Community
    { emoji: "🌍", label: "Community", category: "community" },
    { emoji: "🏠", label: "Local", category: "community" },
    { emoji: "🎯", label: "DAOs", category: "community" },
    { emoji: "🔥", label: "Hot", category: "community" },
];

// Category labels for the folder picker
export const FOLDER_CATEGORIES = [
    { id: "popular", label: "Popular" },
    { id: "people", label: "People" },
    { id: "work", label: "Work" },
    { id: "interests", label: "Interests" },
    { id: "tech", label: "Tech & Crypto" },
    { id: "community", label: "Community" },
];

export type ChatFolder = {
    emoji: string;
    label: string;
    chatIds: string[]; // Chat IDs assigned to this folder
};

export type ChatFolderAssignment = {
    chatId: string;
    chatType: "dm" | "group" | "channel" | "global";
    folderEmoji: string | null;
};

const STORAGE_KEY = "spritz_chat_folders";
const ASSIGNMENTS_KEY = "spritz_chat_folder_assignments";

export function useChatFolders(userAddress: string | null) {
    // Active folders the user has created/enabled
    const [folders, setFolders] = useState<ChatFolder[]>([]);
    // Assignments mapping chatId -> folderEmoji
    const [assignments, setAssignments] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const storedFolders = localStorage.getItem(STORAGE_KEY);
            const storedAssignments = localStorage.getItem(ASSIGNMENTS_KEY);
            
            if (storedFolders) {
                setFolders(JSON.parse(storedFolders));
            }
            if (storedAssignments) {
                setAssignments(JSON.parse(storedAssignments));
            }
        } catch (e) {
            console.warn("[ChatFolders] Failed to load from localStorage:", e);
        }
        setIsLoading(false);
    }, []);

    // Save to localStorage when changed
    useEffect(() => {
        if (!isLoading) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(folders));
            localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(assignments));
        }
    }, [folders, assignments, isLoading]);

    // Add a new folder
    const addFolder = useCallback((emoji: string, label: string) => {
        setFolders(prev => {
            // Don't add if already exists
            if (prev.some(f => f.emoji === emoji)) {
                return prev;
            }
            return [...prev, { emoji, label, chatIds: [] }];
        });
    }, []);

    // Remove a folder
    const removeFolder = useCallback((emoji: string) => {
        setFolders(prev => prev.filter(f => f.emoji !== emoji));
        // Also remove assignments to this folder
        setAssignments(prev => {
            const updated = { ...prev };
            Object.keys(updated).forEach(key => {
                if (updated[key] === emoji) {
                    delete updated[key];
                }
            });
            return updated;
        });
    }, []);

    // Assign a chat to a folder
    const assignChat = useCallback((chatId: string, folderEmoji: string | null) => {
        setAssignments(prev => {
            if (folderEmoji === null) {
                const updated = { ...prev };
                delete updated[chatId];
                return updated;
            }
            return { ...prev, [chatId]: folderEmoji };
        });
    }, []);

    // Get folder for a chat
    const getChatFolder = useCallback((chatId: string): string | null => {
        return assignments[chatId] || null;
    }, [assignments]);

    // Get all chats in a folder
    const getChatsInFolder = useCallback((folderEmoji: string): string[] => {
        return Object.entries(assignments)
            .filter(([_, emoji]) => emoji === folderEmoji)
            .map(([chatId, _]) => chatId);
    }, [assignments]);

    // Get folders that have been used (have at least one chat assigned)
    const activeFolders = useMemo(() => {
        const usedEmojis = new Set(Object.values(assignments));
        return folders.filter(f => usedEmojis.has(f.emoji));
    }, [folders, assignments]);

    // Get all folders including defaults that aren't active yet
    const allAvailableFolders = useMemo(() => {
        const existing = new Set(folders.map(f => f.emoji));
        const available = DEFAULT_FOLDER_EMOJIS.filter(f => !existing.has(f.emoji));
        return [...folders, ...available];
    }, [folders]);

    return {
        folders,
        activeFolders,
        allAvailableFolders,
        assignments,
        isLoading,
        addFolder,
        removeFolder,
        assignChat,
        getChatFolder,
        getChatsInFolder,
    };
}
