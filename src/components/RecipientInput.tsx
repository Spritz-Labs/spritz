"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { isAddress } from "viem";
import { useSendSuggestions, useAddressBook, type SendSuggestion } from "@/hooks/useSendSuggestions";

interface RecipientInputProps {
    value: string;
    onChange: (value: string, suggestion?: SendSuggestion | null) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    showSaveOption?: boolean; // Show option to save to address book
    onValidAddress?: (isValid: boolean, resolvedAddress?: string) => void;
}

/**
 * Enhanced recipient input with suggestions from:
 * - Friends with Smart Wallets
 * - Vaults user is a member of
 * - Address book entries
 * 
 * Also supports saving new addresses to the address book.
 */
export function RecipientInput({
    value,
    onChange,
    placeholder = "Enter address, ENS, or select from suggestions",
    disabled = false,
    className = "",
    showSaveOption = true,
    onValidAddress,
}: RecipientInputProps) {
    const [isFocused, setIsFocused] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [saveLabel, setSaveLabel] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    const { suggestions, isLoading: suggestionsLoading, filter, refresh: refreshSuggestions } = useSendSuggestions(true);
    const { addEntry, entries } = useAddressBook();
    
    // Filter suggestions based on input
    const filteredSuggestions = value.length > 0 ? filter(value) : suggestions;
    
    // Check if current value is a valid address and not already saved
    const isValidAddress = isAddress(value);
    const isAlreadySaved = entries.some(e => e.address.toLowerCase() === value.toLowerCase()) ||
                          filteredSuggestions.some(s => s.address.toLowerCase() === value.toLowerCase());
    const canSave = showSaveOption && isValidAddress && !isAlreadySaved && value.length > 0;

    // Handle clicking outside to close suggestions
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
                setShowSaveDialog(false);
            }
        };
        
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Notify parent of address validity
    useEffect(() => {
        if (onValidAddress) {
            onValidAddress(isValidAddress, isValidAddress ? value : undefined);
        }
    }, [value, isValidAddress, onValidAddress]);

    // Handle keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (!showSuggestions || filteredSuggestions.length === 0) return;
        
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setSelectedIndex(prev => 
                    prev < filteredSuggestions.length - 1 ? prev + 1 : 0
                );
                break;
            case "ArrowUp":
                e.preventDefault();
                setSelectedIndex(prev => 
                    prev > 0 ? prev - 1 : filteredSuggestions.length - 1
                );
                break;
            case "Enter":
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < filteredSuggestions.length) {
                    handleSelectSuggestion(filteredSuggestions[selectedIndex]);
                }
                break;
            case "Escape":
                setShowSuggestions(false);
                setSelectedIndex(-1);
                break;
        }
    }, [showSuggestions, filteredSuggestions, selectedIndex]);

    const handleSelectSuggestion = (suggestion: SendSuggestion) => {
        // Use smart wallet address if available, otherwise use regular address
        const targetAddress = suggestion.smartWalletAddress || suggestion.address;
        onChange(targetAddress, suggestion);
        setShowSuggestions(false);
        setSelectedIndex(-1);
    };

    const handleSaveToAddressBook = async () => {
        if (!saveLabel.trim() || !isValidAddress) return;
        
        setIsSaving(true);
        try {
            await addEntry({
                address: value,
                label: saveLabel.trim(),
            });
            setShowSaveDialog(false);
            setSaveLabel("");
            refreshSuggestions();
        } catch (err) {
            console.error("Failed to save:", err);
        } finally {
            setIsSaving(false);
        }
    };

    // Get type icon
    const getTypeIcon = (type: SendSuggestion["type"]) => {
        switch (type) {
            case "friend":
                return "👤";
            case "vault":
                return "🔐";
            case "address_book":
                return "📖";
            case "recent":
                return "🕐";
            default:
                return "📍";
        }
    };

    const getTypeLabel = (type: SendSuggestion["type"]) => {
        switch (type) {
            case "friend":
                return "Friend";
            case "vault":
                return "Vault";
            case "address_book":
                return "Saved";
            case "recent":
                return "Recent";
            default:
                return "";
        }
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={(e) => {
                        onChange(e.target.value, null);
                        setShowSuggestions(true);
                        setSelectedIndex(-1);
                    }}
                    onFocus={() => {
                        setIsFocused(true);
                        setShowSuggestions(true);
                    }}
                    onBlur={() => {
                        setIsFocused(false);
                        // Delay hiding to allow click on suggestion
                        setTimeout(() => {
                            if (!containerRef.current?.contains(document.activeElement)) {
                                setShowSuggestions(false);
                            }
                        }, 200);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 disabled:opacity-50 font-mono text-sm"
                />
                
                {/* Loading indicator */}
                {suggestionsLoading && isFocused && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 border-2 border-zinc-600 border-t-indigo-500 rounded-full animate-spin" />
                    </div>
                )}
            </div>

            {/* Suggestions dropdown */}
            {showSuggestions && !showSaveDialog && (isFocused || filteredSuggestions.length > 0) && (
                <div className="absolute z-50 w-full mt-2 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-72 overflow-y-auto">
                    {/* Save to address book option */}
                    {canSave && (
                        <button
                            type="button"
                            onClick={() => {
                                setShowSaveDialog(true);
                                setShowSuggestions(false);
                            }}
                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-700/50 transition-colors border-b border-zinc-700"
                        >
                            <span className="text-lg">💾</span>
                            <div className="text-left">
                                <div className="text-sm font-medium text-white">Save to Address Book</div>
                                <div className="text-xs text-zinc-400 font-mono">
                                    {value.slice(0, 10)}...{value.slice(-8)}
                                </div>
                            </div>
                        </button>
                    )}

                    {/* Suggestions list */}
                    {filteredSuggestions.length > 0 ? (
                        <div className="py-1">
                            {filteredSuggestions.map((suggestion, index) => (
                                <button
                                    key={`${suggestion.type}-${suggestion.address}`}
                                    type="button"
                                    onClick={() => handleSelectSuggestion(suggestion)}
                                    className={`w-full px-4 py-3 flex items-center gap-3 transition-colors ${
                                        index === selectedIndex
                                            ? "bg-indigo-600/20"
                                            : "hover:bg-zinc-700/50"
                                    }`}
                                >
                                    {/* Avatar or type icon */}
                                    <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                        {suggestion.avatar ? (
                                            <img 
                                                src={suggestion.avatar} 
                                                alt="" 
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <span className="text-lg">{getTypeIcon(suggestion.type)}</span>
                                        )}
                                    </div>
                                    
                                    {/* Info */}
                                    <div className="flex-1 min-w-0 text-left">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-white truncate">
                                                {suggestion.label}
                                            </span>
                                            {suggestion.isFavorite && (
                                                <span className="text-yellow-400 text-xs">★</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-zinc-400">
                                            <span className="px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-300">
                                                {getTypeLabel(suggestion.type)}
                                            </span>
                                            {suggestion.sublabel && (
                                                <span className="truncate">{suggestion.sublabel}</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Address preview */}
                                    <div className="text-xs text-zinc-500 font-mono flex-shrink-0">
                                        {(suggestion.smartWalletAddress || suggestion.address).slice(0, 6)}...
                                        {(suggestion.smartWalletAddress || suggestion.address).slice(-4)}
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : value.length > 0 && !canSave ? (
                        <div className="px-4 py-6 text-center text-zinc-400 text-sm">
                            No matching suggestions
                        </div>
                    ) : !canSave && (
                        <div className="px-4 py-6 text-center text-zinc-400 text-sm">
                            {suggestions.length === 0 
                                ? "No saved addresses yet"
                                : "Start typing to filter suggestions"
                            }
                        </div>
                    )}
                </div>
            )}

            {/* Save dialog */}
            {showSaveDialog && (
                <div className="absolute z-50 w-full mt-2 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl p-4">
                    <div className="text-sm font-medium text-white mb-3">
                        Save to Address Book
                    </div>
                    <div className="text-xs text-zinc-400 font-mono mb-3 break-all">
                        {value}
                    </div>
                    <input
                        type="text"
                        value={saveLabel}
                        onChange={(e) => setSaveLabel(e.target.value)}
                        placeholder="Enter a label (e.g., Mom, Work, Exchange)"
                        maxLength={50}
                        autoFocus
                        className="w-full px-3 py-2 bg-zinc-900/50 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 mb-3"
                    />
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setShowSaveDialog(false);
                                setSaveLabel("");
                            }}
                            className="flex-1 px-3 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveToAddressBook}
                            disabled={!saveLabel.trim() || isSaving}
                            className="flex-1 px-3 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSaving ? "Saving..." : "Save"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default RecipientInput;
