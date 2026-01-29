"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState } from "react";

interface ChatMarkdownProps {
    content: string;
    className?: string;
    isOwnMessage?: boolean;
}

/**
 * Renders markdown content in chat messages with support for:
 * - Code blocks (```code```) with syntax highlighting
 * - Inline code (`code`)
 * - Bold, italic, strikethrough
 * - Links
 * - Lists
 */
export function ChatMarkdown({ content, className = "", isOwnMessage = false }: ChatMarkdownProps) {
    const [copiedCode, setCopiedCode] = useState<string | null>(null);

    const copyToClipboard = async (code: string) => {
        try {
            await navigator.clipboard.writeText(code);
            setCopiedCode(code);
            setTimeout(() => setCopiedCode(null), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    return (
        <div className={`chat-markdown break-words ${className}`}>
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                // Code blocks with copy button
                code({ node, className, children, ...props }) {
                    const isInline = !className && !String(children).includes("\n");
                    const codeContent = String(children).replace(/\n$/, "");
                    const language = className?.replace("language-", "") || "";
                    
                    if (isInline) {
                        return (
                            <code
                                className={`px-1.5 py-0.5 rounded text-sm font-mono ${
                                    isOwnMessage 
                                        ? "bg-white/20 text-white" 
                                        : "bg-zinc-700/50 text-orange-300"
                                }`}
                                {...props}
                            >
                                {children}
                            </code>
                        );
                    }
                    
                    return (
                        <div className="relative my-2 group">
                            {language && (
                                <div className={`text-xs px-3 py-1 rounded-t-lg font-mono ${
                                    isOwnMessage 
                                        ? "bg-white/10 text-white/60" 
                                        : "bg-zinc-800 text-zinc-400"
                                }`}>
                                    {language}
                                </div>
                            )}
                            <pre className={`p-3 overflow-x-auto text-sm font-mono ${
                                language ? "rounded-b-lg" : "rounded-lg"
                            } ${
                                isOwnMessage 
                                    ? "bg-white/10 text-white" 
                                    : "bg-zinc-800 text-zinc-200"
                            }`}>
                                <code className="whitespace-pre" {...props}>
                                    {children}
                                </code>
                            </pre>
                            <button
                                onClick={() => copyToClipboard(codeContent)}
                                className={`absolute top-2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                                    isOwnMessage 
                                        ? "bg-white/20 hover:bg-white/30 text-white" 
                                        : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                                }`}
                                title="Copy code"
                            >
                                {copiedCode === codeContent ? (
                                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    );
                },
                // Links
                a({ href, children }) {
                    return (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`underline ${
                                isOwnMessage 
                                    ? "text-white/90 hover:text-white" 
                                    : "text-orange-400 hover:text-orange-300"
                            }`}
                        >
                            {children}
                        </a>
                    );
                },
                // Paragraphs - no extra margin for chat bubbles
                p({ children }) {
                    return <p className="mb-0 last:mb-0">{children}</p>;
                },
                // Lists
                ul({ children }) {
                    return <ul className="list-disc list-inside my-1 space-y-0.5">{children}</ul>;
                },
                ol({ children }) {
                    return <ol className="list-decimal list-inside my-1 space-y-0.5">{children}</ol>;
                },
                // Bold
                strong({ children }) {
                    return <strong className="font-semibold">{children}</strong>;
                },
                // Blockquote
                blockquote({ children }) {
                    return (
                        <blockquote className={`border-l-2 pl-3 my-1 italic ${
                            isOwnMessage 
                                ? "border-white/40 text-white/80" 
                                : "border-zinc-500 text-zinc-300"
                        }`}>
                            {children}
                        </blockquote>
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
 * Check if message content contains markdown that should be rendered
 */
export function hasMarkdown(content: string): boolean {
    // Check for code blocks
    if (/```[\s\S]*?```/.test(content)) return true;
    // Check for inline code
    if (/`[^`]+`/.test(content)) return true;
    // Check for bold/italic
    if (/\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_/.test(content)) return true;
    // Check for links
    if (/\[.+\]\(.+\)/.test(content)) return true;
    // Check for lists
    if (/^[\s]*[-*+]\s/m.test(content)) return true;
    if (/^[\s]*\d+\.\s/m.test(content)) return true;
    // Check for blockquotes
    if (/^>\s/m.test(content)) return true;
    
    return false;
}
