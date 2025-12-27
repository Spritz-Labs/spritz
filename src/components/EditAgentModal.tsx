"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Agent } from "@/hooks/useAgents";

const AGENT_EMOJIS = [
    "🤖", "🧠", "💡", "🎯", "🚀", "⚡", "🔮", "🎨",
    "📚", "💼", "🔬", "🎭", "🌟", "🦾", "🤓", "🧙",
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
        webSearchEnabled?: boolean;
        useKnowledgeBase?: boolean;
        x402Enabled?: boolean;
        x402PriceCents?: number;
        x402Network?: "base" | "base-sepolia";
        x402WalletAddress?: string;
    }) => Promise<void>;
    userAddress?: string;
}

export function EditAgentModal({ isOpen, onClose, agent, onSave, userAddress }: EditAgentModalProps) {
    const [name, setName] = useState("");
    const [personality, setPersonality] = useState("");
    const [emoji, setEmoji] = useState("🤖");
    const [visibility, setVisibility] = useState<"private" | "friends" | "public">("private");
    const [webSearchEnabled, setWebSearchEnabled] = useState(true);
    const [useKnowledgeBase, setUseKnowledgeBase] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // x402 state
    const [x402Enabled, setX402Enabled] = useState(false);
    const [x402PriceCents, setX402PriceCents] = useState(1);
    const [x402Network, setX402Network] = useState<"base" | "base-sepolia">("base");
    const [x402WalletAddress, setX402WalletAddress] = useState("");
    const [showEmbedCode, setShowEmbedCode] = useState(false);
    const [embedData, setEmbedData] = useState<{ code: { sdk: string } } | null>(null);

    // Load agent data when modal opens
    useEffect(() => {
        if (agent && isOpen) {
            setName(agent.name);
            setPersonality(agent.personality || "");
            setEmoji(agent.avatar_emoji || "🤖");
            setVisibility(agent.visibility);
            setWebSearchEnabled(agent.web_search_enabled !== false);
            setUseKnowledgeBase(agent.use_knowledge_base !== false);
            // x402 fields
            setX402Enabled(agent.x402_enabled || false);
            setX402PriceCents(agent.x402_price_cents || 1);
            setX402Network(agent.x402_network || "base");
            setX402WalletAddress(agent.x402_wallet_address || userAddress || "");
            setError(null);
            setShowEmbedCode(false);
        }
    }, [agent, isOpen, userAddress]);

    // Fetch embed code when x402 is enabled
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

    const handleSave = async () => {
        if (!agent || !name.trim()) {
            setError("Please give your agent a name");
            return;
        }

        // Validate x402 settings
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
                webSearchEnabled,
                useKnowledgeBase,
                x402Enabled,
                x402PriceCents,
                x402Network,
                x402WalletAddress: x402WalletAddress.trim(),
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
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl">
                                {emoji}
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">Edit Agent</h2>
                                <p className="text-sm text-zinc-400">Update your AI assistant</p>
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        {/* Form */}
                        <div className="space-y-5">
                            {/* Name */}
                            <div>
                                <label className="block text-sm font-medium text-zinc-300 mb-2">
                                    Agent Name *
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g., Research Assistant, Code Helper..."
                                    maxLength={50}
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
                                />
                                <p className="text-xs text-zinc-500 mt-1">{name.length}/50 characters</p>
                            </div>

                            {/* Emoji Picker */}
                            <div>
                                <label className="block text-sm font-medium text-zinc-300 mb-2">
                                    Avatar
                                </label>
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
                                <label className="block text-sm font-medium text-zinc-300 mb-2">
                                    Personality
                                </label>
                                <textarea
                                    value={personality}
                                    onChange={(e) => setPersonality(e.target.value)}
                                    placeholder="Describe how your agent should behave..."
                                    maxLength={1000}
                                    rows={3}
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors resize-none"
                                />
                                <p className="text-xs text-zinc-500 mt-1">{personality.length}/1000 characters</p>
                            </div>

                            {/* Visibility */}
                            <div>
                                <label className="block text-sm font-medium text-zinc-300 mb-2">
                                    Visibility
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        onClick={() => setVisibility("private")}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                            visibility === "private"
                                                ? "bg-purple-500/20 border-2 border-purple-500 text-purple-400"
                                                : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:border-zinc-600"
                                        }`}
                                    >
                                        🔒 Private
                                    </button>
                                    <button
                                        onClick={() => setVisibility("friends")}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                            visibility === "friends"
                                                ? "bg-purple-500/20 border-2 border-purple-500 text-purple-400"
                                                : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:border-zinc-600"
                                        }`}
                                    >
                                        👥 Friends
                                    </button>
                                    <button
                                        onClick={() => setVisibility("public")}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                            visibility === "public"
                                                ? "bg-purple-500/20 border-2 border-purple-500 text-purple-400"
                                                : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:border-zinc-600"
                                        }`}
                                    >
                                        🌍 Public
                                    </button>
                                </div>
                                <p className="text-xs text-zinc-500 mt-2">
                                    {visibility === "private" && "Only you can use this agent"}
                                    {visibility === "friends" && "Your friends can also use this agent"}
                                    {visibility === "public" && "Anyone can discover and use this agent"}
                                </p>
                            </div>

                            {/* Capabilities */}
                            <div>
                                <label className="block text-sm font-medium text-zinc-300 mb-3">
                                    Capabilities
                                </label>
                                <div className="space-y-3">
                                    {/* Web Search Toggle */}
                                    <label className="flex items-center justify-between p-3 bg-zinc-800 border border-zinc-700 rounded-xl cursor-pointer hover:border-zinc-600 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xl">🔍</span>
                                            <div>
                                                <p className="text-sm font-medium text-white">Web Search</p>
                                                <p className="text-xs text-zinc-500">Access real-time information from the web</p>
                                            </div>
                                        </div>
                                        <div 
                                            onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                                            className={`w-11 h-6 rounded-full transition-colors relative ${
                                                webSearchEnabled ? "bg-purple-500" : "bg-zinc-600"
                                            }`}
                                        >
                                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                                                webSearchEnabled ? "left-6" : "left-1"
                                            }`} />
                                        </div>
                                    </label>

                                    {/* Knowledge Base Toggle */}
                                    <label className="flex items-center justify-between p-3 bg-zinc-800 border border-zinc-700 rounded-xl cursor-pointer hover:border-zinc-600 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xl">📚</span>
                                            <div>
                                                <p className="text-sm font-medium text-white">Knowledge Base</p>
                                                <p className="text-xs text-zinc-500">Use added URLs as context for responses</p>
                                            </div>
                                        </div>
                                        <div 
                                            onClick={() => setUseKnowledgeBase(!useKnowledgeBase)}
                                            className={`w-11 h-6 rounded-full transition-colors relative ${
                                                useKnowledgeBase ? "bg-purple-500" : "bg-zinc-600"
                                            }`}
                                        >
                                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                                                useKnowledgeBase ? "left-6" : "left-1"
                                            }`} />
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* x402 API Access */}
                            <div className="border-t border-zinc-800 pt-5">
                                <label className="block text-sm font-medium text-zinc-300 mb-3">
                                    💰 x402 External API Access
                                </label>
                                <p className="text-xs text-zinc-500 mb-3">
                                    Enable micropayments so external apps can use your agent via API. Payments are in USDC on Base.
                                </p>
                                
                                {/* x402 Enable Toggle */}
                                <label className="flex items-center justify-between p-3 bg-zinc-800 border border-zinc-700 rounded-xl cursor-pointer hover:border-zinc-600 transition-colors mb-3">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl">🔌</span>
                                        <div>
                                            <p className="text-sm font-medium text-white">Enable x402 API</p>
                                            <p className="text-xs text-zinc-500">Let external apps pay to use your agent</p>
                                        </div>
                                    </div>
                                    <div 
                                        onClick={() => setX402Enabled(!x402Enabled)}
                                        className={`w-11 h-6 rounded-full transition-colors relative ${
                                            x402Enabled ? "bg-emerald-500" : "bg-zinc-600"
                                        }`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                                            x402Enabled ? "left-6" : "left-1"
                                        }`} />
                                    </div>
                                </label>

                                {/* x402 Configuration (shown when enabled) */}
                                {x402Enabled && (
                                    <div className="space-y-3 pl-3 border-l-2 border-emerald-500/30">
                                        {visibility !== "public" && (
                                            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                                                <p className="text-xs text-amber-400">
                                                    ⚠️ x402 requires Public visibility. Change visibility above to enable API access.
                                                </p>
                                            </div>
                                        )}
                                        
                                        {/* Price per message */}
                                        <div>
                                            <label className="block text-xs font-medium text-zinc-400 mb-1">
                                                Price per Message (USD)
                                            </label>
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

                                        {/* Network */}
                                        <div>
                                            <label className="block text-xs font-medium text-zinc-400 mb-1">
                                                Network
                                            </label>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setX402Network("base")}
                                                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
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
                                                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                                        x402Network === "base-sepolia"
                                                            ? "bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400"
                                                            : "bg-zinc-800 border border-zinc-700 text-zinc-400"
                                                    }`}
                                                >
                                                    Base Sepolia (Test)
                                                </button>
                                            </div>
                                        </div>

                                        {/* Wallet Address */}
                                        <div>
                                            <label className="block text-xs font-medium text-zinc-400 mb-1">
                                                Payment Wallet Address
                                            </label>
                                            <input
                                                type="text"
                                                value={x402WalletAddress}
                                                onChange={(e) => setX402WalletAddress(e.target.value)}
                                                placeholder="0x..."
                                                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-emerald-500"
                                            />
                                            <p className="text-xs text-zinc-500 mt-1">
                                                Payments will be sent to this address
                                            </p>
                                        </div>

                                        {/* Get Embed Code Button */}
                                        {agent?.x402_enabled && (
                                            <button
                                                type="button"
                                                onClick={fetchEmbedCode}
                                                className="w-full py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-400 rounded-lg text-sm font-medium transition-colors"
                                            >
                                                📋 Get SDK / Embed Code
                                            </button>
                                        )}

                                        {/* Show earnings stats if enabled */}
                                        {agent?.x402_enabled && (agent.x402_message_count_paid || 0) > 0 && (
                                            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                                                <p className="text-xs text-emerald-400 font-medium mb-1">💰 Earnings</p>
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-zinc-400">Paid Messages:</span>
                                                    <span className="text-white">{agent.x402_message_count_paid || 0}</span>
                                                </div>
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-zinc-400">Total Earned:</span>
                                                    <span className="text-emerald-400">${((agent.x402_total_earnings_cents || 0) / 100).toFixed(2)}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Embed Code Modal */}
                            {showEmbedCode && embedData && (
                                <div className="p-4 bg-zinc-800 border border-zinc-700 rounded-xl">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-sm font-medium text-white">SDK Integration Code</h4>
                                        <button
                                            onClick={() => setShowEmbedCode(false)}
                                            className="text-zinc-400 hover:text-white"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    <pre className="text-xs bg-zinc-900 p-3 rounded-lg overflow-x-auto text-zinc-300 max-h-48">
                                        {embedData.code.sdk}
                                    </pre>
                                    <button
                                        onClick={() => navigator.clipboard.writeText(embedData.code.sdk)}
                                        className="mt-2 w-full py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs text-white transition-colors"
                                    >
                                        📋 Copy to Clipboard
                                    </button>
                                </div>
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
                                {isSaving ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Saving...
                                    </span>
                                ) : (
                                    "Save Changes"
                                )}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default EditAgentModal;

