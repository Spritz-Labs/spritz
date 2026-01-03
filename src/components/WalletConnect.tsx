"use client";

import { motion } from "motion/react";
import { useAccount } from "wagmi";
import {
    useAppKit,
    useDisconnect as useAppKitDisconnect,
    useAppKitAccount,
    useAppKitNetwork,
} from "@reown/appkit/react";
import { useDisconnect as useWagmiDisconnect } from "wagmi";
import { projectId } from "@/config/wagmi";

export function WalletConnect() {
    // Wagmi for EVM
    const { address: evmAddress, chain } = useAccount();
    // AppKit for both EVM and Solana
    const { address: appKitAddress, isConnected } = useAppKitAccount();
    const { caipNetwork } = useAppKitNetwork();
    const { disconnect: appKitDisconnect } = useAppKitDisconnect();
    const { disconnect: wagmiDisconnect } = useWagmiDisconnect();
    const { open } = useAppKit();

    // Disconnect handler that works for both EVM and Solana
    const handleDisconnect = async () => {
        console.log("[WalletConnect] Disconnecting...");
        try {
            // Try AppKit disconnect first (works for Solana)
            console.log("[WalletConnect] Calling appKitDisconnect");
            await appKitDisconnect();
            console.log("[WalletConnect] appKitDisconnect completed");
        } catch (e) {
            console.log("[WalletConnect] AppKit disconnect error:", e);
        }
        try {
            // Also try wagmi disconnect (for EVM)
            console.log("[WalletConnect] Calling wagmiDisconnect");
            wagmiDisconnect();
            console.log("[WalletConnect] wagmiDisconnect completed");
        } catch (e) {
            console.log("[WalletConnect] Wagmi disconnect error:", e);
        }
        // Force reload as fallback
        console.log("[WalletConnect] Clearing localStorage and reloading...");
        localStorage.removeItem("@appkit/connected_connector");
        localStorage.removeItem("@appkit/wallet_id");
        window.location.reload();
    };

    // Use AppKit address (works for both EVM and Solana)
    const address = appKitAddress || evmAddress;
    // Get network name from AppKit or wagmi
    const networkName = caipNetwork?.name || chain?.name || "Unknown Network";

    const formatAddress = (addr: string) => {
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    if (!projectId) {
        return (
            <div className="w-full opacity-50">
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                            <svg
                                className="w-5 h-5 text-zinc-500"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                />
                            </svg>
                        </div>
                        <div>
                            <p className="text-zinc-400 font-semibold">
                                WalletConnect
                            </p>
                            <p className="text-zinc-600 text-sm">
                                Not configured
                            </p>
                        </div>
                    </div>
                    <p className="text-zinc-600 text-xs">
                        Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID to enable
                    </p>
                </div>
            </div>
        );
    }

    if (isConnected && address) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full"
            >
                <div className="bg-gradient-to-br from-[#FF5500]/10 to-[#FB8D22]/10 border border-[#FF5500]/30 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FB8D22] to-[#FF5500] flex items-center justify-center">
                            <svg
                                className="w-5 h-5 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 13l4 4L19 7"
                                />
                            </svg>
                        </div>
                        <div>
                            <p className="text-[#FF5500] font-semibold">
                                Wallet Connected
                            </p>
                            <p className="text-zinc-400 text-sm">
                                {networkName}
                            </p>
                        </div>
                    </div>

                    <div className="bg-black/30 rounded-xl p-4 mb-4">
                        <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">
                            Address
                        </p>
                        <p className="text-white font-mono text-sm">
                            {formatAddress(address)}
                        </p>
                    </div>

                    <button
                        onClick={handleDisconnect}
                        className="w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors text-sm font-medium"
                    >
                        Disconnect Wallet
                    </button>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="w-full"
        >
            <button
                onClick={() => open()}
                className="w-full group py-4 px-6 rounded-xl bg-zinc-900/70 border border-zinc-800 hover:border-[#FF5500]/50 text-white font-semibold transition-all hover:bg-zinc-900 hover:shadow-xl hover:shadow-[#FF5500]/10"
            >
                <span className="flex items-center justify-center gap-3">
                    <svg
                        className="w-5 h-5 text-[#FF5500]"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path d="M6.52 16.066c-1.015 0-1.911-.386-2.62-1.126-.71-.74-1.089-1.684-1.089-2.746 0-1.062.379-2.006 1.088-2.746.71-.74 1.606-1.126 2.621-1.126h10.96c1.015 0 1.911.386 2.62 1.126.71.74 1.089 1.684 1.089 2.746 0 1.062-.379 2.006-1.088 2.746-.71.74-1.606 1.126-2.621 1.126H6.52zm0-1.5h10.96c.596 0 1.11-.22 1.498-.639.388-.42.602-.978.602-1.633 0-.655-.214-1.214-.602-1.633-.388-.42-.902-.639-1.498-.639H6.52c-.596 0-1.11.22-1.498.639-.388.42-.602.978-.602 1.633 0 .655.214 1.214.602 1.633.388.42.902.639 1.498.639z" />
                    </svg>
                    <span>Connect Wallet</span>
                </span>
            </button>
            <p className="text-center text-zinc-500 text-xs mt-3">
                MetaMask, Coinbase, Phantom, Solflare & more
            </p>
        </motion.div>
    );
}






