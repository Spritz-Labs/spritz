"use client";

import { NFTWidgetConfig } from "../ProfileWidgetTypes";

interface NFTWidgetProps {
    config: NFTWidgetConfig;
    size: string;
}

export function NFTWidget({ config, size }: NFTWidgetProps) {
    const { imageUrl, name, collection, chain, contractAddress, tokenId, showDetails = true } = config;
    
    const isSmall = size === '1x1';
    
    // Generate OpenSea link
    const chainSlug = chain === 'ethereum' ? 'ethereum' : chain;
    const openSeaUrl = `https://opensea.io/assets/${chainSlug}/${contractAddress}/${tokenId}`;
    
    // Chain icons
    const chainIcons: Record<string, string> = {
        ethereum: '⟠',
        polygon: '⬡',
        base: '🔵',
        optimism: '🔴',
    };
    
    return (
        <a
            href={openSeaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-full relative overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-purple-500/50 transition-all group"
        >
            {/* NFT Image */}
            {imageUrl ? (
                <img
                    src={imageUrl}
                    alt={name || 'NFT'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
            ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                    <span className="text-4xl">🖼️</span>
                </div>
            )}
            
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            
            {/* Chain Badge */}
            <div className="absolute top-3 right-3 px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm text-xs text-white flex items-center gap-1">
                <span>{chainIcons[chain] || '⟠'}</span>
                <span className="capitalize">{chain}</span>
            </div>
            
            {/* NFT Info */}
            {showDetails && !isSmall && (
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent">
                    {collection && (
                        <p className="text-purple-400 text-xs mb-1">{collection}</p>
                    )}
                    <p className="text-white font-semibold truncate">
                        {name || `#${tokenId}`}
                    </p>
                </div>
            )}
            
            {/* Hover indicator */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                </div>
            </div>
        </a>
    );
}
