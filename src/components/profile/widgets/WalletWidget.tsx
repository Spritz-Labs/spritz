"use client";

import { useState } from "react";
import { WidgetSize, WalletWidgetConfig } from "../ProfileWidgetTypes";

interface WalletWidgetProps {
    config: WalletWidgetConfig;
    size: WidgetSize;
}

export function WalletWidget({ config, size }: WalletWidgetProps) {
    const { address, label = "Wallet" } = config;
    const [copied, setCopied] = useState(false);
    
    const isCompact = size === '1x1';
    
    const formatAddress = (addr: string) => 
        `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    
    const copyAddress = async () => {
        await navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    
    return (
        <button
            onClick={copyAddress}
            className="w-full h-full p-4 sm:p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:bg-zinc-800/80 hover:border-zinc-700 transition-all text-left group"
        >
            <div className={`flex ${isCompact ? 'flex-col items-center justify-center h-full' : 'items-center gap-3'}`}>
                <div className={`${isCompact ? 'w-10 h-10 mb-2' : 'w-12 h-12'} rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0`}>
                    <span className={`${isCompact ? 'text-xl' : 'text-2xl'}`}>💎</span>
                </div>
                <div className={`${isCompact ? 'text-center' : 'flex-1 min-w-0'}`}>
                    <p className={`text-white font-semibold ${isCompact ? 'text-sm' : ''}`}>{label}</p>
                    {!isCompact && (
                        <p className="text-zinc-500 text-sm font-mono truncate">
                            {formatAddress(address)}
                        </p>
                    )}
                </div>
                <div className={`${isCompact ? 'mt-1' : ''} flex-shrink-0`}>
                    {copied ? (
                        <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5 text-zinc-500 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    )}
                </div>
            </div>
        </button>
    );
}
