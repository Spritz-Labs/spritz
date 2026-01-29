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
 * 
 * NOTE: We no longer show any UI here. Wallet reconnection happens silently
 * in the background via usePWAWalletPersistence. The popup was annoying
 * because PWA wallet reconnection rarely succeeds anyway.
 */
function WalletConnectionStatusInner() {
    // Still run the hook to attempt background reconnection,
    // but don't render any UI - let it happen silently
    usePWAWalletPersistence();
    
    return null;
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
