"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { type Address } from "viem";
import { useAccount } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { useWalletBalances, formatUsd, formatTokenBalance } from "@/hooks/useWalletBalances";
import { useSmartWallet } from "@/hooks/useSmartWallet";
import { useTransactionHistory, formatRelativeTime, truncateAddress as truncateTxAddress, formatTxUsd, type Transaction } from "@/hooks/useTransactionHistory";
import { useSendTransaction, isValidAddress } from "@/hooks/useSendTransaction";
import { useEnsResolver } from "@/hooks/useEnsResolver";
import { useSafeWallet } from "@/hooks/useSafeWallet";
import { useSafePasskeySend } from "@/hooks/useSafePasskeySend";
import { useOnramp } from "@/hooks/useOnramp";
import { PasskeyManager } from "./PasskeyManager";
import { RecoverySignerManager } from "./RecoverySignerManager";
import { MultiChainSecurity } from "./MultiChainSecurity";
import type { ChainBalance, TokenBalance } from "@/app/api/wallet/balances/route";
import { SEND_ENABLED_CHAIN_IDS, SUPPORTED_CHAINS, getChainById } from "@/config/chains";

// Official chain icon components
function ChainIcon({ chainId, size = 20 }: { chainId: number; size?: number }) {
    const iconProps = { width: size, height: size, className: "inline-block" };
    
    switch (chainId) {
        case 1: // Ethereum
            return (
                <svg {...iconProps} viewBox="0 0 784 1277" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M392.07 0L383.5 29.11v873.79l8.57 8.55 392.06-231.75L392.07 0z" fill="#343434"/>
                    <path d="M392.07 0L0 679.7l392.07 231.76V496.18V0z" fill="#8C8C8C"/>
                    <path d="M392.07 981.17l-4.83 5.89v300.87l4.83 14.1 392.3-552.49-392.3 231.63z" fill="#3C3C3B"/>
                    <path d="M392.07 1302.03V981.17L0 749.54l392.07 552.49z" fill="#8C8C8C"/>
                    <path d="M392.07 911.46l392.06-231.76-392.06-178.21v409.97z" fill="#141414"/>
                    <path d="M0 679.7l392.07 231.76V501.49L0 679.7z" fill="#393939"/>
                </svg>
            );
        case 8453: // Base
            return (
                <svg {...iconProps} viewBox="0 0 111 111" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="55.5" cy="55.5" r="55.5" fill="#0052FF"/>
                    <path d="M55.5 95C77.3152 95 95 77.3152 95 55.5C95 33.6848 77.3152 16 55.5 16C34.5254 16 17.4116 32.2826 16.0596 52.875H67.625V58.125H16.0596C17.4116 78.7174 34.5254 95 55.5 95Z" fill="white"/>
                </svg>
            );
        case 42161: // Arbitrum
            return (
                <svg {...iconProps} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="40" height="40" rx="20" fill="#213147"/>
                    <path d="M22.3 22.0784L24.3784 26.9804L27.7941 25.6765L24.7549 18.251L22.3 22.0784Z" fill="#12AAFF"/>
                    <path d="M14.7255 25.6765L18.1412 26.9804L20.2196 22.0784L17.7647 18.251L14.7255 25.6765Z" fill="#12AAFF"/>
                    <path d="M21.251 10.8235L26.0784 20.4706L27.7941 25.6765L28.7843 25.2941L21.251 8.82353L21.251 10.8235Z" fill="#9DCCED"/>
                    <path d="M21.251 10.8235V8.82353L13.7176 25.2941L14.7078 25.6765L16.4235 20.4706L21.251 10.8235Z" fill="#9DCCED"/>
                    <path d="M21.251 15.6471L18.7961 20.4706L21.251 25.2941L23.7059 20.4706L21.251 15.6471Z" fill="white"/>
                </svg>
            );
        case 10: // Optimism
            return (
                <svg {...iconProps} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="28" height="28" rx="14" fill="#FF0420"/>
                    <path d="M9.22 18.35c-.97 0-1.81-.2-2.51-.61-.7-.41-1.24-.99-1.61-1.73-.37-.75-.56-1.62-.56-2.61 0-1 .19-1.87.56-2.61.38-.75.92-1.33 1.62-1.74.7-.42 1.53-.62 2.5-.62.68 0 1.29.1 1.82.31.53.2.98.49 1.34.87l-1.09 1.15c-.5-.53-1.15-.79-1.96-.79-.55 0-1.03.13-1.44.38-.4.25-.72.61-.94 1.08-.22.46-.33 1.01-.33 1.65 0 .63.11 1.18.33 1.65.22.46.54.82.95 1.07.41.25.9.37 1.46.37.81 0 1.46-.27 1.96-.81l1.09 1.16c-.36.38-.81.68-1.35.88-.54.2-1.15.31-1.84.31zm7.08-.13l-2.7-7.87h1.75l1.92 5.85 1.93-5.85h1.66l-2.7 7.87h-1.86z" fill="white"/>
                </svg>
            );
        case 137: // Polygon
            return (
                <svg {...iconProps} viewBox="0 0 38 33" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M28.8 10.075c-.65-.375-1.5-.375-2.25 0l-5.25 3.075-3.525 2.025-5.175 3.075c-.65.375-1.5.375-2.25 0l-4.05-2.4c-.65-.375-1.125-1.125-1.125-1.95V9.925c0-.75.375-1.5 1.125-1.95l4.05-2.325c.65-.375 1.5-.375 2.25 0l4.05 2.4c.65.375 1.125 1.125 1.125 1.95v3.075l3.525-2.1V7.9c0-.75-.375-1.5-1.125-1.95L13.8.8c-.65-.375-1.5-.375-2.25 0L5.1 5.95C4.35 6.4 3.975 7.15 3.975 7.9v10.35c0 .75.375 1.5 1.125 1.95l6.45 3.75c.65.375 1.5.375 2.25 0l5.175-3l3.525-2.1 5.175-3c.65-.375 1.5-.375 2.25 0l4.05 2.325c.65.375 1.125 1.125 1.125 1.95v3.975c0 .75-.375 1.5-1.125 1.95l-3.975 2.325c-.65.375-1.5.375-2.25 0l-4.05-2.325c-.65-.375-1.125-1.125-1.125-1.95v-3l-3.525 2.1v3.075c0 .75.375 1.5 1.125 1.95l6.45 3.75c.65.375 1.5.375 2.25 0l6.45-3.75c.65-.375 1.125-1.125 1.125-1.95V13.9c0-.75-.375-1.5-1.125-1.95l-6.525-3.875z" fill="#8247E5"/>
                </svg>
            );
        case 56: // BNB Chain
            return (
                <svg {...iconProps} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="16" cy="16" r="16" fill="#F3BA2F"/>
                    <path d="M12.116 14.404L16 10.52l3.886 3.886 2.26-2.26L16 6l-6.144 6.144 2.26 2.26zM6 16l2.26-2.26L10.52 16l-2.26 2.26L6 16zm6.116 1.596L16 21.48l3.886-3.886 2.26 2.259L16 26l-6.144-6.144-.003-.003 2.263-2.257zM21.48 16l2.26-2.26L26 16l-2.26 2.26L21.48 16zm-3.188-.002h.002V16L16 18.294l-2.291-2.29-.004-.004.004-.003.401-.402.195-.195L16 13.706l2.293 2.293z" fill="white"/>
                </svg>
            );
        case 130: // Unichain (Uniswap)
            return (
                <svg {...iconProps} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="40" height="40" rx="20" fill="#FF007A"/>
                    <path d="M15.12 12.66c-.22-.04-.23-.05-.08-.08.28-.06.95.02 1.6.18 1.52.37 2.9 1.34 4.24 2.96l.35.43.5-.08c2.17-.33 4.38.24 6.06 1.56.46.36 1.19 1.13 1.19 1.25 0 .03-.15.1-.33.15-.65.18-1.38.13-1.91-.14-.14-.07-.26-.13-.28-.13-.01 0 .04.13.12.28.28.54.35.9.28 1.43-.1.67-.5 1.25-1.16 1.67l-.22.14.13.25c.36.7.45 1.5.24 2.25-.05.19-.1.35-.11.35-.01 0-.11-.08-.22-.18-.48-.44-.97-.66-1.66-.74l-.3-.04-.24.33c-.72 1-.72 2.31 0 3.5.15.25.26.47.24.49-.05.05-.8-.24-1.12-.44-.66-.4-1.12-1.02-1.35-1.8l-.08-.28-.2.16c-.44.35-.95.56-1.58.66-.35.05-.98.03-1.29-.05l-.14-.04.06.22c.1.4.37.8.7 1.06.13.1.22.2.2.22-.05.05-.78-.04-1.09-.14-.71-.23-1.26-.7-1.57-1.36-.1-.22-.24-.66-.24-.77 0-.04-.02-.08-.04-.08-.02 0-.23.08-.45.18-.82.36-1.58.5-2.23.42-.17-.02-.32-.05-.34-.07-.05-.05.44-.5.8-.74.67-.43 1.49-.68 2.78-.86l.35-.05-.16-.24c-.5-.72-.69-1.66-.5-2.5.03-.15.07-.3.08-.31.02-.02.13.04.26.12.48.31 1.05.45 1.48.38l.18-.03-.08-.22c-.22-.67-.1-1.45.32-2.08.09-.14.15-.26.13-.27-.02-.01-.2-.07-.4-.13-.67-.2-1.14-.5-1.52-.97-.26-.32-.55-.89-.55-1.08 0-.04.06-.03.15.03.53.35 1.33.52 2.12.45l.32-.03-.17-.22c-.55-.67-.77-1.58-.58-2.35.04-.15.08-.3.1-.31.02-.02.13.04.25.13.53.39 1.25.58 1.76.46l.14-.03-.2-.29c-.58-.88-.6-1.97-.04-2.9.12-.2.24-.38.25-.4.02-.02.16.08.31.22.62.58 1.38.87 2.14.81l.23-.02-.25-.26c-.76-.76-.95-1.9-.48-2.83.08-.17.17-.34.2-.37.04-.05.08-.04.27.08.9.56 2.31.65 3.15.2.1-.06.2-.1.21-.1.01 0 .03.08.03.18.04.6-.18 1.21-.62 1.71l-.14.16.3-.04c.73-.11 1.56.14 2.2.66.16.13.17.14.04.08-.5-.21-1.2-.24-1.73-.07-.69.23-1.25.75-1.6 1.5-.1.21-.2.38-.22.38-.02 0-.19-.08-.38-.18-.72-.36-1.31-.46-2.03-.35-.86.14-1.6.58-2.15 1.28l-.14.18.35-.1c.91-.25 2.14-.08 3 .42.23.14.67.5.67.55 0 .01-.14.09-.3.16-.84.36-1.42.94-1.73 1.7-.08.2-.15.35-.16.35 0 0-.18-.1-.38-.22-.7-.44-1.35-.6-2.17-.56-.81.04-1.48.32-2.09.86l-.23.2.3-.05c.64-.1 1.44.1 2.07.53.44.3.97.88 1.24 1.35.1.18.1.18-.08.12-1.19-.42-2.56-.12-3.42.76-.08.08-.14.16-.14.18 0 .02.13.1.28.18.64.33 1.12.85 1.36 1.49.05.14.07.26.04.26-.02 0-.2-.07-.39-.15-.75-.33-1.49-.37-2.2-.1-.3.1-.78.38-.78.44 0 .02.07.1.16.18.48.48.74 1.14.74 1.87 0 .22-.01.4-.03.4-.02 0-.2-.1-.4-.21-.95-.56-2.11-.59-3.1-.08-.07.04-.07.05 0 .12.22.22.58.42.9.5.14.03.42.05.7.04.4-.02.52 0 .85.13.48.19.86.52 1.12.96l.13.23-.07.34c-.1.49-.08 1.07.07 1.54.05.17.07.31.03.31-.03 0-.23-.08-.44-.18-.67-.31-1.18-.4-1.84-.34-.83.08-1.47.4-2.05 1.04-.12.13-.2.25-.18.27.02.02.18 0 .37-.04 1.32-.27 2.71.34 3.47 1.52.03.05-.02.06-.27.04-.56-.04-1.1.1-1.6.42-.5.3-.88.77-1.1 1.34-.04.1-.05.18-.03.18.02 0 .18-.06.35-.13.75-.31 1.6-.3 2.35.03.1.04.18.1.18.12 0 .02-.13.13-.3.25-.55.4-.89.9-1.04 1.53-.05.2-.05.63 0 .85.07.33.27.7.5.93.09.1.15.18.12.2-.02.01-.17.04-.32.07-.98.16-1.93-.2-2.5-.96-.17-.23-.37-.65-.43-.9l-.04-.16-.18.22c-.42.54-.97.88-1.68 1.05-.2.05-.34.05-.74.02-.54-.04-.89 0-1.28.14l-.16.06.02-.19c.03-.42.26-.83.63-1.1.12-.1.22-.18.22-.2 0-.06-.6.09-.88.22-.44.2-.73.52-.9.97l-.06.16-.1-.1c-.26-.27-.42-.6-.48-1.02-.05-.3-.02-.73.05-1.01.03-.1.04-.19.02-.2-.01-.01-.14.02-.27.08-.57.24-1.26.23-1.79-.04-.14-.07-.25-.14-.25-.16 0-.02.11-.12.24-.23.34-.28.57-.66.66-1.08.03-.14.05-.28.04-.3-.01-.03-.1.01-.21.08-.54.36-1.28.41-1.86.13-.18-.09-.47-.32-.47-.37 0-.02.1-.1.21-.19.38-.3.63-.73.73-1.22l.04-.18-.17.04c-.56.14-1.24.02-1.68-.29-.1-.07-.18-.14-.18-.17 0-.02.1-.11.23-.2.34-.24.6-.6.73-1.01.04-.13.06-.26.04-.28-.01-.02-.13.02-.25.08-.6.3-1.34.28-1.88-.05-.13-.08-.23-.16-.23-.18 0-.01.12-.12.26-.23.39-.31.63-.73.71-1.23l.03-.18-.18.08c-.5.21-1.06.22-1.54.01-.3-.12-.68-.42-.68-.53 0-.03.1-.13.22-.23.35-.29.56-.66.66-1.15.02-.1.02-.2 0-.22-.02-.02-.14.02-.27.1-.31.18-.58.25-.98.25-.5 0-.91-.15-1.31-.5-.1-.09-.17-.18-.15-.2.01-.02.15-.08.31-.13.83-.27 1.38-.94 1.47-1.78 0-.1 0-.18-.02-.18-.01 0-.15.06-.3.14-.74.38-1.66.29-2.28-.22-.08-.07-.14-.14-.12-.16.01-.01.16-.06.32-.1.9-.22 1.52-.87 1.66-1.74.01-.1.01-.19 0-.2-.02-.02-.14.04-.27.12-.55.32-1.16.4-1.76.21-.44-.13-.96-.47-.96-.62 0-.04.09-.15.2-.24.46-.4.7-.95.7-1.59 0-.17-.01-.31-.03-.31-.01 0-.16.07-.32.15-.79.41-1.77.36-2.45-.14l-.14-.1.26-.06c.77-.18 1.32-.71 1.5-1.45.04-.17.05-.32.02-.34-.02-.02-.17.05-.33.14-.63.37-1.47.37-2.1 0-.17-.1-.42-.31-.42-.36 0-.02.12-.1.27-.18.53-.3.88-.77 1.01-1.37.04-.16.06-.32.04-.34-.02-.02-.17.04-.33.14-.69.41-1.62.35-2.23-.14-.12-.1-.12-.1.05-.17.58-.23.99-.68 1.17-1.27.08-.26.1-.7.03-.96-.02-.08-.02-.08.16 0 .49.2.9.55 1.18 1 .09.14.18.26.2.26.02 0 .04-.09.04-.2 0-.5.19-1 .54-1.42.16-.2.54-.5.54-.44 0 .02.01.15.03.28.05.56.32 1.1.74 1.47.12.1.22.18.23.18 0 0 .03-.12.05-.27.07-.65.44-1.24 1.01-1.63.11-.08.22-.14.23-.14.01 0 .03.12.04.27.05.57.27 1.06.66 1.47l.19.2.17-.18c.36-.4.87-.66 1.42-.73.15-.02.27-.03.28-.01.01.01-.02.14-.07.28-.18.52-.14 1.1.13 1.6.1.2.38.54.47.57.02.01.11-.1.2-.23.36-.53.94-.9 1.56-1 .17-.03.31-.04.33-.02.01.02-.04.14-.1.27-.28.5-.33 1.1-.14 1.64.07.2.28.52.42.65l.1.08.15-.17c.43-.5 1.1-.8 1.78-.8h.22l-.12.22c-.29.52-.34 1.15-.13 1.72.06.17.25.48.38.61l.08.09.22-.21c.38-.34.75-.52 1.25-.61z" fill="white"/>
                </svg>
            );
        case 43114: // Avalanche
            return (
                <svg {...iconProps} viewBox="0 0 254 254" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="127" cy="127" r="127" fill="#E84142"/>
                    <path d="M171.8 130.3c4.4-7.6 11.5-7.6 15.9 0l27.4 48.1c4.4 7.6.8 13.9-8 13.9h-55.1c-8.7 0-12.3-6.2-8-13.9l27.8-48.1zm-42.6-73.5c4.4-7.6 11.4-7.6 15.8 0l7 12.2 16.4 28.7c3.5 7.1 3.5 15.5 0 22.6l-44 76.3c-4.4 7.6-12.3 12.4-21.2 12.4H57.5c-8.8 0-12.4-6.2-8-13.9l79.7-138.3z" fill="white"/>
                </svg>
            );
        default:
            return <span className="text-base">⬡</span>;
    }
}

