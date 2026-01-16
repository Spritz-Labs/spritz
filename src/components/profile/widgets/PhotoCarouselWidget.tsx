"use client";

import { useState, useEffect } from "react";
import { PhotoCarouselWidgetConfig } from "../ProfileWidgetTypes";
import { motion, AnimatePresence } from "motion/react";

interface PhotoCarouselWidgetProps {
    config: PhotoCarouselWidgetConfig;
    size: string;
}

export function PhotoCarouselWidget({ config, size }: PhotoCarouselWidgetProps) {
    const { images, autoPlay = true, interval = 4, showDots = true, showArrows = true } = config;
    const [currentIndex, setCurrentIndex] = useState(0);
    const [direction, setDirection] = useState(1);
    
    const isSmall = size === '2x1';
    
    // Auto-play
    useEffect(() => {
        if (!autoPlay || images.length <= 1) return;
        
        const timer = setInterval(() => {
            setDirection(1);
            setCurrentIndex((prev) => (prev + 1) % images.length);
        }, interval * 1000);
        
        return () => clearInterval(timer);
    }, [autoPlay, interval, images.length]);
    
    const goTo = (index: number) => {
        setDirection(index > currentIndex ? 1 : -1);
        setCurrentIndex(index);
    };
    
    const goNext = () => {
        setDirection(1);
        setCurrentIndex((prev) => (prev + 1) % images.length);
    };
    
    const goPrev = () => {
        setDirection(-1);
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    };
    
    if (images.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-zinc-800/50 rounded-2xl">
                <span className="text-zinc-500">No images</span>
            </div>
        );
    }
    
    const currentImage = images[currentIndex];
    
    return (
        <div className="w-full h-full relative overflow-hidden rounded-2xl group">
            {/* Images */}
            <AnimatePresence mode="wait" initial={false}>
                <motion.div
                    key={currentIndex}
                    initial={{ x: direction * 100 + '%', opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: direction * -100 + '%', opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="absolute inset-0"
                >
                    <img
                        src={currentImage.url}
                        alt={currentImage.caption || ''}
                        className="w-full h-full object-cover"
                    />
                    
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    
                    {/* Caption */}
                    {currentImage.caption && (
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                            <p className={`text-white font-medium ${isSmall ? 'text-xs' : 'text-sm'}`}>
                                {currentImage.caption}
                            </p>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
            
            {/* Navigation arrows */}
            {showArrows && images.length > 1 && (
                <>
                    <button
                        onClick={(e) => { e.stopPropagation(); goPrev(); }}
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        ←
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); goNext(); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        →
                    </button>
                </>
            )}
            
            {/* Dots */}
            {showDots && images.length > 1 && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {images.map((_, index) => (
                        <button
                            key={index}
                            onClick={(e) => { e.stopPropagation(); goTo(index); }}
                            className={`w-2 h-2 rounded-full transition-all ${
                                index === currentIndex 
                                    ? 'bg-white w-4' 
                                    : 'bg-white/50 hover:bg-white/70'
                            }`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
