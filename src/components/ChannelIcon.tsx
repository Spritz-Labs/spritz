"use client";

import { useState } from "react";
import Image from "next/image";

type ChannelIconProps = {
    emoji?: string;
    iconUrl?: string | null;
    name?: string;
    size?: "xs" | "sm" | "md" | "lg" | "xl";
    className?: string;
    editable?: boolean;
    onUpload?: (file: File) => Promise<void>;
    onRemove?: () => Promise<void>;
    /** When set and iconUrl is present, the icon is clickable to open full-width viewer */
    onImageClick?: () => void;
};

const SIZE_CLASSES = {
    xs: "w-6 h-6 text-sm",
    sm: "w-8 h-8 text-lg",
    md: "w-10 h-10 text-xl",
    lg: "w-12 h-12 text-2xl",
    xl: "w-16 h-16 text-3xl",
};

export function ChannelIcon({
    emoji = "💬",
    iconUrl,
    name,
    size = "md",
    className = "",
    editable = false,
    onUpload,
    onRemove,
    onImageClick,
}: ChannelIconProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [showEditOverlay, setShowEditOverlay] = useState(false);
    const [imageError, setImageError] = useState(false);

    const sizeClass = SIZE_CLASSES[size];

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !onUpload) return;

        setIsUploading(true);
        try {
            await onUpload(file);
        } catch (error) {
            console.error("Failed to upload icon:", error);
        } finally {
            setIsUploading(false);
            // Reset input
            e.target.value = "";
        }
    };

    const handleRemove = async () => {
        if (!onRemove) return;
        setIsUploading(true);
        try {
            await onRemove();
            setImageError(false);
        } catch (error) {
            console.error("Failed to remove icon:", error);
        } finally {
            setIsUploading(false);
        }
    };

    const hasImage = iconUrl && !imageError;
    const isImageClickable = hasImage && onImageClick && !editable;

    return (
        <div
            className={`relative ${sizeClass} ${className}`}
            onMouseEnter={() => editable && setShowEditOverlay(true)}
            onMouseLeave={() => setShowEditOverlay(false)}
        >
            {/* Icon display */}
            <div
                className={`${sizeClass} rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center overflow-hidden ${isImageClickable ? "cursor-pointer focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-zinc-900 focus:outline-none" : ""}`}
                onClick={isImageClickable ? onImageClick : undefined}
                onKeyDown={
                    isImageClickable
                        ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  onImageClick();
                              }
                          }
                        : undefined
                }
                role={isImageClickable ? "button" : undefined}
                tabIndex={isImageClickable ? 0 : undefined}
                aria-label={isImageClickable ? "View image full size" : undefined}
            >
                {hasImage ? (
                    <Image
                        src={iconUrl}
                        alt={name || "Channel icon"}
                        fill
                        className="object-cover pointer-events-none"
                        onError={() => setImageError(true)}
                        unoptimized
                    />
                ) : (
                    <span>{emoji}</span>
                )}
            </div>

            {/* Edit overlay */}
            {editable && showEditOverlay && (
                <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center gap-1">
                    {isUploading ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <>
                            {/* Upload button */}
                            <label className="p-1 hover:bg-white/20 rounded cursor-pointer">
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/gif,image/webp"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </label>
                            {/* Remove button (only if has custom icon) */}
                            {hasImage && onRemove && (
                                <button
                                    onClick={handleRemove}
                                    className="p-1 hover:bg-white/20 rounded"
                                >
                                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// Inline editable icon with label
type EditableChannelIconProps = ChannelIconProps & {
    label?: string;
    description?: string;
};

export function EditableChannelIcon({
    label = "Channel Icon",
    description = "Upload a custom image (JPEG, PNG, GIF, WebP, max 2MB)",
    ...iconProps
}: EditableChannelIconProps) {
    return (
        <div className="flex items-center gap-4">
            <ChannelIcon {...iconProps} editable />
            <div>
                <p className="text-sm font-medium text-white">{label}</p>
                <p className="text-xs text-zinc-500">{description}</p>
            </div>
        </div>
    );
}
