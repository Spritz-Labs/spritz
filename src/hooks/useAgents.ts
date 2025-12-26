"use client";

import { useState, useEffect, useCallback } from "react";

export type Agent = {
    id: string;
    owner_address: string;
    name: string;
    personality: string | null;
    system_instructions: string | null;
    model: string;
    avatar_emoji: string;
    visibility: "private" | "friends" | "public";
    web_search_enabled: boolean;
    use_knowledge_base: boolean;
    message_count: number;
    created_at: string;
    updated_at: string;
};

export type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    created_at: string;
};

export function useAgents(userAddress: string | null) {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch user's agents
    const fetchAgents = useCallback(async () => {
        if (!userAddress) {
            setAgents([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/agents?userAddress=${encodeURIComponent(userAddress)}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to fetch agents");
            }

            setAgents(data.agents || []);
        } catch (err) {
            console.error("[useAgents] Error:", err);
            setError(err instanceof Error ? err.message : "Failed to fetch agents");
        } finally {
            setIsLoading(false);
        }
    }, [userAddress]);

    // Create a new agent
    const createAgent = useCallback(async (
        name: string,
        personality?: string,
        avatarEmoji?: string,
        visibility?: "private" | "friends" | "public"
    ): Promise<Agent | null> => {
        if (!userAddress) return null;

        try {
            const res = await fetch("/api/agents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userAddress,
                    name,
                    personality,
                    avatarEmoji,
                    visibility,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to create agent");
            }

            // Refresh agents list
            await fetchAgents();

            return data.agent;
        } catch (err) {
            console.error("[useAgents] Error creating agent:", err);
            throw err;
        }
    }, [userAddress, fetchAgents]);

    // Update an agent
    const updateAgent = useCallback(async (
        agentId: string,
        updates: {
            name?: string;
            personality?: string;
            avatarEmoji?: string;
            visibility?: "private" | "friends" | "public";
            webSearchEnabled?: boolean;
            useKnowledgeBase?: boolean;
        }
    ): Promise<Agent | null> => {
        if (!userAddress) return null;

        try {
            const res = await fetch(`/api/agents/${agentId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userAddress,
                    ...updates,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to update agent");
            }

            // Refresh agents list
            await fetchAgents();

            return data.agent;
        } catch (err) {
            console.error("[useAgents] Error updating agent:", err);
            throw err;
        }
    }, [userAddress, fetchAgents]);

    // Delete an agent
    const deleteAgent = useCallback(async (agentId: string): Promise<boolean> => {
        if (!userAddress) return false;

        try {
            const res = await fetch(
                `/api/agents/${agentId}?userAddress=${encodeURIComponent(userAddress)}`,
                { method: "DELETE" }
            );

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to delete agent");
            }

            // Refresh agents list
            await fetchAgents();

            return true;
        } catch (err) {
            console.error("[useAgents] Error deleting agent:", err);
            throw err;
        }
    }, [userAddress, fetchAgents]);

    // Load agents on mount
    useEffect(() => {
        fetchAgents();
    }, [fetchAgents]);

    return {
        agents,
        isLoading,
        error,
        fetchAgents,
        createAgent,
        updateAgent,
        deleteAgent,
    };
}

// Separate hook for agent chat
export function useAgentChat(userAddress: string | null, agentId: string | null) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch chat history
    const fetchHistory = useCallback(async () => {
        if (!userAddress || !agentId) {
            setMessages([]);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch(
                `/api/agents/${agentId}/chat?userAddress=${encodeURIComponent(userAddress)}`
            );
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to fetch chat history");
            }

            setMessages(data.chats || []);
        } catch (err) {
            console.error("[useAgentChat] Error:", err);
            setError(err instanceof Error ? err.message : "Failed to fetch chat history");
        } finally {
            setIsLoading(false);
        }
    }, [userAddress, agentId]);

    // Send a message
    const sendMessage = useCallback(async (message: string): Promise<string | null> => {
        if (!userAddress || !agentId || !message.trim()) return null;

        setIsSending(true);
        setError(null);

        // Optimistically add user message
        const tempUserMessage: ChatMessage = {
            id: `temp-${Date.now()}`,
            role: "user",
            content: message,
            created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, tempUserMessage]);

        try {
            const res = await fetch(`/api/agents/${agentId}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userAddress, message }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to send message");
            }

            // Add assistant response
            const assistantMessage: ChatMessage = {
                id: `resp-${Date.now()}`,
                role: "assistant",
                content: data.message,
                created_at: new Date().toISOString(),
            };
            setMessages(prev => [...prev, assistantMessage]);

            return data.message;
        } catch (err) {
            console.error("[useAgentChat] Error:", err);
            setError(err instanceof Error ? err.message : "Failed to send message");
            // Remove optimistic message on error
            setMessages(prev => prev.filter(m => m.id !== tempUserMessage.id));
            return null;
        } finally {
            setIsSending(false);
        }
    }, [userAddress, agentId]);

    // Clear chat history
    const clearHistory = useCallback(async (): Promise<boolean> => {
        if (!userAddress || !agentId) return false;

        try {
            const res = await fetch(
                `/api/agents/${agentId}/chat?userAddress=${encodeURIComponent(userAddress)}`,
                { method: "DELETE" }
            );

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to clear history");
            }

            setMessages([]);
            return true;
        } catch (err) {
            console.error("[useAgentChat] Error:", err);
            throw err;
        }
    }, [userAddress, agentId]);

    // Load history when agent changes
    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    return {
        messages,
        isLoading,
        isSending,
        error,
        sendMessage,
        clearHistory,
        fetchHistory,
    };
}

