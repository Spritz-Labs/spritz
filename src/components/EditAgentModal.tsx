"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Agent, MCPServer, APITool } from "@/hooks/useAgents";

const AGENT_EMOJIS = [
    "🤖", "🧠", "💡", "🎯", "🚀", "⚡", "🔮", "🎨",
    "📚", "💼", "🔬", "🎭", "🌟", "🦾", "🤓", "🧙",
];

// Pre-configured MCP servers users can choose from
const POPULAR_MCP_SERVERS = [
    { id: "filesystem", name: "File System", url: "npx -y @modelcontextprotocol/server-filesystem", description: "Read/write local files", requiresApiKey: false },
    { id: "github", name: "GitHub", url: "npx -y @modelcontextprotocol/server-github", description: "GitHub repository access", requiresApiKey: true },
    { id: "slack", name: "Slack", url: "npx -y @modelcontextprotocol/server-slack", description: "Slack workspace integration", requiresApiKey: true },
    { id: "postgres", name: "PostgreSQL", url: "npx -y @modelcontextprotocol/server-postgres", description: "Database queries", requiresApiKey: true },
    { id: "brave-search", name: "Brave Search", url: "npx -y @modelcontextprotocol/server-brave-search", description: "Web search via Brave", requiresApiKey: true },
    { id: "memory", name: "Memory", url: "npx -y @modelcontextprotocol/server-memory", description: "Persistent memory storage", requiresApiKey: false },
];

// Popular tag suggestions
const TAG_SUGGESTIONS = [
    "coding", "writing", "research", "math", "creative", "productivity",
    "learning", "fitness", "finance", "health", "gaming", "music",
    "art", "science", "business", "education", "assistant", "fun",
];

interface EditAgentModalProps {
    isOpen: boolean;
    onClose: () => void;
    agent: Agent | null;
    onSave: (agentId: string, updates: {
        name?: string;
        personality?: string;
        systemInstructions?: string;
        avatarEmoji?: string;
        avatarUrl?: string | null;
        visibility?: "private" | "friends" | "public" | "official";
        tags?: string[];
        suggestedQuestions?: string[];
        webSearchEnabled?: boolean;
        useKnowledgeBase?: boolean;
        mcpEnabled?: boolean;
        apiEnabled?: boolean;
        schedulingEnabled?: boolean;
        publicAccessEnabled?: boolean;
        x402Enabled?: boolean;
        x402PriceCents?: number;
        x402Network?: "base" | "base-sepolia";
        x402WalletAddress?: string;
        x402PricingMode?: "global" | "per_tool";
        mcpServers?: MCPServer[];
        apiTools?: APITool[];
    }) => Promise<void>;
    userAddress?: string;
    isAdmin?: boolean;
}

type TabType = "general" | "capabilities" | "mcp" | "api";

