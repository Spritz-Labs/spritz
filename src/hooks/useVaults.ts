"use client";

import { useState, useCallback, useEffect } from "react";
import type { VaultListItem } from "@/app/api/vault/list/route";
import type { VaultDetails, VaultMember } from "@/app/api/vault/[id]/route";

export type { VaultListItem, VaultDetails, VaultMember };

export type CreateVaultParams = {
    name: string;
    description?: string;
    emoji?: string;
    chainId: number;
    members: Array<{
        address: string;
        nickname?: string;
    }>;
    threshold: number;
};

export function useVaults(userAddress: string | null) {
    const [vaults, setVaults] = useState<VaultListItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch user's vaults
    const fetchVaults = useCallback(async () => {
        if (!userAddress) {
            setVaults([]);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/vault/list", {
                credentials: "include",
            });

            if (!response.ok) {
                throw new Error("Failed to fetch vaults");
            }

            const data = await response.json();
            setVaults(data.vaults || []);
        } catch (err) {
            console.error("[useVaults] Error:", err);
            setError(err instanceof Error ? err.message : "Failed to fetch vaults");
        } finally {
            setIsLoading(false);
        }
    }, [userAddress]);

    // Create a new vault
    const createVault = useCallback(async (params: CreateVaultParams) => {
        if (!userAddress) {
            throw new Error("Not authenticated");
        }

        const response = await fetch("/api/vault/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(params),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to create vault");
        }

        // Refresh vaults list
        await fetchVaults();

        return data.vault;
    }, [userAddress, fetchVaults]);

    // Get vault details
    const getVault = useCallback(async (vaultId: string): Promise<VaultDetails | null> => {
        if (!userAddress) {
            return null;
        }

        try {
            const response = await fetch(`/api/vault/${vaultId}`, {
                credentials: "include",
            });

            if (!response.ok) {
                throw new Error("Failed to fetch vault");
            }

            const data = await response.json();
            return data.vault;
        } catch (err) {
            console.error("[useVaults] Error getting vault:", err);
            return null;
        }
    }, [userAddress]);

    // Update vault metadata
    const updateVault = useCallback(async (
        vaultId: string,
        updates: { name?: string; description?: string; emoji?: string }
    ) => {
        if (!userAddress) {
            throw new Error("Not authenticated");
        }

        const response = await fetch(`/api/vault/${vaultId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(updates),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to update vault");
        }

        // Refresh vaults list
        await fetchVaults();

        return data.vault;
    }, [userAddress, fetchVaults]);

    // Delete vault
    const deleteVault = useCallback(async (vaultId: string) => {
        if (!userAddress) {
            throw new Error("Not authenticated");
        }

        const response = await fetch(`/api/vault/${vaultId}`, {
            method: "DELETE",
            credentials: "include",
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to delete vault");
        }

        // Refresh vaults list
        await fetchVaults();

        return true;
    }, [userAddress, fetchVaults]);

    // Get deployment info for a vault
    const getDeploymentInfo = useCallback(async (vaultId: string) => {
        if (!userAddress) {
            throw new Error("Not authenticated");
        }

        const response = await fetch(`/api/vault/${vaultId}/deploy`, {
            credentials: "include",
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to get deployment info");
        }

        return response.json();
    }, [userAddress]);

    // Confirm deployment after on-chain tx
    const confirmDeployment = useCallback(async (vaultId: string, txHash: string) => {
        if (!userAddress) {
            throw new Error("Not authenticated");
        }

        const response = await fetch(`/api/vault/${vaultId}/deploy`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ txHash }),
        });

        // Handle 202 (Accepted but pending) - Safe not yet visible on-chain
        if (response.status === 202) {
            const data = await response.json();
            throw new Error(data.error || "Deployment pending - not yet deployed on-chain");
        }

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to confirm deployment");
        }

        // Refresh vaults list
        await fetchVaults();

        return response.json();
    }, [userAddress, fetchVaults]);

    // Fetch on mount
    useEffect(() => {
        fetchVaults();
    }, [fetchVaults]);

    return {
        vaults,
        isLoading,
        error,
        fetchVaults,
        createVault,
        getVault,
        updateVault,
        deleteVault,
        getDeploymentInfo,
        confirmDeployment,
    };
}

// Hook to fetch friends with Smart Wallets (for vault member selection)
export function useFriendsWithWallets(userAddress: string | null) {
    const [friends, setFriends] = useState<Array<{
        address: string;
        smartWalletAddress: string;
        username?: string;
        avatar?: string;
        ensName?: string;
    }>>([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchFriends = useCallback(async () => {
        if (!userAddress) {
            setFriends([]);
            return;
        }

        setIsLoading(true);

        try {
            const response = await fetch(`/api/vault/eligible-friends`, {
                credentials: "include",
            });

            if (!response.ok) {
                console.error("[useFriendsWithWallets] API error");
                setFriends([]);
                return;
            }

            const data = await response.json();
            setFriends(data.friends || []);
        } catch (err) {
            console.error("[useFriendsWithWallets] Error:", err);
            setFriends([]);
        } finally {
            setIsLoading(false);
        }
    }, [userAddress]);

    useEffect(() => {
        fetchFriends();
    }, [fetchFriends]);

    return {
        friends,
        isLoading,
        refresh: fetchFriends,
    };
}