// Types for knowledge items
export type AgentKnowledge = {
    id: string;
    agent_id: string;
    title: string;
    url: string;
    content_type: string;
    status: "pending" | "processing" | "indexed" | "failed";
    error_message: string | null;
    chunk_count: number;
    created_at: string;
    indexed_at: string | null;
};

// Hook for managing agent knowledge base
export function useAgentKnowledge(userAddress: string | null, agentId: string | null) {
    const [knowledgeItems, setKnowledgeItems] = useState<AgentKnowledge[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch knowledge items
    const fetchKnowledge = useCallback(async () => {
        if (!userAddress || !agentId) {
            setKnowledgeItems([]);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch(
                `/api/agents/${agentId}/knowledge?userAddress=${encodeURIComponent(userAddress)}`
            );
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to fetch knowledge");
            }

            setKnowledgeItems(data.items || []);
        } catch (err) {
            console.error("[useAgentKnowledge] Error:", err);
            setError(err instanceof Error ? err.message : "Failed to fetch knowledge");
        } finally {
            setIsLoading(false);
        }
    }, [userAddress, agentId]);

    // Add a knowledge item
    const addKnowledgeItem = useCallback(async (
        title: string,
        url: string,
        contentType?: string
    ): Promise<AgentKnowledge | null> => {
        if (!userAddress || !agentId) return null;

        try {
            const res = await fetch(`/api/agents/${agentId}/knowledge`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userAddress, title, url, contentType }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to add knowledge item");
            }

            await fetchKnowledge();
            return data.item;
        } catch (err) {
            console.error("[useAgentKnowledge] Error:", err);
            throw err;
        }
    }, [userAddress, agentId, fetchKnowledge]);

    // Delete a knowledge item
    const deleteKnowledgeItem = useCallback(async (knowledgeId: string): Promise<boolean> => {
        if (!userAddress || !agentId) return false;

        try {
            const res = await fetch(
                `/api/agents/${agentId}/knowledge?userAddress=${encodeURIComponent(userAddress)}&knowledgeId=${encodeURIComponent(knowledgeId)}`,
                { method: "DELETE" }
            );

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to delete knowledge item");
            }

            await fetchKnowledge();
            return true;
        } catch (err) {
            console.error("[useAgentKnowledge] Error:", err);
            throw err;
        }
    }, [userAddress, agentId, fetchKnowledge]);

    // Index a knowledge item (generate embeddings)
    const indexKnowledgeItem = useCallback(async (knowledgeId: string): Promise<boolean> => {
        if (!userAddress || !agentId) return false;

        // Update local state to show processing
        setKnowledgeItems(prev => prev.map(item => 
            item.id === knowledgeId ? { ...item, status: "processing" as const } : item
        ));

        try {
            const res = await fetch(`/api/agents/${agentId}/knowledge/index`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userAddress, knowledgeId }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to index knowledge item");
            }

            // Refresh to get updated status
            await fetchKnowledge();
            return true;
        } catch (err) {
            console.error("[useAgentKnowledge] Error indexing:", err);
            // Refresh to get actual status
            await fetchKnowledge();
            throw err;
        }
    }, [userAddress, agentId, fetchKnowledge]);

    // Load knowledge when agent changes
    useEffect(() => {
        fetchKnowledge();
    }, [fetchKnowledge]);

    return {
        knowledgeItems,
        isLoading,
        error,
        fetchKnowledge,
        addKnowledgeItem,
        deleteKnowledgeItem,
        indexKnowledgeItem,
    };
}

export default useAgents;

