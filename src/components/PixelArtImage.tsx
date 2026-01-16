"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PixelArtShare } from "./PixelArtShare";

// IPFS gateway fallback order (fastest/most reliable first)
const IPFS_GATEWAYS = [
    "gateway.pinata.cloud",
    "cloudflare-ipfs.com",
    "ipfs.io",
    "dweb.link",
    "w3s.link",
];

// Upscale factor for high-res pixel art
const UPSCALE_FACTOR = 16; // 16x upscale (32px -> 512px)

// Extract CID from any IPFS URL
export function extractCID(url: string): string | null {
    // Match patterns like:
    // https://gateway.pinata.cloud/ipfs/QmXxx
    // https://ipfs.io/ipfs/bafyxxx
    // ipfs://QmXxx
    const patterns = [
        /\/ipfs\/([a-zA-Z0-9]+)/,
        /ipfs:\/\/([a-zA-Z0-9]+)/,
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

// Build URL for a specific gateway
function buildGatewayUrl(cid: string, gatewayIndex: number): string {
    const gateway = IPFS_GATEWAYS[gatewayIndex % IPFS_GATEWAYS.length];
    return `https://${gateway}/ipfs/${cid}`;
}

// Upscale pixel art image using canvas (nearest-neighbor)
export function upscalePixelArt(
    img: HTMLImageElement,
    scale: number = UPSCALE_FACTOR
): string {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return img.src;
    
    const newWidth = img.naturalWidth * scale;
    const newHeight = img.naturalHeight * scale;
    
    canvas.width = newWidth;
    canvas.height = newHeight;
    
    // Disable image smoothing for crisp pixel art
    ctx.imageSmoothingEnabled = false;
    
    // Draw the image scaled up
    ctx.drawImage(img, 0, 0, newWidth, newHeight);
    
    return canvas.toDataURL("image/png");
}

// Download high-res pixel art
export function downloadPixelArt(dataUrl: string, filename: string = "pixel-art.png") {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

type PixelArtImageProps = {
    src: string;
    alt?: string;
    className?: string;
    onClick?: () => void;
    size?: "sm" | "md" | "lg";
    showShareButton?: boolean; // Show persistent share button
    showDownloadButton?: boolean; // Show download button
    hideOverlay?: boolean; // Hide all overlays (for lightbox view)
    useUpscaled?: boolean; // Use upscaled version for display
};

export function PixelArtImage({
    src,
    alt = "Pixel Art",
    className = "",
    onClick,
    size = "md",
    showShareButton = false,
    showDownloadButton = false,
    hideOverlay = false,
    useUpscaled = false,
}: PixelArtImageProps) {
    const [currentSrc, setCurrentSrc] = useState(src);
    const [displaySrc, setDisplaySrc] = useState(src);
    const [upscaledSrc, setUpscaledSrc] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [gatewayIndex, setGatewayIndex] = useState(0);
    const [retryCount, setRetryCount] = useState(0);
    const imgRef = useRef<HTMLImageElement>(null);

    const cid = extractCID(src);
    const maxRetries = IPFS_GATEWAYS.length * 2; // Try each gateway twice

    // Size classes
    const sizeClasses = {
        sm: "w-24 h-24",
        md: "w-32 h-32",
        lg: "w-48 h-48",
    };

    // Reset state when src changes
    useEffect(() => {
        setCurrentSrc(src);
        setDisplaySrc(src);
        setUpscaledSrc(null);
        setIsLoading(true);
        setHasError(false);
        setGatewayIndex(0);
        setRetryCount(0);
    }, [src]);

    const handleError = useCallback(() => {
        if (!cid || retryCount >= maxRetries) {
            // Give up after max retries
            setHasError(true);
            setIsLoading(false);
            return;
        }

        // Try next gateway
        const nextIndex = gatewayIndex + 1;
        const nextUrl = buildGatewayUrl(cid, nextIndex);
        
        console.log(`[PixelArt] Gateway ${IPFS_GATEWAYS[gatewayIndex % IPFS_GATEWAYS.length]} failed, trying ${IPFS_GATEWAYS[nextIndex % IPFS_GATEWAYS.length]}`);
        
        setGatewayIndex(nextIndex);
        setRetryCount((prev) => prev + 1);
        setCurrentSrc(nextUrl);
    }, [cid, gatewayIndex, retryCount, maxRetries]);

    const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
        setIsLoading(false);
        setHasError(false);
        
        // Generate upscaled version for display and download
        const img = e.currentTarget;
        if (img.naturalWidth && img.naturalHeight) {
            try {
                const upscaled = upscalePixelArt(img, UPSCALE_FACTOR);
                setUpscaledSrc(upscaled);
                if (useUpscaled) {
                    setDisplaySrc(upscaled);
                }
            } catch (err) {
                console.warn("[PixelArt] Failed to upscale:", err);
            }
        }
    }, [useUpscaled]);

    // Retry button handler
    const handleRetry = useCallback(() => {
        if (!cid) return;
        setIsLoading(true);
        setHasError(false);
        setGatewayIndex(0);
        setRetryCount(0);
        setCurrentSrc(buildGatewayUrl(cid, 0));
    }, [cid]);

    // Download handler
    const handleDownload = useCallback(() => {
        if (upscaledSrc) {
            const filename = cid ? `pixel-art-${cid.slice(0, 8)}.png` : "pixel-art.png";
            downloadPixelArt(upscaledSrc, filename);
        }
    }, [upscaledSrc, cid]);

    const containerClasses = `${sizeClasses[size]} rounded-lg overflow-hidden ${className}`;

    // Error state - show retry button
    if (hasError) {
        return (
            <div
                className={`${containerClasses} bg-zinc-800 border border-zinc-700 flex flex-col items-center justify-center gap-2`}
            >
                <svg
                    className="w-8 h-8 text-zinc-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                </svg>
                <button
                    onClick={handleRetry}
                    className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className={`${containerClasses} relative bg-zinc-700 group`}>
            {/* Loading skeleton */}
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-700 animate-pulse">
                    <div className="relative">
                        {/* Pixel grid pattern */}
                        <div className="w-12 h-12 grid grid-cols-4 gap-0.5 opacity-30">
                            {Array.from({ length: 16 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="bg-zinc-500 rounded-sm"
                                    style={{
                                        animationDelay: `${i * 50}ms`,
                                    }}
                                />
                            ))}
                        </div>
                        {/* Loading spinner overlay */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <svg
                                className="w-6 h-6 text-zinc-400 animate-spin"
                                fill="none"
                                viewBox="0 0 24 24"
                            >
                                <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                />
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                            </svg>
                        </div>
                    </div>
                </div>
            )}

            {/* Actual image - hidden, used for loading */}
            <img
                ref={imgRef}
                src={currentSrc}
                alt={alt}
                className="hidden"
                crossOrigin="anonymous"
                onLoad={handleLoad}
                onError={handleError}
            />
            
            {/* Display image - either upscaled or original with CSS pixelation */}
            {!isLoading && (
                <img
                    src={displaySrc}
                    alt={alt}
                    className={`w-full h-full object-cover ${onClick ? "cursor-zoom-in hover:opacity-90" : ""}`}
                    style={{ imageRendering: useUpscaled && upscaledSrc ? "auto" : "pixelated" }}
                    onClick={onClick}
                />
            )}

            {/* Overlay buttons - share and download */}
            {!hideOverlay && !isLoading && !hasError && (
                <div 
                    className={`absolute bottom-1 right-1 flex items-center gap-1 ${
                        showShareButton || showDownloadButton ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    } transition-opacity z-10`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Download button */}
                    {upscaledSrc && (
                        <button
                            onClick={handleDownload}
                            className="w-6 h-6 rounded-md bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors"
                            title="Download HD"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                        </button>
                    )}
                    {/* Share button */}
                    <PixelArtShare imageUrl={src} compact />
                </div>
            )}
        </div>
    );
}


