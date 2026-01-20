"use client";

/**
 * Wallet Connection Status Component
 * 
 * Shows a subtle indicator when wallet is reconnecting instead of
 * a full-screen "Wallet not connected" message. Better UX for PWA users.
 * 
 * NOTE: This is only for traditional wallet connections (MetaMask, WalletConnect).
 * Passkey, email, and other auth methods don't need wallet reconnection.
 */

import { usePWAWalletPersistence } from "@/hooks/usePWAWalletPersistence";
import { useEffect, useState } from "react";

interface WalletConnectionStatusProps {
    /** If true, user is authenticated via passkey (not wallet) - don't show reconnection banner */
    isPasskeyUser?: boolean;
    /** If true, user is authenticated via email - don't show reconnection banner */
    isEmailUser?: boolean;
    /** If true, user is authenticated via World ID - don't show reconnection banner */
    isWorldIdUser?: boolean;
    /** If true, user is authenticated via Alien ID - don't show reconnection banner */
    isAlienIdUser?: boolean;
}

/**
 * Wrapper component that only renders the status banner for wallet-connected users.
 * This prevents the usePWAWalletPersistence hook from running for non-wallet users.
 */
export function WalletConnectionStatus({ 
    isPasskeyUser, 
    isEmailUser, 
    isWorldIdUser, 
    isAlienIdUser 
}: WalletConnectionStatusProps = {}) {
    // Don't render (or run hooks) for non-wallet auth methods
    // These users don't have a wallet connection to reconnect
    const isNonWalletAuth = isPasskeyUser || isEmailUser || isWorldIdUser || isAlienIdUser;
    
    if (isNonWalletAuth) {
        return null;
    }
    
    // Only render the actual status component for wallet users
    return <WalletConnectionStatusInner />;
}

/**
 * Inner component that actually uses the PWA wallet persistence hook.
 * Only rendered for wallet-connected users.
 */
function WalletConnectionStatusInner() {
    const { connectionState, isReconnecting, reconnectAttempts, forceReconnect } = usePWAWalletPersistence();
    const [showBanner, setShowBanner] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    // Only show banner after a delay to avoid flashing during quick reconnects
    useEffect(() => {
        let timeout: NodeJS.Timeout;
        
        if (isReconnecting && reconnectAttempts >= 2 && !dismissed) {
            timeout = setTimeout(() => {
                setShowBanner(true);
            }, 2000);
        } else if (connectionState === "connected") {
            setShowBanner(false);
            setDismissed(false);
        }

        return () => {
            if (timeout) clearTimeout(timeout);
        };
    }, [isReconnecting, reconnectAttempts, connectionState, dismissed]);

    if (!showBanner || connectionState === "connected") {
        return null;
    }

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-2 duration-300">
            <div className="bg-yellow-900/90 backdrop-blur-sm border border-yellow-700/50 rounded-lg px-4 py-3 flex items-center gap-3 shadow-lg">
                {/* Reconnecting spinner */}
                <div className="w-5 h-5 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                
                <div className="text-sm">
                    <span className="text-yellow-200">Reconnecting wallet...</span>
                    {reconnectAttempts > 2 && (
                        <span className="text-yellow-400/70 ml-1">
                            (attempt {reconnectAttempts})
                        </span>
                    )}
                </div>

                {/* Manual reconnect button after several attempts */}
                {reconnectAttempts >= 3 && (
                    <button
                        onClick={() => {
                            forceReconnect();
                            setDismissed(false);
                        }}
                        className="text-xs bg-yellow-700/50 hover:bg-yellow-700/70 text-yellow-200 px-2 py-1 rounded transition-colors"
                    >
                        Retry
                    </button>
                )}

                {/* Dismiss button */}
                <button
                    onClick={() => setDismissed(true)}
                    className="text-yellow-400/60 hover:text-yellow-400 transition-colors"
                    aria-label="Dismiss"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>
    );
}

/**
 * Hook to check if wallet action is available
 * Returns a function that checks connection and prompts reconnect if needed
 */
export function useWalletActionGuard() {
    const { isConnected, isReconnecting, forceReconnect, connectionState } = usePWAWalletPersistence();
    
    /**
     * Check if wallet is ready for an action
     * If not connected, attempts reconnect and returns false
     * If reconnecting, waits briefly and checks again
     */
    const ensureWalletReady = async (): Promise<boolean> => {
        if (isConnected) return true;
        
        if (isReconnecting) {
            // Wait for reconnection to complete
            await new Promise(resolve => setTimeout(resolve, 3000));
            return connectionState === "connected";
        }
        
        // Try to reconnect
        forceReconnect();
        
        // Wait for reconnection
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check final state
        return connectionState === "connected";
    };

    return {
        isWalletReady: isConnected,
        isReconnecting,
        ensureWalletReady,
        forceReconnect,
    };
}
