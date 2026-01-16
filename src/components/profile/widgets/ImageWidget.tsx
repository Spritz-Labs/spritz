"use client";

import { ImageWidgetConfig } from "../ProfileWidgetTypes";
import { sanitizeUrl, sanitizeImageUrl } from "@/lib/urlSecurity";

interface ImageWidgetProps {
    config: ImageWidgetConfig;
    size: string;
}

export function ImageWidget({ config, size }: ImageWidgetProps) {
    const { url, alt, fit = 'cover', link, caption } = config;
    
    // Sanitize URLs
    const safeImageUrl = sanitizeImageUrl(url);
    const safeLink = sanitizeUrl(link);
    
    // If image URL is unsafe, show placeholder
    if (!safeImageUrl) {
        return (
            <div className="w-full h-full flex items-center justify-center rounded-2xl bg-zinc-800 border border-zinc-700">
                <span className="text-zinc-500 text-sm">Image unavailable</span>
            </div>
        );
    }
    
    const imageElement = (
        <div className="w-full h-full relative overflow-hidden rounded-2xl group">
            <img
                src={safeImageUrl}
                alt={alt || ""}
                className={`w-full h-full transition-transform duration-500 group-hover:scale-105 ${
                    fit === 'cover' ? 'object-cover' : 
                    fit === 'contain' ? 'object-contain' : 
                    'object-fill'
                }`}
            />
            
            {/* Caption overlay */}
            {caption && (
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                    <p className="text-white text-sm">{caption}</p>
                </div>
            )}
            
            {/* Link indicator */}
            {safeLink && (
                <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                </div>
            )}
        </div>
    );
    
    if (safeLink) {
        return (
            <a href={safeLink} target="_blank" rel="noopener noreferrer nofollow" className="block w-full h-full">
                {imageElement}
            </a>
        );
    }
    
    return imageElement;
}
