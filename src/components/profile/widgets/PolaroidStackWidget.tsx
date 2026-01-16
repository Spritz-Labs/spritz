"use client";

import { useState } from "react";
import { PolaroidStackWidgetConfig } from "../ProfileWidgetTypes";
import { motion } from "motion/react";

interface PolaroidStackWidgetProps {
    config: PolaroidStackWidgetConfig;
    size: string;
}

export function PolaroidStackWidget({ config, size }: PolaroidStackWidgetProps) {
    const { photos, spread = 'loose' } = config;
    const [activeIndex, setActiveIndex] = useState(0);
    
    const spreadAngles: Record<string, number[]> = {
        tight: [-3, 0, 3],
        loose: [-8, 0, 8],
        scattered: [-15, 5, 12, -5],
    };
    
    const angles = spreadAngles[spread] || spreadAngles.loose;
    const displayPhotos = photos.slice(0, 4);
    
    if (photos.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-zinc-800/50 rounded-2xl">
                <div className="text-center">
                    <span className="text-4xl">📸</span>
                    <p className="text-zinc-500 text-sm mt-2">Add photos</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="w-full h-full flex items-center justify-center bg-zinc-900/30 rounded-2xl p-4 overflow-hidden">
            <div className="relative w-full h-full flex items-center justify-center">
                {displayPhotos.map((photo, index) => {
                    const baseRotation = photo.rotation ?? angles[index % angles.length];
                    const isActive = index === activeIndex;
                    const zIndex = isActive ? 50 : displayPhotos.length - index;
                    
                    return (
                        <motion.div
                            key={index}
                            onClick={() => setActiveIndex(index)}
                            className="absolute cursor-pointer"
                            style={{ zIndex }}
                            initial={false}
                            animate={{
                                rotate: isActive ? 0 : baseRotation,
                                scale: isActive ? 1.1 : 1 - (index * 0.02),
                                y: isActive ? -10 : index * 3,
                                x: isActive ? 0 : (index - 1) * 5,
                            }}
                            whileHover={{ scale: isActive ? 1.15 : 1.05, zIndex: 100 }}
                            transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        >
                            {/* Polaroid frame */}
                            <div className="bg-white p-2 pb-8 rounded-sm shadow-xl" style={{ width: '140px' }}>
                                {/* Photo */}
                                <div className="aspect-square overflow-hidden bg-zinc-100">
                                    <img
                                        src={photo.url}
                                        alt={photo.caption || ''}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                
                                {/* Caption */}
                                {photo.caption && (
                                    <p className="mt-2 text-center text-zinc-600 text-xs font-handwriting truncate px-1">
                                        {photo.caption}
                                    </p>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
