"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

const AGENT_EMOJIS = [
    "🤖", "🧠", "💡", "🎯", "🚀", "⚡", "🔮", "🎨",
    "📚", "💼", "🔬", "🎭", "🌟", "🦾", "🤓", "🧙",
];

const PERSONALITY_SUGGESTIONS = [
    "Friendly and helpful, explains things simply",
    "Professional and concise, focused on efficiency",
    "Creative and imaginative, thinks outside the box",
    "Patient teacher who breaks down complex topics",
    "Energetic motivator who encourages growth",
    "Analytical thinker who provides detailed insights",
];

// Pre-built agent templates
const AGENT_TEMPLATES = [
    {
        id: "code-helper",
        name: "Code Helper",
        emoji: "💻",
        personality: "Expert programmer who helps with coding questions. Explains code clearly, suggests best practices, and helps debug issues. Writes clean, well-commented code examples.",
        color: "from-blue-500 to-cyan-500",
    },
    {
        id: "writing-assistant",
        name: "Writing Assistant",
        emoji: "✍️",
        personality: "Creative writing helper who assists with crafting compelling content. Helps with grammar, style, tone, and structure. Provides constructive feedback and suggestions.",
        color: "from-purple-500 to-pink-500",
    },
    {
        id: "research-buddy",
        name: "Research Buddy",
        emoji: "🔬",
        personality: "Thorough researcher who helps find and analyze information. Summarizes complex topics, cites sources when possible, and asks clarifying questions to understand your needs.",
        color: "from-emerald-500 to-teal-500",
    },
    {
        id: "brainstorm-partner",
        name: "Brainstorm Partner",
        emoji: "💡",
        personality: "Creative thinking partner who generates innovative ideas. Uses techniques like mind mapping, lateral thinking, and 'yes, and...' to build on concepts. Never dismisses ideas.",
        color: "from-amber-500 to-orange-500",
    },
    {
        id: "study-tutor",
        name: "Study Tutor",
        emoji: "📚",
        personality: "Patient educator who breaks down complex subjects into digestible pieces. Uses analogies, examples, and practice questions. Adapts explanations based on understanding level.",
        color: "from-indigo-500 to-purple-500",
    },
    {
        id: "fitness-coach",
        name: "Fitness Coach",
        emoji: "💪",
        personality: "Motivating fitness advisor who provides workout tips, nutrition guidance, and encouragement. Emphasizes safety and sustainable habits. Celebrates progress of all sizes.",
        color: "from-red-500 to-pink-500",
    },
];

interface CreateAgentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (name: string, personality: string, emoji: string, visibility: "private" | "friends" | "public" | "official", tags: string[]) => Promise<void>;
    isAdmin?: boolean;
}

// Popular tag suggestions
const TAG_SUGGESTIONS = [
    "coding", "writing", "research", "math", "creative", "productivity",
    "learning", "fitness", "finance", "health", "gaming", "music",
    "art", "science", "business", "education", "assistant", "fun",
];

export function CreateAgentModal({ isOpen, onClose, onCreate, isAdmin = false }: CreateAgentModalProps) {
    const [name, setName] = useState("");
    const [personality, setPersonality] = useState("");
    const [emoji, setEmoji] = useState("🤖");
    const [visibility, setVisibility] = useState<"private" | "friends" | "public" | "official">("private");
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showTemplates, setShowTemplates] = useState(true);

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

    const applyTemplate = (template: typeof AGENT_TEMPLATES[0]) => {
        setName(template.name);
        setEmoji(template.emoji);
        setPersonality(template.personality);
        setShowTemplates(false);
    };

    const handleCreate = async () => {
        if (!name.trim()) {
            setError("Please give your agent a name");
            return;
        }

        setIsCreating(true);
        setError(null);

        try {
            await onCreate(name.trim(), personality.trim(), emoji, visibility, tags);
            // Reset form
            setName("");
            setTags([]);
            setTagInput("");
            setPersonality("");
            setEmoji("🤖");
            setVisibility("private");
            setShowTemplates(true);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create agent");
        } finally {
            setIsCreating(false);
        }
    };

    const handleClose = () => {
        setName("");
        setPersonality("");
        setEmoji("🤖");
        setVisibility("private");
        setTags([]);
        setTagInput("");
        setShowTemplates(true);
        setError(null);
        onClose();
    };

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
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl">
                                    {emoji}
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white">Create AI Agent</h2>
                                    <p className="text-sm text-zinc-400">
                                        {showTemplates ? "Choose a template or start from scratch" : "Customize your agent"}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleClose}
                                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        {/* Templates */}
                        {showTemplates && (
                            <div className="mb-6">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-medium text-zinc-300">Quick Start Templates</h3>
                                    <button
                                        onClick={() => setShowTemplates(false)}
                                        className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                                    >
                                        Start from scratch →
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {AGENT_TEMPLATES.map((template) => (
                                        <button
                                            key={template.id}
                                            onClick={() => applyTemplate(template)}
                                            className="p-3 bg-zinc-800/50 border border-zinc-700 rounded-xl hover:border-purple-500/50 hover:bg-zinc-800 transition-all text-left group"
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`w-8 h-8 rounded-lg bg-gradient-to-br ${template.color} flex items-center justify-center text-lg group-hover:scale-110 transition-transform`}>
                                                    {template.emoji}
                                                </span>
                                                <span className="font-medium text-white text-sm">{template.name}</span>
                                            </div>
                                            <p className="text-xs text-zinc-500 line-clamp-2">
                                                {template.personality.slice(0, 60)}...
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Form */}
                        <div className={`space-y-5 ${showTemplates ? "opacity-50 pointer-events-none" : ""}`}>
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
                                
                                {/* Suggestions */}
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {PERSONALITY_SUGGESTIONS.slice(0, 3).map((suggestion) => (
                                        <button
                                            key={suggestion}
                                            onClick={() => setPersonality(suggestion)}
                                            className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-300 transition-colors"
                                        >
                                            {suggestion.slice(0, 30)}...
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Visibility */}
                            <div>
                                <label className="block text-sm font-medium text-zinc-300 mb-2">
                                    Visibility
                                </label>
                                <div className={`grid gap-2 ${isAdmin ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
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
                                    {isAdmin && (
                                        <button
                                            onClick={() => setVisibility("official")}
                                            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                                visibility === "official"
                                                    ? "bg-orange-500/20 border-2 border-orange-500 text-orange-400"
                                                    : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:border-zinc-600"
                                            }`}
                                        >
                                            ⭐ Official
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-zinc-500 mt-2">
                                    {visibility === "private" && "Only you can use this agent"}
                                    {visibility === "friends" && "Your friends can also use this agent"}
                                    {visibility === "public" && "Anyone can discover and use this agent"}
                                    {visibility === "official" && "Official Spritz agent - public & managed by admins"}
                                </p>
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
                                onClick={handleCreate}
                                disabled={isCreating || !name.trim()}
                                className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all"
                            >
                                {isCreating ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Creating...
                                    </span>
                                ) : (
                                    "Create Agent"
                                )}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default CreateAgentModal;

