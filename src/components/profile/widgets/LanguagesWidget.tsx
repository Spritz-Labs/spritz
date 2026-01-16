"use client";

import { LanguagesWidgetConfig } from "../ProfileWidgetTypes";

interface LanguagesWidgetProps {
    config: LanguagesWidgetConfig;
    size: string;
}

// Country flag emoji mapping (common languages)
const LANGUAGE_FLAGS: Record<string, string> = {
    en: '🇬🇧', // English - UK flag (or use 🇺🇸)
    es: '🇪🇸', // Spanish
    fr: '🇫🇷', // French
    de: '🇩🇪', // German
    it: '🇮🇹', // Italian
    pt: '🇵🇹', // Portuguese (or 🇧🇷)
    ru: '🇷🇺', // Russian
    zh: '🇨🇳', // Chinese
    ja: '🇯🇵', // Japanese
    ko: '🇰🇷', // Korean
    ar: '🇸🇦', // Arabic
    hi: '🇮🇳', // Hindi
    nl: '🇳🇱', // Dutch
    pl: '🇵🇱', // Polish
    sv: '🇸🇪', // Swedish
    da: '🇩🇰', // Danish
    no: '🇳🇴', // Norwegian
    fi: '🇫🇮', // Finnish
    tr: '🇹🇷', // Turkish
    el: '🇬🇷', // Greek
    he: '🇮🇱', // Hebrew
    th: '🇹🇭', // Thai
    vi: '🇻🇳', // Vietnamese
    id: '🇮🇩', // Indonesian
    uk: '🇺🇦', // Ukrainian
    cs: '🇨🇿', // Czech
    ro: '🇷🇴', // Romanian
    hu: '🇭🇺', // Hungarian
    default: '🌐',
};

const PROFICIENCY_STYLES: Record<string, { color: string; label: string; width: string }> = {
    native: { color: 'bg-emerald-500', label: 'Native', width: '100%' },
    fluent: { color: 'bg-blue-500', label: 'Fluent', width: '85%' },
    conversational: { color: 'bg-amber-500', label: 'Conversational', width: '60%' },
    learning: { color: 'bg-purple-500', label: 'Learning', width: '30%' },
};

export function LanguagesWidget({ config, size }: LanguagesWidgetProps) {
    const { languages, showFlags = true } = config;
    
    const isSmall = size === '1x1';
    const displayLanguages = languages.slice(0, isSmall ? 3 : 6);
    
    if (languages.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-zinc-800/50 rounded-2xl">
                <div className="text-center">
                    <span className="text-3xl">🗣️</span>
                    <p className="text-zinc-500 text-sm mt-2">Add languages</p>
                </div>
            </div>
        );
    }
    
    // Compact display for 1x1
    if (isSmall) {
        return (
            <div className="w-full h-full p-3 bg-gradient-to-br from-indigo-500/10 to-violet-500/10 rounded-2xl flex flex-col items-center justify-center">
                <div className="flex flex-wrap justify-center gap-1">
                    {displayLanguages.map((lang, index) => (
                        <span key={index} className="text-xl">
                            {showFlags ? (LANGUAGE_FLAGS[lang.code] || LANGUAGE_FLAGS.default) : '🗣️'}
                        </span>
                    ))}
                </div>
                <p className="text-white font-medium text-xs mt-1">
                    {languages.length} language{languages.length !== 1 ? 's' : ''}
                </p>
            </div>
        );
    }
    
    return (
        <div className="w-full h-full p-3 bg-gradient-to-br from-indigo-500/10 to-violet-500/10 rounded-2xl flex flex-col">
            <h3 className="text-white font-bold text-sm mb-2 flex items-center gap-2">
                <span>🗣️</span> Languages
            </h3>
            
            <div className="flex-1 space-y-2">
                {displayLanguages.map((lang, index) => {
                    const proficiency = lang.proficiency || 'conversational';
                    const style = PROFICIENCY_STYLES[proficiency];
                    const flag = LANGUAGE_FLAGS[lang.code] || LANGUAGE_FLAGS.default;
                    
                    return (
                        <div key={index} className="flex items-center gap-2">
                            {/* Flag */}
                            {showFlags && (
                                <span className="text-lg w-6 text-center">{flag}</span>
                            )}
                            
                            {/* Language info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <span className="text-white text-xs font-medium truncate">
                                        {lang.name}
                                    </span>
                                    <span className="text-zinc-400 text-[10px]">
                                        {style.label}
                                    </span>
                                </div>
                                
                                {/* Proficiency bar */}
                                <div className="h-1 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                                    <div
                                        className={`h-full ${style.color} rounded-full transition-all duration-500`}
                                        style={{ width: style.width }}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            
            {languages.length > displayLanguages.length && (
                <p className="text-xs text-zinc-500 text-center pt-2">
                    +{languages.length - displayLanguages.length} more
                </p>
            )}
        </div>
    );
}
