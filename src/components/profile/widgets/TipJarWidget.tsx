"use client";

import { useState } from "react";
import { TipJarWidgetConfig, WidgetSize } from "../ProfileWidgetTypes";

interface TipJarWidgetProps {
    config: TipJarWidgetConfig;
    size: WidgetSize;
}

export function TipJarWidget({ config, size }: TipJarWidgetProps) {
    const { address, tokens = ['ETH'], message, amounts = [0.01, 0.05, 0.1] } = config;
    const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
    const [selectedToken, setSelectedToken] = useState(tokens[0] || 'ETH');
    const [copied, setCopied] = useState(false);
    
    const isSmall = size === '1x1';
    const isCompact = size === '2x1';
    
    const formatAddress = (addr: string) => 
        `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    
    const copyAddress = async () => {
        await navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    
    // Token icons
    const tokenIcons: Record<string, string> = {
        ETH: '⟠',
        USDC: '💵',
        USDT: '💲',
    };
    
    if (isSmall) {
        return (
            <button
                onClick={copyAddress}
                className="w-full h-full flex flex-col items-center justify-center p-4 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-500/30 hover:border-emerald-400/50 transition-all group"
            >
                <span className="text-3xl mb-1">💰</span>
                <p className="text-white font-semibold text-sm">Tip Jar</p>
                <p className="text-emerald-300/70 text-xs">
                    {copied ? 'Copied!' : 'Tap to copy'}
                </p>
            </button>
        );
    }
    
    return (
        <div className="w-full h-full flex flex-col p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-green-500/10 border border-emerald-500/30">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                    <span className="text-2xl">💰</span>
                </div>
                <div className="flex-1">
                    <p className="text-white font-semibold">Tip Jar</p>
                    {message && (
                        <p className="text-emerald-200/70 text-sm line-clamp-1">{message}</p>
                    )}
                </div>
            </div>
            
            {!isCompact && (
                <>
                    {/* Token selector */}
                    {tokens.length > 1 && (
                        <div className="flex gap-2 mb-3">
                            {tokens.map((token) => (
                                <button
                                    key={token}
                                    onClick={() => setSelectedToken(token)}
                                    className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                        selectedToken === token
                                            ? 'bg-emerald-500 text-white'
                                            : 'bg-zinc-800/50 text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    {tokenIcons[token] || '💎'} {token}
                                </button>
                            ))}
                        </div>
                    )}
                    
                    {/* Amount buttons */}
                    <div className="flex gap-2 mb-4">
                        {amounts.map((amount) => (
                            <button
                                key={amount}
                                onClick={() => setSelectedAmount(amount)}
                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    selectedAmount === amount
                                        ? 'bg-emerald-500 text-white'
                                        : 'bg-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-800'
                                }`}
                            >
                                {amount} {selectedToken}
                            </button>
                        ))}
                    </div>
                </>
            )}
            
            {/* Address / Send button */}
            <div className="mt-auto">
                <button
                    onClick={copyAddress}
                    className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition-colors flex items-center justify-center gap-2"
                >
                    {copied ? (
                        <>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Address Copied!
                        </>
                    ) : (
                        <>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copy {formatAddress(address)}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
