"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Custom image component for nice logo/image display
function MarkdownImage({ src, alt }: { src?: string | Blob; alt?: string }) {
    const [error, setError] = useState(false);
    const [loaded, setLoaded] = useState(false);

    // Convert src to string (ignore Blob for now)
    const srcStr = typeof src === "string" ? src : undefined;

    if (!srcStr || error) {
        return (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-400">
                🖼️ {alt || "Image"}
            </span>
        );
    }

    return (
        <span className="inline-block my-2">
            <img
                src={srcStr}
                alt={alt || ""}
                onError={() => setError(true)}
                onLoad={() => setLoaded(true)}
                className={`max-w-full h-auto max-h-32 rounded-lg border border-zinc-700 bg-zinc-800 object-contain transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
            />
            {alt && (
                <span className="block text-xs text-zinc-500 mt-1 text-center">
                    {alt}
                </span>
            )}
        </span>
    );
}

// Logo grid component for displaying multiple logos nicely
function LogoGrid({ children }: { children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 my-4">
            {children}
        </div>
    );
}

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
    has_events?: boolean;
    events_count?: number;
}

interface Message {
    role: "user" | "assistant";
    content: string;
}

const SESSION_STORAGE_KEY = "spritz-agent-chat-session";

function getOrCreateSessionId(agentId: string): string {
    if (typeof window === "undefined")
        return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const key = `${SESSION_STORAGE_KEY}-${agentId}`;
    let sessionId = localStorage.getItem(key);
    if (!sessionId) {
        sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(key, sessionId);
    }
    return sessionId;
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

    // Hydrate chat history when agent is loaded (continuity across refresh)
    useEffect(() => {
        if (!id || !agent) return;
        const sessionId = getOrCreateSessionId(id);
        const fetchHistory = async () => {
            try {
                const res = await fetch(
                    `/api/public/agents/${id}/history?sessionId=${encodeURIComponent(sessionId)}`,
                );
                if (res.ok) {
                    const data = await res.json();
                    if (data.messages?.length) {
                        setMessages(
                            data.messages.map(
                                (m: { role: string; content: string }) => ({
                                    role: m.role as "user" | "assistant",
                                    content: m.content,
                                }),
                            ),
                        );
                    }
                }
            } catch {
                // ignore
            }
        };
        fetchHistory();
    }, [id, agent?.id]);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || sending || !agent) return;

        const userMessage = input.trim();
        setInput("");
        setMessages((prev) => [
            ...prev,
            { role: "user", content: userMessage },
        ]);
        setSending(true);
        const sessionId = getOrCreateSessionId(id);
        const useStream = true;

        try {
            const res = await fetch(`/api/public/agents/${id}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: userMessage,
                    sessionId,
                    stream: useStream,
                }),
            });

            if (res.status === 402) {
                const data = await res.json();
                const price = data.price || agent.x402_price_cents || 0;
                setMessages((prev) => [
                    ...prev,
                    {
                        role: "assistant",
                        content: `💰 **Payment Required**\n\nThis agent requires a payment of **$${(price / 100).toFixed(2)}** per message.\n\nTo use this agent programmatically with x402 payments, use the embed code from the agent owner.`,
                    },
                ]);
                setPaymentRequired(true);
                setSending(false);
                return;
            }

            const contentType = res.headers.get("content-type") || "";
            if (
                res.ok &&
                useStream &&
                contentType.includes("application/x-ndjson") &&
                res.body
            ) {
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                let streamedContent = "";
                setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: "" },
                ]);
                const appendStreamed = (chunk: string) => {
                    streamedContent += chunk;
                    setMessages((prev) => {
                        const next = [...prev];
                        const last = next[next.length - 1];
                        if (last?.role === "assistant")
                            next[next.length - 1] = {
                                ...last,
                                content: streamedContent,
                            };
                        return next;
                    });
                };
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split("\n");
                        buffer = lines.pop() || "";
                        for (const line of lines) {
                            if (!line.trim()) continue;
                            try {
                                const data = JSON.parse(line);
                                if (data.type === "chunk" && data.text)
                                    appendStreamed(data.text);
                                if (data.type === "done") {
                                    if (
                                        data.sessionId &&
                                        typeof window !== "undefined"
                                    ) {
                                        localStorage.setItem(
                                            `${SESSION_STORAGE_KEY}-${id}`,
                                            data.sessionId,
                                        );
                                    }
                                    if (data.message) {
                                        streamedContent = data.message;
                                        setMessages((prev) => {
                                            const next = [...prev];
                                            const last = next[next.length - 1];
                                            if (last?.role === "assistant")
                                                next[next.length - 1] = {
                                                    ...last,
                                                    content: data.message,
                                                };
                                            return next;
                                        });
                                    }
                                }
                                if (data.type === "error") {
                                    setMessages((prev) => {
                                        const next = [...prev];
                                        const last = next[next.length - 1];
                                        if (last?.role === "assistant")
                                            next[next.length - 1] = {
                                                ...last,
                                                content: `❌ ${data.error || "Error"}`,
                                            };
                                        return next;
                                    });
                                }
                            } catch {
                                // skip malformed line
                            }
                        }
                    }
                } finally {
                    reader.releaseLock();
                }
                setSending(false);
                return;
            }

            if (res.ok) {
                const data = await res.json();
                if (data.sessionId && typeof window !== "undefined") {
                    localStorage.setItem(
                        `${SESSION_STORAGE_KEY}-${id}`,
                        data.sessionId,
                    );
                }
                const responseText =
                    data.message || data.response || "No response";
                setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: responseText },
                ]);
            } else {
                const data = await res.json();
                setMessages((prev) => [
                    ...prev,
                    {
                        role: "assistant",
                        content: `❌ Error: ${data.error || "Failed to get response"}`,
                    },
                ]);
            }
        } catch {
            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: "❌ Failed to connect to the agent",
                },
            ]);
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
                    <h1 className="text-2xl font-bold text-white mb-2">
                        Agent Not Available
                    </h1>
                    <p className="text-zinc-400">
                        {error || "This agent could not be loaded"}
                    </p>
                    <a
                        href="/"
                        className="mt-6 inline-block px-4 py-2 bg-[#FF5500] text-white rounded-lg hover:bg-[#E04D00] transition-colors"
                    >
                        Go to Spritz
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col">
            {/* Header */}
            <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md sticky top-0 z-10">
                <div className="max-w-3xl mx-auto px-4 py-3">
                    <div className="flex items-center gap-3">
                        {agent.avatar_url ? (
                            <img
                                src={agent.avatar_url}
                                alt={agent.name}
                                className="w-11 h-11 rounded-xl object-cover ring-2 ring-zinc-700"
                            />
                        ) : (
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-2xl ring-2 ring-zinc-700">
                                {agent.avatar_emoji}
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-lg font-bold text-white truncate">
                                    {agent.name}
                                </h1>
                                {agent.visibility === "official" && (
                                    <span className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                                        ⭐ Official
                                    </span>
                                )}
                                {agent.x402_enabled ? (
                                    <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded font-medium">
                                        💰 $
                                        {(agent.x402_price_cents / 100).toFixed(
                                            2,
                                        )}
                                        /msg
                                    </span>
                                ) : (
                                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-medium">
                                        ✨ Free
                                    </span>
                                )}
                            </div>
                            {agent.personality && (
                                <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5">
                                    {agent.personality}
                                </p>
                            )}
                        </div>
                        <a
                            href="/"
                            className="hidden sm:block text-xs text-zinc-500 hover:text-zinc-300 transition-colors whitespace-nowrap"
                        >
                            Powered by{" "}
                            <span className="text-orange-400 font-medium">
                                Spritz
                            </span>
                        </a>
                    </div>
                    {agent.tags && agent.tags.length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                            {agent.tags.map((tag) => (
                                <span
                                    key={tag}
                                    className="text-[10px] px-2 py-0.5 bg-zinc-800 text-zinc-500 rounded-full"
                                >
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
                                <div className="text-6xl mb-4">
                                    {agent.avatar_emoji}
                                </div>
                            )}
                            <h2 className="text-xl font-semibold text-white mb-2">
                                Chat with {agent.name}
                            </h2>
                            <p className="text-zinc-400 mb-6 max-w-md mx-auto">
                                {agent.personality || "Ask me anything!"}
                            </p>

                            {/* Suggested Questions */}
                            {agent.suggested_questions &&
                                agent.suggested_questions.length > 0 && (
                                    <div className="mb-6 max-w-lg mx-auto">
                                        <p className="text-xs text-zinc-500 mb-3">
                                            Try asking:
                                        </p>
                                        <div className="flex flex-wrap gap-2 justify-center">
                                            {agent.suggested_questions.map(
                                                (question, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => {
                                                            setInput(question);
                                                            // Auto-send after a brief delay for UX
                                                            setTimeout(() => {
                                                                setMessages(
                                                                    (prev) => [
                                                                        ...prev,
                                                                        {
                                                                            role: "user",
                                                                            content:
                                                                                question,
                                                                        },
                                                                    ],
                                                                );
                                                                setInput("");
                                                                setSending(
                                                                    true,
                                                                );
                                                                fetch(
                                                                    `/api/public/agents/${id}/chat`,
                                                                    {
                                                                        method: "POST",
                                                                        headers:
                                                                            {
                                                                                "Content-Type":
                                                                                    "application/json",
                                                                            },
                                                                        body: JSON.stringify(
                                                                            {
                                                                                message:
                                                                                    question,
                                                                            },
                                                                        ),
                                                                    },
                                                                )
                                                                    .then(
                                                                        async (
                                                                            res,
                                                                        ) => {
                                                                            if (
                                                                                res.ok
                                                                            ) {
                                                                                const data =
                                                                                    await res.json();
                                                                                setMessages(
                                                                                    (
                                                                                        prev,
                                                                                    ) => [
                                                                                        ...prev,
                                                                                        {
                                                                                            role: "assistant",
                                                                                            content:
                                                                                                data.message ||
                                                                                                data.response ||
                                                                                                "No response",
                                                                                        },
                                                                                    ],
                                                                                );
                                                                            } else {
                                                                                const data =
                                                                                    await res.json();
                                                                                setMessages(
                                                                                    (
                                                                                        prev,
                                                                                    ) => [
                                                                                        ...prev,
                                                                                        {
                                                                                            role: "assistant",
                                                                                            content: `❌ Error: ${data.error || "Failed to get response"}`,
                                                                                        },
                                                                                    ],
                                                                                );
                                                                            }
                                                                        },
                                                                    )
                                                                    .catch(
                                                                        () => {
                                                                            setMessages(
                                                                                (
                                                                                    prev,
                                                                                ) => [
                                                                                    ...prev,
                                                                                    {
                                                                                        role: "assistant",
                                                                                        content:
                                                                                            "❌ Failed to connect to the agent",
                                                                                    },
                                                                                ],
                                                                            );
                                                                        },
                                                                    )
                                                                    .finally(
                                                                        () => {
                                                                            setSending(
                                                                                false,
                                                                            );
                                                                        },
                                                                    );
                                                            }, 100);
                                                        }}
                                                        className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 rounded-xl text-sm text-zinc-300 hover:text-white transition-all"
                                                    >
                                                        {question}
                                                    </button>
                                                ),
                                            )}
                                        </div>
                                    </div>
                                )}

                            {agent.x402_enabled && (
                                <div className="inline-block bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3 text-sm">
                                    <p className="text-yellow-400 font-medium">
                                        💰 This agent uses x402 payments
                                    </p>
                                    <p className="text-zinc-400 text-xs mt-1">
                                        $
                                        {(agent.x402_price_cents / 100).toFixed(
                                            2,
                                        )}{" "}
                                        per message on {agent.x402_network}
                                    </p>
                                </div>
                            )}

                            {/* Events Link */}
                            {agent.has_events &&
                                agent.events_count &&
                                agent.events_count > 0 && (
                                    <a
                                        href={`/agent/${id}/events`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 border border-purple-500/30 hover:border-purple-500/50 rounded-full text-purple-300 hover:text-purple-200 text-sm font-medium transition-all"
                                    >
                                        📅 View {agent.events_count} Events →
                                    </a>
                                )}

                            {/* CTA to sign up */}
                            <div className="mt-8 pt-6 border-t border-zinc-800/50">
                                <a
                                    href="/"
                                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700 hover:border-zinc-600 rounded-xl text-sm text-zinc-300 hover:text-white transition-all group"
                                >
                                    <span className="text-orange-400">🍊</span>
                                    <span>
                                        Sign up for{" "}
                                        <span className="text-orange-400 font-medium">
                                            Spritz
                                        </span>{" "}
                                        for more features
                                    </span>
                                    <svg
                                        className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 group-hover:translate-x-0.5 transition-all"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M9 5l7 7-7 7"
                                        />
                                    </svg>
                                </a>
                                <p className="text-[10px] text-zinc-600 mt-2">
                                    Create your own AI agents • Chat with
                                    friends • Web3 wallet
                                </p>
                            </div>
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
                                        <div
                                            className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                                                msg.role === "user"
                                                    ? "bg-[#FF5500] text-white"
                                                    : "bg-zinc-800/80 text-zinc-100 border border-zinc-700/50"
                                            }`}
                                        >
                                            {msg.role === "assistant" && (
                                                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-zinc-700/50">
                                                    {agent.avatar_url ? (
                                                        <img
                                                            src={
                                                                agent.avatar_url
                                                            }
                                                            alt=""
                                                            className="w-5 h-5 rounded-md object-cover"
                                                        />
                                                    ) : (
                                                        <span className="text-sm">
                                                            {agent.avatar_emoji}
                                                        </span>
                                                    )}
                                                    <span className="text-xs font-medium text-zinc-300">
                                                        {agent.name}
                                                    </span>
                                                </div>
                                            )}
                                            {msg.role === "user" ? (
                                                <div className="text-sm whitespace-pre-wrap">
                                                    {msg.content}
                                                </div>
                                            ) : (
                                                <div
                                                    className="prose prose-sm prose-invert max-w-none
                                                    prose-p:my-2 prose-p:leading-relaxed
                                                    prose-headings:text-white prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
                                                    prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
                                                    prose-strong:text-orange-300 prose-strong:font-semibold
                                                    prose-em:text-zinc-300
                                                    prose-ul:my-2 prose-ul:pl-4 prose-li:my-0.5 prose-li:marker:text-orange-400
                                                    prose-ol:my-2 prose-ol:pl-4
                                                    prose-code:bg-zinc-900 prose-code:text-orange-300 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-[''] prose-code:after:content-['']
                                                    prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-700 prose-pre:rounded-lg prose-pre:my-2
                                                    prose-a:text-orange-400 prose-a:no-underline hover:prose-a:underline
                                                    prose-hr:border-zinc-700 prose-hr:my-3
                                                    prose-blockquote:border-l-orange-500 prose-blockquote:bg-zinc-900/50 prose-blockquote:pl-4 prose-blockquote:py-1 prose-blockquote:my-2 prose-blockquote:rounded-r
                                                "
                                                >
                                                    <ReactMarkdown
                                                        remarkPlugins={[
                                                            remarkGfm,
                                                        ]}
                                                        components={{
                                                            img: ({
                                                                src,
                                                                alt,
                                                            }) => (
                                                                <MarkdownImage
                                                                    src={src}
                                                                    alt={alt}
                                                                />
                                                            ),
                                                        }}
                                                    >
                                                        {msg.content}
                                                    </ReactMarkdown>
                                                </div>
                                            )}
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
                                    <div className="bg-zinc-800/80 border border-zinc-700/50 rounded-2xl px-4 py-3">
                                        <div className="flex items-center gap-3 text-zinc-400">
                                            {agent.avatar_url ? (
                                                <img
                                                    src={agent.avatar_url}
                                                    alt=""
                                                    className="w-5 h-5 rounded-md object-cover"
                                                />
                                            ) : (
                                                <span className="text-sm">
                                                    {agent.avatar_emoji}
                                                </span>
                                            )}
                                            <div className="flex items-center gap-1">
                                                <span
                                                    className="w-2 h-2 bg-orange-400 rounded-full animate-bounce"
                                                    style={{
                                                        animationDelay: "0ms",
                                                    }}
                                                />
                                                <span
                                                    className="w-2 h-2 bg-orange-400 rounded-full animate-bounce"
                                                    style={{
                                                        animationDelay: "150ms",
                                                    }}
                                                />
                                                <span
                                                    className="w-2 h-2 bg-orange-400 rounded-full animate-bounce"
                                                    style={{
                                                        animationDelay: "300ms",
                                                    }}
                                                />
                                            </div>
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
            <footer className="border-t border-zinc-800 bg-gradient-to-t from-zinc-900 via-zinc-900/95 to-zinc-900/80 backdrop-blur-md sticky bottom-0">
                <div className="max-w-3xl mx-auto px-4 py-3">
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            sendMessage();
                        }}
                        className="flex gap-2"
                    >
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={
                                agent.x402_enabled
                                    ? `Message (${agent.x402_price_cents}¢/msg)...`
                                    : "Send a message..."
                            }
                            disabled={sending}
                            className="flex-1 bg-zinc-800/80 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 disabled:opacity-50 transition-all"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || sending}
                            className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all shadow-lg shadow-orange-500/20 disabled:shadow-none"
                        >
                            {sending ? (
                                <svg
                                    className="w-5 h-5 animate-spin"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                >
                                    <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                    />
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                    />
                                </svg>
                            ) : (
                                <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                                    />
                                </svg>
                            )}
                        </button>
                    </form>
                    <div className="flex items-center justify-center gap-2 mt-2 text-[10px] text-zinc-500">
                        <span>
                            {agent.x402_enabled
                                ? "x402 payments required"
                                : "Public AI Agent"}
                        </span>
                        <span className="text-zinc-700">•</span>
                        <a
                            href="/"
                            className="inline-flex items-center gap-1 text-orange-400 hover:text-orange-300 transition-colors"
                        >
                            <span>🍊</span>
                            <span className="hover:underline">
                                Join Spritz for more
                            </span>
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
