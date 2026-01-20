"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useVaults, type VaultListItem, type VaultDetails } from "@/hooks/useVaults";
import { useVaultExecution } from "@/hooks/useVaultExecution";
import { getChainById } from "@/config/chains";
import { QRCodeSVG } from "qrcode.react";
import { useEnsResolver } from "@/hooks/useEnsResolver";
import { useWalletClient, usePublicClient, useAccount, useSignMessage, useSignTypedData } from "wagmi";
import { deployMultiSigSafeWithEOA, deployVaultViaSponsoredGas } from "@/lib/safeWallet";
import type { VaultBalanceResponse, VaultTokenBalance } from "@/app/api/vault/[id]/balances/route";
import type { Address, Hex } from "viem";

type VaultListProps = {
    userAddress: string;
    onCreateNew: () => void;
};

// Transaction types for activity tab
type VaultTransaction = {
    hash: string;
    from: string;
    to: string;
    value: string;
    timestamp: string;
    type: "incoming" | "outgoing";
    status: "confirmed" | "pending" | "failed";
    tokenSymbol?: string;
    tokenDecimals?: number;
    tokenName?: string;
};

// Pending transaction type (from database)
type PendingTransaction = {
    id: string;
    vault_id: string;
    safe_tx_hash: string;
    to_address: string;
    value: string;
    data: string;
    nonce: number;
    status: "pending" | "executed" | "cancelled";
    description: string;
    token_symbol?: string;
    token_address?: string;
    created_by: string;
    created_at: string;
    confirmations: {
        id: string;
        signer_address: string;
        signature?: string;
        signed_at: string;
    }[];
};

// Common emojis for vaults
const VAULT_EMOJIS = ["🔐", "💰", "🏦", "💎", "🚀", "🌟", "🎯", "🔒", "💼", "🏠", "🎮", "🌈"];

// Tab types for vault detail view
type VaultTab = "assets" | "send" | "receive" | "activity";

