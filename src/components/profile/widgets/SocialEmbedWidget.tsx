"use client";

import { useEffect, useRef, useState } from "react";
import { SocialEmbedWidgetConfig, WidgetSize } from "../ProfileWidgetTypes";

interface SocialEmbedWidgetProps {
    config: SocialEmbedWidgetConfig;
    size: WidgetSize;
}

// Extract tweet ID from various Twitter/X URL formats
function extractTweetId(url: string): string | null {
    const patterns = [
        /twitter\.com\/\w+\/status\/(\d+)/,
        /x\.com\/\w+\/status\/(\d+)/,
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    
    return null;
}

// Extract Instagram post ID
function extractInstagramId(url: string): string | null {
    const pattern = /instagram\.com\/p\/([^\/]+)/;
    const match = url.match(pattern);
    return match ? match[1] : null;
}

export function SocialEmbedWidget({ config, size }: SocialEmbedWidgetProps) {
    const { platform, embedUrl, postId } = config;
    const containerRef = useRef<HTMLDivElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    useEffect(() => {
        if (!embedUrl) {
            setError("No post URL configured");
            setIsLoading(false);
            return;
        }
        
        // For Twitter/X, we'll use an oEmbed approach with iframe
        if (platform === 'twitter' || platform === 'x') {
            const tweetId = extractTweetId(embedUrl);
            if (!tweetId) {
                setError("Invalid Twitter/X URL");
                setIsLoading(false);
                return;
            }
            
            // Using Twitter's widget.js
            const loadTwitterWidget = () => {
                if (typeof window !== 'undefined' && (window as unknown as { twttr?: { widgets?: { load: () => void } } }).twttr?.widgets) {
                    (window as unknown as { twttr: { widgets: { load: () => void } } }).twttr.widgets.load();
                    setIsLoading(false);
                }
            };
            
            // Load Twitter widget script if not already loaded
            if (!document.getElementById('twitter-wjs')) {
                const script = document.createElement('script');
                script.id = 'twitter-wjs';
                script.src = 'https://platform.twitter.com/widgets.js';
                script.async = true;
                script.onload = loadTwitterWidget;
                document.body.appendChild(script);
            } else {
                loadTwitterWidget();
            }
        }
        
        setIsLoading(false);
    }, [platform, embedUrl]);
    
    const platformStyles: Record<string, { icon: string; name: string; bg: string }> = {
        twitter: { icon: '𝕏', name: 'Twitter', bg: 'bg-black' },
        x: { icon: '𝕏', name: 'X', bg: 'bg-black' },
        instagram: { icon: '📷', name: 'Instagram', bg: 'bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400' },
        tiktok: { icon: '♪', name: 'TikTok', bg: 'bg-black' },
        linkedin: { icon: 'in', name: 'LinkedIn', bg: 'bg-blue-600' },
        mastodon: { icon: '🐘', name: 'Mastodon', bg: 'bg-purple-600' },
    };
    
    const style = platformStyles[platform] || platformStyles.twitter;
    
    // If there's an error or no URL, show a placeholder
    if (error || !embedUrl) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
                <div className={`w-12 h-12 rounded-xl ${style.bg} flex items-center justify-center mb-3`}>
                    <span className="text-xl text-white font-bold">{style.icon}</span>
                </div>
                <p className="text-white font-medium">{style.name}</p>
                <p className="text-zinc-500 text-xs mt-1">{error || 'Add a post URL'}</p>
            </div>
        );
    }
    
    // Twitter/X embed
    if (platform === 'twitter' || platform === 'x') {
        const tweetId = extractTweetId(embedUrl);
        
        return (
            <div 
                ref={containerRef}
                className="w-full h-full rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden relative"
            >
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                        <div className="w-6 h-6 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                )}
                
                {/* Twitter embed blockquote */}
                <div className="w-full h-full overflow-auto p-2">
                    <blockquote 
                        className="twitter-tweet" 
                        data-theme="dark"
                        data-conversation="none"
                    >
                        <a href={embedUrl}>Loading tweet...</a>
                    </blockquote>
                </div>
            </div>
        );
    }
    
    // Instagram embed (uses iframe)
    if (platform === 'instagram') {
        const postId = extractInstagramId(embedUrl);
        if (!postId) {
            return (
                <div className="w-full h-full flex items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-800">
                    <p className="text-zinc-500">Invalid Instagram URL</p>
                </div>
            );
        }
        
        return (
            <div className="w-full h-full rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
                <iframe
                    src={`https://www.instagram.com/p/${postId}/embed/`}
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    scrolling="no"
                    className="rounded-2xl"
                    style={{ minHeight: '400px' }}
                />
            </div>
        );
    }
    
    // Generic fallback - link to the post
    return (
        <a
            href={embedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-full flex flex-col items-center justify-center p-4 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors group"
        >
            <div className={`w-14 h-14 rounded-xl ${style.bg} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                <span className="text-2xl text-white font-bold">{style.icon}</span>
            </div>
            <p className="text-white font-medium">{style.name} Post</p>
            <p className="text-zinc-500 text-sm mt-1">Click to view</p>
        </a>
    );
}
