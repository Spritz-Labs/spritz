"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState, useCallback } from "react";

interface AgentMarkdownProps {
    content: string;
    /** "channel" = purple theme (channel/alpha chat), "dm" = orange theme (agent DM page) */
    theme?: "channel" | "dm";
}

/**
 * Shared markdown renderer for all agent messages.
 * Features:
 * - Clickable links with external-link icon
 * - Code blocks with copy button
 * - Inline code styling
 * - Images with error handling
 * - Auto-linked URLs via remark-gfm
 * - Themed for channel (purple) or DM (orange) contexts
 */
export function AgentMarkdown({ content, theme = "channel" }: AgentMarkdownProps) {
    const [copiedCode, setCopiedCode] = useState<string | null>(null);

    const copyCode = useCallback(async (code: string) => {
        try {
            await navigator.clipboard.writeText(code);
            setCopiedCode(code);
            setTimeout(() => setCopiedCode(null), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    }, []);

    const isPurple = theme === "channel";
    const accent = isPurple ? "purple" : "orange";

    const proseClasses = isPurple
        ? `prose prose-sm prose-invert max-w-none
            prose-p:my-1.5 prose-p:leading-relaxed prose-p:text-zinc-100
            prose-headings:text-white prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1.5
            prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
            prose-strong:text-purple-200 prose-strong:font-semibold
            prose-em:text-zinc-200
            prose-ul:my-2 prose-ul:pl-4 prose-ul:space-y-1
            prose-ol:my-2 prose-ol:pl-4 prose-ol:space-y-1
            prose-li:my-0 prose-li:text-zinc-100 prose-li:marker:text-purple-400
            prose-code:bg-black/30 prose-code:text-purple-200 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-[''] prose-code:after:content-['']
            prose-pre:bg-black/30 prose-pre:border prose-pre:border-purple-500/20 prose-pre:rounded-lg prose-pre:my-2 prose-pre:overflow-x-auto
            prose-hr:border-purple-500/30 prose-hr:my-3
            prose-blockquote:border-l-purple-400 prose-blockquote:bg-black/20 prose-blockquote:pl-3 prose-blockquote:py-1 prose-blockquote:my-2 prose-blockquote:rounded-r prose-blockquote:text-zinc-300`
        : `prose prose-sm prose-invert max-w-none
            prose-p:my-2 prose-p:leading-relaxed
            prose-headings:text-white prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
            prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
            prose-strong:text-orange-300 prose-strong:font-semibold
            prose-em:text-zinc-300
            prose-ul:my-2 prose-ul:pl-4 prose-li:my-0.5 prose-li:marker:text-orange-400
            prose-ol:my-2 prose-ol:pl-4
            prose-code:bg-zinc-900 prose-code:text-orange-300 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-[''] prose-code:after:content-['']
            prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-700 prose-pre:rounded-lg prose-pre:my-2
            prose-hr:border-zinc-700 prose-hr:my-3
            prose-blockquote:border-l-orange-500 prose-blockquote:bg-zinc-900/50 prose-blockquote:pl-4 prose-blockquote:py-1 prose-blockquote:my-2 prose-blockquote:rounded-r`;

    const linkColor = isPurple
        ? "text-purple-300 hover:text-purple-200 decoration-purple-500/40 hover:decoration-purple-400/70"
        : "text-orange-400 hover:text-orange-300 decoration-orange-500/40 hover:decoration-orange-400/70";

    const codeBlockBg = isPurple ? "bg-black/30" : "bg-zinc-900";
    const codeBlockBorder = isPurple ? "border-purple-500/20" : "border-zinc-700";
    const codeLangBg = isPurple ? "bg-black/40 text-purple-300/70" : "bg-zinc-800 text-zinc-400";
    const copyBtnClasses = isPurple
        ? "bg-purple-900/50 hover:bg-purple-800/50 text-purple-300"
        : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300";
    const imgBorder = isPurple ? "border-purple-500/30 bg-black/30" : "border-zinc-700 bg-zinc-900/50";
    const imgAltColor = isPurple ? "text-purple-300/70" : "text-zinc-400";

    return (
        <div className={`${proseClasses} overflow-hidden break-words [word-break:break-word]`}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    // Links with external icon
                    a: ({ href, children }) => (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1 underline underline-offset-2 transition-colors ${linkColor}`}
                        >
                            {children}
                            <svg
                                className="w-3 h-3 flex-shrink-0 opacity-60"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                />
                            </svg>
                        </a>
                    ),

                    // Code blocks with copy button
                    code({ node, className, children, ...props }) {
                        const isInline = !className && !String(children).includes("\n");
                        const codeContent = String(children).replace(/\n$/, "");
                        const language = className?.replace("language-", "") || "";

                        if (isInline) {
                            return (
                                <code {...props}>
                                    {children}
                                </code>
                            );
                        }

                        return (
                            <div className="relative my-2 group/code not-prose overflow-hidden rounded-lg">
                                {language && (
                                    <div className={`text-[10px] px-3 py-1 font-mono ${codeLangBg}`}>
                                        {language}
                                    </div>
                                )}
                                <pre
                                    className={`p-3 overflow-x-auto text-xs font-mono max-w-full ${
                                        language ? "" : "rounded-lg"
                                    } ${codeBlockBg} border ${codeBlockBorder}`}
                                >
                                    <code className="whitespace-pre" {...props}>
                                        {children}
                                    </code>
                                </pre>
                                <button
                                    onClick={() => copyCode(codeContent)}
                                    className={`absolute top-2 right-2 p-1.5 rounded-md opacity-0 group-hover/code:opacity-100 transition-opacity ${copyBtnClasses}`}
                                    title="Copy code"
                                >
                                    {copiedCode === codeContent ? (
                                        <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    ) : (
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        );
                    },

                    // Images with error handling
                    img: ({ src, alt }) => {
                        const srcStr = typeof src === "string" ? src : undefined;
                        if (!srcStr) {
                            return (
                                <span className={`text-xs ${imgAltColor}`}>
                                    🖼️ {alt || "Image"}
                                </span>
                            );
                        }
                        return (
                            <span className="inline-block my-2">
                                <img
                                    src={srcStr}
                                    alt={alt || ""}
                                    className={`max-h-40 rounded-lg border ${imgBorder}`}
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = "none";
                                    }}
                                />
                                {alt && (
                                    <span className={`block text-[10px] mt-1 ${imgAltColor}`}>
                                        {alt}
                                    </span>
                                )}
                            </span>
                        );
                    },
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}

/**
 * Wrapper for agent messages in channel/alpha chat with:
 * - Subtle card styling
 * - AI badge
 * - Copy full response button
 * - Fade-in animation
 */
export function AgentMessageWrapper({
    children,
    content,
    agentName,
    theme = "channel",
}: {
    children: React.ReactNode;
    content: string;
    agentName?: string;
    theme?: "channel" | "dm";
}) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    const isPurple = theme === "channel";

    return (
        <div className="relative group/agent-msg min-w-0 overflow-hidden">
            {children}
            {/* Copy response button - appears on hover */}
            <div className="absolute -bottom-1 right-0 opacity-0 group-hover/agent-msg:opacity-100 transition-opacity">
                <button
                    onClick={handleCopy}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                        isPurple
                            ? "bg-purple-900/70 hover:bg-purple-800/70 text-purple-200 border border-purple-700/30"
                            : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/50"
                    }`}
                    title="Copy response"
                >
                    {copied ? (
                        <>
                            <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Copied
                        </>
                    ) : (
                        <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copy
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

/**
 * Thinking/generating indicator for agent messages in channels.
 * Shows bouncing dots with the agent's avatar.
 */
export function AgentThinkingIndicator({
    agentName,
    agentEmoji,
    agentAvatarUrl,
}: {
    agentName: string;
    agentEmoji?: string;
    agentAvatarUrl?: string;
}) {
    return (
        <div className="flex items-start gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-2 bg-purple-950/40 border border-purple-500/20 rounded-2xl px-3 py-2.5">
                {agentAvatarUrl ? (
                    <img
                        src={agentAvatarUrl}
                        alt={agentName}
                        className="w-4 h-4 rounded-md object-cover"
                    />
                ) : agentEmoji ? (
                    <span className="text-sm">{agentEmoji}</span>
                ) : null}
                <span className="text-xs text-purple-300/70 font-medium">{agentName}</span>
                <div className="flex items-center gap-0.5 ml-1">
                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
            </div>
        </div>
    );
}
