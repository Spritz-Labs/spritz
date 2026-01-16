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
    const [isSyncing, setIsSyncing] = useState(false);

    // Load from Supabase (or localStorage as fallback)
    useEffect(() => {
        const loadData = async () => {
            if (!userAddress) {
                setIsLoading(false);
                return;
            }

            const addressLower = userAddress.toLowerCase();

            // Try to load from Supabase first
            if (isSupabaseConfigured && supabase) {
                try {
                    // Fetch folders
                    const { data: foldersData, error: foldersError } = await supabase
                        .from("shout_chat_folders")
                        .select("*")
                        .eq("user_address", addressLower)
                        .order("sort_order", { ascending: true });

                    if (foldersError) {
                        console.warn("[ChatFolders] Failed to load folders from Supabase:", foldersError);
                    } else if (foldersData) {
                        const loadedFolders: ChatFolder[] = foldersData.map(f => ({
                            emoji: f.emoji,
                            label: f.label,
                            chatIds: [],
                        }));
                        setFolders(loadedFolders);
                    }

                    // Fetch assignments
                    const { data: assignmentsData, error: assignmentsError } = await supabase
                        .from("shout_chat_folder_assignments")
                        .select("*")
                        .eq("user_address", addressLower);

                    if (assignmentsError) {
                        console.warn("[ChatFolders] Failed to load assignments from Supabase:", assignmentsError);
                    } else if (assignmentsData) {
                        const loadedAssignments: Record<string, string> = {};
                        assignmentsData.forEach(a => {
                            loadedAssignments[a.chat_id] = a.folder_emoji;
                        });
                        setAssignments(loadedAssignments);
                    }

                    setIsLoading(false);
                    return;
                } catch (err) {
                    console.warn("[ChatFolders] Supabase error, falling back to localStorage:", err);
                }
            }

            // Fallback to localStorage
            try {
                const storedFolders = localStorage.getItem(`${STORAGE_KEY}_${addressLower}`);
                const storedAssignments = localStorage.getItem(`${ASSIGNMENTS_KEY}_${addressLower}`);
                
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
        };

        loadData();
    }, [userAddress]);

    // Save to localStorage as backup whenever data changes
    useEffect(() => {
        if (!isLoading && userAddress) {
            const addressLower = userAddress.toLowerCase();
            localStorage.setItem(`${STORAGE_KEY}_${addressLower}`, JSON.stringify(folders));
            localStorage.setItem(`${ASSIGNMENTS_KEY}_${addressLower}`, JSON.stringify(assignments));
        }
    }, [folders, assignments, isLoading, userAddress]);

    // Add a new folder
    const addFolder = useCallback(async (emoji: string, label: string) => {
        if (!userAddress) return;
        
        const addressLower = userAddress.toLowerCase();
        
        // Check if already exists
        if (folders.some(f => f.emoji === emoji)) {
            return;
        }
        
        // Optimistic update
        const newFolder: ChatFolder = { emoji, label, chatIds: [] };
        setFolders(prev => [...prev, newFolder]);
        
        // Sync to Supabase
        if (isSupabaseConfigured && supabase) {
            try {
                const { error } = await supabase
                    .from("shout_chat_folders")
                    .upsert({
                        user_address: addressLower,
                        emoji,
                        label,
                        sort_order: folders.length,
                    }, {
                        onConflict: "user_address,emoji",
                    });
                
                if (error) {
                    console.error("[ChatFolders] Failed to save folder:", error);
                }
            } catch (err) {
                console.error("[ChatFolders] Failed to save folder:", err);
            }
        }
    }, [userAddress, folders]);

    // Remove a folder
    const removeFolder = useCallback(async (emoji: string) => {
        if (!userAddress) return;
        
        const addressLower = userAddress.toLowerCase();
        
        // Optimistic update
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
        
        // Sync to Supabase
        if (isSupabaseConfigured && supabase) {
            try {
                // Delete the folder
                await supabase
                    .from("shout_chat_folders")
                    .delete()
                    .eq("user_address", addressLower)
                    .eq("emoji", emoji);
                
                // Delete assignments to this folder
                await supabase
                    .from("shout_chat_folder_assignments")
                    .delete()
                    .eq("user_address", addressLower)
                    .eq("folder_emoji", emoji);
            } catch (err) {
                console.error("[ChatFolders] Failed to delete folder:", err);
            }
        }
    }, [userAddress]);

    // Assign a chat to a folder
    const assignChat = useCallback(async (chatId: string, folderEmoji: string | null, chatType: "dm" | "group" | "channel" | "global" = "dm") => {
        if (!userAddress) return;
        
        const addressLower = userAddress.toLowerCase();
        
        // Optimistic update
        setAssignments(prev => {
            if (folderEmoji === null) {
                const updated = { ...prev };
                delete updated[chatId];
                return updated;
            }
            return { ...prev, [chatId]: folderEmoji };
        });
        
        // Sync to Supabase
        if (isSupabaseConfigured && supabase) {
            try {
                if (folderEmoji === null) {
                    // Remove assignment
                    await supabase
                        .from("shout_chat_folder_assignments")
                        .delete()
                        .eq("user_address", addressLower)
                        .eq("chat_id", chatId);
                } else {
                    // Upsert assignment
                    await supabase
                        .from("shout_chat_folder_assignments")
                        .upsert({
                            user_address: addressLower,
                            chat_id: chatId,
                            chat_type: chatType,
                            folder_emoji: folderEmoji,
                        }, {
                            onConflict: "user_address,chat_id",
                        });
                }
            } catch (err) {
                console.error("[ChatFolders] Failed to save assignment:", err);
            }
        }
    }, [userAddress]);

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
        // Include all created folders, plus mark which ones have chats
        return folders.map(f => ({
            ...f,
            chatIds: Object.entries(assignments)
                .filter(([_, emoji]) => emoji === f.emoji)
                .map(([chatId, _]) => chatId),
        }));
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
        isSyncing,
        addFolder,
        removeFolder,
        assignChat,
        getChatFolder,
        getChatsInFolder,
    };
}