export function EditAgentModal({ isOpen, onClose, agent, onSave, userAddress, isAdmin = false }: EditAgentModalProps) {
    const [activeTab, setActiveTab] = useState<TabType>("general");
    
    // General settings
    const [name, setName] = useState("");
    const [personality, setPersonality] = useState("");
    const [systemInstructions, setSystemInstructions] = useState("");
    const [emoji, setEmoji] = useState("🤖");
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const [visibility, setVisibility] = useState<"private" | "friends" | "public" | "official">("private");
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState("");
    const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>(["", "", "", ""]);
    
    // Channel presence (for Official agents)
    const [availableChannels, setAvailableChannels] = useState<Array<{id: string; name: string; emoji: string}>>([]);
    const [channelMemberships, setChannelMemberships] = useState<{global: boolean; channels: string[]}>({ global: false, channels: [] });
    const [isSavingChannels, setIsSavingChannels] = useState(false);
    
    // Tag helpers
    const addTag = (tag: string) => {
        const normalizedTag = tag.trim().toLowerCase();
        if (normalizedTag && !tags.includes(normalizedTag) && tags.length < 5) {
            setTags([...tags, normalizedTag]);
            setTagInput("");
        }
    };

    const removeTag = (tagToRemove: string) => {
        setTags(tags.filter(t => t !== tagToRemove));
    };

    const handleTagKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag(tagInput);
        } else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
            setTags(tags.slice(0, -1));
        }
    };

    // Resize image for avatar (ensure high quality)
    // Increased to 1024px and 95% quality for sharper profile photos
    const resizeImageForAvatar = (file: File, maxSize: number = 1024): Promise<Blob> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            img.onload = () => {
                if (!ctx) {
                    reject(new Error('Could not get canvas context'));
                    return;
                }
                
                // Calculate dimensions (crop to square, then resize)
                const size = Math.min(img.width, img.height);
                const sx = (img.width - size) / 2;
                const sy = (img.height - size) / 2;
                
                // Set canvas to target size (use original size if smaller than max)
                const targetSize = Math.min(size, maxSize);
                canvas.width = targetSize;
                canvas.height = targetSize;
                
                // Enable high-quality image smoothing
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                
                // Draw cropped and resized image
                ctx.drawImage(img, sx, sy, size, size, 0, 0, targetSize, targetSize);
                
                // Convert to blob with high quality
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Failed to create image blob'));
                        }
                    },
                    'image/jpeg',
                    0.95 // Higher quality (was 0.9)
                );
            };
            
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = URL.createObjectURL(file);
        });
    };
    
    // Capabilities
    const [webSearchEnabled, setWebSearchEnabled] = useState(true);
    const [useKnowledgeBase, setUseKnowledgeBase] = useState(true);
    const [mcpEnabled, setMcpEnabled] = useState(true);
    const [apiEnabled, setApiEnabled] = useState(true);
    const [schedulingEnabled, setSchedulingEnabled] = useState(false);
    const [publicAccessEnabled, setPublicAccessEnabled] = useState(true); // For Official agents
    const [x402Enabled, setX402Enabled] = useState(false);
    const [x402PriceCents, setX402PriceCents] = useState(1);
    const [x402Network, setX402Network] = useState<"base" | "base-sepolia">("base");
    const [x402WalletAddress, setX402WalletAddress] = useState("");
    const [x402PricingMode, setX402PricingMode] = useState<"global" | "per_tool">("global");
    
    // MCP Servers
    const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
    const [showAddMcp, setShowAddMcp] = useState(false);
    const [newMcpName, setNewMcpName] = useState("");
    const [newMcpUrl, setNewMcpUrl] = useState("");
    const [newMcpApiKey, setNewMcpApiKey] = useState("");
    const [newMcpDescription, setNewMcpDescription] = useState("");
    const [newMcpHeaders, setNewMcpHeaders] = useState<Record<string, string>>({});
    
    // API Tools
    const [apiTools, setApiTools] = useState<APITool[]>([]);
    const [showAddApi, setShowAddApi] = useState(false);
    const [newApiName, setNewApiName] = useState("");
    const [newApiUrl, setNewApiUrl] = useState("");
    const [newApiMethod, setNewApiMethod] = useState<"GET" | "POST" | "PUT" | "DELETE">("GET");
    const [newApiKey, setNewApiKey] = useState("");
    const [newApiDescription, setNewApiDescription] = useState("");
    const [newApiHeaders, setNewApiHeaders] = useState<Record<string, string>>({});
    
    // API Key visibility toggles
    const [visibleApiKeys, setVisibleApiKeys] = useState<Set<string>>(new Set());
    
    const toggleApiKeyVisibility = (id: string) => {
        setVisibleApiKeys(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };
    
    // UI state
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showEmbedCode, setShowEmbedCode] = useState(false);
    const [embedData, setEmbedData] = useState<{ code: { sdk: string }; endpoints: { chat: string } } | null>(null);

    // Track original values to detect changes
    const [originalValues, setOriginalValues] = useState<{
        name: string;
        personality: string;
        systemInstructions: string;
        emoji: string;
        avatarUrl: string | null;
        visibility: "private" | "friends" | "public" | "official";
        tags: string[];
        webSearchEnabled: boolean;
        useKnowledgeBase: boolean;
        mcpEnabled: boolean;
        apiEnabled: boolean;
        schedulingEnabled: boolean;
        x402Enabled: boolean;
        x402PriceCents: number;
        x402Network: "base" | "base-sepolia";
        x402WalletAddress: string;
        x402PricingMode: "global" | "per_tool";
        mcpServers: MCPServer[];
        apiTools: APITool[];
    } | null>(null);

    // Load agent data when modal opens or agent changes
    useEffect(() => {
        if (agent && isOpen) {
            const agentName = agent.name;
            const agentPersonality = agent.personality || "";
            const agentSystemInstructions = agent.system_instructions || "";
            const agentEmoji = agent.avatar_emoji || "🤖";
            const agentAvatarUrl = agent.avatar_url || null;
            const agentVisibility = agent.visibility;
            const agentTags = agent.tags || [];
            const agentWebSearch = agent.web_search_enabled !== false;
            const agentKnowledgeBase = agent.use_knowledge_base !== false;
            const agentMcp = agent.mcp_enabled !== false;
            const agentApi = agent.api_enabled !== false;
            const agentScheduling = agent.scheduling_enabled || false;
            const agentPublicAccess = agent.public_access_enabled !== false; // Defaults to true
            const agentX402 = agent.x402_enabled || false;
            const agentX402Price = agent.x402_price_cents || 1;
            const agentX402Network = agent.x402_network || "base";
            const agentX402Wallet = agent.x402_wallet_address || userAddress || "";
            const agentX402Mode = agent.x402_pricing_mode || "global";
            const agentMcpServers = agent.mcp_servers || [];
            const agentApiTools = agent.api_tools || [];
            const agentSuggestedQuestions = agent.suggested_questions || [];

            // Set all state values
            setName(agentName);
            setPersonality(agentPersonality);
            setSystemInstructions(agentSystemInstructions);
            setEmoji(agentEmoji);
            setAvatarUrl(agentAvatarUrl);
            setVisibility(agentVisibility);
            setTags(agentTags);
            setTagInput("");
            // Pad suggested questions to always have 4 slots
            setSuggestedQuestions([
                agentSuggestedQuestions[0] || "",
                agentSuggestedQuestions[1] || "",
                agentSuggestedQuestions[2] || "",
                agentSuggestedQuestions[3] || "",
            ]);
            setWebSearchEnabled(agentWebSearch);
            setUseKnowledgeBase(agentKnowledgeBase);
            setMcpEnabled(agentMcp);
            setApiEnabled(agentApi);
            setSchedulingEnabled(agentScheduling);
            setPublicAccessEnabled(agentPublicAccess);
            setX402Enabled(agentX402);
            setX402PriceCents(agentX402Price);
            setX402Network(agentX402Network);
            setX402WalletAddress(agentX402Wallet);
            setX402PricingMode(agentX402Mode);
            setMcpServers(agentMcpServers);
            setApiTools(agentApiTools);
            setError(null);
            setShowEmbedCode(false);
            setActiveTab("general");

            // Store original values for change detection
            setOriginalValues({
                name: agentName,
                personality: agentPersonality,
                systemInstructions: agentSystemInstructions,
                emoji: agentEmoji,
                avatarUrl: agentAvatarUrl,
                visibility: agentVisibility,
                tags: agentTags,
                webSearchEnabled: agentWebSearch,
                useKnowledgeBase: agentKnowledgeBase,
                mcpEnabled: agentMcp,
                apiEnabled: agentApi,
                schedulingEnabled: agentScheduling,
                x402Enabled: agentX402,
                x402PriceCents: agentX402Price,
                x402Network: agentX402Network,
                x402WalletAddress: agentX402Wallet,
                x402PricingMode: agentX402Mode,
                mcpServers: agentMcpServers,
                apiTools: agentApiTools,
            });
        } else if (!isOpen) {
            // Reset when modal closes
            setOriginalValues(null);
        }
    }, [agent?.id, isOpen, userAddress]); // Use agent.id to ensure reset when switching agents
    
    // Fetch available channels and agent's channel memberships (for Official agents)
    useEffect(() => {
        if (!isOpen || !agent?.id || visibility !== "official") return;
        
        const agentId = agent.id;
        
        // Fetch available public channels
        async function fetchChannels() {
            try {
                const res = await fetch("/api/channels");
                if (res.ok) {
                    const data = await res.json();
                    setAvailableChannels(data.channels || []);
                }
            } catch (err) {
                console.error("[EditAgent] Error fetching channels:", err);
            }
        }
        
        // Fetch agent's current channel memberships
        async function fetchMemberships() {
            try {
                const res = await fetch(`/api/agents/${agentId}/channels`);
                if (res.ok) {
                    const data = await res.json();
                    const memberships = data.memberships || [];
                    const isInGlobal = memberships.some((m: { channel_type: string }) => m.channel_type === "global");
                    const channelIds = memberships
                        .filter((m: { channel_type: string }) => m.channel_type === "channel")
                        .map((m: { channel_id: string }) => m.channel_id);
                    setChannelMemberships({ global: isInGlobal, channels: channelIds });
                }
            } catch (err) {
                console.error("[EditAgent] Error fetching memberships:", err);
            }
        }
        
        fetchChannels();
        fetchMemberships();
    }, [isOpen, agent?.id, visibility]);
    
    // Handle channel membership toggle
    const toggleChannelMembership = async (channelType: "global" | "channel", channelId?: string) => {
        if (!agent || !userAddress) return;
        
        setIsSavingChannels(true);
        try {
            const isCurrentlyIn = channelType === "global" 
                ? channelMemberships.global 
                : channelMemberships.channels.includes(channelId!);
            
            if (isCurrentlyIn) {
                // Remove from channel
                const params = new URLSearchParams({
                    userAddress,
                    channelType,
                    ...(channelId && { channelId }),
                });
                await fetch(`/api/agents/${agent.id}/channels?${params}`, { method: "DELETE" });
                
                setChannelMemberships(prev => ({
                    global: channelType === "global" ? false : prev.global,
                    channels: channelType === "channel" 
                        ? prev.channels.filter(id => id !== channelId) 
                        : prev.channels,
                }));
            } else {
                // Add to channel
                await fetch(`/api/agents/${agent.id}/channels`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userAddress,
                        channelType,
                        channelId: channelType === "channel" ? channelId : undefined,
                    }),
                });
                
                setChannelMemberships(prev => ({
                    global: channelType === "global" ? true : prev.global,
                    channels: channelType === "channel" && channelId
                        ? [...prev.channels, channelId] 
                        : prev.channels,
                }));
            }
        } catch (err) {
            console.error("[EditAgent] Error toggling channel membership:", err);
        } finally {
            setIsSavingChannels(false);
        }
    };

    // Fetch embed code
    const fetchEmbedCode = async () => {
        if (!agent || !userAddress) return;
        try {
            const res = await fetch(`/api/agents/${agent.id}/embed?userAddress=${encodeURIComponent(userAddress)}`);
            if (res.ok) {
                const data = await res.json();
                setEmbedData(data);
                setShowEmbedCode(true);
            }
        } catch {
            // Ignore errors
        }
    };

    // Add MCP server
    const addMcpServer = (preset?: typeof POPULAR_MCP_SERVERS[0]) => {
        const newServer: MCPServer = {
            id: preset?.id || `custom-${Date.now()}`,
            name: preset?.name || newMcpName,
            url: preset?.url || newMcpUrl,
            apiKey: preset?.requiresApiKey ? "" : undefined,
            description: preset?.description || newMcpDescription || undefined,
            x402Enabled: false,
            x402PriceCents: 1,
        };
        
        if (!preset && newMcpApiKey) {
            newServer.apiKey = newMcpApiKey;
        }
        
        // Add headers if any are configured
        if (!preset && Object.keys(newMcpHeaders).length > 0) {
            // Filter out empty key-value pairs
            const validHeaders: Record<string, string> = {};
            Object.entries(newMcpHeaders).forEach(([k, v]) => {
                if (k.trim()) validHeaders[k.trim()] = v;
            });
            if (Object.keys(validHeaders).length > 0) {
                newServer.headers = validHeaders;
            }
        }
        
        setMcpServers(prev => [...prev, newServer]);
        setNewMcpName("");
        setNewMcpUrl("");
        setNewMcpApiKey("");
        setNewMcpDescription("");
        setNewMcpHeaders({});
        setShowAddMcp(false);
    };

    // Remove MCP server (using functional update to avoid stale closure)
    const removeMcpServer = (id: string) => {
        setMcpServers(prev => prev.filter(s => s.id !== id));
    };

    // Update MCP server (using functional update to avoid stale closure)
    const updateMcpServer = (id: string, updates: Partial<MCPServer>) => {
        setMcpServers(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    // Detect API type
    const [detectingApiId, setDetectingApiId] = useState<string | null>(null);
    
    const detectApiType = async (toolId: string, url: string, apiKey?: string, headers?: Record<string, string>) => {
        setDetectingApiId(toolId);
        try {
            const response = await fetch("/api/agents/detect-api", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url, apiKey, headers })
            });
            
            if (response.ok) {
                const result = await response.json();
                updateApiTool(toolId, {
                    apiType: result.apiType,
                    schema: result.schema,
                    detectedAt: result.detectedAt,
                    // Auto-set method to POST for GraphQL
                    ...(result.apiType === "graphql" ? { method: "POST" } : {})
                });
            }
        } catch (error) {
            console.error("Failed to detect API type:", error);
        } finally {
            setDetectingApiId(null);
        }
    };
    
    // Add API Tool
    const addApiTool = async () => {
        if (!newApiName || !newApiUrl) return;
        
        const toolId = `api-${Date.now()}`;
        
        const newTool: APITool = {
            id: toolId,
            name: newApiName,
            url: newApiUrl,
            method: newApiMethod,
            apiKey: newApiKey || undefined,
            description: newApiDescription || undefined,
            x402Enabled: false,
            x402PriceCents: 1,
        };
        
        // Add headers if any are configured
        const validHeaders: Record<string, string> = {};
        if (Object.keys(newApiHeaders).length > 0) {
            // Filter out empty key-value pairs
            Object.entries(newApiHeaders).forEach(([k, v]) => {
                if (k.trim()) validHeaders[k.trim()] = v;
            });
            if (Object.keys(validHeaders).length > 0) {
                newTool.headers = validHeaders;
            }
        }
        
        setApiTools(prev => [...prev, newTool]);
        setNewApiName("");
        setNewApiUrl("");
        setNewApiMethod("GET");
        setNewApiKey("");
        setNewApiDescription("");
        setNewApiHeaders({});
        setShowAddApi(false);
        
        // Auto-detect API type after adding
        detectApiType(toolId, newApiUrl, newApiKey || undefined, Object.keys(validHeaders).length > 0 ? validHeaders : undefined);
    };

    // Remove API Tool (using functional update to avoid stale closure)
    const removeApiTool = (id: string) => {
        setApiTools(prev => prev.filter(t => t.id !== id));
    };

    // Update API Tool (using functional update to avoid stale closure)
    const updateApiTool = (id: string, updates: Partial<APITool>) => {
        setApiTools(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    };

    const handleSave = async () => {
        if (!agent || !name.trim()) {
            setError("Please give your agent a name");
            return;
        }

        if (x402Enabled) {
            if (visibility !== "public") {
                setError("x402 API access requires the agent to be Public");
                return;
            }
            if (!x402WalletAddress || !x402WalletAddress.startsWith("0x")) {
                setError("Please enter a valid wallet address to receive payments");
                return;
            }
        }

        setIsSaving(true);
        setError(null);

        try {
            // Filter out empty suggested questions for Official agents
            const filteredQuestions = visibility === "official" 
                ? suggestedQuestions.filter(q => q.trim()).map(q => q.trim())
                : undefined;
            
            await onSave(agent.id, {
                name: name.trim(),
                personality: personality.trim(),
                systemInstructions: systemInstructions.trim() || undefined,
                avatarEmoji: emoji,
                avatarUrl,
                visibility,
                tags,
                suggestedQuestions: filteredQuestions,
                webSearchEnabled,
                useKnowledgeBase,
                mcpEnabled,
                apiEnabled,
                schedulingEnabled,
                publicAccessEnabled: visibility === "official" ? publicAccessEnabled : undefined,
                x402Enabled,
                x402PriceCents,
                x402Network,
                x402WalletAddress: x402WalletAddress.trim(),
                x402PricingMode,
                mcpServers,
                apiTools,
            });
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save changes");
        } finally {
            setIsSaving(false);
        }
    };

    // Check if there are unsaved changes
    const hasUnsavedChanges = originalValues && (
        name !== originalValues.name ||
        personality !== originalValues.personality ||
        emoji !== originalValues.emoji ||
        avatarUrl !== originalValues.avatarUrl ||
        visibility !== originalValues.visibility ||
        JSON.stringify(tags) !== JSON.stringify(originalValues.tags) ||
        webSearchEnabled !== originalValues.webSearchEnabled ||
        useKnowledgeBase !== originalValues.useKnowledgeBase ||
        mcpEnabled !== originalValues.mcpEnabled ||
        apiEnabled !== originalValues.apiEnabled ||
        schedulingEnabled !== originalValues.schedulingEnabled ||
        x402Enabled !== originalValues.x402Enabled ||
        x402PriceCents !== originalValues.x402PriceCents ||
        x402Network !== originalValues.x402Network ||
        x402WalletAddress !== originalValues.x402WalletAddress ||
        x402PricingMode !== originalValues.x402PricingMode ||
        JSON.stringify(mcpServers) !== JSON.stringify(originalValues.mcpServers) ||
        JSON.stringify(apiTools) !== JSON.stringify(originalValues.apiTools)
    );

    // Handle close with warning if there are unsaved changes
    const handleClose = () => {
        if (hasUnsavedChanges) {
            if (confirm("You have unsaved changes. Are you sure you want to close? All changes will be lost.")) {
                onClose();
            }
        } else {
            onClose();
        }
    };

    if (!agent) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
                    onClick={handleClose}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="bg-zinc-900 rounded-2xl p-6 max-w-lg w-full border border-zinc-800 max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl">
                                {emoji}
                            </div>
                            <div className="flex-1">
                                <h2 className="text-xl font-bold text-white">Edit Agent</h2>
                                <p className="text-sm text-zinc-400">{agent.name}</p>
                            </div>
                            <button onClick={handleClose} className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex gap-1 mb-4 bg-zinc-800 rounded-lg p-1">
                            {[
                                { id: "general" as TabType, label: "General", icon: "⚙️" },
                                { id: "capabilities" as TabType, label: "Capabilities", icon: "🔧" },
                                { id: "mcp" as TabType, label: "MCP", icon: "🔌" },
                                { id: "api" as TabType, label: "APIs", icon: "🌐" },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-1 ${
                                        activeTab === tab.id
                                            ? "bg-purple-500 text-white"
                                            : "text-zinc-400 hover:text-white"
                                    }`}
                                >
                                    <span>{tab.icon}</span>
                                    <span className="hidden sm:inline">{tab.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        {/* Tab Content */}
                        <div className="space-y-5">
                            {/* General Tab */}
                            {activeTab === "general" && (
                                <>
                                    {/* Name */}
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-2">Agent Name *</label>
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            maxLength={50}
                                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                                        />
                                    </div>

                                    {/* Avatar */}
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-2">Avatar</label>
                                        
                                        {/* Current Avatar Preview */}
                                        <div className="flex items-center gap-4 mb-3">
                                            <div className="relative">
                                                {avatarUrl ? (
                                                    <img
                                                        src={avatarUrl}
                                                        alt="Agent avatar"
                                                        className="w-16 h-16 rounded-xl object-cover border-2 border-purple-500"
                                                    />
                                                ) : (
                                                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center text-3xl border-2 border-purple-500">
                                                        {emoji}
                                                    </div>
                                                )}
                                                {isUploadingAvatar && (
                                                    <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center">
                                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div className="flex flex-col gap-2">
                                                <label className="px-3 py-1.5 text-xs bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg cursor-pointer transition-colors">
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        className="hidden"
                                                        onChange={async (e) => {
                                                            const file = e.target.files?.[0];
                                                            if (!file) return;
                                                            
                                                            if (!file.type.startsWith('image/')) {
                                                                setError('Please select an image file');
                                                                return;
                                                            }
                                                            if (file.size > 5 * 1024 * 1024) {
                                                                setError('Image must be less than 5MB');
                                                                return;
                                                            }

                                                            setIsUploadingAvatar(true);
                                                            setError(null);

                                                            try {
                                                                // Resize image for better quality (1024x1024)
                                                                const resizedBlob = await resizeImageForAvatar(file, 1024);
                                                                const resizedFile = new File([resizedBlob], 'avatar.jpg', { type: 'image/jpeg' });
                                                                
                                                                const formData = new FormData();
                                                                formData.append('file', resizedFile);

                                                                const res = await fetch('/api/upload?type=avatar', {
                                                                    method: 'POST',
                                                                    body: formData,
                                                                });

                                                                if (!res.ok) {
                                                                    const data = await res.json();
                                                                    throw new Error(data.error || 'Failed to upload');
                                                                }

                                                                const { url } = await res.json();
                                                                setAvatarUrl(url);
                                                            } catch (err) {
                                                                setError(err instanceof Error ? err.message : 'Upload failed');
                                                            } finally {
                                                                setIsUploadingAvatar(false);
                                                                e.target.value = '';
                                                            }
                                                        }}
                                                    />
                                                    {isUploadingAvatar ? 'Uploading...' : 'Upload Image'}
                                                </label>
                                                {avatarUrl && (
                                                    <button
                                                        onClick={() => setAvatarUrl(null)}
                                                        className="px-3 py-1.5 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors"
                                                    >
                                                        Remove Image
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {/* Emoji Picker (fallback when no image) */}
                                        <p className="text-xs text-zinc-500 mb-2">
                                            {avatarUrl ? 'Or choose an emoji as fallback:' : 'Or choose an emoji:'}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {AGENT_EMOJIS.map((e) => (
                                                <button
                                                    key={e}
                                                    onClick={() => setEmoji(e)}
                                                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all ${
                                                        emoji === e && !avatarUrl
                                                            ? "bg-purple-500/30 border-2 border-purple-500 scale-110"
                                                            : emoji === e
                                                            ? "bg-purple-500/20 border border-purple-500/50"
                                                            : "bg-zinc-800 border border-zinc-700 hover:border-zinc-600"
                                                    }`}
                                                >
                                                    {e}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Personality */}
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-2">Personality</label>
                                        <textarea
                                            value={personality}
                                            onChange={(e) => setPersonality(e.target.value)}
                                            maxLength={1000}
                                            rows={3}
                                            placeholder="Friendly and helpful assistant..."
                                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-none"
                                        />
                                    </div>

                                    {/* System Instructions (Advanced) */}
                                    <div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const el = document.getElementById('system-instructions-section');
                                                if (el) el.classList.toggle('hidden');
                                            }}
                                            className="flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 mb-2"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            System Instructions (Advanced)
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                        <div id="system-instructions-section" className={systemInstructions ? "" : "hidden"}>
                                            <p className="text-xs text-zinc-500 mb-2">
                                                Detailed instructions that tell the AI how to behave. Use this for knowledge source context, response formatting, and specific behaviors.
                                            </p>
                                            <textarea
                                                value={systemInstructions}
                                                onChange={(e) => setSystemInstructions(e.target.value)}
                                                maxLength={4000}
                                                rows={6}
                                                placeholder={`Example for an agent with multiple knowledge sources:

You are a helpful assistant. Your knowledge base has MULTIPLE sources:

1. **source-name.com** = Official documentation
2. **community-data** = Community-contributed information

When users ask about X, prioritize results from source Y...`}
                                                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-none font-mono text-sm"
                                            />
                                            <p className="text-xs text-zinc-500 mt-1 text-right">
                                                {systemInstructions.length}/4000
                                            </p>
                                        </div>
                                    </div>

                                    {/* Visibility */}
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-2">Visibility</label>
                                        <div className={`grid gap-2 ${isAdmin ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
                                            {[
                                                { value: "private", label: "🔒 Private" },
                                                { value: "friends", label: "👥 Friends" },
                                                { value: "public", label: "🌍 Public" },
                                                ...(isAdmin ? [{ value: "official", label: "⭐ Official" }] : []),
                                            ].map(opt => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => setVisibility(opt.value as typeof visibility)}
                                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                                        visibility === opt.value
                                                            ? opt.value === "official" 
                                                                ? "bg-orange-500/20 border-2 border-orange-500 text-orange-400"
                                                                : "bg-purple-500/20 border-2 border-purple-500 text-purple-400"
                                                            : "bg-zinc-800 border border-zinc-700 text-zinc-400"
                                                    }`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Tags */}
                                    {(visibility === "friends" || visibility === "public" || visibility === "official") && (
                                        <div>
                                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                                                Tags <span className="text-zinc-500 font-normal">({tags.length}/5)</span>
                                            </label>
                                            <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-2 focus-within:border-purple-500 transition-colors">
                                                <div className="flex flex-wrap gap-2 mb-2">
                                                    {tags.map(tag => (
                                                        <span
                                                            key={tag}
                                                            className="inline-flex items-center gap-1 px-2 py-1 bg-purple-500/20 text-purple-400 rounded-lg text-sm"
                                                        >
                                                            #{tag}
                                                            <button
                                                                onClick={() => removeTag(tag)}
                                                                className="hover:text-purple-300"
                                                            >
                                                                ×
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                                <input
                                                    type="text"
                                                    value={tagInput}
                                                    onChange={(e) => setTagInput(e.target.value.slice(0, 20))}
                                                    onKeyDown={handleTagKeyDown}
                                                    placeholder={tags.length < 5 ? "Add tags (press Enter)" : "Max tags reached"}
                                                    disabled={tags.length >= 5}
                                                    className="w-full bg-transparent text-white placeholder-zinc-500 focus:outline-none text-sm disabled:opacity-50"
                                                />
                                            </div>
                                            {/* Tag suggestions */}
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {TAG_SUGGESTIONS
                                                    .filter(t => !tags.includes(t))
                                                    .slice(0, 8)
                                                    .map(suggestion => (
                                                        <button
                                                            key={suggestion}
                                                            onClick={() => addTag(suggestion)}
                                                            disabled={tags.length >= 5}
                                                            className="px-2 py-0.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            +{suggestion}
                                                        </button>
                                                    ))}
                                            </div>
                                            <p className="text-xs text-zinc-500 mt-2">
                                                Tags help users find your agent when searching
                                            </p>
                                        </div>
                                    )}
                                    
                                    {/* Suggested Questions (Official agents only) */}
                                    {visibility === "official" && (
                                        <div className="mt-4 p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="text-lg">💬</span>
                                                <label className="text-sm font-medium text-orange-400">
                                                    Suggested Questions
                                                </label>
                                                <span className="text-xs text-zinc-500 font-normal">(Optional)</span>
                                            </div>
                                            <p className="text-xs text-zinc-400 mb-3">
                                                Custom prompts shown to users on the public agent page. Leave empty for auto-generated questions.
                                            </p>
                                            <div className="space-y-2">
                                                {suggestedQuestions.map((question, idx) => (
                                                    <input
                                                        key={idx}
                                                        type="text"
                                                        value={question}
                                                        onChange={(e) => {
                                                            const newQuestions = [...suggestedQuestions];
                                                            newQuestions[idx] = e.target.value;
                                                            setSuggestedQuestions(newQuestions);
                                                        }}
                                                        placeholder={`Question ${idx + 1} (e.g., "What can you help me with?")`}
                                                        maxLength={100}
                                                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-orange-500 transition-colors"
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Capabilities Tab */}
                            {activeTab === "capabilities" && (
                                <>
                                    {/* Built-in Capabilities */}
                                    <div className="space-y-3">
                                        {/* Web Search */}
                                        <CapabilityToggle
                                            icon="🔍"
                                            title="Web Search"
                                            description="Access real-time information from the web"
                                            enabled={webSearchEnabled}
                                            onChange={setWebSearchEnabled}
                                        />

                                        {/* Knowledge Base */}
                                        <CapabilityToggle
                                            icon="📚"
                                            title="Knowledge Base"
                                            description="Use added URLs as context for responses"
                                            enabled={useKnowledgeBase}
                                            onChange={setUseKnowledgeBase}
                                        />

                                        {/* MCP Servers */}
                                        <CapabilityToggle
                                            icon="🔌"
                                            title="MCP Servers"
                                            description="Connect to Model Context Protocol servers"
                                            enabled={mcpEnabled}
                                            onChange={setMcpEnabled}
                                            color="purple"
                                        />

                                        {/* API Tools */}
                                        <CapabilityToggle
                                            icon="🌐"
                                            title="API Tools"
                                            description="Call external APIs during conversations"
                                            enabled={apiEnabled}
                                            onChange={setApiEnabled}
                                            color="cyan"
                                        />

                                        {/* Scheduling Tool */}
                                        <CapabilityToggle
                                            icon="📅"
                                            title="Scheduling Assistant"
                                            description="Help users schedule meetings with you"
                                            enabled={schedulingEnabled}
                                            onChange={setSchedulingEnabled}
                                            color="cyan"
                                        />
                                        
                                        {/* Public Access Toggle - Only for Official agents */}
                                        {visibility === "official" && (
                                            <CapabilityToggle
                                                icon="🌐"
                                                title="Public Access"
                                                description="Allow anyone to chat via /agent/[id] page"
                                                enabled={publicAccessEnabled}
                                                onChange={setPublicAccessEnabled}
                                                color="orange"
                                            />
                                        )}
                                        
                                        {/* Channel Presence - Only for Official agents */}
                                        {visibility === "official" && (
                                            <ChannelPresenceSection
                                                channelMemberships={channelMemberships}
                                                availableChannels={availableChannels}
                                                isSavingChannels={isSavingChannels}
                                                toggleChannelMembership={toggleChannelMembership}
                                                agentName={name}
                                            />
                                        )}

                                        {/* x402 API Access */}
                                        <CapabilityToggle
                                            icon="💰"
                                            title="x402 API Access"
                                            description="Let external apps pay to use your agent"
                                            enabled={x402Enabled}
                                            onChange={setX402Enabled}
                                            color="emerald"
                                        />
                                    </div>

                                    {/* Public Chat Page URL */}
                                    {visibility === "public" && agent && (
                                        <div className="mt-4 p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl">
                                            <h4 className="text-sm font-medium text-purple-400 flex items-center gap-2 mb-3">
                                                🔗 Public Chat Page
                                            </h4>
                                            <p className="text-xs text-zinc-400 mb-2">
                                                Anyone can chat with your agent at this URL:
                                            </p>
                                            <div className="flex gap-2">
                                                <code className="flex-1 text-xs bg-zinc-900 p-2 rounded text-purple-400 break-all">
                                                    {typeof window !== 'undefined' ? `${window.location.origin}/agent/${agent.id}` : `/agent/${agent.id}`}
                                                </code>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const url = `${window.location.origin}/agent/${agent.id}`;
                                                        navigator.clipboard.writeText(url);
                                                    }}
                                                    className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded text-xs"
                                                >
                                                    📋
                                                </button>
                                                <a
                                                    href={`/agent/${agent.id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded text-xs"
                                                >
                                                    ↗️
                                                </a>
                                            </div>
                                            {x402Enabled && (
                                                <p className="text-xs text-amber-400 mt-2">
                                                    💰 x402 payments will be required for chat
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* x402 Configuration */}
                                    {x402Enabled && (
                                        <div className="mt-4 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-4">
                                            <h4 className="text-sm font-medium text-emerald-400 flex items-center gap-2">
                                                💰 x402 Payment Settings
                                            </h4>

                                            {visibility !== "public" && (
                                                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                                                    <p className="text-xs text-amber-400">⚠️ x402 requires Public visibility</p>
                                                </div>
                                            )}

                                            {/* Pricing Mode */}
                                            <div>
                                                <label className="block text-xs font-medium text-zinc-400 mb-2">Pricing Mode</label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setX402PricingMode("global")}
                                                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                                            x402PricingMode === "global"
                                                                ? "bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400"
                                                                : "bg-zinc-800 border border-zinc-700 text-zinc-400"
                                                        }`}
                                                    >
                                                        🌐 Global Price
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setX402PricingMode("per_tool")}
                                                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                                            x402PricingMode === "per_tool"
                                                                ? "bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400"
                                                                : "bg-zinc-800 border border-zinc-700 text-zinc-400"
                                                        }`}
                                                    >
                                                        🔧 Per Tool
                                                    </button>
                                                </div>
                                                <p className="text-xs text-zinc-500 mt-1">
                                                    {x402PricingMode === "global" 
                                                        ? "Single price for all interactions" 
                                                        : "Set different prices per MCP tool"}
                                                </p>
                                            </div>

                                            {/* Global Price (only shown in global mode) */}
                                            {x402PricingMode === "global" && (
                                                <div>
                                                    <label className="block text-xs font-medium text-zinc-400 mb-1">Price per Message</label>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-zinc-400">$</span>
                                                        <input
                                                            type="number"
                                                            min="0.01"
                                                            step="0.01"
                                                            value={(x402PriceCents / 100).toFixed(2)}
                                                            onChange={(e) => setX402PriceCents(Math.max(1, Math.round(parseFloat(e.target.value || "0.01") * 100)))}
                                                            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                                                        />
                                                        <span className="text-xs text-zinc-500">USDC</span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Network */}
                                            <div>
                                                <label className="block text-xs font-medium text-zinc-400 mb-1">Network</label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setX402Network("base")}
                                                        className={`px-3 py-2 rounded-lg text-xs font-medium ${
                                                            x402Network === "base"
                                                                ? "bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400"
                                                                : "bg-zinc-800 border border-zinc-700 text-zinc-400"
                                                        }`}
                                                    >
                                                        Base Mainnet
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setX402Network("base-sepolia")}
                                                        className={`px-3 py-2 rounded-lg text-xs font-medium ${
                                                            x402Network === "base-sepolia"
                                                                ? "bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400"
                                                                : "bg-zinc-800 border border-zinc-700 text-zinc-400"
                                                        }`}
                                                    >
                                                        Sepolia (Test)
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Wallet */}
                                            <div>
                                                <label className="block text-xs font-medium text-zinc-400 mb-1">Payment Wallet</label>
                                                <input
                                                    type="text"
                                                    value={x402WalletAddress}
                                                    onChange={(e) => setX402WalletAddress(e.target.value)}
                                                    placeholder="0x..."
                                                    spellCheck={false}
                                                    autoComplete="off"
                                                    autoCorrect="off"
                                                    autoCapitalize="off"
                                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-emerald-500"
                                                />
                                            </div>

                                            {/* Get Embed Code */}
                                            {agent?.x402_enabled && (
                                                <button
                                                    type="button"
                                                    onClick={fetchEmbedCode}
                                                    className="w-full py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-400 rounded-lg text-sm font-medium"
                                                >
                                                    📋 Get API URL / SDK Code
                                                </button>
                                            )}

                                            {/* Earnings */}
                                            {agent?.x402_enabled && (agent.x402_message_count_paid || 0) > 0 && (
                                                <div className="p-3 bg-emerald-500/10 rounded-lg">
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-zinc-400">Paid Messages:</span>
                                                        <span className="text-white">{agent.x402_message_count_paid}</span>
                                                    </div>
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-zinc-400">Total Earned:</span>
                                                        <span className="text-emerald-400">${((agent.x402_total_earnings_cents || 0) / 100).toFixed(2)}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Embed Code Display */}
                                    {showEmbedCode && embedData && (
                                        <div className="p-4 bg-zinc-800 border border-zinc-700 rounded-xl">
                                            <div className="flex items-center justify-between mb-2">
                                                <h4 className="text-sm font-medium text-white">API Endpoint</h4>
                                                <button onClick={() => setShowEmbedCode(false)} className="text-zinc-400 hover:text-white text-sm">✕</button>
                                            </div>
                                            <code className="block text-xs bg-zinc-900 p-2 rounded text-emerald-400 mb-3 break-all">
                                                {embedData.endpoints.chat}
                                            </code>
                                            <details className="text-xs">
                                                <summary className="text-zinc-400 cursor-pointer hover:text-white">Show SDK Code</summary>
                                                <pre className="mt-2 bg-zinc-900 p-3 rounded-lg overflow-x-auto text-zinc-300 max-h-32">
                                                    {embedData.code.sdk}
                                                </pre>
                                            </details>
                                            <button
                                                onClick={() => navigator.clipboard.writeText(embedData.endpoints.chat)}
                                                className="mt-2 w-full py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs text-white"
                                            >
                                                📋 Copy URL
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* MCP Tools Tab */}
                            {activeTab === "mcp" && (
                                <>
                                    <p className="text-xs text-zinc-500 mb-4">
                                        Connect MCP servers to give your agent access to external tools and services.
                                    </p>

                                    {/* Configured MCP Servers */}
                                    {mcpServers.length > 0 && (
                                        <div className="space-y-2 mb-4">
                                            {mcpServers.map(server => (
                                                <div key={server.id} className="p-3 bg-zinc-800 border border-zinc-700 rounded-xl">
                                                    <div className="flex items-start justify-between mb-2">
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            <span className="text-lg shrink-0">🔌</span>
                                                            <div className="flex-1 min-w-0">
                                                                <input
                                                                    type="text"
                                                                    value={server.name}
                                                                    onChange={(e) => updateMcpServer(server.id, { name: e.target.value })}
                                                                    className="w-full bg-transparent border-b border-transparent hover:border-zinc-600 focus:border-purple-500 text-sm font-medium text-white focus:outline-none px-0 py-0.5"
                                                                    placeholder="Server name"
                                                                />
                                                                <input
                                                                    type="text"
                                                                    value={server.url}
                                                                    onChange={(e) => updateMcpServer(server.id, { url: e.target.value })}
                                                                    className="w-full bg-transparent border-b border-transparent hover:border-zinc-600 focus:border-purple-500 text-xs text-zinc-400 font-mono focus:outline-none px-0 py-0.5"
                                                                    placeholder="Server URL"
                                                                />
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => removeMcpServer(server.id)}
                                                            className="text-zinc-500 hover:text-red-400 text-sm shrink-0 ml-2"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                    
                                                    {/* Instructions for Agent */}
                                                    <div className="mb-2">
                                                        <textarea
                                                            value={server.description || ""}
                                                            onChange={(e) => updateMcpServer(server.id, { description: e.target.value || undefined })}
                                                            placeholder="Instructions for agent (e.g. 'Use this MCP server to search documentation when the user asks about API references')"
                                                            rows={2}
                                                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-purple-500 resize-none"
                                                        />
                                                    </div>

                                                    {/* API Key input */}
                                                    <div className="mb-2">
                                                        <div className="relative">
                                                            <input
                                                                type={visibleApiKeys.has(`mcp-${server.id}`) ? "text" : "password"}
                                                                value={server.apiKey || ""}
                                                                onChange={(e) => updateMcpServer(server.id, { apiKey: e.target.value || undefined })}
                                                                placeholder="API Key (optional)"
                                                                autoComplete="off"
                                                                data-lpignore="true"
                                                                data-1p-ignore="true"
                                                                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 pr-10 text-white text-xs font-mono focus:outline-none focus:border-purple-500"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleApiKeyVisibility(`mcp-${server.id}`)}
                                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs"
                                                                title={visibleApiKeys.has(`mcp-${server.id}`) ? "Hide" : "Show"}
                                                            >
                                                                {visibleApiKeys.has(`mcp-${server.id}`) ? "🙈" : "👁️"}
                                                            </button>
                                                        </div>
                                                        {/* Add API Key as Header */}
                                                        {server.apiKey && (
                                                            <div className="mt-1 flex items-center gap-2">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Header name (e.g. X-API-Key)"
                                                                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:border-purple-500"
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                                                            const headerName = e.currentTarget.value.trim();
                                                                            const newHeaders = { ...(server.headers || {}), [headerName]: server.apiKey || "" };
                                                                            updateMcpServer(server.id, { headers: newHeaders });
                                                                            e.currentTarget.value = "";
                                                                        }
                                                                    }}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                                                        if (input?.value.trim()) {
                                                                            const headerName = input.value.trim();
                                                                            const newHeaders = { ...(server.headers || {}), [headerName]: server.apiKey || "" };
                                                                            updateMcpServer(server.id, { headers: newHeaders });
                                                                            input.value = "";
                                                                        }
                                                                    }}
                                                                    className="px-2 py-1 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded text-xs whitespace-nowrap"
                                                                >
                                                                    + Add to Headers
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Custom Headers */}
                                                    <div className="mb-2">
                                                        <details className="group">
                                                            <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300 flex items-center gap-1">
                                                                <span className="group-open:rotate-90 transition-transform">▶</span>
                                                                Headers {server.headers && Object.keys(server.headers).length > 0 && (
                                                                    <span className="text-purple-400">({Object.keys(server.headers).length})</span>
                                                                )}
                                                            </summary>
                                                            <div className="mt-2 space-y-2">
                                                                {/* Existing headers */}
                                                                {server.headers && Object.entries(server.headers).map(([key, value], idx) => (
                                                                    <div key={idx} className="flex gap-2 items-center">
                                                                        <input
                                                                            type="text"
                                                                            value={key}
                                                                            onChange={(e) => {
                                                                                const newHeaders = { ...server.headers };
                                                                                const oldValue = newHeaders[key];
                                                                                delete newHeaders[key];
                                                                                if (e.target.value.trim()) {
                                                                                    newHeaders[e.target.value.trim()] = oldValue;
                                                                                }
                                                                                updateMcpServer(server.id, { headers: Object.keys(newHeaders).length > 0 ? newHeaders : undefined });
                                                                            }}
                                                                            placeholder="Header name"
                                                                            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:border-purple-500"
                                                                        />
                                                                        <span className="text-zinc-600">:</span>
                                                                        <input
                                                                            type="text"
                                                                            value={value}
                                                                            onChange={(e) => {
                                                                                const newHeaders = { ...server.headers, [key]: e.target.value };
                                                                                updateMcpServer(server.id, { headers: newHeaders });
                                                                            }}
                                                                            placeholder="Value"
                                                                            className="flex-[2] bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:border-purple-500"
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const newHeaders = { ...server.headers };
                                                                                delete newHeaders[key];
                                                                                updateMcpServer(server.id, { headers: Object.keys(newHeaders).length > 0 ? newHeaders : undefined });
                                                                            }}
                                                                            className="text-zinc-500 hover:text-red-400 text-xs px-1"
                                                                        >
                                                                            ✕
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                                {/* Add new header */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const newHeaders = { ...(server.headers || {}), "": "" };
                                                                        updateMcpServer(server.id, { headers: newHeaders });
                                                                    }}
                                                                    className="w-full py-1.5 border border-dashed border-zinc-700 rounded text-zinc-500 hover:border-purple-500 hover:text-purple-400 text-xs transition-colors"
                                                                >
                                                                    + Add Header
                                                                </button>
                                                            </div>
                                                        </details>
                                                    </div>

                                                    {/* Per-tool pricing */}
                                                    {x402Enabled && x402PricingMode === "per_tool" && (
                                                        <div className="flex items-center gap-2 pt-2 border-t border-zinc-700">
                                                            <label className="flex items-center gap-2 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={server.x402Enabled || false}
                                                                    onChange={(e) => updateMcpServer(server.id, { x402Enabled: e.target.checked })}
                                                                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-emerald-500 focus:ring-emerald-500"
                                                                />
                                                                <span className="text-xs text-zinc-400">💰 Paid tool</span>
                                                            </label>
                                                            {server.x402Enabled && (
                                                                <div className="flex items-center gap-1 ml-auto">
                                                                    <span className="text-xs text-zinc-500">$</span>
                                                                    <input
                                                                        type="number"
                                                                        min="0.01"
                                                                        step="0.01"
                                                                        value={((server.x402PriceCents || 1) / 100).toFixed(2)}
                                                                        onChange={(e) => updateMcpServer(server.id, { 
                                                                            x402PriceCents: Math.max(1, Math.round(parseFloat(e.target.value || "0.01") * 100))
                                                                        })}
                                                                        className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-emerald-500"
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Add MCP Server */}
                                    {!showAddMcp ? (
                                        <button
                                            onClick={() => setShowAddMcp(true)}
                                            className="w-full py-3 border-2 border-dashed border-zinc-700 rounded-xl text-zinc-400 hover:border-purple-500 hover:text-purple-400 transition-colors text-sm"
                                        >
                                            + Add MCP Server
                                        </button>
                                    ) : (
                                        <div className="p-4 bg-zinc-800 border border-zinc-700 rounded-xl space-y-3">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-sm font-medium text-white">Add MCP Server</h4>
                                                <button onClick={() => setShowAddMcp(false)} className="text-zinc-400 hover:text-white text-sm">✕</button>
                                            </div>

                                            {/* Popular presets */}
                                            <div>
                                                <p className="text-xs text-zinc-500 mb-2">Popular servers:</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {POPULAR_MCP_SERVERS.filter(s => !mcpServers.some(m => m.id === s.id)).slice(0, 4).map(preset => (
                                                        <button
                                                            key={preset.id}
                                                            onClick={() => addMcpServer(preset)}
                                                            className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs text-white"
                                                        >
                                                            {preset.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Custom server */}
                                            <div className="pt-2 border-t border-zinc-700">
                                                <p className="text-xs text-zinc-500 mb-2">Or add custom:</p>
                                                <input
                                                    type="text"
                                                    value={newMcpName}
                                                    onChange={(e) => setNewMcpName(e.target.value)}
                                                    placeholder="Server name"
                                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm mb-2 focus:outline-none focus:border-purple-500"
                                                />
                                                <input
                                                    type="text"
                                                    value={newMcpUrl}
                                                    onChange={(e) => setNewMcpUrl(e.target.value)}
                                                    placeholder="Server URL or command"
                                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm mb-2 font-mono focus:outline-none focus:border-purple-500"
                                                />
                                                <input
                                                    type="password"
                                                    value={newMcpApiKey}
                                                    onChange={(e) => setNewMcpApiKey(e.target.value)}
                                                    placeholder="API Key (optional)"
                                                    autoComplete="off"
                                                    data-lpignore="true"
                                                    data-1p-ignore="true"
                                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm mb-2 font-mono focus:outline-none focus:border-purple-500"
                                                />
                                                <textarea
                                                    value={newMcpDescription}
                                                    onChange={(e) => setNewMcpDescription(e.target.value)}
                                                    placeholder="Instructions for agent (when should it use this server?)"
                                                    rows={2}
                                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm mb-2 focus:outline-none focus:border-purple-500 resize-none"
                                                />
                                                
                                                {/* Headers */}
                                                <div className="mb-2">
                                                    <p className="text-xs text-zinc-500 mb-2">Headers (optional)</p>
                                                    <div className="space-y-2">
                                                        {Object.entries(newMcpHeaders).map(([key, value], idx) => (
                                                            <div key={idx} className="flex gap-2 items-center">
                                                                <input
                                                                    type="text"
                                                                    value={key}
                                                                    onChange={(e) => {
                                                                        const newHeaders = { ...newMcpHeaders };
                                                                        const oldValue = newHeaders[key];
                                                                        delete newHeaders[key];
                                                                        newHeaders[e.target.value] = oldValue;
                                                                        setNewMcpHeaders(newHeaders);
                                                                    }}
                                                                    placeholder="Header name"
                                                                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-purple-500"
                                                                />
                                                                <span className="text-zinc-600">:</span>
                                                                <input
                                                                    type="text"
                                                                    value={value}
                                                                    onChange={(e) => {
                                                                        setNewMcpHeaders({ ...newMcpHeaders, [key]: e.target.value });
                                                                    }}
                                                                    placeholder="Value"
                                                                    className="flex-[2] bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-purple-500"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const newHeaders = { ...newMcpHeaders };
                                                                        delete newHeaders[key];
                                                                        setNewMcpHeaders(newHeaders);
                                                                    }}
                                                                    className="text-zinc-500 hover:text-red-400 text-xs px-1"
                                                                >
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        ))}
                                                        <button
                                                            type="button"
                                                            onClick={() => setNewMcpHeaders({ ...newMcpHeaders, "": "" })}
                                                            className="w-full py-1.5 border border-dashed border-zinc-700 rounded text-zinc-500 hover:border-purple-500 hover:text-purple-400 text-xs transition-colors"
                                                        >
                                                            + Add Header
                                                        </button>
                                                    </div>
                                                </div>
                                                
                                                <button
                                                    onClick={() => addMcpServer()}
                                                    disabled={!newMcpName || !newMcpUrl}
                                                    className="w-full py-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
                                                >
                                                    Add Server
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* API Tools Tab */}
                            {activeTab === "api" && (
                                <>
                                    <p className="text-xs text-zinc-500 mb-4">
                                        Configure external API endpoints your agent can call to fetch data or perform actions.
                                    </p>

                                    {/* Configured API Tools */}
                                    {apiTools.length > 0 && (
                                        <div className="space-y-2 mb-4">
                                                    {apiTools.map(tool => (
                                                                <div key={tool.id} className="p-3 bg-zinc-800 border border-zinc-700 rounded-xl">
                                                                    <div className="flex items-start justify-between mb-2">
                                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                            <select
                                                                                value={tool.method}
                                                                                onChange={(e) => updateApiTool(tool.id, { method: e.target.value as "GET" | "POST" | "PUT" | "DELETE" })}
                                                                                className={`text-xs font-mono px-2 py-0.5 rounded cursor-pointer focus:outline-none ${
                                                                                    tool.method === "GET" ? "bg-green-500/20 text-green-400" :
                                                                                    tool.method === "POST" ? "bg-blue-500/20 text-blue-400" :
                                                                                    tool.method === "PUT" ? "bg-yellow-500/20 text-yellow-400" :
                                                                                    "bg-red-500/20 text-red-400"
                                                                                }`}
                                                                            >
                                                                                <option value="GET">GET</option>
                                                                                <option value="POST">POST</option>
                                                                                <option value="PUT">PUT</option>
                                                                                <option value="DELETE">DELETE</option>
                                                                            </select>
                                                                            {/* API Type Badge */}
                                                                            {tool.apiType && (
                                                                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                                                                    tool.apiType === "graphql" ? "bg-pink-500/20 text-pink-400" :
                                                                                    tool.apiType === "openapi" ? "bg-purple-500/20 text-purple-400" :
                                                                                    "bg-zinc-600/20 text-zinc-400"
                                                                                }`}>
                                                                                    {tool.apiType === "graphql" ? "GraphQL" : 
                                                                                     tool.apiType === "openapi" ? "OpenAPI" : "REST"}
                                                                                </span>
                                                                            )}
                                                                            {/* Detect/Fetch Schema Button */}
                                                                            <button
                                                                                onClick={() => detectApiType(tool.id, tool.url, tool.apiKey, tool.headers)}
                                                                                disabled={detectingApiId === tool.id}
                                                                                className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 disabled:opacity-50"
                                                                                title={tool.schema ? "Refresh schema" : "Auto-detect API type and fetch schema"}
                                                                            >
                                                                                {detectingApiId === tool.id ? "..." : tool.schema ? "🔄" : "🔍"}
                                                                            </button>
                                                                            <div className="flex-1 min-w-0">
                                                                                <input
                                                                                    type="text"
                                                                                    value={tool.name}
                                                                                    onChange={(e) => updateApiTool(tool.id, { name: e.target.value })}
                                                                                    className="w-full bg-transparent border-b border-transparent hover:border-zinc-600 focus:border-cyan-500 text-sm font-medium text-white focus:outline-none px-0 py-0.5"
                                                                                    placeholder="API name"
                                                                                />
                                                                                <input
                                                                                    type="text"
                                                                                    value={tool.url}
                                                                                    onChange={(e) => updateApiTool(tool.id, { url: e.target.value })}
                                                                                    className="w-full bg-transparent border-b border-transparent hover:border-zinc-600 focus:border-cyan-500 text-xs text-zinc-400 font-mono focus:outline-none px-0 py-0.5"
                                                                                    placeholder="API URL"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                        <button
                                                                            onClick={() => removeApiTool(tool.id)}
                                                                            className="text-zinc-500 hover:text-red-400 text-sm shrink-0 ml-2"
                                                                        >
                                                                            ✕
                                                                        </button>
                                                                    </div>
                                                                    
                                                                    {/* Schema Preview */}
                                                                    {tool.schema && (
                                                                        <div className="mb-2 p-2 bg-zinc-900/50 rounded-lg border border-zinc-700/50">
                                                                            <div className="flex items-center justify-between mb-1">
                                                                                <span className="text-xs text-zinc-500">Detected Schema</span>
                                                                                <button
                                                                                    onClick={() => updateApiTool(tool.id, { schema: undefined })}
                                                                                    className="text-xs text-zinc-500 hover:text-zinc-300"
                                                                                >
                                                                                    Clear
                                                                                </button>
                                                                            </div>
                                                                            <pre className="text-xs text-zinc-400 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                                                                                {tool.schema.length > 500 ? tool.schema.substring(0, 500) + "..." : tool.schema}
                                                                            </pre>
                                                                        </div>
                                                                    )}
                                                    
                                                    {/* Instructions for Agent */}
                                                    <div className="mb-2">
                                                        <textarea
                                                            value={tool.description || ""}
                                                            onChange={(e) => updateApiTool(tool.id, { description: e.target.value || undefined })}
                                                            placeholder="Instructions for agent (e.g. 'Call this API to get weather data when the user asks about the forecast')"
                                                            rows={2}
                                                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-cyan-500 resize-none"
                                                        />
                                                    </div>

                                                    {/* API Key input */}
                                                    <div className="mb-2">
                                                        <div className="relative">
                                                            <input
                                                                type={visibleApiKeys.has(`api-${tool.id}`) ? "text" : "password"}
                                                                value={tool.apiKey || ""}
                                                                onChange={(e) => updateApiTool(tool.id, { apiKey: e.target.value || undefined })}
                                                                placeholder="API Key (optional)"
                                                                autoComplete="off"
                                                                data-lpignore="true"
                                                                data-1p-ignore="true"
                                                                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 pr-10 text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleApiKeyVisibility(`api-${tool.id}`)}
                                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs"
                                                                title={visibleApiKeys.has(`api-${tool.id}`) ? "Hide" : "Show"}
                                                            >
                                                                {visibleApiKeys.has(`api-${tool.id}`) ? "🙈" : "👁️"}
                                                            </button>
                                                        </div>
                                                        {/* Add API Key as Header */}
                                                        {tool.apiKey && (
                                                            <div className="mt-1 flex items-center gap-2">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Header name (e.g. Authorization)"
                                                                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                                                            const headerName = e.currentTarget.value.trim();
                                                                            const newHeaders = { ...(tool.headers || {}), [headerName]: tool.apiKey || "" };
                                                                            updateApiTool(tool.id, { headers: newHeaders });
                                                                            e.currentTarget.value = "";
                                                                        }
                                                                    }}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                                                        if (input?.value.trim()) {
                                                                            const headerName = input.value.trim();
                                                                            const newHeaders = { ...(tool.headers || {}), [headerName]: tool.apiKey || "" };
                                                                            updateApiTool(tool.id, { headers: newHeaders });
                                                                            input.value = "";
                                                                        }
                                                                    }}
                                                                    className="px-2 py-1 bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 rounded text-xs whitespace-nowrap"
                                                                >
                                                                    + Add to Headers
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Custom Headers */}
                                                    <div className="mb-2">
                                                        <details className="group">
                                                            <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300 flex items-center gap-1">
                                                                <span className="group-open:rotate-90 transition-transform">▶</span>
                                                                Headers {tool.headers && Object.keys(tool.headers).length > 0 && (
                                                                    <span className="text-cyan-400">({Object.keys(tool.headers).length})</span>
                                                                )}
                                                            </summary>
                                                            <div className="mt-2 space-y-2">
                                                                {/* Existing headers */}
                                                                {tool.headers && Object.entries(tool.headers).map(([key, value], idx) => (
                                                                    <div key={idx} className="flex gap-2 items-center">
                                                                        <input
                                                                            type="text"
                                                                            value={key}
                                                                            onChange={(e) => {
                                                                                const newHeaders = { ...tool.headers };
                                                                                const oldValue = newHeaders[key];
                                                                                delete newHeaders[key];
                                                                                if (e.target.value.trim()) {
                                                                                    newHeaders[e.target.value.trim()] = oldValue;
                                                                                }
                                                                                updateApiTool(tool.id, { headers: Object.keys(newHeaders).length > 0 ? newHeaders : undefined });
                                                                            }}
                                                                            placeholder="Header name"
                                                                            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
                                                                        />
                                                                        <span className="text-zinc-600">:</span>
                                                                        <input
                                                                            type="text"
                                                                            value={value}
                                                                            onChange={(e) => {
                                                                                const newHeaders = { ...tool.headers, [key]: e.target.value };
                                                                                updateApiTool(tool.id, { headers: newHeaders });
                                                                            }}
                                                                            placeholder="Value"
                                                                            className="flex-[2] bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const newHeaders = { ...tool.headers };
                                                                                delete newHeaders[key];
                                                                                updateApiTool(tool.id, { headers: Object.keys(newHeaders).length > 0 ? newHeaders : undefined });
                                                                            }}
                                                                            className="text-zinc-500 hover:text-red-400 text-xs px-1"
                                                                        >
                                                                            ✕
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                                {/* Add new header */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const newHeaders = { ...(tool.headers || {}), "": "" };
                                                                        updateApiTool(tool.id, { headers: newHeaders });
                                                                    }}
                                                                    className="w-full py-1.5 border border-dashed border-zinc-700 rounded text-zinc-500 hover:border-cyan-500 hover:text-cyan-400 text-xs transition-colors"
                                                                >
                                                                    + Add Header
                                                                </button>
                                                            </div>
                                                        </details>
                                                    </div>

                                                    {/* Per-tool pricing */}
                                                    {x402Enabled && x402PricingMode === "per_tool" && (
                                                        <div className="flex items-center gap-2 pt-2 border-t border-zinc-700">
                                                            <label className="flex items-center gap-2 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={tool.x402Enabled || false}
                                                                    onChange={(e) => updateApiTool(tool.id, { x402Enabled: e.target.checked })}
                                                                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-emerald-500 focus:ring-emerald-500"
                                                                />
                                                                <span className="text-xs text-zinc-400">💰 Paid API</span>
                                                            </label>
                                                            {tool.x402Enabled && (
                                                                <div className="flex items-center gap-1 ml-auto">
                                                                    <span className="text-xs text-zinc-500">$</span>
                                                                    <input
                                                                        type="number"
                                                                        min="0.01"
                                                                        step="0.01"
                                                                        value={((tool.x402PriceCents || 1) / 100).toFixed(2)}
                                                                        onChange={(e) => updateApiTool(tool.id, { 
                                                                            x402PriceCents: Math.max(1, Math.round(parseFloat(e.target.value || "0.01") * 100))
                                                                        })}
                                                                        className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-emerald-500"
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Add API Tool */}
                                    {!showAddApi ? (
                                        <button
                                            onClick={() => setShowAddApi(true)}
                                            className="w-full py-3 border-2 border-dashed border-zinc-700 rounded-xl text-zinc-400 hover:border-cyan-500 hover:text-cyan-400 transition-colors text-sm"
                                        >
                                            + Add API Endpoint
                                        </button>
                                    ) : (
                                        <div className="p-4 bg-zinc-800 border border-zinc-700 rounded-xl space-y-3">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-sm font-medium text-white">Add API Endpoint</h4>
                                                <button onClick={() => setShowAddApi(false)} className="text-zinc-400 hover:text-white text-sm">✕</button>
                                            </div>

                                            {/* Name */}
                                            <input
                                                type="text"
                                                value={newApiName}
                                                onChange={(e) => setNewApiName(e.target.value)}
                                                placeholder="API name (e.g., Weather API)"
                                                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                                            />

                                            {/* Method + URL */}
                                            <div className="flex gap-2">
                                                <select
                                                    value={newApiMethod}
                                                    onChange={(e) => setNewApiMethod(e.target.value as typeof newApiMethod)}
                                                    className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                                                >
                                                    <option value="GET">GET</option>
                                                    <option value="POST">POST</option>
                                                    <option value="PUT">PUT</option>
                                                    <option value="DELETE">DELETE</option>
                                                </select>
                                                <input
                                                    type="text"
                                                    value={newApiUrl}
                                                    onChange={(e) => setNewApiUrl(e.target.value)}
                                                    placeholder="https://api.example.com/endpoint"
                                                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-cyan-500"
                                                />
                                            </div>

                                            {/* Instructions for Agent */}
                                            <textarea
                                                value={newApiDescription}
                                                onChange={(e) => setNewApiDescription(e.target.value)}
                                                placeholder="Instructions for agent (when should it use this API?)"
                                                rows={2}
                                                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 resize-none"
                                            />

                                            {/* API Key */}
                                            <input
                                                type="password"
                                                value={newApiKey}
                                                onChange={(e) => setNewApiKey(e.target.value)}
                                                placeholder="API Key (optional)"
                                                autoComplete="off"
                                                data-lpignore="true"
                                                data-1p-ignore="true"
                                                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-cyan-500"
                                            />
                                            
                                            {/* Add API Key as Header */}
                                            {newApiKey && (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        id="new-api-header-name"
                                                        placeholder="Header name (e.g. Authorization)"
                                                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                                                const headerName = e.currentTarget.value.trim();
                                                                setNewApiHeaders({ ...newApiHeaders, [headerName]: newApiKey });
                                                                e.currentTarget.value = "";
                                                            }
                                                        }}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const input = document.getElementById('new-api-header-name') as HTMLInputElement;
                                                            if (input?.value.trim()) {
                                                                const headerName = input.value.trim();
                                                                setNewApiHeaders({ ...newApiHeaders, [headerName]: newApiKey });
                                                                input.value = "";
                                                            }
                                                        }}
                                                        className="px-2 py-1.5 bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 rounded text-xs whitespace-nowrap"
                                                    >
                                                        + Add to Headers
                                                    </button>
                                                </div>
                                            )}

                                            {/* Headers */}
                                            <div>
                                                <p className="text-xs text-zinc-500 mb-2">Headers (optional)</p>
                                                <div className="space-y-2">
                                                    {Object.entries(newApiHeaders).map(([key, value], idx) => (
                                                        <div key={idx} className="flex gap-2 items-center">
                                                            <input
                                                                type="text"
                                                                value={key}
                                                                onChange={(e) => {
                                                                    const newHeaders = { ...newApiHeaders };
                                                                    const oldValue = newHeaders[key];
                                                                    delete newHeaders[key];
                                                                    newHeaders[e.target.value] = oldValue;
                                                                    setNewApiHeaders(newHeaders);
                                                                }}
                                                                placeholder="Header name"
                                                                className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
                                                            />
                                                            <span className="text-zinc-600">:</span>
                                                            <input
                                                                type="text"
                                                                value={value}
                                                                onChange={(e) => {
                                                                    setNewApiHeaders({ ...newApiHeaders, [key]: e.target.value });
                                                                }}
                                                                placeholder="Value"
                                                                className="flex-[2] bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const newHeaders = { ...newApiHeaders };
                                                                    delete newHeaders[key];
                                                                    setNewApiHeaders(newHeaders);
                                                                }}
                                                                className="text-zinc-500 hover:text-red-400 text-xs px-1"
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button
                                                        type="button"
                                                        onClick={() => setNewApiHeaders({ ...newApiHeaders, "": "" })}
                                                        className="w-full py-1.5 border border-dashed border-zinc-700 rounded text-zinc-500 hover:border-cyan-500 hover:text-cyan-400 text-xs transition-colors"
                                                    >
                                                        + Add Header
                                                    </button>
                                                </div>
                                            </div>

                                            <button
                                                onClick={addApiTool}
                                                disabled={!newApiName || !newApiUrl}
                                                className="w-full py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
                                            >
                                                Add API
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={handleClose}
                                className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving || !name.trim()}
                                className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all"
                            >
                                {isSaving ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// Compact Channel Presence section for Official agents
function ChannelPresenceSection({
    channelMemberships,
    availableChannels,
    isSavingChannels,
    toggleChannelMembership,
    agentName,
}: {
    channelMemberships: { global: boolean; channels: string[] };
    availableChannels: Array<{ id: string; name: string; emoji: string }>;
    isSavingChannels: boolean;
    toggleChannelMembership: (type: "global" | "channel", channelId?: string) => void;
    agentName: string;
}) {
    const [showChannelPicker, setShowChannelPicker] = useState(false);
    const [channelSearch, setChannelSearch] = useState("");
    
    // Get selected channel names for display
    const selectedChannels = availableChannels.filter(c => channelMemberships.channels.includes(c.id));
    const unselectedChannels = availableChannels.filter(c => !channelMemberships.channels.includes(c.id));
    const filteredChannels = unselectedChannels.filter(c => 
        c.name.toLowerCase().includes(channelSearch.toLowerCase())
    );
    
    const totalActive = (channelMemberships.global ? 1 : 0) + channelMemberships.channels.length;
    
    return (
        <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className="text-base">🤖</span>
                    <h4 className="text-sm font-medium text-purple-400">Channel Presence</h4>
                    {isSavingChannels && (
                        <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                    )}
                </div>
                <span className="text-xs text-zinc-500">
                    {totalActive > 0 ? `${totalActive} active` : "Not in any channels"}
                </span>
            </div>
            
            {/* Active channels as compact chips */}
            <div className="flex flex-wrap gap-1.5 mb-2">
                {/* Global Chat chip */}
                <button
                    onClick={() => toggleChannelMembership("global")}
                    disabled={isSavingChannels}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                        channelMemberships.global
                            ? "bg-orange-500/20 text-orange-400 border border-orange-500/40 hover:bg-orange-500/30"
                            : "bg-zinc-800 text-zinc-500 border border-zinc-700 hover:bg-zinc-700 hover:text-zinc-300"
                    }`}
                >
                    <span>🌍</span>
                    <span>Global</span>
                    {channelMemberships.global && (
                        <svg className="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                </button>
                
                {/* Selected channel chips */}
                {selectedChannels.map(channel => (
                    <button
                        key={channel.id}
                        onClick={() => toggleChannelMembership("channel", channel.id)}
                        disabled={isSavingChannels}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/40 hover:bg-purple-500/30 transition-all"
                    >
                        <span>{channel.emoji || "#"}</span>
                        <span className="max-w-[80px] truncate">{channel.name}</span>
                        <svg className="w-3 h-3 ml-0.5 text-purple-400/70 hover:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                ))}
                
                {/* Add channel button */}
                {unselectedChannels.length > 0 && (
                    <div className="relative">
                        <button
                            onClick={() => setShowChannelPicker(!showChannelPicker)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700 border-dashed hover:bg-zinc-700 hover:text-white transition-all"
                        >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span>Add channel</span>
                        </button>
                        
                        {/* Channel picker dropdown */}
                        {showChannelPicker && (
                            <>
                                <div 
                                    className="fixed inset-0 z-40" 
                                    onClick={() => setShowChannelPicker(false)}
                                />
                                <div className="absolute top-full left-0 mt-1 w-56 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
                                    {/* Search input */}
                                    <div className="p-2 border-b border-zinc-700">
                                        <input
                                            type="text"
                                            value={channelSearch}
                                            onChange={(e) => setChannelSearch(e.target.value)}
                                            placeholder="Search channels..."
                                            className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                                            autoFocus
                                        />
                                    </div>
                                    
                                    {/* Channel list */}
                                    <div className="max-h-40 overflow-y-auto">
                                        {filteredChannels.length === 0 ? (
                                            <p className="p-3 text-xs text-zinc-500 text-center">
                                                {channelSearch ? "No channels found" : "No more channels"}
                                            </p>
                                        ) : (
                                            filteredChannels.map(channel => (
                                                <button
                                                    key={channel.id}
                                                    onClick={() => {
                                                        toggleChannelMembership("channel", channel.id);
                                                        setChannelSearch("");
                                                        setShowChannelPicker(false);
                                                    }}
                                                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-700 transition-colors"
                                                >
                                                    <span>{channel.emoji || "#"}</span>
                                                    <span className="text-sm text-white truncate">{channel.name}</span>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
            
            {/* Help text */}
            {totalActive > 0 && (
                <p className="text-[10px] text-zinc-500">
                    Users can @mention <code className="px-1 py-0.5 bg-zinc-800 rounded text-purple-400">{agentName || "Agent"}</code> in these channels
                </p>
            )}
        </div>
    );
}

// Toggle component for capabilities
function CapabilityToggle({ 
    icon, 
    title, 
    description, 
    enabled, 
    onChange,
    color = "purple"
}: { 
    icon: string; 
    title: string; 
    description: string; 
    enabled: boolean; 
    onChange: (v: boolean) => void;
    color?: "purple" | "emerald" | "cyan" | "orange";
}) {
    const colorClass = color === "emerald" ? "bg-emerald-500" : color === "cyan" ? "bg-cyan-500" : color === "orange" ? "bg-orange-500" : "bg-purple-500";
    
    return (
        <div 
            onClick={() => onChange(!enabled)}
            className="flex items-center justify-between p-3 bg-zinc-800 border border-zinc-700 rounded-xl cursor-pointer hover:border-zinc-600 transition-colors"
        >
            <div className="flex items-center gap-3">
                <span className="text-xl">{icon}</span>
                <div>
                    <p className="text-sm font-medium text-white">{title}</p>
                    <p className="text-xs text-zinc-500">{description}</p>
                </div>
            </div>
            <div className={`w-11 h-6 rounded-full transition-colors relative ${enabled ? colorClass : "bg-zinc-600"}`}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${enabled ? "left-6" : "left-1"}`} />
            </div>
        </div>
    );
}

export default EditAgentModal;
