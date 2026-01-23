"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";

interface Agent {
    id: string;
    name: string;
    personality: string | null;
    avatar_emoji: string;
    avatar_url?: string | null;
    visibility: string;
    x402_enabled: boolean;
    x402_price_cents: number;
    x402_network: string;
    owner_address: string;
    tags?: string[];
    suggested_questions?: string[];
}

interface Message {
    role: "user" | "assistant";
    content: string;
}

export default function PublicAgentPage() {
    const params = useParams();
    const id = params?.id as string;
    
    const [agent, setAgent] = useState<Agent | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [paymentRequired, setPaymentRequired] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Fetch agent details
    useEffect(() => {
        const fetchAgent = async () => {
            if (!id) return;
            
            try {
                const res = await fetch(`/api/public/agents/${id}`);
                if (res.ok) {
                    const data = await res.json();
                    setAgent(data);
                    // Only require payment if x402 is explicitly enabled
                    setPaymentRequired(data.x402_enabled === true);
                } else if (res.status === 404) {
                    setError("Agent not found or not public");
                } else if (res.status === 403) {
                    setError("This agent is not public");
                } else {
                    setError("Failed to load agent");
                }
            } catch {
                setError("Failed to connect");
            } finally {
                setLoading(false);
            }
        };
        
        fetchAgent();
    }, [id]);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || sending || !agent) return;
        
        const userMessage = input.trim();
        setInput("");
        setMessages(prev => [...prev, { role: "user", content: userMessage }]);
        setSending(true);

        try {
            const res = await fetch(`/api/public/agents/${id}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: userMessage })
            });

            if (res.status === 402) {
                // Payment required
                const data = await res.json();
                const price = data.price || agent.x402_price_cents || 0;
                setMessages(prev => [...prev, { 
                    role: "assistant", 
                    content: `💰 **Payment Required**\n\nThis agent requires a payment of **$${(price / 100).toFixed(2)}** per message.\n\nTo use this agent programmatically with x402 payments, use the embed code from the agent owner.`
                }]);
                setPaymentRequired(true);
            } else if (res.ok) {
                const data = await res.json();
                // Handle both 'message' and 'response' keys for compatibility
                const responseText = data.message || data.response || "No response";
                setMessages(prev => [...prev, { role: "assistant", content: responseText }]);
            } else {
                const data = await res.json();
                setMessages(prev => [...prev, { 
                    role: "assistant", 
                    content: `❌ Error: ${data.error || "Failed to get response"}` 
                }]);
            }
        } catch {
            setMessages(prev => [...prev, { 
                role: "assistant", 
                content: "❌ Failed to connect to the agent" 
            }]);
        } finally {
            setSending(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin text-4xl mb-4">🤖</div>
                    <p className="text-zinc-400">Loading agent...</p>
                </div>
            </div>
        );
    }

    if (error || !agent) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="text-center">
                    <div className="text-6xl mb-4">😕</div>
                    <h1 className="text-2xl font-bold text-white mb-2">Agent Not Available</h1>
                    <p className="text-zinc-400">{error || "This agent could not be loaded"}</p>
                    <a href="/" className="mt-6 inline-block px-4 py-2 bg-[#FF5500] text-white rounded-lg hover:bg-[#E04D00] transition-colors">
                        Go to Spritz
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col">
            {/* Header */}
            <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="max-w-3xl mx-auto px-4 py-4">
                        <div className="flex items-center gap-4">
                        {agent.avatar_url ? (
                            <img 
                                src={agent.avatar_url} 
                                alt={agent.name} 
                                className="w-12 h-12 rounded-xl object-cover"
                            />
                        ) : (
                            <div className="text-4xl">{agent.avatar_emoji}</div>
                        )}
                        <div className="flex-1">
                            <h1 className="text-xl font-bold text-white flex items-center gap-2">
                                {agent.name}
                                {agent.x402_enabled ? (
                                    <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                                        💰 ${(agent.x402_price_cents / 100).toFixed(2)}/msg
                                    </span>
                                ) : (
                                    <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                                        ✨ Free
                                    </span>
                                )}
                            </h1>
                            {agent.personality && (
                                <p className="text-sm text-zinc-400 line-clamp-1">{agent.personality}</p>
                            )}
                        </div>
                        <a 
                            href="/"
                            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                            Powered by <span className="text-orange-400">Spritz</span>
                        </a>
                    </div>
                    {agent.tags && agent.tags.length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                            {agent.tags.map(tag => (
                                <span key={tag} className="text-xs px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded-full">
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </header>

            {/* Chat Messages */}
            <main className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-4 py-6">
                    {messages.length === 0 ? (
                        <div className="text-center py-12">
                            {agent.avatar_url ? (
                                <img 
                                    src={agent.avatar_url} 
                                    alt={agent.name} 
                                    className="w-24 h-24 rounded-2xl object-cover mx-auto mb-4"
                                />
                            ) : (
                                <div className="text-6xl mb-4">{agent.avatar_emoji}</div>
                            )}
                            <h2 className="text-xl font-semibold text-white mb-2">
                                Chat with {agent.name}
                            </h2>
                            <p className="text-zinc-400 mb-6 max-w-md mx-auto">
                                {agent.personality || "Ask me anything!"}
                            </p>
                            
                            {/* Suggested Questions */}
                            {agent.suggested_questions && agent.suggested_questions.length > 0 && (
                                <div className="mb-6 max-w-lg mx-auto">
                                    <p className="text-xs text-zinc-500 mb-3">Try asking:</p>
                                    <div className="flex flex-wrap gap-2 justify-center">
                                        {agent.suggested_questions.map((question, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => {
                                                    setInput(question);
                                                    // Auto-send after a brief delay for UX
                                                    setTimeout(() => {
                                                        setMessages(prev => [...prev, { role: "user", content: question }]);
                                                        setInput("");
                                                        setSending(true);
                                                        fetch(`/api/public/agents/${id}/chat`, {
                                                            method: "POST",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({ message: question })
                                                        }).then(async (res) => {
                                                            if (res.ok) {
                                                                const data = await res.json();
                                                                setMessages(prev => [...prev, { role: "assistant", content: data.message || data.response || "No response" }]);
                                                            } else {
                                                                const data = await res.json();
                                                                setMessages(prev => [...prev, { role: "assistant", content: `❌ Error: ${data.error || "Failed to get response"}` }]);
                                                            }
                                                        }).catch(() => {
                                                            setMessages(prev => [...prev, { role: "assistant", content: "❌ Failed to connect to the agent" }]);
                                                        }).finally(() => {
                                                            setSending(false);
                                                        });
                                                    }, 100);
                                                }}
                                                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 rounded-xl text-sm text-zinc-300 hover:text-white transition-all"
                                            >
                                                {question}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            {agent.x402_enabled ? (
                                <div className="inline-block bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3 text-sm">
                                    <p className="text-yellow-400 font-medium">💰 This agent uses x402 payments</p>
                                    <p className="text-zinc-400 text-xs mt-1">
                                        ${(agent.x402_price_cents / 100).toFixed(2)} per message on {agent.x402_network}
                                    </p>
                                </div>
                            ) : (
                                <div className="inline-block bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 text-sm">
                                    <p className="text-emerald-400 font-medium">✨ Free to chat</p>
                                    <p className="text-zinc-400 text-xs mt-1">
                                        This public agent is free to use
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <AnimatePresence>
                                {messages.map((msg, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                                    >
                                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                                            msg.role === "user" 
                                                ? "bg-[#FF5500] text-white" 
                                                : "bg-zinc-800 text-zinc-100"
                                        }`}>
                                            {msg.role === "assistant" && (
                                                <div className="flex items-center gap-2 mb-1 text-xs text-zinc-400">
                                                    {agent.avatar_url ? (
                                                        <img src={agent.avatar_url} alt="" className="w-4 h-4 rounded object-cover" />
                                                    ) : (
                                                        <span>{agent.avatar_emoji}</span>
                                                    )}
                                                    <span>{agent.name}</span>
                                                </div>
                                            )}
                                            <div className="whitespace-pre-wrap text-sm">
                                                {msg.content}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            {sending && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex justify-start"
                                >
                                    <div className="bg-zinc-800 rounded-2xl px-4 py-3">
                                        <div className="flex items-center gap-2 text-zinc-400">
                                            {agent.avatar_url ? (
                                                <img src={agent.avatar_url} alt="" className="w-5 h-5 rounded object-cover animate-pulse" />
                                            ) : (
                                                <span className="animate-pulse">{agent.avatar_emoji}</span>
                                            )}
                                            <span className="text-sm">Thinking...</span>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>
            </main>

            {/* Input Area */}
            <footer className="border-t border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky bottom-0">
                <div className="max-w-3xl mx-auto px-4 py-4">
                    <form 
                        onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                        className="flex gap-3"
                    >
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={agent.x402_enabled 
                                ? `Chat (${agent.x402_price_cents}¢/msg)...` 
                                : "Type a message..."}
                            disabled={sending}
                            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF5500] disabled:opacity-50"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || sending}
                            className="px-6 py-3 bg-[#FF5500] hover:bg-[#E04D00] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors"
                        >
                            {sending ? "..." : "Send"}
                        </button>
                    </form>
                    {agent.x402_enabled ? (
                        <p className="text-xs text-zinc-500 text-center mt-2">
                            This agent requires x402 payment. Use the SDK for programmatic access with payments.
                        </p>
                    ) : (
                        <p className="text-xs text-zinc-500 text-center mt-2">
                            Powered by <a href="/" className="text-[#FF5500] hover:underline">Spritz</a> • Public AI Agent
                        </p>
                    )}
                </div>
            </footer>
        </div>
    );
}