// Chain info for display (must include ALL chains from SUPPORTED_CHAINS in chains.ts)
// safePrefix is the chain identifier used in Safe App URLs: https://app.safe.global/home?safe={safePrefix}:{address}
const CHAIN_INFO: Record<number, { name: string; color: string; sponsorship: "free" | "usdc" | "none"; safePrefix: string; symbol: string; gasCost?: string }> = {
    1: { name: "Ethereum", color: "#627EEA", sponsorship: "usdc", safePrefix: "eth", symbol: "ETH", gasCost: "$50-200+" },
    8453: { name: "Base", color: "#0052FF", sponsorship: "free", safePrefix: "base", symbol: "ETH" },
    42161: { name: "Arbitrum", color: "#28A0F0", sponsorship: "free", safePrefix: "arb1", symbol: "ETH" },
    10: { name: "Optimism", color: "#FF0420", sponsorship: "free", safePrefix: "oeth", symbol: "ETH" },
    137: { name: "Polygon", color: "#8247E5", sponsorship: "free", safePrefix: "matic", symbol: "MATIC" },
    56: { name: "BNB Chain", color: "#F3BA2F", sponsorship: "free", safePrefix: "bnb", symbol: "BNB" },
    130: { name: "Unichain", color: "#FF007A", sponsorship: "free", safePrefix: "unichain", symbol: "ETH" },
    43114: { name: "Avalanche", color: "#E84142", sponsorship: "free", safePrefix: "avax", symbol: "AVAX" },
};

