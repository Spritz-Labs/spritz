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
        avatarEmoji?: string;
        visibility?: "private" | "friends" | "public";
        tags?: string[];
        webSearchEnabled?: boolean;
        useKnowledgeBase?: boolean;
        x402Enabled?: boolean;
        x402PriceCents?: number;
        x402Network?: "base" | "base-sepolia";
        x402WalletAddress?: string;
        x402PricingMode?: "global" | "per_tool";
        mcpServers?: MCPServer[];
        apiTools?: APITool[];
    }) => Promise<void>;
    userAddress?: string;
}

type TabType = "general" | "capabilities" | "mcp" | "api";

export function EditAgentModal({ isOpen, onClose, agent, onSave, userAddress }: EditAgentModalProps) {
    const [activeTab, setActiveTab] = useState<TabType>("general");
    
    // General settings
    const [name, setName] = useState("");
    const [personality, setPersonality] = useState("");
    const [emoji, setEmoji] = useState("🤖");
    const [visibility, setVisibility] = useState<"private" | "friends" | "public">("private");
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState("");
    
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
    
    // Capabilities
    const [webSearchEnabled, setWebSearchEnabled] = useState(true);
    const [useKnowledgeBase, setUseKnowledgeBase] = useState(true);
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

    // Load agent data when modal opens
    useEffect(() => {
        if (agent && isOpen) {
            setName(agent.name);
            setPersonality(agent.personality || "");
            setEmoji(agent.avatar_emoji || "🤖");
            setVisibility(agent.visibility);
            setTags(agent.tags || []);
            setTagInput("");
            setWebSearchEnabled(agent.web_search_enabled !== false);
            setUseKnowledgeBase(agent.use_knowledge_base !== false);
            setX402Enabled(agent.x402_enabled || false);
            setX402PriceCents(agent.x402_price_cents || 1);
            setX402Network(agent.x402_network || "base");
            setX402WalletAddress(agent.x402_wallet_address || userAddress || "");
            setX402PricingMode(agent.x402_pricing_mode || "global");
            setMcpServers(agent.mcp_servers || []);
            setApiTools(agent.api_tools || []);
            setError(null);
            setShowEmbedCode(false);
            setActiveTab("general");
        }
    }, [agent, isOpen, userAddress]);

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
        
        setMcpServers([...mcpServers, newServer]);
        setNewMcpName("");
        setNewMcpUrl("");
        setNewMcpApiKey("");
        setNewMcpDescription("");
        setNewMcpHeaders({});
        setShowAddMcp(false);
    };

    // Remove MCP server
    const removeMcpServer = (id: string) => {
        setMcpServers(mcpServers.filter(s => s.id !== id));
    };

    // Update MCP server
    const updateMcpServer = (id: string, updates: Partial<MCPServer>) => {
        setMcpServers(mcpServers.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    // Add API Tool
    const addApiTool = () => {
        if (!newApiName || !newApiUrl) return;
        
        const newTool: APITool = {
            id: `api-${Date.now()}`,
            name: newApiName,
            url: newApiUrl,
            method: newApiMethod,
            apiKey: newApiKey || undefined,
            description: newApiDescription || undefined,
            x402Enabled: false,
            x402PriceCents: 1,
        };
        
        // Add headers if any are configured
        if (Object.keys(newApiHeaders).length > 0) {
            // Filter out empty key-value pairs
            const validHeaders: Record<string, string> = {};
            Object.entries(newApiHeaders).forEach(([k, v]) => {
                if (k.trim()) validHeaders[k.trim()] = v;
            });
            if (Object.keys(validHeaders).length > 0) {
                newTool.headers = validHeaders;
            }
        }
        
        setApiTools([...apiTools, newTool]);
        setNewApiName("");
        setNewApiUrl("");
        setNewApiMethod("GET");
        setNewApiKey("");
        setNewApiDescription("");
        setNewApiHeaders({});
        setShowAddApi(false);
    };

    // Remove API Tool
    const removeApiTool = (id: string) => {
        setApiTools(apiTools.filter(t => t.id !== id));
    };

    // Update API Tool
    const updateApiTool = (id: string, updates: Partial<APITool>) => {
        setApiTools(apiTools.map(t => t.id === id ? { ...t, ...updates } : t));
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
            await onSave(agent.id, {
                name: name.trim(),
                personality: personality.trim(),
                avatarEmoji: emoji,
                visibility,
                tags,
                webSearchEnabled,
                useKnowledgeBase,
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

    if (!agent) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
                    onClick={onClose}
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
                            <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800">
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

                                    {/* Emoji */}
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-2">Avatar</label>
                                        <div className="flex flex-wrap gap-2">
                                            {AGENT_EMOJIS.map((e) => (
                                                <button
                                                    key={e}
                                                    onClick={() => setEmoji(e)}
                                                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all ${
                                                        emoji === e
                                                            ? "bg-purple-500/30 border-2 border-purple-500 scale-110"
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
                                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-none"
                                        />
                                    </div>

                                    {/* Visibility */}
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-2">Visibility</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[
                                                { value: "private", label: "🔒 Private" },
                                                { value: "friends", label: "👥 Friends" },
                                                { value: "public", label: "🌍 Public" },
                                            ].map(opt => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => setVisibility(opt.value as typeof visibility)}
                                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                                        visibility === opt.value
                                                            ? "bg-purple-500/20 border-2 border-purple-500 text-purple-400"
                                                            : "bg-zinc-800 border border-zinc-700 text-zinc-400"
                                                    }`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Tags */}
                                    {(visibility === "friends" || visibility === "public") && (
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
                                                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-cyan-500"
                                            />

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
                                onClick={onClose}
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
    color?: "purple" | "emerald";
}) {
    const colorClass = color === "emerald" ? "bg-emerald-500" : "bg-purple-500";
    
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
