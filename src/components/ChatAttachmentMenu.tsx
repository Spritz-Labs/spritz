"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GifPicker } from "./GifPicker";
import { type LocationData } from "./LocationMessage";

type AttachmentType = "image" | "pixel_art" | "gif" | "poll" | "location" | "voice";

type ChatRulesConfig = {
    photos_allowed?: boolean | string;
    pixel_art_allowed?: boolean | string;
    gifs_allowed?: boolean | string;
    polls_allowed?: boolean | string;
    location_sharing_allowed?: boolean | string;
    voice_allowed?: boolean | string;
};

type ChatAttachmentMenuProps = {
    onImageUpload?: () => void;
    onPixelArt?: () => void;
    onGif?: (gifUrl: string) => void;
    onPoll?: () => void;
    onLocation?: (location: LocationData) => void;
    onVoice?: () => void;
    isUploading?: boolean;
    showPoll?: boolean;
    showLocation?: boolean;
    showVoice?: boolean;
    disabled?: boolean;
    className?: string;
    chatRules?: ChatRulesConfig | null;
    isModerator?: boolean;
};

export function ChatAttachmentMenu({
    onImageUpload,
    onPixelArt,
    onGif,
    onPoll,
    onLocation,
    onVoice,
    isUploading = false,
    showPoll = false,
    showLocation = true,
    showVoice = false,
    disabled = false,
    className = "",
    chatRules,
    isModerator = false,
}: ChatAttachmentMenuProps) {
    // Apply chat rules - check if content type is available for this user
    // "everyone" or true or undefined = allowed for all
    // "mods_only" = allowed for mods/admins only
    // "disabled" or false = hidden for regular users (admins exempt server-side)
    const isContentAllowed = (value?: boolean | string) => {
        if (value === undefined || value === null) return true;
        if (value === "everyone" || value === true) return true;
        if (value === "mods_only") return isModerator;
        if (value === "disabled" || value === false) return isModerator;
        return true;
    };
    const photosAllowed = isContentAllowed(chatRules?.photos_allowed);
    const pixelArtAllowed = isContentAllowed(chatRules?.pixel_art_allowed);
    const gifsAllowed = isContentAllowed(chatRules?.gifs_allowed);
    const pollsAllowed = isContentAllowed(chatRules?.polls_allowed);
    const locationAllowed = isContentAllowed(chatRules?.location_sharing_allowed);
    const voiceAllowed = isContentAllowed(chatRules?.voice_allowed);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showGifPicker, setShowGifPicker] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsExpanded(false);
            }
        };

        if (isExpanded) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isExpanded]);

    const handleAction = (action: () => void) => {
        action();
        setIsExpanded(false);
    };

    const handleGifSelect = (gifUrl: string) => {
        onGif?.(gifUrl);
        setShowGifPicker(false);
        setIsExpanded(false);
    };

    // Count available actions to determine layout (respecting rules)
    const effectiveImageUpload = photosAllowed ? onImageUpload : undefined;
    const effectivePixelArt = pixelArtAllowed ? onPixelArt : undefined;
    const effectiveGif = gifsAllowed ? onGif : undefined;
    const effectivePoll = pollsAllowed && showPoll ? onPoll : undefined;
    const effectiveLocation = locationAllowed && showLocation ? onLocation : undefined;
    const effectiveVoice = voiceAllowed && showVoice ? onVoice : undefined;
    const actionCount = [effectiveImageUpload, effectivePixelArt, effectiveGif, effectivePoll].filter(Boolean).length;

    return (
        <div ref={menuRef} className={`relative ${className}`}>
            {/* Main + Button */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                disabled={disabled || isUploading}
                className={`p-3 rounded-xl transition-all duration-200 ${
                    isExpanded 
                        ? "bg-[#FF5500] text-white rotate-45" 
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title="Attachments"
            >
                {isUploading ? (
                    <div className="w-5 h-5 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
                ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                )}
            </button>

            {/* Expanded Menu */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full left-0 mb-2 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50"
                    >
                        <div className="p-2 flex flex-col gap-1 min-w-[140px]">
                            {effectiveImageUpload && (
                                <button
                                    onClick={() => handleAction(effectiveImageUpload)}
                                    className="flex items-center gap-3 px-3 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-lg transition-colors"
                                >
                                    <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <span>Photo</span>
                                </button>
                            )}
                            
                            {effectivePixelArt && (
                                <button
                                    onClick={() => handleAction(effectivePixelArt)}
                                    className="flex items-center gap-3 px-3 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-lg transition-colors"
                                >
                                    <svg className="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="currentColor">
                                        <rect x="4" y="4" width="4" height="4" />
                                        <rect x="8" y="4" width="4" height="4" opacity="0.7" />
                                        <rect x="12" y="4" width="4" height="4" />
                                        <rect x="4" y="8" width="4" height="4" opacity="0.7" />
                                        <rect x="8" y="8" width="4" height="4" />
                                        <rect x="12" y="8" width="4" height="4" opacity="0.7" />
                                        <rect x="4" y="12" width="4" height="4" />
                                        <rect x="8" y="12" width="4" height="4" opacity="0.7" />
                                        <rect x="12" y="12" width="4" height="4" />
                                    </svg>
                                    <span>Pixel Art</span>
                                </button>
                            )}
                            
                            {effectiveGif && (
                                <button
                                    onClick={() => {
                                        setShowGifPicker(true);
                                        setIsExpanded(false);
                                    }}
                                    className="flex items-center gap-3 px-3 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-lg transition-colors"
                                >
                                    <span className="w-5 h-5 flex items-center justify-center text-xs font-bold text-emerald-400 bg-emerald-400/20 rounded">
                                        GIF
                                    </span>
                                    <span>GIF</span>
                                </button>
                            )}
                            
                            {effectivePoll && (
                                <button
                                    onClick={() => handleAction(effectivePoll)}
                                    className="flex items-center gap-3 px-3 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-lg transition-colors"
                                >
                                    <span className="w-5 h-5 flex items-center justify-center text-amber-400">🗳️</span>
                                    <span>Poll</span>
                                </button>
                            )}
                            
                            {effectiveLocation && onLocation && (
                                <button
                                    onClick={() => {
                                        setIsExpanded(false);
                                        // Get location and call onLocation
                                        if (navigator.geolocation) {
                                            navigator.geolocation.getCurrentPosition(
                                                async (position) => {
                                                    const locationData: LocationData = {
                                                        lat: position.coords.latitude,
                                                        lng: position.coords.longitude,
                                                        accuracy: position.coords.accuracy,
                                                        timestamp: position.timestamp,
                                                    };
                                                    
                                                    // Try reverse geocoding
                                                    try {
                                                        const res = await fetch(
                                                            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${locationData.lat}&lon=${locationData.lng}`
                                                        );
                                                        const data = await res.json();
                                                        if (data.display_name) {
                                                            locationData.address = data.display_name;
                                                            if (data.address) {
                                                                const { road, city, town, village, suburb } = data.address;
                                                                locationData.name = [road, city || town || village || suburb].filter(Boolean).join(", ");
                                                            }
                                                        }
                                                    } catch {}
                                                    
                                                    onLocation(locationData);
                                                },
                                                (error) => {
                                                    console.error("Location error:", error);
                                                    alert("Could not get your location. Please check permissions.");
                                                },
                                                { enableHighAccuracy: true, timeout: 10000 }
                                            );
                                        } else {
                                            alert("Geolocation is not supported by your browser");
                                        }
                                    }}
                                    className="flex items-center gap-3 px-3 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-lg transition-colors"
                                >
                                    <span className="w-5 h-5 flex items-center justify-center text-red-400">📍</span>
                                    <span>Location</span>
                                </button>
                            )}
                            
                            {effectiveVoice && onVoice && (
                                <button
                                    onClick={() => handleAction(onVoice)}
                                    className="flex items-center gap-3 px-3 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-lg transition-colors"
                                >
                                    <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                    </svg>
                                    <span>Voice Memo</span>
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* GIF Picker Modal */}
            <GifPicker
                isOpen={showGifPicker}
                onClose={() => setShowGifPicker(false)}
                onSelect={handleGifSelect}
                position="top"
            />
        </div>
    );
}