// Supported Networks Info Component (collapsible on balance tab)
function SupportedNetworksInfo({ isExpanded, onToggle }: { isExpanded: boolean; onToggle: () => void }) {
    const freeGasChains = Object.entries(CHAIN_INFO).filter(([, info]) => info.sponsorship === "free");
    const paidGasChains = Object.entries(CHAIN_INFO).filter(([, info]) => info.sponsorship === "usdc" || info.sponsorship === "none");
    
    return (
        <div className="mx-4 mb-3">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between p-3 bg-zinc-800/50 hover:bg-zinc-800/70 rounded-xl transition-colors"
            >
                <div className="flex items-center gap-2">
                    <span className="text-lg">🌐</span>
                    <span className="text-sm font-medium text-white">Supported Networks</span>
                    <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] rounded-full font-medium">
                        {freeGasChains.length} free gas
                    </span>
                </div>
                <svg 
                    className={`w-4 h-4 text-zinc-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            
            {isExpanded && (
                <div className="mt-2 p-3 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-3">
                    {/* Free gas chains */}
                    <div>
                        <p className="text-xs text-emerald-400 font-medium mb-2 flex items-center gap-1">
                            <span>✓</span> Free Gas (Recommended)
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                            {freeGasChains.map(([chainId, info]) => (
                                <div 
                                    key={chainId}
                                    className="flex items-center gap-1.5 text-xs text-zinc-300 bg-zinc-800/50 px-2 py-1.5 rounded-lg"
                                >
                                    <ChainIcon chainId={Number(chainId)} size={14} />
                                    <span className="truncate">{info.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    {/* Paid gas chains with warning */}
                    <div>
                        <p className="text-xs text-amber-400 font-medium mb-2 flex items-center gap-1">
                            <span>⚠️</span> High Gas Fees
                        </p>
                        {paidGasChains.map(([chainId, info]) => (
                            <div 
                                key={chainId}
                                className="flex items-center justify-between text-xs bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-lg mb-1 last:mb-0"
                            >
                                <div className="flex items-center gap-1.5 text-zinc-300">
                                    <ChainIcon chainId={Number(chainId)} size={14} />
                                    <span>{info.name}</span>
                                </div>
                                {info.gasCost && (
                                    <span className="text-amber-400 font-medium">{info.gasCost}</span>
                                )}
                            </div>
                        ))}
                        <p className="text-[10px] text-amber-300/60 mt-2">
                            First transaction on Ethereum requires deploying your Smart Account, which costs {CHAIN_INFO[1].gasCost} in gas fees.
                        </p>
                    </div>
                    
                    {/* Warning about unsupported chains */}
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                        <p className="text-xs text-red-400">
                            <strong>⚠️ Not Supported:</strong> Solana and other non-EVM networks.
                            Sending from unsupported chains will result in <strong>permanent loss of funds</strong>.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

// Network Warning Content - Full overlay that covers the wallet modal content
function NetworkWarningContent({ onAcknowledge }: { onAcknowledge: () => void }) {
    return (
        <div className="absolute inset-0 z-20 bg-zinc-900 flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                    <span className="text-xl">⚠️</span>
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-white">Before You Deposit</h2>
                    <p className="text-xs text-zinc-400">Please read carefully</p>
                </div>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* Recommended Networks - FREE */}
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                        <span>✅</span>
                        <span className="text-sm font-bold text-emerald-400">Recommended - FREE Gas</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                        <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2 py-1.5 rounded-lg">
                            <ChainIcon chainId={8453} size={14} />
                            <span className="text-xs text-white">Base</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2 py-1.5 rounded-lg">
                            <ChainIcon chainId={42161} size={14} />
                            <span className="text-xs text-white">Arb</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2 py-1.5 rounded-lg">
                            <ChainIcon chainId={10} size={14} />
                            <span className="text-xs text-white">OP</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2 py-1.5 rounded-lg">
                            <ChainIcon chainId={137} size={14} />
                            <span className="text-xs text-white">Poly</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2 py-1.5 rounded-lg">
                            <ChainIcon chainId={56} size={14} />
                            <span className="text-xs text-white">BNB</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2 py-1.5 rounded-lg">
                            <ChainIcon chainId={130} size={14} />
                            <span className="text-xs text-white">Uni</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2 py-1.5 rounded-lg col-span-2">
                            <ChainIcon chainId={43114} size={14} />
                            <span className="text-xs text-white">Avalanche</span>
                        </div>
                    </div>
                    <p className="text-xs text-emerald-300/80 mt-2">Send and receive for free on these networks!</p>
                </div>
                
                {/* Ethereum Mainnet - HIGH FEES */}
                <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                        <ChainIcon chainId={1} size={20} />
                        <span className="text-sm font-bold text-amber-400 flex-1">Ethereum Mainnet</span>
                        <span className="text-base font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-lg">$50-200+</span>
                    </div>
                    <p className="text-xs text-amber-200/70">
                        First transaction deploys Smart Account. Use L2s above for free.
                    </p>
                </div>
                
                {/* NOT SUPPORTED - DANGER */}
                <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                        <span>🚫</span>
                        <span className="text-sm font-bold text-red-400">NOT SUPPORTED - Funds Will Be Lost</span>
                    </div>
                    <p className="text-xs text-red-300/80 mb-2">
                        Sending from these networks results in permanent loss:
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <span className="px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded-lg">Solana</span>
                        <span className="px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded-lg">Bitcoin</span>
                        <span className="px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded-lg">Other non-EVM</span>
                    </div>
                </div>
            </div>
            
            {/* Fixed CTA Button at bottom */}
            <div className="p-4 border-t border-zinc-800">
                <button
                    onClick={onAcknowledge}
                    className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white text-base font-bold rounded-xl transition-colors"
                >
                    I Understand, Show My Address
                </button>
            </div>
        </div>
    );
}

// Helper to get Safe App URL for a specific chain
// Uses /transactions/history which works better with ERC-4337 Safes than /home
function getSafeAppUrl(chainId: number, address: string, page: "home" | "transactions" = "transactions"): string {
    const chainInfo = CHAIN_INFO[chainId];
    const prefix = chainInfo?.safePrefix || "base";
    
    // Use transactions/history page as it's more compatible with 4337 Safes
    // The home page sometimes shows "contract not supported" for 4337 module configs
    if (page === "transactions") {
        return `https://app.safe.global/transactions/history?safe=${prefix}:${address}`;
    }
    return `https://app.safe.global/home?safe=${prefix}:${address}`;
}

type WalletModalProps = {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string; // Spritz ID (identity)
    emailVerified?: boolean;
    authMethod?: "wallet" | "email" | "passkey" | "world_id" | "alien_id" | "solana";
};

// Copy to clipboard helper
function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
}