export function VaultList({ userAddress, onCreateNew }: VaultListProps) {
    const { vaults, isLoading, getVault, updateVault, deleteVault, getDeploymentInfo, confirmDeployment, fetchVaults } = useVaults(userAddress);
    const vaultExecution = useVaultExecution();
    const [selectedVault, setSelectedVault] = useState<VaultDetails | null>(null);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [activeTab, setActiveTab] = useState<VaultTab>("assets");
    const [isDeploying, setIsDeploying] = useState(false);
    const [deployError, setDeployError] = useState<string | null>(null);
    
    // Balance state
    const [balances, setBalances] = useState<VaultBalanceResponse | null>(null);
    const [isLoadingBalances, setIsLoadingBalances] = useState(false);
    
    // Edit state
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editEmoji, setEditEmoji] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    
    // Send state
    const ensResolver = useEnsResolver();
    const [sendAmount, setSendAmount] = useState("");
    const [sendToken, setSendToken] = useState<VaultTokenBalance | null>(null);
    const [isSending, setIsSending] = useState(false);
    const [showTokenSelector, setShowTokenSelector] = useState(false);
    
    // Activity state
    const [transactions, setTransactions] = useState<VaultTransaction[]>([]);
    const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
    
    // Pending transactions state
    const [pendingTxs, setPendingTxs] = useState<PendingTransaction[]>([]);
    const [isLoadingPendingTxs, setIsLoadingPendingTxs] = useState(false);
    const [isProposing, setIsProposing] = useState(false);
    const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
    
    // Deployment toggle: default to Smart Wallet (sponsored), toggle for EOA
    const [useEOAForDeploy, setUseEOAForDeploy] = useState(false);

    // Wallet clients for deployment
    const { data: walletClient } = useWalletClient();
    const publicClient = usePublicClient();
    const { address: connectedAddress, isConnected } = useAccount();
    
    // Signing functions for sponsored deployment
    const { signMessageAsync } = useSignMessage();
    const { signTypedDataAsync } = useSignTypedData();

    // Get gas cost estimate based on chain
    const getDeployGasCost = (chainId: number): { cost: string; isHigh: boolean; isSponsored: boolean } => {
        // Mainnet is expensive and not sponsored
        if (chainId === 1) {
            return { cost: "$50-200+", isHigh: true, isSponsored: false };
        }
        // L2s have free sponsored gas via paymaster
        return { cost: "Free (Sponsored)", isHigh: false, isSponsored: true };
    };

    // Deploy vault's Safe contract
    // Default: Use Smart Wallet with sponsored gas (L2s)
    // Toggle: Use EOA directly (pays gas from wallet)
    const handleDeployVault = useCallback(async (vaultId: string) => {
        if (!selectedVault) {
            setDeployError("No vault selected");
            return;
        }

        setIsDeploying(true);
        setDeployError(null);

        try {
            // Get deployment info
            const deployInfo = await getDeploymentInfo(vaultId);
            
            if (deployInfo.isDeployed) {
                // Already deployed, just refresh
                const updatedVault = await getVault(vaultId);
                if (updatedVault) {
                    setSelectedVault(updatedVault);
                }
                await fetchVaults();
                setIsDeploying(false);
                return;
            }

            const gasCost = getDeployGasCost(deployInfo.chainId);
            console.log("[VaultList] Deploying vault Safe:", deployInfo);
            console.log("[VaultList] Chain:", deployInfo.chainId, "Owners:", deployInfo.owners.length);
            console.log("[VaultList] saltNonce from API:", deployInfo.saltNonce, "as BigInt:", BigInt(deployInfo.saltNonce || "0").toString());
            console.log("[VaultList] saltNonce hex:", "0x" + BigInt(deployInfo.saltNonce || "0").toString(16));
            console.log("[VaultList] Stored safe address:", deployInfo.safeAddress);
            console.log("[VaultList] Sorted owners:", [...(deployInfo.owners as string[])].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
            console.log("[VaultList] Using EOA:", useEOAForDeploy, "Sponsored:", gasCost.isSponsored);

            // Double-check on-chain status before deploying (in case previous attempt succeeded)
            // This prevents "Create2 call failed" errors when Safe already exists
            if (deployInfo.isDeployed) {
                console.log("[VaultList] Safe already deployed on-chain, updating database...");
                await confirmDeployment(vaultId, "");
                const updatedVault = await getVault(vaultId);
                if (updatedVault) {
                    setSelectedVault(updatedVault);
                }
                await fetchVaults();
                setIsDeploying(false);
                return;
            }

            let txHash: Hex;
            let safeAddress: Address;

            // On Mainnet (no sponsorship) or if EOA toggle is enabled, use EOA
            // Otherwise, use Smart Wallet with sponsored gas
            if (useEOAForDeploy || !gasCost.isSponsored) {
                // EOA deployment - connected wallet pays gas directly
                if (!walletClient) {
                    setDeployError("Please connect your wallet to deploy");
                    setIsDeploying(false);
                    return;
                }

                console.log("[VaultList] Deploying via EOA (wallet pays gas)");
                const result = await deployMultiSigSafeWithEOA(
                    deployInfo.owners as Address[],
                    deployInfo.threshold,
                    deployInfo.chainId,
                    walletClient as {
                        account: { address: Address };
                        writeContract: (args: unknown) => Promise<Hex>;
                    },
                    BigInt(deployInfo.saltNonce || "0")
                );
                txHash = result.txHash;
                safeAddress = result.safeAddress;
            } else {
                // Smart Wallet deployment - sponsored gas via paymaster
                if (!connectedAddress) {
                    setDeployError("Please connect your wallet to deploy");
                    setIsDeploying(false);
                    return;
                }

                console.log("[VaultList] Deploying via Smart Wallet (sponsored gas)");
                
                try {
                    const result = await deployVaultViaSponsoredGas(
                        deployInfo.owners as Address[],
                        deployInfo.threshold,
                        deployInfo.chainId,
                        connectedAddress as Address,
                        async (message: string) => {
                            return await signMessageAsync({ message }) as Hex;
                        },
                        async (data: unknown) => {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            return await signTypedDataAsync(data as any) as Hex;
                        },
                        BigInt(deployInfo.saltNonce || "0")
                    );
                    txHash = result.txHash;
                    safeAddress = result.safeAddress;
                } catch (sponsoredError: unknown) {
                    const errorMsg = sponsoredError instanceof Error ? sponsoredError.message : String(sponsoredError);
                    
                    // If bundler simulation fails with Create2 error, try EOA as fallback
                    if (errorMsg.includes("Create2 call failed") || errorMsg.includes("simulation")) {
                        console.log("[VaultList] Bundler simulation failed, falling back to EOA deployment...");
                        
                        if (!walletClient) {
                            throw new Error("Bundler unavailable and wallet not connected for fallback");
                        }
                        
                        const eoaResult = await deployMultiSigSafeWithEOA(
                            deployInfo.owners as Address[],
                            deployInfo.threshold,
                            deployInfo.chainId,
                            walletClient as {
                                account: { address: Address };
                                writeContract: (args: unknown) => Promise<Hex>;
                            },
                            BigInt(deployInfo.saltNonce || "0")
                        );
                        txHash = eoaResult.txHash;
                        safeAddress = eoaResult.safeAddress;
                        console.log("[VaultList] EOA fallback deployment submitted:", txHash);
                    } else {
                        // Re-throw other errors
                        throw sponsoredError;
                    }
                }
            }

            console.log("[VaultList] Safe deployment tx:", txHash, "Safe:", safeAddress);

            // Wait for transaction confirmation
            if (publicClient) {
                console.log("[VaultList] Waiting for transaction confirmation...");
                await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });
                console.log("[VaultList] Transaction confirmed, verifying on-chain deployment...");
            }

            // Poll for on-chain deployment with retries (bundler transactions can have slight delays)
            let deployed = false;
            let retries = 0;
            const maxRetries = 15;
            const retryDelay = 3000; // 3 seconds

            console.log("[VaultList] Polling for on-chain deployment confirmation...");

            while (!deployed && retries < maxRetries) {
                // Small delay before checking
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retries++;
                
                try {
                    // Use the deploy API to check and update status
                    await confirmDeployment(vaultId, txHash);
                    deployed = true;
                    console.log("[VaultList] Vault deployment confirmed!");
                } catch (confirmError: unknown) {
                    // Check if it's a "pending" response (202) vs actual error
                    const errorMessage = confirmError instanceof Error ? confirmError.message : "";
                    if (errorMessage.includes("pending") || errorMessage.includes("not yet deployed")) {
                        console.log(`[VaultList] Deployment check attempt ${retries}/${maxRetries} - still pending...`);
                    } else {
                        console.error(`[VaultList] Deployment check error:`, confirmError);
                    }
                    
                    if (retries >= maxRetries) {
                        throw new Error("Deployment verification timed out. The transaction was sent - please refresh to check status.");
                    }
                }
            }

            // Refresh vault details
            const updatedVault = await getVault(vaultId);
            if (updatedVault) {
                setSelectedVault(updatedVault);
            }
            
            console.log("[VaultList] Vault deployed successfully!");
        } catch (err) {
            console.error("[VaultList] Deploy error:", err);
            const errorMsg = err instanceof Error ? err.message : "Failed to deploy vault";
            
            // "Create2 call failed" means the Safe already exists at that address!
            // This happens when a previous deployment succeeded but DB wasn't updated
            if (errorMsg.includes("Create2 call failed") || errorMsg.includes("437265617465322063616c6c206661696c6564")) {
                console.log("[VaultList] Create2 failed = Safe already exists! Marking as deployed with force=true...");
                try {
                    // Mark as deployed in the database, force=true bypasses on-chain check
                    // because Create2 failure IS proof that the contract exists
                    await confirmDeployment(vaultId, "", true);
                    const updatedVault = await getVault(vaultId);
                    if (updatedVault) {
                        setSelectedVault(updatedVault);
                    }
                    await fetchVaults();
                    setDeployError(null); // Clear error since we fixed it
                    console.log("[VaultList] Vault marked as deployed successfully!");
                } catch (syncErr) {
                    console.error("[VaultList] Failed to mark vault as deployed:", syncErr);
                    setDeployError("Safe is deployed but failed to update database. Try the Sync button.");
                }
            } else if (errorMsg.includes("User rejected") || errorMsg.includes("User denied")) {
                setDeployError("Transaction cancelled");
            } else {
                setDeployError(errorMsg);
            }
        } finally {
            setIsDeploying(false);
        }
    }, [walletClient, publicClient, selectedVault, getDeploymentInfo, confirmDeployment, getVault, fetchVaults, useEOAForDeploy, connectedAddress, signMessageAsync, signTypedDataAsync]);

    // Sync deployment status - checks on-chain state and updates DB if needed
    const [isSyncing, setIsSyncing] = useState(false);
    const handleSyncStatus = useCallback(async (vaultId: string) => {
        if (!selectedVault) return;
        
        setIsSyncing(true);
        try {
            console.log("[VaultList] Syncing deployment status for vault:", vaultId);
            
            // Call getDeploymentInfo which checks on-chain and auto-updates DB
            const deployInfo = await getDeploymentInfo(vaultId);
            console.log("[VaultList] Deploy info:", deployInfo);
            
            if (deployInfo.isDeployed && !selectedVault.isDeployed) {
                // Status changed - update DB and refresh
                console.log("[VaultList] Safe is deployed on-chain! Updating database...");
                await confirmDeployment(vaultId, "");
                
                // Refresh vault details
                const updatedVault = await getVault(vaultId);
                if (updatedVault) {
                    setSelectedVault(updatedVault);
                }
                await fetchVaults();
            } else if (deployInfo.isDeployed) {
                // Just refresh to get latest state
                const updatedVault = await getVault(vaultId);
                if (updatedVault) {
                    setSelectedVault(updatedVault);
                }
            } else {
                console.log("[VaultList] Safe is not deployed on-chain yet");
            }
        } catch (err) {
            console.error("[VaultList] Sync error:", err);
        } finally {
            setIsSyncing(false);
        }
    }, [selectedVault, getDeploymentInfo, confirmDeployment, getVault, fetchVaults]);

    // Fetch balances when vault is selected
    const fetchBalances = useCallback(async (vaultId: string) => {
        console.log("[VaultList] Fetching balances for vault:", vaultId);
        setIsLoadingBalances(true);
        try {
            const response = await fetch(`/api/vault/${vaultId}/balances`, {
                credentials: "include",
            });
            console.log("[VaultList] Balance response status:", response.status);
            if (response.ok) {
                const data = await response.json();
                console.log("[VaultList] Balance data received:", JSON.stringify(data, null, 2));
                console.log("[VaultList] Tokens count:", data.tokens?.length || 0);
                console.log("[VaultList] Native balance:", data.nativeBalance);
                console.log("[VaultList] Total USD:", data.totalUsd);
                setBalances(data);
            } else {
                const errorText = await response.text();
                console.error("[VaultList] Balance fetch failed:", response.status, errorText);
            }
        } catch (err) {
            console.error("[VaultList] Error fetching balances:", err);
        } finally {
            setIsLoadingBalances(false);
        }
    }, []);

    // Fetch transaction history from Blockscout
    const fetchTransactions = useCallback(async (safeAddress: string, chainId: number) => {
        console.log("[VaultList] Fetching transactions for:", safeAddress, "chain:", chainId);
        setIsLoadingTransactions(true);
        try {
            const blockscoutUrls: Record<number, string> = {
                1: "https://eth.blockscout.com",
                8453: "https://base.blockscout.com",
                42161: "https://arbitrum.blockscout.com",
                10: "https://optimism.blockscout.com",
                137: "https://polygon.blockscout.com",
            };
            
            const blockscoutUrl = blockscoutUrls[chainId];
            if (!blockscoutUrl) {
                console.log("[VaultList] No blockscout URL for chain:", chainId);
                return;
            }
            
            // Fetch both regular transactions and token transfers
            const [txResponse, tokenResponse] = await Promise.all([
                fetch(`${blockscoutUrl}/api/v2/addresses/${safeAddress}/transactions?filter=to%20%7C%20from`, {
                    headers: { Accept: "application/json" },
                }),
                fetch(`${blockscoutUrl}/api/v2/addresses/${safeAddress}/token-transfers?type=ERC-20`, {
                    headers: { Accept: "application/json" },
                }),
            ]);
            
            const allTransactions: VaultTransaction[] = [];
            const safeAddrLower = safeAddress.toLowerCase();
            
            // Process regular transactions (ETH transfers)
            if (txResponse.ok) {
                const txData = await txResponse.json();
                console.log("[VaultList] Regular transactions:", txData.items?.length || 0);
                for (const tx of txData.items || []) {
                    // Only include if there was actual value transfer
                    if (tx.value && tx.value !== "0") {
                        allTransactions.push({
                            hash: tx.hash,
                            from: tx.from?.hash || "",
                            to: tx.to?.hash || "",
                            value: tx.value,
                            timestamp: tx.timestamp,
                            type: tx.to?.hash?.toLowerCase() === safeAddrLower ? "incoming" : "outgoing",
                            status: tx.status === "ok" ? "confirmed" : tx.status === "error" ? "failed" : "pending",
                        });
                    }
                }
            }
            
            // Process token transfers
            if (tokenResponse.ok) {
                const tokenData = await tokenResponse.json();
                console.log("[VaultList] Token transfers:", tokenData.items?.length || 0);
                for (const transfer of tokenData.items || []) {
                    allTransactions.push({
                        hash: transfer.tx_hash,
                        from: transfer.from?.hash || "",
                        to: transfer.to?.hash || "",
                        value: transfer.total?.value || "0",
                        timestamp: transfer.timestamp,
                        type: transfer.to?.hash?.toLowerCase() === safeAddrLower ? "incoming" : "outgoing",
                        status: "confirmed",
                        tokenSymbol: transfer.token?.symbol,
                        tokenDecimals: parseInt(transfer.token?.decimals || "18"),
                        tokenName: transfer.token?.name,
                    });
                }
            }
            
            // Sort by timestamp descending
            allTransactions.sort((a, b) => 
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
            
            console.log("[VaultList] Total transactions:", allTransactions.length);
            setTransactions(allTransactions.slice(0, 20)); // Limit to 20 most recent
        } catch (err) {
            console.error("[VaultList] Error fetching transactions:", err);
        } finally {
            setIsLoadingTransactions(false);
        }
    }, []);

    const handleViewVault = async (vault: VaultListItem) => {
        setIsLoadingDetails(true);
        setActiveTab("assets");
        setBalances(null);
        setTransactions([]);
        setPendingTxs([]);
        const details = await getVault(vault.id);
        setSelectedVault(details);
        setIsLoadingDetails(false);
        
        // Fetch balances, transactions, and pending txs after getting vault details
        if (details) {
            fetchBalances(details.id);
            fetchTransactions(details.safeAddress, details.chainId);
            fetchPendingTxs(details.id);
        }
    };

    const handleDelete = async (vaultId: string) => {
        if (!confirm("Are you sure you want to delete this vault?")) return;
        
        setIsDeleting(vaultId);
        try {
            await deleteVault(vaultId);
            if (selectedVault?.id === vaultId) {
                setSelectedVault(null);
            }
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to delete vault");
        } finally {
            setIsDeleting(null);
        }
    };

    const copyAddress = async (address: string) => {
        await navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const truncateAddress = (addr: string) => 
        `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    const getTimeAgo = (date: Date): string => {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return "Just now";
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    // Fetch pending transactions from database
    const fetchPendingTxs = useCallback(async (vaultId: string) => {
        setIsLoadingPendingTxs(true);
        try {
            const response = await fetch(`/api/vault/${vaultId}/transactions`, {
                credentials: "include",
            });
            if (response.ok) {
                const data = await response.json();
                setPendingTxs(data.transactions?.filter((tx: PendingTransaction) => tx.status === "pending") || []);
            }
        } catch (err) {
            console.error("[VaultList] Error fetching pending txs:", err);
        } finally {
            setIsLoadingPendingTxs(false);
        }
    }, []);

    // Sign a pending transaction with actual wallet signature
    const handleSignTransaction = async (tx: PendingTransaction) => {
        if (!selectedVault) return;
        
        try {
            // Get the transaction details for signing
            const signResult = await vaultExecution.signTransaction({
                safeAddress: selectedVault.safeAddress as Address,
                chainId: selectedVault.chainId,
                to: tx.to_address as Address,
                value: tx.value || "0",
                data: (tx.data || "0x") as Hex,
                nonce: tx.nonce,
            });
            
            if (!signResult.success || !signResult.signature) {
                alert(signResult.error || "Failed to sign");
                return;
            }
            
            // Store the signature in the database
            const response = await fetch(`/api/vault/${selectedVault.id}/transactions`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ 
                    transactionId: tx.id, 
                    action: "sign",
                    signature: signResult.signature,
                    signerAddress: signResult.signerAddress,
                    safeTxHash: signResult.safeTxHash,
                }),
            });
            
            const data = await response.json();
            
            if (response.ok) {
                alert(data.message || "✅ Signed successfully!");
                fetchPendingTxs(selectedVault.id);
            } else {
                alert(data.error || "Failed to store signature");
            }
        } catch (err) {
            console.error("[VaultList] Sign error:", err);
            alert("Failed to sign transaction");
        }
    };

    // Execute a transaction (when threshold is met)
    const handleExecuteTransaction = async (tx: PendingTransaction) => {
        if (!selectedVault) return;
        
        try {
            // Get signatures from the database (they should have real signatures now)
            const signatures = tx.confirmations
                .filter(c => c.signature && !c.signature.startsWith("signed_by_") && !c.signature.startsWith("auto_signed"))
                .map(c => ({
                    signerAddress: c.signer_address,
                    signature: c.signature!,
                }));
            
            console.log("[VaultList] Executing with", signatures.length, "signatures");
            
            // Execute on-chain with collected signatures
            const result = await vaultExecution.execute({
                safeAddress: selectedVault.safeAddress as Address,
                chainId: selectedVault.chainId,
                to: tx.to_address as Address,
                value: tx.value || "0",
                data: (tx.data || "0x") as Hex,
                signatures: signatures.length > 0 ? signatures : undefined,
            });
            
            if (result.success && result.txHash) {
                alert(`✅ Transaction executed!\n\nTx Hash: ${result.txHash.slice(0, 10)}...${result.txHash.slice(-8)}`);
                
                // Update the transaction status and hash in the database
                await fetch(`/api/vault/${selectedVault.id}/transactions`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ 
                        transactionId: tx.id, 
                        action: "executed",
                        txHash: result.txHash 
                    }),
                });
                
                fetchPendingTxs(selectedVault.id);
                fetchBalances(selectedVault.id);
                fetchTransactions(selectedVault.safeAddress, selectedVault.chainId);
            } else if (result.needsMoreSignatures) {
                alert(`Need ${result.threshold} signatures to execute.\n\nAsk other vault members to sign first.`);
            } else if (result.error) {
                // Execution failed - show error and option to use Safe app
                const safeAppUrl = `https://app.safe.global/transactions/queue?safe=${
                    selectedVault.chainId === 1 ? "eth" : 
                    selectedVault.chainId === 8453 ? "base" :
                    selectedVault.chainId === 42161 ? "arb1" :
                    selectedVault.chainId === 10 ? "oeth" :
                    selectedVault.chainId === 137 ? "matic" : "eth"
                }:${selectedVault.safeAddress}`;
                
                if (confirm(`${result.error}\n\nWould you like to try via the Safe app?`)) {
                    window.open(safeAppUrl, "_blank");
                }
            }
        } catch (err) {
            console.error("[VaultList] Execute error:", err);
            alert("Failed to execute transaction");
        }
    };

    // Cancel a pending transaction
    const cancelTransaction = async (transactionId: string) => {
        if (!selectedVault) return;
        if (!confirm("Are you sure you want to cancel this transaction?")) return;
        
        try {
            const response = await fetch(`/api/vault/${selectedVault.id}/transactions`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ transactionId, action: "cancel" }),
            });
            
            const data = await response.json();
            
            if (response.ok) {
                alert(data.message);
                fetchPendingTxs(selectedVault.id);
            } else {
                alert(data.error || "Failed to cancel");
            }
        } catch (err) {
            console.error("[VaultList] Cancel error:", err);
            alert("Failed to cancel transaction");
        }
    };

    // Propose a new transaction
    const proposeTransaction = async () => {
        if (!selectedVault || !sendToken || !sendAmount || !ensResolver.resolvedAddress) {
            alert("Please fill in all fields");
            return;
        }

        setIsProposing(true);
        try {
            const response = await fetch(`/api/vault/${selectedVault.id}/transactions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    toAddress: ensResolver.resolvedAddress,
                    amount: sendAmount,
                    tokenAddress: sendToken.contractAddress === "native" ? null : sendToken.contractAddress,
                    tokenDecimals: sendToken.decimals,
                    tokenSymbol: sendToken.symbol,
                    description: `Send ${sendAmount} ${sendToken.symbol} to ${ensResolver.input}`,
                }),
            });

            const data = await response.json();
            
            if (response.ok) {
                alert(data.message || "Transaction proposed!");
                // Reset form
                setSendAmount("");
                setSendToken(null);
                ensResolver.clear();
                // Refresh pending txs and switch to activity tab
                fetchPendingTxs(selectedVault.id);
                setActiveTab("activity");
            } else {
                alert(data.error || "Failed to propose transaction");
            }
        } catch (err) {
            console.error("[VaultList] Propose error:", err);
            alert("Failed to propose transaction");
        } finally {
            setIsProposing(false);
        }
    };

    // Check if current user is the creator
    const isCreator = selectedVault?.creatorAddress.toLowerCase() === userAddress.toLowerCase();

    const startEditing = () => {
        if (!selectedVault) return;
        setEditName(selectedVault.name);
        setEditDescription(selectedVault.description || "");
        setEditEmoji(selectedVault.emoji);
        setIsEditing(true);
        setShowEmojiPicker(false);
    };

    const cancelEditing = () => {
        setIsEditing(false);
        setShowEmojiPicker(false);
    };

    const saveEdits = async () => {
        if (!selectedVault || !editName.trim()) return;
        
        setIsSaving(true);
        try {
            await updateVault(selectedVault.id, {
                name: editName.trim(),
                description: editDescription.trim() || undefined,
                emoji: editEmoji,
            });
            
            // Refresh vault details
            const updated = await getVault(selectedVault.id);
            if (updated) {
                setSelectedVault(updated);
            }
            setIsEditing(false);
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to update vault");
        } finally {
            setIsSaving(false);
        }
    };

    // Format currency
    const formatUsd = (value: number | null) => {
        if (value === null) return "—";
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value);
    };

    // Format token balance
    const formatBalance = (balance: string, decimals = 4) => {
        const num = parseFloat(balance);
        if (num === 0) return "0";
        if (num < 0.0001) return "<0.0001";
        return num.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: decimals,
        });
    };

    // Get all tokens for send
    const getAllTokens = (): VaultTokenBalance[] => {
        if (!balances) return [];
        const tokens: VaultTokenBalance[] = [];
        if (balances.nativeBalance) {
            tokens.push(balances.nativeBalance);
        }
        tokens.push(...balances.tokens);
        return tokens;
    };

    // Handle send (placeholder for now)
    const handleSendTransaction = async () => {
        if (!selectedVault || !ensResolver.resolvedAddress || !sendAmount || !sendToken) return;
        
        setIsSending(true);
        try {
            // For now, just show a message - actual transaction creation will come later
            const displayTo = ensResolver.ensName 
                ? `${ensResolver.ensName} (${ensResolver.resolvedAddress})`
                : ensResolver.resolvedAddress;
            alert(`Transaction proposal feature coming soon!\n\nTo: ${displayTo}\nAmount: ${sendAmount} ${sendToken.symbol}\n\nThis will require ${selectedVault.threshold} of ${selectedVault.members.length} signatures.`);
            ensResolver.clear();
            setSendAmount("");
            setSendToken(null);
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to create transaction");
        } finally {
            setIsSending(false);
        }
    };

    // Details view
    if (selectedVault) {
        const chainInfo = getChainById(selectedVault.chainId);
        
        return (
            <div className="space-y-4">
                {/* Back button */}
                <button
                    onClick={() => {
                        setIsEditing(false);
                        setShowEmojiPicker(false);
                        setSelectedVault(null);
                        setBalances(null);
                        setActiveTab("assets");
                        ensResolver.clear();
                        setSendAmount("");
                        setSendToken(null);
                    }}
                    className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Vaults
                </button>

                {/* Vault header */}
                <div className="p-4 bg-zinc-800/50 rounded-xl">
                    {isEditing ? (
                        // Edit mode
                        <div className="space-y-3">
                            {/* Emoji picker */}
                            <div>
                                <label className="block text-xs text-zinc-400 mb-1">Emoji</label>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                        className="w-14 h-14 text-3xl bg-zinc-900 rounded-xl hover:bg-zinc-900/70 transition-colors flex items-center justify-center"
                                    >
                                        {editEmoji}
                                    </button>
                                    <AnimatePresence>
                                        {showEmojiPicker && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                className="absolute top-full left-0 mt-2 p-2 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-10 grid grid-cols-6 gap-1"
                                            >
                                                {VAULT_EMOJIS.map((emoji) => (
                                                    <button
                                                        key={emoji}
                                                        type="button"
                                                        onClick={() => {
                                                            setEditEmoji(emoji);
                                                            setShowEmojiPicker(false);
                                                        }}
                                                        className={`w-10 h-10 text-xl rounded-lg hover:bg-zinc-700 transition-colors ${
                                                            editEmoji === emoji ? "bg-orange-500/20 ring-2 ring-orange-500" : ""
                                                        }`}
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>
                            
                            {/* Name input */}
                            <div>
                                <label className="block text-xs text-zinc-400 mb-1">Name</label>
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    placeholder="Vault name"
                                    maxLength={50}
                                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
                                />
                            </div>
                            
                            {/* Description input */}
                            <div>
                                <label className="block text-xs text-zinc-400 mb-1">Description (optional)</label>
                                <input
                                    type="text"
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    placeholder="What's this vault for?"
                                    maxLength={200}
                                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
                                />
                            </div>
                            
                            {/* Action buttons */}
                            <div className="flex items-center gap-2 pt-2">
                                <button
                                    onClick={cancelEditing}
                                    disabled={isSaving}
                                    className="flex-1 px-3 py-2 bg-zinc-700 text-white text-sm font-medium rounded-lg hover:bg-zinc-600 transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={saveEdits}
                                    disabled={isSaving || !editName.trim()}
                                    className="flex-1 px-3 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isSaving ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        "Save Changes"
                                    )}
                                </button>
                            </div>
                        </div>
                    ) : (
                        // View mode
                        <div className="flex items-center gap-3">
                            <span className="text-3xl">{selectedVault.emoji}</span>
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold text-white">{selectedVault.name}</h3>
                                {selectedVault.description && (
                                    <p className="text-sm text-zinc-400">{selectedVault.description}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {isCreator && (
                                    <button
                                        onClick={startEditing}
                                        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors"
                                        title="Edit vault"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                    </button>
                                )}
                                <div className="flex items-center gap-1">
                                    <span className="text-lg">{chainInfo?.icon}</span>
                                    <span className="text-sm text-zinc-400">{chainInfo?.name}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Total Balance */}
                <div className="p-4 bg-gradient-to-br from-orange-500/10 to-pink-500/10 border border-orange-500/20 rounded-xl">
                    <p className="text-xs text-zinc-400 mb-1">Total Balance</p>
                    {isLoadingBalances ? (
                        <div className="h-8 w-32 bg-zinc-700/50 rounded animate-pulse" />
                    ) : (
                        <p className="text-2xl font-bold text-white">
                            {formatUsd(balances?.totalUsd ?? 0)}
                        </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                            selectedVault.isDeployed
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-yellow-500/20 text-yellow-400"
                        }`}>
                            {selectedVault.isDeployed ? "Deployed" : "Not Deployed"}
                        </span>
                        {!selectedVault.isDeployed && (
                            <button
                                onClick={() => handleSyncStatus(selectedVault.id)}
                                disabled={isSyncing}
                                className="text-xs px-2 py-0.5 rounded-full bg-zinc-700/50 text-zinc-400 hover:bg-zinc-600/50 hover:text-white transition-colors disabled:opacity-50"
                                title="Check on-chain deployment status"
                            >
                                {isSyncing ? "Syncing..." : "🔄 Sync"}
                            </button>
                        )}
                        <span className="text-xs text-zinc-500">
                            {selectedVault.threshold}/{selectedVault.members.length} signatures required
                        </span>
                    </div>
                </div>

                {/* Deploy Vault Banner - Show if not deployed */}
                {!selectedVault.isDeployed && (() => {
                    const gasCost = getDeployGasCost(selectedVault.chainId);
                    const chainInfo = getChainById(selectedVault.chainId);
                    const isSponsored = gasCost.isSponsored && !useEOAForDeploy;
                    
                    return (
                        <div className={`p-4 rounded-xl border ${gasCost.isHigh ? 'bg-amber-500/10 border-amber-500/30' : isSponsored ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}`}>
                            <div className="flex items-start gap-3">
                                <span className="text-2xl">{gasCost.isHigh ? '⚠️' : isSponsored ? '✨' : '🔧'}</span>
                                <div className="flex-1">
                                    <h4 className={`font-medium mb-1 ${gasCost.isHigh ? 'text-amber-400' : isSponsored ? 'text-emerald-400' : 'text-yellow-400'}`}>
                                        Vault Not Yet Deployed
                                    </h4>
                                    <p className="text-sm text-zinc-400 mb-2">
                                        Deploy the vault&apos;s smart contract on <span className="text-white font-medium">{chainInfo?.name || 'the network'}</span> to enable transactions.
                                    </p>
                                    
                                    {/* Gas Cost Info */}
                                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg mb-3 ${
                                        gasCost.isHigh ? 'bg-amber-500/20' : isSponsored ? 'bg-emerald-500/20' : 'bg-zinc-800'
                                    }`}>
                                        <span className="text-xs text-zinc-400">Gas fee:</span>
                                        <span className={`text-sm font-bold ${
                                            gasCost.isHigh ? 'text-amber-400' : isSponsored ? 'text-emerald-400' : 'text-yellow-400'
                                        }`}>
                                            {isSponsored ? 'Free (Sponsored)' : useEOAForDeploy ? '~$0.50-2' : gasCost.cost}
                                        </span>
                                    </div>
                                    
                                    {gasCost.isHigh && (
                                        <p className="text-xs text-amber-300/70 mb-3">
                                            💡 Consider creating vaults on Layer 2 networks (Base, Arbitrum) for free sponsored deployments.
                                        </p>
                                    )}
                                    
                                    {deployError && (
                                        <p className="text-sm text-red-400 mb-2">{deployError}</p>
                                    )}
                                    
                                    <div className="flex items-center gap-3 mb-3">
                                        <button
                                            onClick={() => handleDeployVault(selectedVault.id)}
                                            disabled={isDeploying || !isConnected}
                                            className={`px-4 py-2 font-medium rounded-lg transition-colors flex items-center gap-2 ${
                                                gasCost.isHigh 
                                                    ? 'bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-600 text-black' 
                                                    : isSponsored 
                                                        ? 'bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-600 text-black'
                                                        : 'bg-yellow-500 hover:bg-yellow-400 disabled:bg-zinc-600 text-black'
                                            }`}
                                        >
                                            {isDeploying ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                                    Deploying...
                                                </>
                                            ) : (
                                                <>
                                                    🚀 Deploy Vault
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    
                                    {/* EOA Toggle - Only show on L2s where sponsorship is available */}
                                    {gasCost.isSponsored && (
                                        <button
                                            onClick={() => setUseEOAForDeploy(!useEOAForDeploy)}
                                            className="text-xs text-zinc-400 hover:text-zinc-300 flex items-center gap-1.5 mb-2"
                                        >
                                            <span className="text-sm">{useEOAForDeploy ? '☑' : '☐'}</span>
                                            <span>Pay from connected wallet instead</span>
                                        </button>
                                    )}
                                    
                                    {!isConnected && (
                                        <p className="text-xs text-zinc-500 mt-2">Connect your wallet to deploy</p>
                                    )}
                                    
                                    <p className="text-xs text-zinc-500">
                                        {isSponsored 
                                            ? 'Deployment is sponsored by your Smart Wallet - no gas fees!' 
                                            : 'Your connected wallet will pay the gas fee for deployment.'
                                        }
                                    </p>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Tab Navigation */}
                <div className="flex gap-1 p-1 bg-zinc-800/50 rounded-xl">
                    {(["assets", "send", "receive", "activity"] as VaultTab[]).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all capitalize relative ${
                                activeTab === tab
                                    ? "bg-zinc-700 text-white shadow-sm"
                                    : "text-zinc-400 hover:text-zinc-200"
                            }`}
                        >
                            {tab === "assets" && "💰"}
                            {tab === "send" && "📤"}
                            {tab === "receive" && "📥"}
                            {tab === "activity" && "📜"}
                            <span className="ml-1.5 hidden sm:inline">{tab}</span>
                            {tab === "activity" && pendingTxs.length > 0 && (
                                <span className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-500 text-black text-xs font-bold rounded-full flex items-center justify-center">
                                    {pendingTxs.length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.15 }}
                    >
                        {/* Assets Tab */}
                        {activeTab === "assets" && (
                            <div className="space-y-2">
                                {isLoadingBalances ? (
                                    <div className="space-y-2">
                                        {[1, 2, 3].map((i) => (
                                            <div key={i} className="p-3 bg-zinc-800/50 rounded-xl animate-pulse">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-zinc-700 rounded-full" />
                                                    <div className="flex-1">
                                                        <div className="h-4 w-20 bg-zinc-700 rounded mb-1" />
                                                        <div className="h-3 w-16 bg-zinc-700/50 rounded" />
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="h-4 w-24 bg-zinc-700 rounded mb-1" />
                                                        <div className="h-3 w-16 bg-zinc-700/50 rounded" />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : balances?.nativeBalance || (balances?.tokens && balances.tokens.length > 0) ? (
                                    <>
                                        {/* Native Balance */}
                                        {balances?.nativeBalance && (
                                            <div className="p-3 bg-zinc-800/50 border border-zinc-700 rounded-xl">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-lg">
                                                        {chainInfo?.icon || "💎"}
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-sm font-medium text-white">
                                                            {balances.nativeBalance.symbol}
                                                        </p>
                                                        <p className="text-xs text-zinc-500">Native Token</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-medium text-white">
                                                            {formatBalance(balances.nativeBalance.balanceFormatted)}
                                                        </p>
                                                        <p className="text-xs text-zinc-500">
                                                            {formatUsd(balances.nativeBalance.balanceUsd)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* ERC20 Tokens */}
                                        {balances?.tokens.map((token) => (
                                            <div
                                                key={token.contractAddress}
                                                className="p-3 bg-zinc-800/50 border border-zinc-700 rounded-xl"
                                            >
                                                <div className="flex items-center gap-3">
                                                    {token.logoUrl ? (
                                                        <img
                                                            src={token.logoUrl}
                                                            alt={token.symbol}
                                                            className="w-10 h-10 rounded-full"
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-300">
                                                            {token.symbol.slice(0, 2)}
                                                        </div>
                                                    )}
                                                    <div className="flex-1">
                                                        <p className="text-sm font-medium text-white">
                                                            {token.symbol}
                                                        </p>
                                                        <p className="text-xs text-zinc-500">{token.name}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-medium text-white">
                                                            {formatBalance(token.balanceFormatted)}
                                                        </p>
                                                        <p className="text-xs text-zinc-500">
                                                            {formatUsd(token.balanceUsd)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                ) : (
                                    <div className="text-center py-8">
                                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-800 flex items-center justify-center text-3xl">
                                            💸
                                        </div>
                                        <h4 className="text-sm font-medium text-white mb-1">No Assets Yet</h4>
                                        <p className="text-xs text-zinc-500">
                                            Deposit funds to this vault to get started
                                        </p>
                                        <button
                                            onClick={() => setActiveTab("receive")}
                                            className="mt-3 px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                                        >
                                            Get Deposit Address
                                        </button>
                                    </div>
                                )}

                                {/* Refresh button */}
                                <button
                                    onClick={() => fetchBalances(selectedVault.id)}
                                    disabled={isLoadingBalances}
                                    className="w-full p-2 text-sm text-zinc-400 hover:text-white transition-colors flex items-center justify-center gap-2"
                                >
                                    <svg
                                        className={`w-4 h-4 ${isLoadingBalances ? "animate-spin" : ""}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                        />
                                    </svg>
                                    Refresh Balances
                                </button>
                            </div>
                        )}

                        {/* Send Tab */}
                        {activeTab === "send" && (
                            <div className="space-y-4 relative">
                                {/* Show deploy prompt if not deployed */}
                                {!selectedVault.isDeployed && (
                                    <div className="p-6 text-center">
                                        <span className="text-4xl mb-4 block">🔒</span>
                                        <h4 className="text-lg font-medium text-white mb-2">Deploy Vault First</h4>
                                        <p className="text-sm text-zinc-400 mb-4">
                                            You need to deploy the vault&apos;s smart contract before you can send transactions.
                                        </p>
                                        <button
                                            onClick={() => handleDeployVault(selectedVault.id)}
                                            disabled={isDeploying || !walletClient}
                                            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:bg-zinc-600 text-black font-medium rounded-lg transition-colors"
                                        >
                                            {isDeploying ? "Deploying..." : "Deploy Vault"}
                                        </button>
                                    </div>
                                )}
                                
                                {/* Deployed vault content */}
                                {selectedVault.isDeployed && (
                                <>
                                {/* Token Selector Modal */}
                                <AnimatePresence>
                                    {showTokenSelector && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="absolute inset-0 bg-zinc-900/95 z-10 flex flex-col rounded-xl"
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
                                                {getAllTokens().length === 0 ? (
                                                    <div className="p-8 text-center text-zinc-500 text-sm">
                                                        No tokens with balance
                                                    </div>
                                                ) : (
                                                    getAllTokens().map((token) => (
                                                        <button
                                                            key={token.contractAddress}
                                                            onClick={() => {
                                                                setSendToken(token);
                                                                setShowTokenSelector(false);
                                                            }}
                                                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800/50 transition-colors text-left border-b border-zinc-800/30 last:border-b-0"
                                                        >
                                                            <div className="relative">
                                                                {token.logoUrl ? (
                                                                    <img src={token.logoUrl} alt={token.symbol} className="w-10 h-10 rounded-full" />
                                                                ) : (
                                                                    <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-medium">
                                                                        {token.symbol.slice(0, 2)}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium text-white">{token.symbol}</p>
                                                                <p className="text-xs text-zinc-500">{token.name}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-sm font-medium text-white">{formatBalance(token.balanceFormatted, 4)}</p>
                                                                {token.balanceUsd !== null && (
                                                                    <p className="text-xs text-zinc-500">
                                                                        ${Number(token.balanceUsd).toFixed(2)}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            {sendToken?.contractAddress === token.contractAddress && (
                                                                <svg className="w-5 h-5 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <div className="p-4 bg-zinc-800/50 rounded-xl space-y-4">
                                    {/* Token selector button */}
                                    <div>
                                        <label className="block text-xs text-zinc-400 mb-2">Token</label>
                                        <button
                                            onClick={() => setShowTokenSelector(true)}
                                            className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg hover:border-zinc-600 transition-colors flex items-center gap-3"
                                        >
                                            {sendToken ? (
                                                <>
                                                    {sendToken.logoUrl ? (
                                                        <img src={sendToken.logoUrl} alt="" className="w-8 h-8 rounded-full" />
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-medium">
                                                            {sendToken.symbol.slice(0, 2)}
                                                        </div>
                                                    )}
                                                    <div className="flex-1 text-left">
                                                        <p className="text-sm font-medium text-white">{sendToken.symbol}</p>
                                                        <p className="text-xs text-zinc-500">
                                                            Balance: {formatBalance(sendToken.balanceFormatted, 4)}
                                                        </p>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">
                                                        <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                                        </svg>
                                                    </div>
                                                    <span className="flex-1 text-left text-zinc-400">Select token to send</span>
                                                </>
                                            )}
                                            <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Amount input */}
                                    <div>
                                        <label className="block text-xs text-zinc-400 mb-2">Amount</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                value={sendAmount}
                                                onChange={(e) => setSendAmount(e.target.value)}
                                                onWheel={(e) => e.currentTarget.blur()}
                                                placeholder="0.00"
                                                className="w-full px-3 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-lg placeholder-zinc-500 focus:outline-none focus:border-orange-500 pr-20"
                                            />
                                            {sendToken && (
                                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                                    <span className="text-sm text-zinc-400">{sendToken.symbol}</span>
                                                    <button
                                                        onClick={() => setSendAmount(sendToken.balanceFormatted)}
                                                        className="text-xs font-medium text-orange-400 hover:text-orange-300 px-2 py-1 bg-orange-500/10 rounded"
                                                    >
                                                        MAX
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Recipient input with ENS support */}
                                    <div>
                                        <label className="block text-xs text-zinc-400 mb-2">Recipient Address or ENS</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={ensResolver.input}
                                                onChange={(e) => ensResolver.setInput(e.target.value)}
                                                placeholder="0x... or vitalik.eth"
                                                className={`w-full px-3 py-3 bg-zinc-900 border rounded-lg text-white placeholder-zinc-500 focus:outline-none font-mono text-sm ${
                                                    ensResolver.error 
                                                        ? "border-red-500 focus:border-red-500" 
                                                        : ensResolver.isValid
                                                            ? "border-emerald-500 focus:border-emerald-500"
                                                            : "border-zinc-700 focus:border-orange-500"
                                                }`}
                                            />
                                            {/* Loading indicator */}
                                            {ensResolver.isResolving && (
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                    <div className="w-4 h-4 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
                                                </div>
                                            )}
                                            {/* Valid indicator */}
                                            {!ensResolver.isResolving && ensResolver.isValid && (
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                            )}
                                        </div>
                                        {/* Show resolved info */}
                                        {ensResolver.ensName && ensResolver.resolvedAddress && (
                                            <p className="mt-1 text-xs text-emerald-400 flex items-center gap-1">
                                                <span>✓</span>
                                                <span className="font-medium">{ensResolver.ensName}</span>
                                                <span className="text-zinc-500">→</span>
                                                <span className="font-mono text-zinc-400">
                                                    {ensResolver.resolvedAddress.slice(0, 6)}...{ensResolver.resolvedAddress.slice(-4)}
                                                </span>
                                            </p>
                                        )}
                                        {/* Error message */}
                                        {ensResolver.error && (
                                            <p className="mt-1 text-xs text-red-400">{ensResolver.error}</p>
                                        )}
                                    </div>

                                    {/* Info box about signing flow */}
                                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-2">
                                        <p className="text-xs text-blue-300">
                                            <span className="font-medium">📝 How it works:</span>
                                        </p>
                                        <ol className="text-xs text-blue-300/80 space-y-1 ml-4 list-decimal">
                                            <li>You propose the transaction</li>
                                            <li>Other members sign in the <span className="font-medium">Activity</span> tab</li>
                                            <li>Once {selectedVault.threshold}/{selectedVault.members.length} sign, anyone can execute</li>
                                        </ol>
                                    </div>

                                    {/* Send button */}
                                    <button
                                        onClick={proposeTransaction}
                                        disabled={!ensResolver.isValid || !sendAmount || !sendToken || isProposing || ensResolver.isResolving}
                                        className="w-full py-3 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isProposing ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                Creating Proposal...
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                </svg>
                                                Propose Transaction
                                            </>
                                        )}
                                    </button>
                                </div>
                                </>
                                )}
                            </div>
                        )}

                        {/* Receive Tab */}
                        {activeTab === "receive" && (
                            <div className="space-y-4">
                                <div className="p-6 bg-zinc-800/50 rounded-xl">
                                    <div className="flex flex-col items-center">
                                        {/* QR Code */}
                                        <div className="p-4 bg-white rounded-2xl mb-4">
                                            <QRCodeSVG
                                                value={selectedVault.safeAddress}
                                                size={180}
                                                level="H"
                                                includeMargin={false}
                                            />
                                        </div>

                                        {/* Chain badge */}
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-lg">{chainInfo?.icon}</span>
                                            <span className="text-sm text-zinc-400">{chainInfo?.name} Network</span>
                                        </div>

                                        {/* Address */}
                                        <button
                                            onClick={() => copyAddress(selectedVault.safeAddress)}
                                            className="w-full p-3 bg-zinc-900 rounded-lg hover:bg-zinc-900/70 transition-colors"
                                        >
                                            <p className="font-mono text-sm text-white break-all">
                                                {selectedVault.safeAddress}
                                            </p>
                                            <p className="text-xs text-orange-400 mt-2">
                                                {copied ? "✓ Copied!" : "Tap to copy"}
                                            </p>
                                        </button>

                                        {/* Warning */}
                                        <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg w-full">
                                            <p className="text-xs text-yellow-300 text-center">
                                                <span className="font-medium">⚠️ Important:</span> Only send {chainInfo?.name} network assets to this address
                                            </p>
                                        </div>

                                        {/* Explorer link */}
                                        {chainInfo?.explorerUrl && (
                                            <a
                                                href={`${chainInfo.explorerUrl}/address/${selectedVault.safeAddress}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="mt-4 text-sm text-orange-400 hover:text-orange-300 flex items-center gap-1"
                                            >
                                                View on Explorer
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                </svg>
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Activity Tab */}
                        {activeTab === "activity" && (
                            <div className="space-y-4">
                                {/* Pending Transactions */}
                                {pendingTxs.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                                            Pending Transactions ({pendingTxs.length})
                                        </h4>
                                        {pendingTxs.map((tx) => {
                                            const hasThreshold = tx.confirmations.length >= selectedVault.threshold;
                                            const userHasSigned = tx.confirmations.some(
                                                (c) => c.signer_address.toLowerCase() === userAddress.toLowerCase() ||
                                                       selectedVault.members.find(
                                                           (m) => m.address.toLowerCase() === userAddress.toLowerCase()
                                                       )?.smartWalletAddress?.toLowerCase() === c.signer_address.toLowerCase()
                                            );
                                            const isProposer = tx.created_by.toLowerCase() === userAddress.toLowerCase();
                                            const isExpanded = expandedTxId === tx.id;
                                            
                                            // Find member info for each signer
                                            const getSignerDisplay = (signerAddr: string) => {
                                                const member = selectedVault.members.find(
                                                    (m) => m.smartWalletAddress?.toLowerCase() === signerAddr.toLowerCase() ||
                                                           m.address.toLowerCase() === signerAddr.toLowerCase()
                                                );
                                                if (member?.nickname) return member.nickname;
                                                return `${signerAddr.slice(0, 6)}...${signerAddr.slice(-4)}`;
                                            };
                                            
                                            return (
                                                <div
                                                    key={tx.id}
                                                    className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl overflow-hidden"
                                                >
                                                    {/* Main row - clickable to expand */}
                                                    <div 
                                                        className="p-3 cursor-pointer hover:bg-yellow-500/5 transition-colors"
                                                        onClick={() => setExpandedTxId(isExpanded ? null : tx.id)}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400">
                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                </svg>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium text-white truncate">
                                                                    {tx.description}
                                                                </p>
                                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                                    <span className="text-xs text-zinc-500">
                                                                        {tx.confirmations.length}/{selectedVault.threshold} signatures
                                                                    </span>
                                                                    {userHasSigned && (
                                                                        <span className="text-xs text-emerald-400 flex items-center gap-0.5">
                                                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                                            </svg>
                                                                            Signed
                                                                        </span>
                                                                    )}
                                                                    <span className="text-xs text-zinc-600">•</span>
                                                                    <span className="text-xs text-zinc-500">
                                                                        {getTimeAgo(new Date(tx.created_at))}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                                {hasThreshold ? (
                                                                    <button 
                                                                        onClick={() => handleExecuteTransaction(tx)}
                                                                        disabled={vaultExecution.isExecuting}
                                                                        className="px-3 py-1.5 text-xs font-medium bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50"
                                                                    >
                                                                        Execute
                                                                    </button>
                                                                ) : !userHasSigned ? (
                                                                    <button 
                                                                        onClick={() => handleSignTransaction(tx)}
                                                                        disabled={vaultExecution.isSigning}
                                                                        className="px-3 py-1.5 text-xs font-medium bg-yellow-500 text-black rounded-lg hover:bg-yellow-400 transition-colors disabled:opacity-50"
                                                                    >
                                                                        Sign
                                                                    </button>
                                                                ) : (
                                                                    <span className="text-xs text-zinc-500">Waiting...</span>
                                                                )}
                                                                {isProposer && (
                                                                    <button 
                                                                        onClick={() => cancelTransaction(tx.id)}
                                                                        className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
                                                                        title="Cancel transaction"
                                                                    >
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                        </svg>
                                                                    </button>
                                                                )}
                                                            </div>
                                                            {/* Expand indicator */}
                                                            <svg 
                                                                className={`w-4 h-4 text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                                                                fill="none" 
                                                                stroke="currentColor" 
                                                                viewBox="0 0 24 24"
                                                            >
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Expanded details */}
                                                    {isExpanded && (
                                                        <div className="px-3 pb-3 border-t border-yellow-500/20">
                                                            {/* Signature progress */}
                                                            <div className="mt-3 space-y-2">
                                                                <p className="text-xs font-medium text-zinc-400">Signatures:</p>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {selectedVault.members.map((member) => {
                                                                        const memberSigned = tx.confirmations.some(
                                                                            (c) => c.signer_address.toLowerCase() === member.smartWalletAddress?.toLowerCase() ||
                                                                                   c.signer_address.toLowerCase() === member.address.toLowerCase()
                                                                        );
                                                                        return (
                                                                            <div 
                                                                                key={member.address}
                                                                                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs ${
                                                                                    memberSigned 
                                                                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                                                                        : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                                                                                }`}
                                                                            >
                                                                                {memberSigned ? (
                                                                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                                                    </svg>
                                                                                ) : (
                                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                                    </svg>
                                                                                )}
                                                                                {member.nickname || `${member.address.slice(0, 6)}...`}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                            
                                                            {/* Transaction details */}
                                                            <div className="mt-3 p-2 bg-zinc-900/50 rounded-lg">
                                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                                    <div>
                                                                        <span className="text-zinc-500">To:</span>
                                                                        <p className="text-zinc-300 font-mono truncate">{tx.to_address}</p>
                                                                    </div>
                                                                    <div>
                                                                        <span className="text-zinc-500">Value:</span>
                                                                        <p className="text-zinc-300">{tx.value || "0"} {tx.token_symbol || "ETH"}</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Transaction History */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-medium text-zinc-300">Recent Activity</h4>
                                        <button
                                            onClick={() => {
                                                fetchTransactions(selectedVault.safeAddress, selectedVault.chainId);
                                                fetchPendingTxs(selectedVault.id);
                                            }}
                                            disabled={isLoadingTransactions || isLoadingPendingTxs}
                                            className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
                                        >
                                            <svg
                                                className={`w-3.5 h-3.5 ${isLoadingTransactions || isLoadingPendingTxs ? "animate-spin" : ""}`}
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                            Refresh
                                        </button>
                                    </div>
                                    
                                    {isLoadingTransactions ? (
                                        <div className="space-y-2">
                                            {[1, 2, 3].map((i) => (
                                                <div key={i} className="p-3 bg-zinc-800/50 rounded-xl animate-pulse">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-zinc-700" />
                                                        <div className="flex-1">
                                                            <div className="h-4 bg-zinc-700 rounded w-32 mb-2" />
                                                            <div className="h-3 bg-zinc-700 rounded w-24" />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : transactions.length > 0 ? (
                                        <div className="space-y-2">
                                            {transactions.map((tx) => {
                                                const chainInfo = getChainById(selectedVault.chainId);
                                                const isToken = !!tx.tokenSymbol;
                                                const decimals = tx.tokenDecimals || 18;
                                                const formattedValue = (Number(tx.value) / Math.pow(10, decimals)).toFixed(
                                                    isToken && tx.tokenDecimals === 6 ? 2 : 4
                                                );
                                                const symbol = tx.tokenSymbol || chainInfo?.symbol || "ETH";
                                                const date = new Date(tx.timestamp);
                                                const timeAgo = getTimeAgo(date);
                                                
                                                return (
                                                    <a
                                                        key={tx.hash}
                                                        href={`${chainInfo?.explorerUrl}/tx/${tx.hash}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="block p-3 bg-zinc-800/50 border border-zinc-700 rounded-xl hover:border-zinc-600 transition-colors"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                                                tx.type === "incoming" 
                                                                    ? "bg-emerald-500/20 text-emerald-400" 
                                                                    : "bg-orange-500/20 text-orange-400"
                                                            }`}>
                                                                {tx.type === "incoming" ? (
                                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                                                    </svg>
                                                                ) : (
                                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between">
                                                                    <p className="text-sm font-medium text-white">
                                                                        {tx.type === "incoming" ? "Received" : "Sent"}
                                                                    </p>
                                                                    <p className={`text-sm font-medium ${
                                                                        tx.type === "incoming" ? "text-emerald-400" : "text-orange-400"
                                                                    }`}>
                                                                        {tx.type === "incoming" ? "+" : "-"}{formattedValue} {symbol}
                                                                    </p>
                                                                </div>
                                                                <div className="flex items-center justify-between mt-1">
                                                                    <p className="text-xs text-zinc-500 truncate">
                                                                        {tx.type === "incoming" ? "From" : "To"}: {truncateAddress(tx.type === "incoming" ? tx.from : tx.to)}
                                                                    </p>
                                                                    <p className="text-xs text-zinc-500">{timeAgo}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </a>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl text-center">
                                            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-zinc-700/50 flex items-center justify-center">
                                                <svg className="w-6 h-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <p className="text-sm text-zinc-400">No activity yet</p>
                                            <p className="text-xs text-zinc-500 mt-1">
                                                Transaction history will appear here
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>

                {/* Members section (collapsed by default) */}
                <details className="group">
                    <summary className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl cursor-pointer hover:bg-zinc-800/70 transition-colors">
                        <span className="text-sm font-medium text-zinc-300">
                            Vault Members ({selectedVault.members.length})
                        </span>
                        <svg
                            className="w-5 h-5 text-zinc-500 transition-transform group-open:rotate-180"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </summary>
                    <div className="mt-2 space-y-2">
                        {selectedVault.members.map((member) => (
                            <div
                                key={member.address}
                                className={`p-3 rounded-xl border flex items-center gap-3 ${
                                    member.isCreator
                                        ? "bg-emerald-500/10 border-emerald-500/30"
                                        : "bg-zinc-800/50 border-zinc-700"
                                }`}
                            >
                                {member.avatar ? (
                                    <img
                                        src={member.avatar}
                                        alt=""
                                        className="w-10 h-10 rounded-full object-cover"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white font-bold">
                                        {(member.username || member.address).slice(0, 2).toUpperCase()}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium text-white truncate">
                                            {member.nickname || member.username || truncateAddress(member.address)}
                                        </p>
                                        {member.isCreator && (
                                            <span className="text-xs px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded">
                                                Creator
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-zinc-500 font-mono truncate">
                                        Signer: {truncateAddress(member.smartWalletAddress)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </details>

                {/* Delete button for undeployed vaults */}
                {!selectedVault.isDeployed && isCreator && (
                    <button
                        onClick={() => handleDelete(selectedVault.id)}
                        disabled={isDeleting === selectedVault.id}
                        className="w-full p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                        {isDeleting === selectedVault.id ? "Deleting..." : "Delete Vault"}
                    </button>
                )}
            </div>
        );
    }

    // Loading state
    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
            </div>
        );
    }

    // Empty state
    if (vaults.length === 0) {
        return (
            <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-800 flex items-center justify-center text-3xl">
                    🔐
                </div>
                <h3 className="text-lg font-medium text-white mb-1">No Vaults Yet</h3>
                <p className="text-sm text-zinc-500 mb-4">
                    Create a shared wallet with your friends
                </p>
                <button
                    onClick={onCreateNew}
                    className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-xl hover:bg-orange-600 transition-colors"
                >
                    Create Your First Vault
                </button>
            </div>
        );
    }

    // Vault list
    return (
        <div className="space-y-3">
            {vaults.map((vault) => {
                const chainInfo = getChainById(vault.chainId);
                
                return (
                    <button
                        key={vault.id}
                        onClick={() => handleViewVault(vault)}
                        disabled={isLoadingDetails}
                        className="w-full p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl hover:border-zinc-600 transition-all text-left"
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">{vault.emoji}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-medium text-white truncate">
                                        {vault.name}
                                    </h4>
                                    {vault.isCreator && (
                                        <span className="text-xs px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded">
                                            Creator
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-xs text-zinc-500 flex items-center gap-1">
                                        <span>{chainInfo?.icon}</span>
                                        {chainInfo?.name}
                                    </span>
                                    <span className="text-xs text-zinc-600">•</span>
                                    <span className="text-xs text-zinc-500">
                                        {vault.threshold}/{vault.memberCount} sigs
                                    </span>
                                    <span className="text-xs text-zinc-600">•</span>
                                    <span className={`text-xs ${vault.isDeployed ? "text-emerald-400" : "text-yellow-400"}`}>
                                        {vault.isDeployed ? "Active" : "Pending"}
                                    </span>
                                </div>
                            </div>
                            <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </div>
                    </button>
                );
            })}

            {/* Create new button */}
            <button
                onClick={onCreateNew}
                className="w-full p-3 border border-dashed border-zinc-700 rounded-xl text-sm text-zinc-400 hover:border-orange-500/50 hover:text-orange-400 transition-colors flex items-center justify-center gap-2"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create New Vault
            </button>
        </div>
    );
}
