"use client";

import { MoodBoardWidgetConfig } from "../ProfileWidgetTypes";

interface MoodBoardWidgetProps {
    config: MoodBoardWidgetConfig;
    size: string;
}

export function MoodBoardWidget({ config, size }: MoodBoardWidgetProps) {
    const { images, title, gap = 2 } = config;
    
    const isLarge = size === '4x2';
    const displayImages = images.slice(0, isLarge ? 9 : 6);
    
    // Create a masonry-like layout
    const getGridClass = (index: number, total: number) => {
        // For smaller grids, create visual interest with varied sizes
        if (total <= 3) {
            if (index === 0) return 'col-span-2 row-span-2';
            return 'col-span-1 row-span-1';
        }
        if (total <= 6) {
            if (index === 0 || index === 3) return 'col-span-2 row-span-2';
            return 'col-span-1 row-span-1';
        }
        // Larger grid
        const sizeHint = images[index]?.size || 'medium';
        if (sizeHint === 'large') return 'col-span-2 row-span-2';
        if (sizeHint === 'small') return 'col-span-1 row-span-1';
        return index % 5 === 0 ? 'col-span-2 row-span-2' : 'col-span-1 row-span-1';
    };
    
    if (images.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-zinc-800/50 rounded-2xl">
                <div className="text-center">
                    <span className="text-4xl">🎨</span>
                    <p className="text-zinc-500 text-sm mt-2">Add images to your mood board</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="w-full h-full p-2 bg-zinc-900/50 rounded-2xl overflow-hidden">
            {title && (
                <h3 className="text-white font-bold text-sm px-2 mb-2">{title}</h3>
            )}
            
            <div 
                className="w-full h-full grid grid-cols-4 auto-rows-fr"
                style={{ gap: `${gap * 4}px` }}
            >
                {displayImages.map((image, index) => (
                    <div
                        key={index}
                        className={`relative overflow-hidden rounded-lg ${getGridClass(index, displayImages.length)}`}
                    >
                        <img
                            src={image.url}
                            alt=""
                            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
