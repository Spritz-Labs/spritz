import { useState, useEffect, useCallback } from "react";

export interface Transaction {
    hash: string;
    chainId: number;
    chainName: string;
    chainIcon: string;
    from: string;
    to: string;
    value: string;
    valueFormatted: string;
    valueUsd: number | null;
    tokenSymbol: string;
    tokenName: string;
    tokenDecimals: number;
    tokenLogo?: string;
    contractAddress: string;
    timestamp: number;
    blockNumber: number;
    type: "send" | "receive";
    explorerUrl: string;
}

interface UseTransactionHistoryReturn {
    transactions: Transaction[];
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

export function useTransactionHistory(
    address: string | null,
    chainFilter?: string
): UseTransactionHistoryReturn {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchTransactions = useCallback(async () => {
        if (!address) {
            setTransactions([]);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({ address });
            if (chainFilter) {
                params.append("chain", chainFilter);
            }

            const response = await fetch(`/api/wallet/transactions?${params}`);
            
            if (!response.ok) {
                throw new Error("Failed to fetch transactions");
            }

            const data = await response.json();
            setTransactions(data.transactions || []);
        } catch (err) {
            console.error("[TransactionHistory] Error:", err);
            setError(err instanceof Error ? err.message : "Unknown error");
            setTransactions([]);
        } finally {
            setIsLoading(false);
        }
    }, [address, chainFilter]);

    useEffect(() => {
        fetchTransactions();
    }, [fetchTransactions]);

    return {
        transactions,
        isLoading,
        error,
        refresh: fetchTransactions,
    };
}

// Format relative time
export function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 30) {
        return new Date(timestamp).toLocaleDateString();
    } else if (days > 0) {
        return `${days}d ago`;
    } else if (hours > 0) {
        return `${hours}h ago`;
    } else if (minutes > 0) {
        return `${minutes}m ago`;
    } else {
        return "Just now";
    }
}

// Truncate address for display
export function truncateAddress(address: string, chars: number = 4): string {
    if (!address) return "";
    return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

// Format USD value
export function formatTxUsd(value: number | null): string {
    if (value === null || value === undefined) return "";
    if (value < 0.01) return "<$0.01";
    return `$${value.toFixed(2)}`;
}
