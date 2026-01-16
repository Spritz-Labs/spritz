"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState, useCallback } from "react";
import { PixelArtShare } from "@/components/PixelArtShare";
import { upscalePixelArt, downloadPixelArt } from "@/components/PixelArtImage";

export default function PixelArtPage() {
    const params = useParams();
    const hash = params.hash as string;
    const [upscaledSrc, setUpscaledSrc] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    
    const pinataGateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud";
    const imageUrl = `https://${pinataGateway}/ipfs/${hash}`;

    const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
        setIsLoading(false);
        const img = e.currentTarget;
        if (img.naturalWidth && img.naturalHeight) {
            try {
                const upscaled = upscalePixelArt(img, 16);
                setUpscaledSrc(upscaled);
            } catch (err) {
                console.warn("[PixelArt] Failed to upscale:", err);
            }
        }
    }, []);

    const handleDownload = useCallback(() => {
        if (upscaledSrc) {
            downloadPixelArt(upscaledSrc, `pixel-art-${hash.slice(0, 8)}.png`);
        }
    }, [upscaledSrc, hash]);
    
    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 via-black to-black" />
            
            <div className="relative z-10 max-w-lg w-full">
                {/* Header */}
                <div className="text-center mb-6">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                        🍊 Pixel Art on Spritz
                    </h1>
                    <p className="text-zinc-400">
                        Created with love on the decentralized web
                    </p>
                </div>
                
                {/* Image container with pixel art styling */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-2xl">
                    <div className="relative aspect-square w-full max-w-md mx-auto bg-white rounded-xl overflow-hidden border-4 border-zinc-700">
                        {/* Hidden image for loading and upscaling */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={imageUrl}
                            alt=""
                            className="hidden"
                            crossOrigin="anonymous"
                            onLoad={handleImageLoad}
                        />
                        {/* Display upscaled or original */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={upscaledSrc || imageUrl}
                            alt="Pixel Art"
                            className={`w-full h-full object-contain transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                            style={{ imageRendering: upscaledSrc ? "auto" : "pixelated" }}
                        />
                        {/* Loading state */}
                        {isLoading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
                                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        )}
                    </div>
                    
                    {/* Share and Download buttons */}
                    <div className="mt-6 flex justify-center gap-3">
                        <PixelArtShare imageUrl={imageUrl} />
                        {upscaledSrc && (
                            <button
                                onClick={handleDownload}
                                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Download HD
                            </button>
                        )}
                    </div>
                </div>
                
                {/* CTA */}
                <div className="mt-8 text-center">
                    <p className="text-zinc-400 mb-4">
                        Want to create your own pixel art?
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#FF5500] to-[#FF8800] text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-orange-500/25 transition-all"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Create on Spritz
                    </Link>
                    
                    <p className="mt-6 text-zinc-500 text-sm">
                        Spritz is a censorship-resistant chat app for Web3
                    </p>
                </div>
            </div>
        </div>
    );
}
