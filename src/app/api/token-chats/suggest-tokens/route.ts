import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
    fetchBalances,
    GRAPH_NETWORK_NAMES,
    type TokenBalance,
} from "@/lib/graphTokenApi";
import { SUPPORTED_CHAINS } from "@/config/chains";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type WalletSource = {
    label: string;
    type: "eoa" | "smart_wallet" | "vault";
    address: string;
    vaultName?: string;
};

export type SuggestedToken = {
    address: string;
    chainId: number;
    chainName: string;
    chainIcon: string;
    name: string;
    symbol: string;
    decimals: number;
    balance: string;
    balanceFormatted: string;
    balanceUsd: number | null;
    logoUrl?: string;
    source: WalletSource;
};

// GET /api/token-chats/suggest-tokens?userAddress=0x...
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get("userAddress")?.toLowerCase();

    if (!userAddress) {
        return NextResponse.json({ error: "Missing userAddress" }, { status: 400 });
    }

    try {
        // Step 1: Collect all wallet addresses
        const walletSources: WalletSource[] = [
            { label: "Connected Wallet", type: "eoa", address: userAddress },
        ];

        // Get Smart Wallet address from Supabase
        const { data: userData } = await supabase
            .from("shout_users")
            .select("smart_wallet_address, wallet_type")
            .eq("wallet_address", userAddress)
            .single();

        if (userData?.smart_wallet_address && userData.smart_wallet_address !== userAddress) {
            walletSources.push({
                label: "Spritz Wallet",
                type: "smart_wallet",
                address: userData.smart_wallet_address.toLowerCase(),
            });
        }

        // Get Vault addresses
        try {
            const { data: vaultMembers } = await supabase
                .from("vault_members")
                .select("vault_id")
                .eq("smart_wallet_address", userData?.smart_wallet_address?.toLowerCase() || userAddress);

            if (vaultMembers && vaultMembers.length > 0) {
                const vaultIds = vaultMembers.map((vm) => vm.vault_id);
                const { data: vaults } = await supabase
                    .from("vaults")
                    .select("id, name, safe_address, chain_id")
                    .in("id", vaultIds);

                if (vaults) {
                    for (const vault of vaults) {
                        if (vault.safe_address) {
                            walletSources.push({
                                label: vault.name || "Vault",
                                type: "vault",
                                address: vault.safe_address.toLowerCase(),
                                vaultName: vault.name,
                            });
                        }
                    }
                }
            }
        } catch {
            // Vault fetch might fail if tables don't exist yet - that's fine
        }

        // Step 2: Fetch tokens from all chains for all wallet sources
        const allTokens: SuggestedToken[] = [];
        const chainList = Object.values(SUPPORTED_CHAINS);

        // Fetch in parallel across all sources and chains
        const fetchPromises: Promise<void>[] = [];

        for (const source of walletSources) {
            for (const chain of chainList) {
                fetchPromises.push(
                    (async () => {
                        try {
                            const network = GRAPH_NETWORK_NAMES[chain.id];
                            const { balances } = await fetchBalances(
                                source.address,
                                chain.id,
                                network || chain.network,
                            );

                            for (const token of balances) {
                                // Skip native tokens and zero balances
                                if (token.tokenType !== "erc20") continue;
                                if (!token.balance || token.balance === "0") continue;

                                allTokens.push({
                                    address: token.contractAddress,
                                    chainId: chain.id,
                                    chainName: chain.name,
                                    chainIcon: chain.icon,
                                    name: token.name,
                                    symbol: token.symbol,
                                    decimals: token.decimals,
                                    balance: token.balance,
                                    balanceFormatted: token.balanceFormatted,
                                    balanceUsd: token.balanceUsd,
                                    logoUrl: token.logoUrl,
                                    source,
                                });
                            }
                        } catch {
                            // Silent - individual chain failures shouldn't block others
                        }
                    })(),
                );
            }
        }

        await Promise.allSettled(fetchPromises);

        // Step 3: Sort by USD value (highest first), then by balance
        allTokens.sort((a, b) => {
            const aUsd = a.balanceUsd ?? 0;
            const bUsd = b.balanceUsd ?? 0;
            return bUsd - aUsd;
        });

        // Step 4: Deduplicate (same token on same chain from different sources -> keep highest balance)
        // Actually don't dedup - show all sources so user knows where the token is
        
        return NextResponse.json({
            tokens: allTokens,
            walletSources,
        });
    } catch (err) {
        console.error("[suggest-tokens] Error:", err);
        return NextResponse.json(
            { error: "Failed to fetch tokens" },
            { status: 500 },
        );
    }
}
