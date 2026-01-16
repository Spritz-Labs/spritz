"use client";

import { useState } from "react";
import { ColorPaletteWidgetConfig } from "../ProfileWidgetTypes";
import { motion } from "motion/react";

interface ColorPaletteWidgetProps {
    config: ColorPaletteWidgetConfig;
    size: string;
}

export function ColorPaletteWidget({ config, size }: ColorPaletteWidgetProps) {
    const { colors, title, showHex = true } = config;
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    
    const isWide = size === '4x1';
    
    const copyColor = async (hex: string, index: number) => {
        try {
            await navigator.clipboard.writeText(hex);
            setCopiedIndex(index);
            setTimeout(() => setCopiedIndex(null), 1500);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };
    
    if (colors.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-zinc-800/50 rounded-2xl">
                <span className="text-zinc-500">Add colors</span>
            </div>
        );
    }
    
    return (
        <div className="w-full h-full p-3 flex flex-col bg-zinc-900/50 rounded-2xl">
            {title && (
                <h3 className="text-white font-bold text-sm mb-2 flex items-center gap-2">
                    <span>🎨</span> {title}
                </h3>
            )}
            
            <div className={`flex-1 flex ${isWide ? 'flex-row' : 'flex-row'} gap-2`}>
                {colors.map((color, index) => (
                    <motion.button
                        key={index}
                        onClick={() => copyColor(color.hex, index)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="flex-1 flex flex-col items-center justify-center rounded-xl overflow-hidden group relative"
                        style={{ backgroundColor: color.hex }}
                    >
                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                            {copiedIndex === index ? (
                                <motion.span
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="text-white text-xs font-medium bg-black/50 px-2 py-1 rounded"
                                >
                                    Copied!
                                </motion.span>
                            ) : (
                                <span className="text-white text-xs font-medium bg-black/50 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                    Copy
                                </span>
                            )}
                        </div>
                        
                        {/* Color info */}
                        {showHex && (
                            <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
                                <span className="text-[10px] font-mono text-white/80 bg-black/30 px-1.5 py-0.5 rounded">
                                    {color.hex}
                                </span>
                            </div>
                        )}
                    </motion.button>
                ))}
            </div>
        </div>
    );
}
