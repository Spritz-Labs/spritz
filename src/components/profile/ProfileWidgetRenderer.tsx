"use client";

import { motion } from "motion/react";
import { 
    BaseWidget, 
    WidgetType, 
    getGridSpanClasses,
    MapWidgetConfig,
    ImageWidgetConfig,
    TextWidgetConfig,
    LinkWidgetConfig,
    NFTWidgetConfig,
    SpotifyWidgetConfig,
    VideoWidgetConfig,
    CountdownWidgetConfig,
    ClockWidgetConfig,
    TechStackWidgetConfig,
    CurrentlyWidgetConfig,
    StatsWidgetConfig,
} from "./ProfileWidgetTypes";

// Widget components
import { MapWidget } from "./widgets/MapWidget";
import { ImageWidget } from "./widgets/ImageWidget";
import { TextWidget } from "./widgets/TextWidget";
import { LinkWidget } from "./widgets/LinkWidget";
import { NFTWidget } from "./widgets/NFTWidget";
import { SpotifyWidget } from "./widgets/SpotifyWidget";
import { VideoWidget } from "./widgets/VideoWidget";
import { CountdownWidget } from "./widgets/CountdownWidget";
import { ClockWidget } from "./widgets/ClockWidget";
import { TechStackWidget } from "./widgets/TechStackWidget";
import { CurrentlyWidget } from "./widgets/CurrentlyWidget";
import { StatsWidget } from "./widgets/StatsWidget";

interface ProfileWidgetRendererProps {
    widgets: BaseWidget[];
    isEditing?: boolean;
    onWidgetClick?: (widget: BaseWidget) => void;
}

function renderWidget(widget: BaseWidget): React.ReactNode {
    const { widget_type, config, size } = widget;
    
    switch (widget_type) {
        case 'map':
            return <MapWidget config={config as unknown as MapWidgetConfig} size={size} />;
        case 'image':
            return <ImageWidget config={config as unknown as ImageWidgetConfig} size={size} />;
        case 'text':
            return <TextWidget config={config as unknown as TextWidgetConfig} size={size} />;
        case 'link':
            return <LinkWidget config={config as unknown as LinkWidgetConfig} size={size} />;
        case 'nft':
            return <NFTWidget config={config as unknown as NFTWidgetConfig} size={size} />;
        case 'spotify':
            return <SpotifyWidget config={config as unknown as SpotifyWidgetConfig} size={size} />;
        case 'video':
            return <VideoWidget config={config as unknown as VideoWidgetConfig} size={size} />;
        case 'countdown':
            return <CountdownWidget config={config as unknown as CountdownWidgetConfig} size={size} />;
        case 'clock':
            return <ClockWidget config={config as unknown as ClockWidgetConfig} size={size} />;
        case 'tech_stack':
            return <TechStackWidget config={config as unknown as TechStackWidgetConfig} size={size} />;
        case 'currently':
            return <CurrentlyWidget config={config as unknown as CurrentlyWidgetConfig} size={size} />;
        case 'stats':
            return <StatsWidget config={config as unknown as StatsWidgetConfig} size={size} />;
        default:
            // Fallback for unknown widget types
            return (
                <div className="w-full h-full flex items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-800">
                    <p className="text-zinc-500">Unknown widget</p>
                </div>
            );
    }
}

export function ProfileWidgetRenderer({ 
    widgets, 
    isEditing = false,
    onWidgetClick,
}: ProfileWidgetRendererProps) {
    // Sort widgets by position
    const sortedWidgets = [...widgets]
        .filter(w => w.is_visible || isEditing)
        .sort((a, b) => a.position - b.position);
    
    if (sortedWidgets.length === 0) {
        return (
            <div className="text-center py-12">
                <p className="text-zinc-500">No widgets added yet</p>
            </div>
        );
    }
    
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 auto-rows-[minmax(120px,auto)]">
            {sortedWidgets.map((widget, index) => (
                <motion.div
                    key={widget.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`${getGridSpanClasses(widget.size)} ${
                        isEditing ? 'cursor-move' : ''
                    } ${!widget.is_visible ? 'opacity-50' : ''}`}
                    onClick={() => isEditing && onWidgetClick?.(widget)}
                >
                    {isEditing && (
                        <div className="absolute top-2 right-2 z-10 flex gap-1">
                            <button className="w-6 h-6 rounded bg-black/50 text-white flex items-center justify-center hover:bg-black/70">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                            </button>
                        </div>
                    )}
                    {renderWidget(widget)}
                </motion.div>
            ))}
        </div>
    );
}