// Truncate address for display
function truncateAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Single token row component for the new flat list view
function TokenBalanceRow({ token, symbol }: { token: TokenBalance; symbol?: string }) {
    const displaySymbol = symbol || token.symbol;
    return (
        <div className="px-4 py-3 flex items-center gap-3 border-b border-zinc-800/30 last:border-b-0 hover:bg-zinc-800/20 transition-colors">
            {/* Token logo or fallback */}
            {token.logoUrl ? (
                <img src={token.logoUrl} alt={displaySymbol} className="w-10 h-10 rounded-full" />
            ) : (
                <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-medium text-zinc-300">
                    {displaySymbol.slice(0, 3)}
                </div>
            )}

            {/* Token name and balance */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{displaySymbol}</span>
                    {token.name && token.name !== displaySymbol && (
                        <span className="text-xs text-zinc-500">{token.name}</span>
                    )}
                </div>
                <span className="text-sm text-zinc-400">
                    {formatTokenBalance(token.balance, token.decimals, token.balanceFormatted)}
                </span>
            </div>

            {/* USD value */}
            <div className="text-right">
                <span className={`font-medium ${(token.balanceUsd || 0) > 0 ? "text-white" : "text-zinc-500"}`}>
                    {formatUsd(token.balanceUsd || 0)}
                </span>
            </div>
        </div>
    );
}

// Chain selector dropdown component
function ChainSelectorDropdown({ 
    selectedChainId, 
    onSelectChain,
    balances 
}: { 
    selectedChainId: number; 
    onSelectChain: (chainId: number) => void;
    balances: ChainBalance[];
}) {
    const [isOpen, setIsOpen] = useState(false);
    const selectedInfo = CHAIN_INFO[selectedChainId];
    const selectedBalance = balances.find(b => b.chain.id === selectedChainId);

    return (
        <div className="px-4 py-3 border-b border-zinc-800/50">
            <div className="relative">
                {/* Selected chain button */}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/70 hover:bg-zinc-800 transition-colors"
                    style={{ 
                        borderLeft: `3px solid ${selectedInfo?.color || '#666'}`,
                    }}
                >
                    <div className="flex items-center gap-3">
                        <ChainIcon chainId={selectedChainId} size={24} />
                        <div className="text-left">
                            <div className="text-sm font-medium text-white">{selectedInfo?.name}</div>
                            <div className="text-xs text-zinc-400">
                                {selectedBalance?.totalUsd 
                                    ? `$${selectedBalance.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                    : "No balance"
                                }
                            </div>
                        </div>
                    </div>
                    <svg 
                        className={`w-5 h-5 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {/* Dropdown menu */}
                {isOpen && (
                    <div className="absolute z-50 w-full mt-2 py-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden">
                        {SEND_ENABLED_CHAIN_IDS.map((chainId) => {
                            const info = CHAIN_INFO[chainId];
                            if (!info) return null;
                            const chainBalance = balances.find(b => b.chain.id === chainId);
                            const isSelected = selectedChainId === chainId;
                            
                            return (
                                <button
                                    key={chainId}
                                    onClick={() => {
                                        onSelectChain(chainId);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${
                                        isSelected
                                            ? "bg-zinc-800"
                                            : "hover:bg-zinc-800/50"
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <ChainIcon chainId={chainId} size={20} />
                                        <span className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                                            {info.name}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {chainBalance && chainBalance.totalUsd > 0 && (
                                            <span className="text-xs text-zinc-400">
                                                ${chainBalance.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        )}
                                        {isSelected && (
                                            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

// Token row component
function TokenRow({ token }: { token: TokenBalance }) {
    return (
        <div className="px-4 py-2.5 pl-16 flex items-center gap-3 border-t border-zinc-800/30">
            {/* Token logo or fallback */}
            {token.logoUrl ? (
                <img src={token.logoUrl} alt={token.symbol} className="w-7 h-7 rounded-full" />
            ) : (
                <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-300">
                    {token.symbol.slice(0, 2)}
                </div>
            )}

            {/* Token name and balance */}
            <div className="flex-1 min-w-0">
                <span className="text-sm text-white font-medium">{token.symbol}</span>
                <p className="text-xs text-zinc-500 truncate">
                    {formatTokenBalance(token.balance, token.decimals, token.balanceFormatted)} {token.name}
                </p>
            </div>

            {/* USD value */}
            <span className={`text-sm font-medium ${token.balanceUsd ? "text-zinc-300" : "text-zinc-600"}`}>
                {token.balanceUsd ? formatUsd(token.balanceUsd) : "-"}
            </span>
        </div>
    );
}

// Transaction row component
function TransactionRow({ tx, userAddress }: { tx: Transaction; userAddress: string }) {
    const isOutgoing = tx.type === "send" || tx.from.toLowerCase() === userAddress.toLowerCase();
    
    return (
        <a
            href={tx.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-3 flex items-center gap-3 hover:bg-zinc-800/30 transition-colors"
        >
            {/* Token logo with direction indicator */}
            <div className="relative">
                {tx.tokenLogo ? (
                    <img src={tx.tokenLogo} alt={tx.tokenSymbol} className="w-9 h-9 rounded-full" />
                ) : (
                    <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-300">
                        {tx.tokenSymbol.slice(0, 2)}
                    </div>
                )}
                {/* Direction badge */}
                <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                    isOutgoing 
                        ? "bg-orange-500 text-white" 
                        : "bg-emerald-500 text-white"
                }`}>
                    {isOutgoing ? "↗" : "↙"}
                </div>
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm text-white font-medium">
                        {isOutgoing ? "Sent" : "Received"} {tx.tokenSymbol}
                    </span>
                    <span className="text-zinc-600"><ChainIcon chainId={tx.chainId} size={14} /></span>
                </div>
                <p className="text-xs text-zinc-500 truncate">
                    {isOutgoing ? "To: " : "From: "}
                    {truncateTxAddress(isOutgoing ? tx.to : tx.from)}
                </p>
            </div>

            {/* Amount and time */}
            <div className="text-right">
                <p className={`text-sm font-medium ${
                    isOutgoing ? "text-orange-400" : "text-emerald-400"
                }`}>
                    {isOutgoing ? "-" : "+"}{tx.valueFormatted} {tx.tokenSymbol}
                </p>
                <div className="flex items-center justify-end gap-1.5">
                    {tx.valueUsd !== null && (
                        <span className="text-xs text-zinc-500">{formatTxUsd(tx.valueUsd)}</span>
                    )}
                    <span className="text-xs text-zinc-600">
                        {formatRelativeTime(tx.timestamp)}
                    </span>
                </div>
            </div>
        </a>
    );
}

type TabType = "balances" | "send" | "history" | "receive" | "security";

export function WalletModal({ isOpen, onClose, userAddress, emailVerified, authMethod }: WalletModalProps) {
    // Check if wallet is connected (for sending)
    const { isConnected } = useAccount();
    const { open: openConnectModal } = useAppKit();
    
    // Determine if user authenticated via passkey (needs Safe signing)
    const isPasskeyUser = authMethod === "passkey";
    
    // For email/digital_id/world_id/solana users, they should use passkey signing
    // This means we don't store any private keys - passkey is the only signer
    // Solana users need passkey because Solana wallets can't sign EVM transactions
    const isSolanaUser = authMethod === "solana";
    const needsPasskeyForSend = authMethod === "email" || authMethod === "alien_id" || authMethod === "world_id" || isSolanaUser;
    const canUsePasskeySigning = isPasskeyUser || needsPasskeyForSend;

    // Get Smart Wallet (Safe) address
    const { smartWallet, isLoading: isSmartWalletLoading } = useSmartWallet(
        isOpen ? userAddress : null
    );
    
    // Always use Smart Wallet address for balances - this is the user's Spritz wallet
    // Don't fall back to userAddress (EOA) as that's a different wallet
    const smartWalletAddress = smartWallet?.smartWalletAddress;
    const isSmartWalletReady = !!smartWalletAddress && !isSmartWalletLoading;
    
    const { balances, totalUsd, isLoading, error, lastUpdated, refresh } = useWalletBalances(
        isSmartWalletReady ? smartWalletAddress : null,
        isSmartWalletReady
    );

    // Transaction history - also uses Smart Wallet address
    const { 
        transactions, 
        isLoading: isLoadingTx, 
        refresh: refreshTx 
    } = useTransactionHistory(
        isSmartWalletReady ? smartWalletAddress : null
    );

    const [copied, setCopied] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>("balances");
    const [showPasskeyManager, setShowPasskeyManager] = useState(false);
    const [hasAcknowledgedChainWarning, setHasAcknowledgedChainWarning] = useState(false);
    const [showNetworksInfo, setShowNetworksInfo] = useState(false);
    
    // Selected chain for viewing balances and sending (default to Base)
    const [selectedChainId, setSelectedChainId] = useState<number>(8453);
    const selectedChainInfo = CHAIN_INFO[selectedChainId] || CHAIN_INFO[8453];

    // Send form state
    const [sendToken, setSendToken] = useState<TokenBalance | null>(null);
    const [sendAmount, setSendAmount] = useState("");
    
    // ENS resolver for recipient
    const {
        input: recipientInput,
        resolvedAddress: resolvedRecipient,
        ensName: recipientEnsName,
        isResolving: isResolvingEns,
        error: ensError,
        isValid: isRecipientValid,
        setInput: setRecipientInput,
        clear: clearRecipient,
    } = useEnsResolver();
    const [showTokenSelector, setShowTokenSelector] = useState(false);
    const [showSendConfirm, setShowSendConfirm] = useState(false);
    
    // EOA gas payment toggle (for Mainnet when Safe has no USDC approval)
    const [useEOAForGas, setUseEOAForGas] = useState(false);

    // Send transaction hook
    const {
        status: sendStatus,
        error: sendError,
        txHash,
        gasEstimate,
        isEstimating,
        isSending,
        estimateGas,
        send,
        reset: resetSend,
    } = useSendTransaction();

    // Safe wallet hook (for sending from Spritz wallet)
    const {
        safeAddress,
        isDeployed: isSafeDeployed,
        isSending: isSafeSending,
        status: safeStatus,
        error: safeError,
        txHash: safeTxHash,
        estimatedGas: safeEstimatedGas,
        sendTransaction: sendSafeTransaction,
        estimateGas: estimateSafeGas,
        reset: resetSafe,
    } = useSafeWallet();

    // Passkey Safe hook (for passkey users)
    const {
        status: passkeyStatus,
        error: passkeyError,
        txHash: passkeyTxHash,
        isSending: isPasskeySending,
        isReady: isPasskeyReady,
        initialize: initializePasskey,
        sendTransaction: sendPasskeyTransaction,
        reset: resetPasskey,
    } = useSafePasskeySend();

    // Initialize passkey Safe when modal opens for users who can use passkey signing
    // This includes: passkey users, email users, alien_id users, world_id users
    useEffect(() => {
        if (isOpen && canUsePasskeySigning && userAddress && !isPasskeyReady && passkeyStatus === "idle") {
            console.log("[WalletModal] Initializing passkey Safe for user:", userAddress.slice(0, 10), "authMethod:", authMethod);
            initializePasskey(userAddress as Address);
        }
    }, [isOpen, canUsePasskeySigning, userAddress, isPasskeyReady, passkeyStatus, initializePasskey, authMethod]);

    // Onramp (Buy crypto) hook
    const {
        status: onrampStatus,
        error: onrampError,
        initializeOnramp,
        openOnramp,
        reset: resetOnramp,
    } = useOnramp();

    // Spritz Wallet always uses Safe - if users want EOA, they use their wallet app directly
    const useSafeForSend = true;
    
    // Determine effective state based on auth method
    // canUsePasskeySigning includes passkey, email, alien_id, world_id users
    const effectiveTxHash = canUsePasskeySigning ? passkeyTxHash : (useSafeForSend ? safeTxHash : txHash);
    const effectiveError = canUsePasskeySigning ? passkeyError : (useSafeForSend ? safeError : sendError);
    const effectiveIsSending = canUsePasskeySigning ? isPasskeySending : (useSafeForSend ? isSafeSending : isSending);

    // Estimate gas when recipient and amount are valid
    const handleEstimateGas = useCallback(async () => {
        if (!sendToken || !resolvedRecipient || !sendAmount) return;

        if (useSafeForSend && safeAddress) {
            await estimateSafeGas(resolvedRecipient, sendAmount);
        } else {
            await estimateGas({
                to: resolvedRecipient,
                value: sendAmount,
            });
        }
    }, [sendToken, resolvedRecipient, sendAmount, estimateGas, estimateSafeGas, useSafeForSend, safeAddress]);

    // Handle send confirmation
    const handleSend = useCallback(async () => {
        if (!sendToken || !resolvedRecipient || !sendAmount) return;

        let hash: string | null = null;
        
        // Determine if this is a native ETH transfer or ERC20 token transfer
        const isNativeTransfer = sendToken.tokenType === "native";
        const tokenAddress = isNativeTransfer ? undefined : sendToken.contractAddress as Address;
        const tokenDecimals = isNativeTransfer ? undefined : sendToken.decimals;

        if (canUsePasskeySigning) {
            // Send via passkey-signed Safe transaction
            // This works for passkey, email, alien_id, and world_id users
            console.log("[WalletModal] Sending via passkey Safe to:", resolvedRecipient, "authMethod:", authMethod);
            hash = await sendPasskeyTransaction(
                resolvedRecipient,
                sendAmount,
                tokenAddress,
                tokenDecimals,
                selectedChainId,
                smartWalletAddress as Address // Pass Safe address for USDC balance check
            );
        } else if (useSafeForSend && safeAddress) {
            // Send via Safe smart wallet (EOA signer)
            // Pass selectedChainId to ensure correct chain is used
            // On Mainnet, useEOAForGas allows the connected wallet to pay gas directly
            hash = await sendSafeTransaction(
                resolvedRecipient,
                sendAmount,
                tokenAddress,
                tokenDecimals,
                { chainId: selectedChainId, useEOAForGas }
            );
        } else {
            // Send via connected EOA (only supports native ETH for now)
            if (!isNativeTransfer) {
                console.warn("[WalletModal] EOA ERC20 transfers not yet implemented");
                // TODO: Implement EOA ERC20 transfers
            }
            hash = await send({
                to: resolvedRecipient,
                value: sendAmount,
            });
        }

        if (hash) {
            // Success - refresh balances after delays to catch blockchain indexing
            // First refresh after 3 seconds (force fresh data)
            setTimeout(() => {
                refresh(true);
                refreshTx();
            }, 3000);
            // Second refresh after 8 seconds to catch any indexing lag
            setTimeout(() => {
                refresh(true);
                refreshTx();
            }, 8000);
            // Third refresh after 15 seconds for slow indexing
            setTimeout(() => {
                refresh(true);
                refreshTx();
            }, 15000);
        }
    }, [sendToken, resolvedRecipient, sendAmount, send, sendSafeTransaction, sendPasskeyTransaction, useSafeForSend, safeAddress, canUsePasskeySigning, authMethod, refresh, refreshTx, selectedChainId, useEOAForGas]);

    // Reset send form
    const resetSendForm = useCallback(() => {
        setSendToken(null);
        clearRecipient();
        setSendAmount("");
        setShowSendConfirm(false);
        setUseEOAForGas(false);
        resetSend();
        resetSafe();
        resetPasskey();
    }, [clearRecipient, resetSend, resetSafe, resetPasskey]);

    // Get all tokens flat for send selector (only from send-enabled chains)
    const allTokens = useMemo(() => {
        const tokens: (TokenBalance & { chainIcon: string; chainName: string; chainId: number })[] = [];
        for (const chainBalance of balances) {
            // Include tokens from ALL send-enabled chains (not just selected)
            // This way users can see all their assets and select any
            if (!SEND_ENABLED_CHAIN_IDS.includes(chainBalance.chain.id)) {
                continue;
            }
            if (chainBalance.nativeBalance) {
                tokens.push({
                    ...chainBalance.nativeBalance,
                    chainIcon: chainBalance.chain.icon,
                    chainName: chainBalance.chain.name,
                    chainId: chainBalance.chain.id,
                });
            }
            for (const token of chainBalance.tokens) {
                tokens.push({
                    ...token,
                    chainIcon: chainBalance.chain.icon,
                    chainName: chainBalance.chain.name,
                    chainId: chainBalance.chain.id,
                });
            }
        }
        // Sort by USD value (highest first)
        return tokens.sort((a, b) => (b.balanceUsd || 0) - (a.balanceUsd || 0));
    }, [balances]);

    // Get selected chain balance for display
    const selectedChainBalance = balances.find(b => b.chain.id === selectedChainId);

    // Reset to balances tab when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setActiveTab("balances");
            setCopied(false);
            setHasAcknowledgedChainWarning(false);
        } else {
            // Reset send form when modal closes
            resetSendForm();
            setHasAcknowledgedChainWarning(false);
        }
    }, [isOpen, resetSendForm]);

    // Auto-estimate gas when send form is complete
    useEffect(() => {
        if (sendToken && resolvedRecipient && sendAmount && parseFloat(sendAmount) > 0) {
            handleEstimateGas();
        }
    }, [sendToken, resolvedRecipient, sendAmount, handleEstimateGas]);

    // Copy wallet address
    const handleCopy = () => {
        if (!smartWalletAddress) return;
        copyToClipboard(smartWalletAddress);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Alias for clarity
    const handleCopySmartWallet = handleCopy;

    // Close on escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        if (isOpen) {
            document.addEventListener("keydown", handleEscape);
        }
        return () => document.removeEventListener("keydown", handleEscape);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md min-h-[70vh] max-h-[90vh] overflow-hidden flex flex-col"
                    >
                        {/* Network Warning Overlay - shown when receive tab active and not acknowledged */}
                        {activeTab === "receive" && !hasAcknowledgedChainWarning && !isSmartWalletLoading && !(smartWallet?.needsPasskey || (needsPasskeyForSend && passkeyStatus === "error")) && !(needsPasskeyForSend && passkeyStatus === "loading") && (
                            <NetworkWarningContent onAcknowledge={() => setHasAcknowledgedChainWarning(true)} />
                        )}
                        
                        {/* Header */}
                        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                    <span className="text-xl">💳</span>
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-white">Spritz Smart Accounts</h2>
                                    <span className="text-xs text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full">
                                        Beta
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Wallet Address Card */}
                        <div className="px-4 pt-4">
                            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3">
                                {isSmartWalletLoading ? (
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-zinc-700 animate-pulse" />
                                        <div className="flex-1">
                                            <div className="h-4 w-32 bg-zinc-700 rounded animate-pulse mb-1" />
                                            <div className="h-3 w-24 bg-zinc-800 rounded animate-pulse" />
                                        </div>
                                    </div>
                                ) : smartWalletAddress ? (
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-xs font-bold text-black">
                                            {smartWalletAddress.slice(2, 4).toUpperCase()}
                                </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-zinc-300 font-medium">
                                                Smart Wallet
                                            </p>
                                            <p className="text-xs text-zinc-500">
                                                Tap Receive to view address
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => setActiveTab("receive")}
                                            className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                                        >
                                            Receive
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-center py-2 text-sm text-zinc-500">
                                        Unable to load wallet address
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Total Balance across all chains */}
                        <div className="px-4 py-4">
                            <div className="text-center">
                                <p className="text-sm text-zinc-500 mb-1">
                                    Total Balance
                                </p>
                                {!isSmartWalletReady ? (
                                    <div className="h-9 w-32 mx-auto bg-zinc-800 rounded-lg animate-pulse" />
                                ) : isLoading && balances.length === 0 ? (
                                    <div className="h-9 w-32 mx-auto bg-zinc-800 rounded-lg animate-pulse" />
                                ) : (
                                    <p className="text-3xl font-bold text-white">
                                        {formatUsd(totalUsd)}
                                    </p>
                                )}
                                {/* Show selected chain balance below */}
                                {selectedChainBalance && selectedChainBalance.totalUsd > 0 && (
                                    <p className="text-xs text-zinc-400 mt-1 flex items-center justify-center gap-1">
                                        <ChainIcon chainId={selectedChainId} size={14} />
                                        <span>{selectedChainInfo.name}: {formatUsd(selectedChainBalance.totalUsd)}</span>
                                    </p>
                                )}
                            </div>
                            
                            {/* Quick Actions - Buy button */}
                            {smartWalletAddress && (
                                <div className="flex justify-center mt-3">
                                    <button
                                        onClick={async () => {
                                            // Initialize and open in one go
                                            const url = await initializeOnramp(smartWalletAddress, {
                                                presetFiatAmount: 50,
                                                defaultNetwork: "base",
                                                defaultAsset: "ETH",
                                            });
                                            if (url) {
                                                // Open directly with the URL
                                                const width = 450;
                                                const height = 700;
                                                const left = Math.max(0, (window.innerWidth - width) / 2 + window.screenX);
                                                const top = Math.max(0, (window.innerHeight - height) / 2 + window.screenY);
                                                const popup = window.open(
                                                    url,
                                                    "coinbase-onramp",
                                                    `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
                                                );
                                                if (!popup || popup.closed) {
                                                    window.location.href = url;
                                                }
                                            }
                                        }}
                                        disabled={onrampStatus === "loading"}
                                        className="px-4 py-2 rounded-xl text-sm font-medium transition-all bg-[#0052FF] text-white hover:bg-[#0052FF]/90 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {onrampStatus === "loading" ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                Loading...
                                            </>
                                        ) : (
                                            <>
                                                <span>💳</span>
                                                Buy Crypto
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                        
                        {/* Supported Networks Info - Collapsible */}
                        <SupportedNetworksInfo 
                            isExpanded={showNetworksInfo} 
                            onToggle={() => setShowNetworksInfo(!showNetworksInfo)} 
                        />

                        {/* Tab Navigation */}
                        <div className="px-4 pb-3">
                            <div className="flex gap-1 p-1 bg-zinc-800/50 rounded-xl">
                                <button
                                    onClick={() => setActiveTab("balances")}
                                    className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                                        activeTab === "balances"
                                            ? "bg-zinc-700 text-white shadow-sm"
                                            : "text-zinc-400 hover:text-zinc-200"
                                    }`}
                                >
                                    💰 Assets
                                </button>
                                <button
                                    onClick={() => setActiveTab("send")}
                                    className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                                        activeTab === "send"
                                            ? "bg-zinc-700 text-white shadow-sm"
                                            : "text-zinc-400 hover:text-zinc-200"
                                    }`}
                                >
                                    📤 Send
                                </button>
                                <button
                                    onClick={() => setActiveTab("receive")}
                                    className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                                        activeTab === "receive"
                                            ? "bg-zinc-700 text-white shadow-sm"
                                            : "text-zinc-400 hover:text-zinc-200"
                                    }`}
                                >
                                    📥 Receive
                                </button>
                                <button
                                    onClick={() => setActiveTab("history")}
                                    className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                                        activeTab === "history"
                                            ? "bg-zinc-700 text-white shadow-sm"
                                            : "text-zinc-400 hover:text-zinc-200"
                                    }`}
                                >
                                    📜 History
                                </button>
                                <button
                                    onClick={() => setActiveTab("security")}
                                    className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                                        activeTab === "security"
                                            ? "bg-zinc-700 text-white shadow-sm"
                                            : "text-zinc-400 hover:text-zinc-200"
                                    }`}
                                >
                                    🔐
                                </button>
                            </div>
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 flex flex-col overflow-hidden border-t border-zinc-800/50">
                            {activeTab === "balances" && (
                                <div className="flex-1 overflow-y-auto">
                                    {/* Chain selector dropdown */}
                                    <ChainSelectorDropdown
                                        selectedChainId={selectedChainId}
                                        onSelectChain={setSelectedChainId}
                                        balances={balances}
                                    />

                                    {/* Refresh bar */}
                                    <div className="px-4 py-2 flex items-center justify-between border-b border-zinc-800/50">
                                        <div className="flex items-center gap-2">
                                            {selectedChainInfo.sponsorship === "free" ? (
                                                <span className="text-[10px] text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                    <span>✓</span> Free Gas
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded-full">
                                                    Gas paid in USDC
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-zinc-500">
                                                {lastUpdated 
                                                    ? new Date(lastUpdated).toLocaleTimeString()
                                                    : "..."
                                                }
                                            </span>
                                            <button
                                                onClick={() => refresh(true)}
                                                disabled={isLoading}
                                                className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
                                            >
                                                {isLoading ? (
                                                    <div className="w-4 h-4 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                    </svg>
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Token balances for selected chain */}
                                    <div>
                                        {error ? (
                                            <div className="p-8 text-center">
                                                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/10 flex items-center justify-center">
                                                    <span className="text-2xl">⚠️</span>
                                                </div>
                                                <p className="text-red-400 mb-2">{error}</p>
                                                <button
                                                    onClick={() => refresh(true)}
                                                    className="text-sm text-emerald-400 hover:underline"
                                                >
                                                    Try again
                                                </button>
                                            </div>
                                        ) : isLoading && balances.length === 0 ? (
                                            <div className="p-8 flex flex-col items-center gap-3">
                                                <div className="w-8 h-8 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
                                                <p className="text-sm text-zinc-500">Fetching balances...</p>
                                            </div>
                                        ) : !selectedChainBalance ? (
                                            <div className="p-8 text-center">
                                                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-zinc-800 flex items-center justify-center">
                                                    <ChainIcon chainId={selectedChainId} size={28} />
                                                </div>
                                                <p className="text-zinc-400 text-sm mb-1">No assets on {selectedChainInfo.name}</p>
                                                <p className="text-zinc-600 text-xs">
                                                    Deposit {selectedChainInfo.symbol} or tokens to get started
                                                </p>
                                            </div>
                                        ) : (
                                            <div>
                                                {/* Native token (ETH, MATIC, etc.) */}
                                                {selectedChainBalance.nativeBalance && (
                                                    <TokenBalanceRow 
                                                        token={selectedChainBalance.nativeBalance} 
                                                        symbol={selectedChainInfo.symbol}
                                                    />
                                                )}
                                                
                                                {/* ERC20 tokens */}
                                                {selectedChainBalance.tokens.length > 0 ? (
                                                    selectedChainBalance.tokens.map((token, idx) => (
                                                        <TokenBalanceRow 
                                                            key={`${token.contractAddress}-${idx}`} 
                                                            token={token}
                                                        />
                                                    ))
                                                ) : (
                                                    !selectedChainBalance.nativeBalance && (
                                                        <div className="p-6 text-center">
                                                            <p className="text-zinc-500 text-sm">No tokens on {selectedChainInfo.name}</p>
                                                        </div>
                                                    )
                                                )}
                                                
                                                {/* View in Safe App button */}
                                                {smartWalletAddress && isSafeDeployed && (
                                                    <div className="p-4 border-t border-zinc-800/50">
                                                        {/* Note: Safe deploys on first tx per chain */}
                                                        {selectedChainId !== 8453 && (
                                                            <p className="text-xs text-zinc-500 text-center mb-2">
                                                                ℹ️ Safe deploys on each chain with your first transaction there
                                                            </p>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                const safeUrl = getSafeAppUrl(selectedChainId, smartWalletAddress);
                                                                window.open(safeUrl, "_blank");
                                                            }}
                                                            className="w-full py-2.5 rounded-xl text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
                                                        >
                                                            <span>🔐</span>
                                                            <span>View on {selectedChainInfo.name} Safe App</span>
                                                            <span className="text-zinc-500">↗</span>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === "receive" && (
                                <div className="relative flex-1 flex flex-col overflow-y-auto">
                                    {/* Email/Digital ID users without passkey - must create one to unlock wallet */}
                                    {(smartWallet?.needsPasskey || (needsPasskeyForSend && passkeyStatus === "error")) ? (
                                        <div className="flex flex-col items-center justify-center text-center p-6">
                                            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-purple-500/10 flex items-center justify-center">
                                                <span className="text-3xl">🔐</span>
                                            </div>
                                            <h3 className="text-lg font-semibold text-white mb-2">Create Your Wallet</h3>
                                            <p className="text-sm text-zinc-400 mb-4 max-w-xs">
                                                {isSolanaUser ? (
                                                    <>Your Solana wallet works on Solana, but to use EVM chains (Ethereum, Base, etc.), you need a passkey.</>
                                                ) : (
                                                    <>Set up a passkey to create your wallet. Your passkey will be your wallet key - it&apos;s how you sign transactions.</>
                                                )}
                                            </p>
                                            <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 mb-4 max-w-xs">
                                                <p className="text-xs text-purple-300 mb-2">
                                                    <strong>🔑 Your Passkey = Your Wallet Key</strong>
                                                </p>
                                                <p className="text-xs text-zinc-400">
                                                    Your passkey controls your wallet. If you delete your passkey, you&apos;ll lose access to any funds in your wallet.
                                                </p>
                                            </div>
                                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 max-w-xs">
                                                <p className="text-xs text-amber-300">
                                                    <strong>💡 Tip:</strong> Use a passkey that syncs across devices (iCloud Keychain, Google Password Manager, or a hardware key like YubiKey).
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => setShowPasskeyManager(true)}
                                                className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-xl transition-colors"
                                            >
                                                Create Passkey & Wallet
                                            </button>
                                            <p className="text-xs text-zinc-600 mt-4">
                                                🔒 Takes less than 30 seconds
                                            </p>
                                        </div>
                                    ) : (needsPasskeyForSend && passkeyStatus === "loading") || isSmartWalletLoading ? (
                                        <div className="flex flex-col items-center justify-center p-6">
                                            <div className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-4" />
                                            <p className="text-sm text-zinc-400">Loading wallet...</p>
                                        </div>
                                    ) : !hasAcknowledgedChainWarning ? (
                                        /* Network warning is rendered as overlay at modal level */
                                        <div className="flex-1 flex items-center justify-center p-6">
                                            <p className="text-zinc-400 text-sm">Loading...</p>
                                        </div>
                                    ) : (
                                        /* Normal receive flow - user has acknowledged warning */
                                        <div className="p-6 overflow-y-auto h-full">
                                    <div className="text-center mb-6">
                                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                                            <span className="text-3xl">📥</span>
                                        </div>
                                        <h3 className="text-lg font-semibold text-white mb-1">Receive Tokens</h3>
                                        <p className="text-sm text-zinc-500">
                                            Send tokens to your wallet on any supported chain
                                        </p>
                                    </div>

                                    {/* Passkey wallet warning - remind users that passkey = wallet key */}
                                    {smartWallet?.warning && needsPasskeyForSend && (
                                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-4 mx-auto max-w-xs">
                                            <div className="flex items-start gap-2">
                                                <span className="text-amber-400 text-sm">🔑</span>
                                                <p className="text-xs text-amber-200/80">
                                                    <strong>Your passkey controls this wallet.</strong> Keep it safe - losing your passkey means losing access to funds.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* QR Code - uses Smart Wallet address */}
                                    {smartWalletAddress && (
                                    <div className="bg-white p-4 rounded-2xl mb-4 mx-auto w-fit">
                                            <QRCodeSVG
                                                value={smartWalletAddress}
                                                size={176}
                                                level="M"
                                                includeMargin={false}
                                                bgColor="#ffffff"
                                                fgColor="#000000"
                                            />
                                        </div>
                                    )}

                                    {/* Wallet Address */}
                                    {smartWalletAddress && (
                                        <>
                                            <div className="mb-3">
                                                <div className="flex items-center justify-center mb-1.5">
                                                    <span className="text-xs font-medium text-zinc-400">Your Wallet Address</span>
                                    </div>
                                                <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3">
                                        <code className="text-xs text-zinc-300 font-mono break-all block text-center">
                                                        {smartWalletAddress}
                                        </code>
                                                </div>
                                    </div>

                                    <div className="flex gap-2 mb-3">
                                        <button
                                            onClick={handleCopySmartWallet}
                                            className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                                                copied 
                                                    ? "bg-emerald-500 text-white" 
                                                    : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                                            }`}
                                        >
                                            {copied ? "✓ Address Copied!" : "Copy Address"}
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (isSafeDeployed && smartWalletAddress) {
                                                    const safeUrl = getSafeAppUrl(selectedChainId, smartWalletAddress);
                                                    window.open(safeUrl, "_blank");
                                                } else {
                                                    alert("Safe App will be available after your first transaction deploys the Safe contract.");
                                                }
                                            }}
                                            className={`px-4 py-3 rounded-xl font-medium transition-all ${
                                                isSafeDeployed 
                                                    ? "bg-zinc-700 text-zinc-300 hover:bg-zinc-600" 
                                                    : "bg-zinc-800 text-zinc-500 cursor-help"
                                            }`}
                                            title={isSafeDeployed ? `View on ${selectedChainInfo.name} Safe App` : "Safe not deployed yet - make a transaction first"}
                                        >
                                            🔐
                                        </button>
                                    </div>

                                        </>
                                    )}

                                    {/* Supported chains - CRITICAL for users to understand */}
                                    <div className="mt-6 bg-zinc-800/50 rounded-xl p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-emerald-400">✓</span>
                                            <span className="text-sm font-medium text-white">Deposit on these chains only:</span>
                                        </div>
                                        
                                        {/* Supported chain pills */}
                                        <div className="flex flex-wrap gap-2 mb-4">
                                            {SEND_ENABLED_CHAIN_IDS.map((chainId) => {
                                                const info = CHAIN_INFO[chainId];
                                                if (!info) return null;
                                                return (
                                                    <div 
                                                        key={chainId}
                                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                                                        style={{ backgroundColor: `${info.color}20`, color: info.color }}
                                                    >
                                                        <ChainIcon chainId={chainId} size={14} />
                                                        <span>{info.name}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Warning about unsupported chains */}
                                        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
                                            <div className="flex gap-2">
                                                <span className="text-orange-400 text-sm">⚠️</span>
                                                <div>
                                                    <p className="text-xs text-orange-300 font-medium mb-1">
                                                        Do NOT deposit from other chains
                                                    </p>
                                                    <p className="text-xs text-zinc-400">
                                                        This is a Smart Wallet. Sending funds from unsupported chains
                                                        (Solana, etc.) may result in <strong className="text-orange-300">permanent loss</strong>.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === "send" && (
                                <div className="flex-1 flex flex-col overflow-y-auto relative">
                                    {/* Loading state */}
                                    {((canUsePasskeySigning && passkeyStatus === "loading") || isSmartWalletLoading) ? (
                                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                                            <div className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-4" />
                                            <p className="text-sm text-zinc-400">Loading wallet...</p>
                                        </div>
                                    ) : (smartWallet?.needsPasskey || (canUsePasskeySigning && passkeyStatus === "error" && needsPasskeyForSend)) ? (
                                        /* Email/Digital ID users without a passkey - prompt to create one */
                                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                                            <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center mb-4">
                                                <span className="text-3xl">🔐</span>
                                            </div>
                                            <h3 className="text-lg font-semibold text-white mb-2">Create Your Wallet</h3>
                                            <p className="text-sm text-zinc-400 mb-4 max-w-xs">
                                                {isSolanaUser ? (
                                                    <>Your Solana wallet can&apos;t sign EVM transactions. Create a passkey to get your EVM wallet.</>
                                                ) : (
                                                    <>Set up a passkey to create your wallet. Your passkey will be your wallet key - it signs all your transactions.</>
                                                )}
                                            </p>
                                            <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 mb-6 max-w-xs">
                                                <p className="text-xs text-purple-300">
                                                    <strong>🔑 Your Passkey = Your Wallet Key</strong>
                                                    <br />
                                                    <span className="text-zinc-400">Keep it safe - losing it means losing wallet access.</span>
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => setShowPasskeyManager(true)}
                                                className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-xl transition-colors"
                                            >
                                                Create Passkey & Wallet
                                            </button>
                                            <p className="text-xs text-zinc-600 mt-4">
                                                🔒 Your passkey stays on your device
                                            </p>
                                        </div>
                                    ) : canUsePasskeySigning && passkeyStatus === "error" ? (
                                        /* Passkey users with an error */
                                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                                            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                                                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                </svg>
                                            </div>
                                            <h3 className="text-lg font-semibold text-white mb-2">Setup Required</h3>
                                            <p className="text-sm text-zinc-400 mb-4 max-w-xs">
                                                {passkeyError || "Failed to initialize passkey wallet"}
                                            </p>
                                            <button
                                                onClick={() => {
                                                    resetPasskey();
                                                    if (userAddress) initializePasskey(userAddress as Address);
                                                }}
                                                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm"
                                            >
                                                Try Again
                                            </button>
                                        </div>
                                    ) : !isConnected && !canUsePasskeySigning ? (
                                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                                            <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center mb-4">
                                                <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                                </svg>
                                            </div>
                                            <h3 className="text-lg font-semibold text-white mb-2">Connect Wallet to Send</h3>
                                            <p className="text-sm text-zinc-400 mb-6 max-w-xs">
                                                To send tokens, you need to connect an Ethereum wallet to sign transactions.
                                            </p>
                                            <button
                                                onClick={() => openConnectModal?.()}
                                                className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-xl transition-colors"
                                            >
                                                Connect Wallet
                                            </button>
                                            <p className="text-xs text-zinc-600 mt-4">
                                                Your Spritz wallet address will stay the same
                                            </p>
                                        </div>
                                    ) : (
                                    <>
                                    {/* Token Selector Modal */}
                                    <AnimatePresence>
                                        {showTokenSelector && (
                                            <motion.div
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                className="absolute inset-0 bg-zinc-900/95 z-10 flex flex-col"
                                            >
                                                <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                                                    <h4 className="text-sm font-medium text-white">Select Token</h4>
                                                    <button
                                                        onClick={() => setShowTokenSelector(false)}
                                                        className="p-1 text-zinc-400 hover:text-white"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                                <div className="flex-1 overflow-y-auto">
                                                    {allTokens.length === 0 ? (
                                                        <div className="p-8 text-center text-zinc-500 text-sm">
                                                            No tokens with balance
                                                        </div>
                                                    ) : (
                                                        allTokens.map((token, idx) => {
                                                            const chainInfo = CHAIN_INFO[token.chainId];
                                                            const isFreeGas = chainInfo?.sponsorship === "free";
                                                            return (
                                                            <button
                                                                key={`${token.contractAddress}-${idx}`}
                                                                onClick={() => {
                                                                    setSendToken(token);
                                                                    // Auto-switch to the token's chain
                                                                    if (token.chainId && token.chainId !== selectedChainId) {
                                                                        setSelectedChainId(token.chainId);
                                                                    }
                                                                    setShowTokenSelector(false);
                                                                }}
                                                                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800/50 transition-colors text-left border-b border-zinc-800/30 last:border-b-0"
                                                            >
                                                                <div className="relative">
                                                                    {token.logoUrl ? (
                                                                        <img src={token.logoUrl} alt={token.symbol} className="w-10 h-10 rounded-full" />
                                                                    ) : (
                                                                        <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-medium">
                                                                            {token.symbol.slice(0, 2)}
                                                                        </div>
                                                                    )}
                                                                    {/* Chain badge on token icon */}
                                                                    <div 
                                                                        className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-zinc-900 overflow-hidden"
                                                                        style={{ backgroundColor: chainInfo?.color || "#666" }}
                                                                    >
                                                                        <ChainIcon chainId={token.chainId} size={14} />
                                                                    </div>
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-sm text-white font-medium">{token.symbol}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 mt-0.5">
                                                                        <span className="text-xs text-zinc-500">{token.chainName}</span>
                                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                                                            isFreeGas 
                                                                                ? "bg-emerald-500/20 text-emerald-400" 
                                                                                : "bg-amber-500/20 text-amber-400"
                                                                        }`}>
                                                                            {isFreeGas ? "Free gas" : "Paid gas"}
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-xs text-zinc-600 mt-0.5">
                                                                        {formatTokenBalance(token.balance, token.decimals, token.balanceFormatted)}
                                                                    </p>
                                                                </div>
                                                                <span className="text-sm text-zinc-400 font-medium">
                                                                    {token.balanceUsd ? formatUsd(token.balanceUsd) : "-"}
                                                                </span>
                                                            </button>
                                                        );})
                                                        
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <div className="p-4 space-y-4">
                                        {/* Token Selector */}
                                        <div>
                                            <label className="block text-xs font-medium text-zinc-400 mb-2">
                                                Token
                                            </label>
                                            <button
                                                onClick={() => setShowTokenSelector(true)}
                                                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3 hover:border-zinc-600 transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    {sendToken ? (
                                                        <>
                                                            {sendToken.logoUrl ? (
                                                                <img src={sendToken.logoUrl} alt={sendToken.symbol} className="w-8 h-8 rounded-full" />
                                                            ) : (
                                                                <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-300">
                                                                    {sendToken.symbol.slice(0, 2)}
                                                                </div>
                                                            )}
                                                            <div className="flex-1 text-left">
                                                                <p className="text-sm text-white font-medium">{sendToken.symbol}</p>
                                                                <p className="text-xs text-zinc-500">
                                                                    Balance: {formatTokenBalance(sendToken.balance, sendToken.decimals, sendToken.balanceFormatted)}
                                                                </p>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">
                                                                <span>💰</span>
                                                            </div>
                                                            <div className="flex-1 text-left">
                                                                <p className="text-sm text-white font-medium">Select a token</p>
                                                                <p className="text-xs text-zinc-500">Choose from your balances</p>
                                                            </div>
                                                        </>
                                                    )}
                                                    <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </div>
                                            </button>
                                        </div>

                                        {/* Chain Info Banner - shows when token selected */}
                                        {sendToken && (
                                            <div 
                                                className="flex items-center justify-between p-3 rounded-xl border"
                                                style={{ 
                                                    backgroundColor: `${selectedChainInfo.color}10`,
                                                    borderColor: `${selectedChainInfo.color}30`
                                                }}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <ChainIcon chainId={selectedChainId} size={22} />
                                                    <div>
                                                        <p className="text-sm font-medium text-white">{selectedChainInfo.name}</p>
                                                        <p className="text-xs text-zinc-400">
                                                            {selectedChainInfo.sponsorship === "free" 
                                                                ? "Transactions are sponsored (free)" 
                                                                : selectedChainInfo.sponsorship === "usdc"
                                                                ? "Gas paid in USDC or ETH"
                                                                : "Standard gas fees apply"
                                                            }
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className={`px-2 py-1 rounded-lg text-xs font-semibold ${
                                                    selectedChainInfo.sponsorship === "free"
                                                        ? "bg-emerald-500/20 text-emerald-400"
                                                        : "bg-amber-500/20 text-amber-400"
                                                }`}>
                                                    {selectedChainInfo.sponsorship === "free" ? "✓ FREE" : "💰 GAS"}
                                                </div>
                                            </div>
                                        )}

                                        {/* Mainnet Warning - Prominent warning about high gas costs */}
                                        {sendToken && selectedChainId === 1 && (
                                            <div className="bg-amber-500/15 border-2 border-amber-500/40 rounded-xl p-3 space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xl">⚠️</span>
                                                    <p className="text-sm font-bold text-amber-400">
                                                        Ethereum Mainnet - High Gas Fees
                                                    </p>
                                                </div>
                                                <div className="bg-amber-500/20 rounded-lg p-2 text-center">
                                                    <p className="text-xs text-amber-300/80 mb-1">Expected gas cost:</p>
                                                    <p className="text-lg font-bold text-amber-300">$50 - $200+</p>
                                                </div>
                                                {!isSafeDeployed && (
                                                    <p className="text-[11px] text-amber-200/80">
                                                        <strong>First transaction?</strong> Your Smart Account needs to be deployed on Ethereum, 
                                                        which adds significant gas costs. Consider using a free L2 network instead.
                                                    </p>
                                                )}
                                                <p className="text-[10px] text-amber-300/60">
                                                    Gas fees will be deducted from your wallet&apos;s ETH balance.
                                                </p>
                                                {!canUsePasskeySigning && (
                                                    <button
                                                        onClick={() => setUseEOAForGas(!useEOAForGas)}
                                                        className="mt-1 text-[10px] text-zinc-400 hover:text-zinc-300 flex items-center gap-1"
                                                    >
                                                        <span>{useEOAForGas ? "☑" : "☐"}</span>
                                                        <span>Pay from connected wallet instead</span>
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* Recipient Address with ENS support */}
                                        <div>
                                            <label className="block text-xs font-medium text-zinc-400 mb-2">
                                                Recipient
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={recipientInput}
                                                    onChange={(e) => setRecipientInput(e.target.value)}
                                                    placeholder="0x... or ENS name"
                                                    className={`w-full bg-zinc-800/50 border rounded-xl p-3 pr-10 text-white text-sm placeholder-zinc-500 focus:outline-none ${
                                                        recipientInput && !isRecipientValid && !isResolvingEns
                                                            ? "border-red-500/50 focus:border-red-500"
                                                            : isRecipientValid
                                                            ? "border-emerald-500/50 focus:border-emerald-500"
                                                            : "border-zinc-700/50 focus:border-purple-500/50"
                                                    }`}
                                                />
                                                {/* Status indicator */}
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                    {isResolvingEns ? (
                                                        <div className="w-4 h-4 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                                                    ) : isRecipientValid ? (
                                                        <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    ) : recipientInput ? (
                                                        <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    ) : null}
                                                </div>
                                            </div>
                                            {/* Show resolved address for ENS names */}
                                            {recipientEnsName && resolvedRecipient && recipientInput.includes(".") && (
                                                <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                                                    <span>✓</span>
                                                    <span className="text-zinc-500">{resolvedRecipient.slice(0, 6)}...{resolvedRecipient.slice(-4)}</span>
                                                </p>
                                            )}
                                            {/* Show ENS name for addresses */}
                                            {recipientEnsName && resolvedRecipient && !recipientInput.includes(".") && (
                                                <p className="text-xs text-purple-400 mt-1 flex items-center gap-1">
                                                    <span>🏷️</span>
                                                    <span>{recipientEnsName}</span>
                                                </p>
                                            )}
                                            {/* Show error */}
                                            {ensError && (
                                                <p className="text-xs text-red-400 mt-1">{ensError}</p>
                                            )}
                                            {/* Show invalid format error only if not resolving and not an ENS attempt */}
                                            {recipientInput && !isRecipientValid && !isResolvingEns && !ensError && !recipientInput.includes(".") && (
                                                <p className="text-xs text-red-400 mt-1">Invalid address format</p>
                                            )}
                                        </div>

                                        {/* Amount */}
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-xs font-medium text-zinc-400">
                                                    Amount
                                                </label>
                                                {sendToken && (
                                                    <button
                                                        onClick={() => setSendAmount(sendToken.balanceFormatted)}
                                                        className="text-xs text-purple-400 hover:text-purple-300"
                                                    >
                                                        MAX
                                                    </button>
                                                )}
                                            </div>
                                            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={sendAmount}
                                                        onChange={(e) => {
                                                            // Only allow valid decimal numbers
                                                            const value = e.target.value;
                                                            if (value === "" || /^\d*\.?\d*$/.test(value)) {
                                                                setSendAmount(value);
                                                            }
                                                        }}
                                                        placeholder="0.00"
                                                        className="flex-1 bg-transparent text-white text-xl font-medium placeholder-zinc-500 focus:outline-none"
                                                    />
                                                    <span className="text-zinc-400 font-medium">
                                                        {sendToken?.symbol || "---"}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-zinc-500 mt-1">
                                                    ≈ {sendToken?.balanceUsd && sendAmount 
                                                        ? formatUsd((parseFloat(sendAmount) / parseFloat(sendToken.balanceFormatted)) * sendToken.balanceUsd)
                                                        : "$0.00"}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Gas Estimation & Summary */}
                                        {sendToken && resolvedRecipient && sendAmount && parseFloat(sendAmount) > 0 && (
                                            <div className="bg-zinc-800/30 rounded-xl p-3 space-y-2">
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-zinc-500">Network Fee</span>
                                                    <span className="text-zinc-400">
                                                        {gasEstimate 
                                                            ? `~${gasEstimate.estimatedFeeUsd ? formatUsd(gasEstimate.estimatedFeeUsd) : gasEstimate.estimatedFeeFormatted + " ETH"}`
                                                            : "Estimating..."}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-zinc-500">Total</span>
                                                    <span className="text-zinc-300 font-medium">
                                                        {sendAmount} {sendToken.symbol}
                                                        {gasEstimate?.estimatedFeeUsd && sendToken.balanceUsd && sendAmount && (
                                                            <> + {formatUsd(gasEstimate.estimatedFeeUsd)} fee</>
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Error Message */}
                                        {effectiveError && (
                                            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                                                <p className="text-xs text-red-400">{effectiveError}</p>
                                            </div>
                                        )}

                                        {/* Success Message */}
                                        {effectiveTxHash && (
                                            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                                                <p className="text-xs text-emerald-400 mb-2">
                                                    Transaction sent!
                                                </p>
                                                <a
                                                    href={`https://etherscan.io/tx/${effectiveTxHash}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-emerald-300 hover:underline break-all"
                                                >
                                                    {effectiveTxHash.slice(0, 20)}...{effectiveTxHash.slice(-8)}
                                                </a>
                                            </div>
                                        )}
                                    </div>

                                    {/* Send Button - Fixed at bottom */}
                                    <div className="mt-auto p-4 border-t border-zinc-800/50">
                                        {effectiveTxHash ? (
                                            <button
                                                onClick={resetSendForm}
                                                className="w-full py-3 rounded-xl font-medium bg-zinc-700 text-white hover:bg-zinc-600 transition-colors"
                                            >
                                                Send Another
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleSend}
                                                disabled={
                                                    !sendToken ||
                                                    !resolvedRecipient ||
                                                    !sendAmount ||
                                                    parseFloat(sendAmount) <= 0 ||
                                                    effectiveIsSending ||
                                                    isResolvingEns
                                                }
                                                className={`w-full py-3 rounded-xl font-medium transition-colors ${
                                                    sendToken && resolvedRecipient && sendAmount && parseFloat(sendAmount) > 0 && !effectiveIsSending && !isResolvingEns
                                                        ? "bg-emerald-500 text-white hover:bg-emerald-600"
                                                        : "bg-emerald-500/20 text-emerald-400 opacity-50 cursor-not-allowed"
                                                }`}
                                            >
                                                {effectiveIsSending ? (
                                                    <span className="flex items-center justify-center gap-2">
                                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                        {safeStatus === "deploying" ? "Deploying Safe..." : "Signing..."}
                                                    </span>
                                                ) : !sendToken ? (
                                                    "Select Token"
                                                ) : !recipientInput ? (
                                                    "Enter Recipient"
                                                ) : isResolvingEns ? (
                                                    "Resolving ENS..."
                                                ) : !resolvedRecipient ? (
                                                    "Invalid Address"
                                                ) : !sendAmount || parseFloat(sendAmount) <= 0 ? (
                                                    "Enter Amount"
                                                ) : (
                                                    `Send ${sendAmount} ${sendToken.symbol}`
                                                )}
                                            </button>
                                        )}

                                        {/* Note about send method */}
                                        <p className="text-xs text-zinc-600 text-center mt-2">
                                            ⚡ Sending via Safe Wallet
                                        </p>
                                    </div>
                                </>
                                )}
                                </div>
                            )}

                            {activeTab === "history" && (
                                <div className="flex-1 flex flex-col overflow-y-auto">
                                    {/* Header with refresh */}
                                    <div className="px-4 py-2 flex items-center justify-between border-b border-zinc-800/50">
                                        <span className="text-xs text-zinc-500">
                                            {transactions.length} transactions
                                        </span>
                                        <button
                                            onClick={refreshTx}
                                            disabled={isLoadingTx}
                                            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            {isLoadingTx ? (
                                                <div className="w-4 h-4 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>

                                    {/* Transaction list */}
                                    <div className="flex-1 overflow-y-auto">
                                        {isLoadingTx && transactions.length === 0 ? (
                                            <div className="p-8 flex flex-col items-center gap-3">
                                                <div className="w-8 h-8 border-2 border-zinc-700 border-t-cyan-500 rounded-full animate-spin" />
                                                <p className="text-sm text-zinc-500">Loading transactions...</p>
                                            </div>
                                        ) : transactions.length === 0 ? (
                                            <div className="p-8 text-center">
                                                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-zinc-800 flex items-center justify-center">
                                                    <span className="text-xl">📭</span>
                                                </div>
                                                <p className="text-zinc-400 text-sm">No transactions yet</p>
                                                <p className="text-zinc-600 text-xs mt-1">
                                                    Transactions will appear here once you send or receive tokens
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-zinc-800/50">
                                                {transactions.map((tx) => (
                                                    <TransactionRow key={tx.hash} tx={tx} userAddress={smartWalletAddress || userAddress} />
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* View on Explorer button */}
                                    <div className="p-4 border-t border-zinc-800/50 space-y-2">
                                        <button
                                            onClick={() => {
                                                const address = smartWallet?.smartWalletAddress || userAddress;
                                                window.open(`https://basescan.org/address/${address}`, "_blank");
                                            }}
                                            className="w-full py-2.5 rounded-xl font-medium text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                                        >
                                            View All on Explorer ↗
                                        </button>
                                        {smartWallet?.smartWalletAddress && (
                                            isSafeDeployed ? (
                                                <button
                                                    onClick={() => {
                                                        if (!smartWallet.smartWalletAddress) return;
                                                        const safeUrl = getSafeAppUrl(selectedChainId, smartWallet.smartWalletAddress);
                                                        window.open(safeUrl, "_blank");
                                                    }}
                                                    className="w-full py-2.5 rounded-xl font-medium text-sm bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <span>🔐</span> View on {selectedChainInfo.name} Safe ↗
                                                </button>
                                            ) : (
                                                <div className="w-full py-2.5 rounded-xl text-sm bg-zinc-800/50 text-zinc-500 text-center">
                                                    🔐 Safe App available after first transaction
                                                </div>
                                            )
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === "security" && (
                                <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                                    {/* Multi-Chain Security - shows Safe status across all chains */}
                                    {smartWallet?.smartWalletAddress && (
                                        <MultiChainSecurity
                                            safeAddress={smartWallet.smartWalletAddress}
                                            primarySigner={smartWallet.spritzId}
                                            balances={balances}
                                        />
                                    )}

                                    {/* Passkey Manager Access */}
                                    <button
                                        onClick={() => setShowPasskeyManager(true)}
                                        className="w-full flex items-center justify-between bg-zinc-800/50 hover:bg-zinc-800 rounded-xl p-4 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">🔑</span>
                                            <div className="text-left">
                                                <p className="text-sm text-white font-medium">Passkey Manager</p>
                                                <p className="text-xs text-zinc-500">View and manage your passkeys</p>
                                            </div>
                                        </div>
                                        <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                </div>
                            )}

                            {/* Settings/Backup moved to menu - keeping backup tab hidden for now */}
                            {false && activeTab === "backup" as never && (
                                <div className="p-6">
                                    <div className="text-center mb-6">
                                        <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center ${
                                            emailVerified ? "bg-emerald-500/10" : "bg-orange-500/10"
                                        }`}>
                                            <span className="text-3xl">{emailVerified ? "✅" : "🔐"}</span>
                                        </div>
                                        <h3 className="text-lg font-semibold text-white mb-1">
                                            {emailVerified ? "Account Protected" : "Backup Wallet"}
                                        </h3>
                                        <p className="text-sm text-zinc-500">
                                            {emailVerified 
                                                ? "Your account can be recovered via email"
                                                : "Secure your funds by backing up your wallet"
                                            }
                                        </p>
                                    </div>

                                    {/* Status message based on email verification */}
                                    {emailVerified ? (
                                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mb-6">
                                            <div className="flex gap-3">
                                                <span className="text-xl">📧</span>
                                                <div>
                                                    <p className="text-emerald-400 font-medium text-sm mb-1">
                                                        Email Recovery Enabled
                                                    </p>
                                                    <p className="text-xs text-zinc-400">
                                                        You can recover your wallet using your verified email address. 
                                                        Even if you lose access to this device or clear browser data, 
                                                        you can sign in again using email recovery.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 mb-6">
                                        <div className="flex gap-3">
                                            <span className="text-xl">⚠️</span>
                                            <div>
                                                <p className="text-orange-400 font-medium text-sm mb-1">
                                                        No Recovery Method
                                                </p>
                                                <p className="text-xs text-zinc-400">
                                                        Your wallet is stored locally on this device. Verify your email 
                                                        in settings to enable account recovery, or export your private key 
                                                        as a backup.
                                                </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Backup options */}
                                    <div className="space-y-3">
                                        <button
                                            className="w-full py-3 px-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-medium text-white transition-colors flex items-center gap-3"
                                            onClick={() => {
                                                alert("Private key export coming soon!");
                                            }}
                                        >
                                            <span className="text-lg">🔑</span>
                                            <div className="text-left flex-1">
                                                <p className="text-sm font-medium">Export Private Key</p>
                                                <p className="text-xs text-zinc-500">View and copy your private key</p>
                                            </div>
                                            <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </button>

                                        <button
                                            className="w-full py-3 px-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-medium text-white transition-colors flex items-center gap-3"
                                            onClick={() => {
                                                alert("Seed phrase export coming soon!");
                                            }}
                                        >
                                            <span className="text-lg">📝</span>
                                            <div className="text-left flex-1">
                                                <p className="text-sm font-medium">Export Recovery Phrase</p>
                                                <p className="text-xs text-zinc-500">12 or 24 word seed phrase</p>
                                            </div>
                                            <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Security note */}
                                    <p className="text-xs text-zinc-600 text-center mt-6">
                                        🔒 Never share your private key or seed phrase with anyone
                                    </p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}

            {/* Passkey Manager Modal */}
            {showPasskeyManager && (
                <PasskeyManager
                    userAddress={userAddress}
                    onClose={() => {
                        setShowPasskeyManager(false);
                        // Refresh smart wallet to check if user now has a passkey
                        if (smartWallet?.needsPasskey) {
                            window.location.reload();
                        }
                    }}
                    passkeyIsWalletKey={needsPasskeyForSend}
                    smartWalletAddress={smartWalletAddress}
                />
            )}

        </AnimatePresence>
    );
}
