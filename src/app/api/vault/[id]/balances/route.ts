import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { getChainById } from "@/config/chains";
import { 
    fetchBalances, 
    GRAPH_NETWORK_NAMES,
    clearBalanceCache,
    type TokenBalance as GraphTokenBalance,
} from "@/lib/graphTokenApi";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Re-export types for compatibility
export type VaultTokenBalance = GraphTokenBalance;

export type VaultBalanceResponse = {
    vaultId: string;
    safeAddress: string;
    chainId: number;
    nativeBalance: VaultTokenBalance | null;
    tokens: VaultTokenBalance[];
    totalUsd: number;
    source: "graph" | "blockscout" | "rpc";
    lastUpdated: string;
};

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: vaultId } = await params;
        const { searchParams } = new URL(request.url);
        const refresh = searchParams.get("refresh") === "true";
        
        console.log("[Vault Balances] ====== START ======");
        console.log("[Vault Balances] Request for vault:", vaultId);

        // Authenticate user
        const user = await getAuthenticatedUser(request);
        if (!user) {
            console.log("[Vault Balances] ERROR: Unauthorized - no user");
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }
        console.log("[Vault Balances] User authenticated:", user.userAddress);

        // Get vault details
        const { data: vault, error: vaultError } = await supabase
            .from("shout_vaults")
            .select("id, safe_address, chain_id")
            .eq("id", vaultId)
            .single();

        if (vaultError || !vault) {
            console.log("[Vault Balances] ERROR: Vault not found", vaultError);
            return NextResponse.json(
                { error: "Vault not found" },
                { status: 404 }
            );
        }
        console.log("[Vault Balances] Vault found:", { 
            id: vault.id, 
            safeAddress: vault.safe_address, 
            chainId: vault.chain_id 
        });

        // Verify user is a member of this vault
        const { data: membership } = await supabase
            .from("shout_vault_members")
            .select("id")
            .eq("vault_id", vaultId)
            .eq("member_address", user.userAddress.toLowerCase())
            .single();

        if (!membership) {
            console.log("[Vault Balances] ERROR: Not a member");
            return NextResponse.json(
                { error: "Not a member of this vault" },
                { status: 403 }
            );
        }
        console.log("[Vault Balances] User is member of vault");

        // Clear cache if refresh requested
        if (refresh) {
            clearBalanceCache(vault.safe_address, vault.chain_id);
            console.log("[Vault Balances] Cache cleared");
        }

        const chainInfo = getChainById(vault.chain_id);
        const network = GRAPH_NETWORK_NAMES[vault.chain_id] || chainInfo?.network;
        
        console.log("[Vault Balances] Using Graph Token API with fallbacks...");
        console.log("[Vault Balances] Chain:", vault.chain_id, "Network:", network);

        // Fetch balances using the unified Graph Token API service
        const { balances, totalUsd, source } = await fetchBalances(
            vault.safe_address,
            vault.chain_id,
            network
        );

        // Separate native and token balances
        const nativeBalance = balances.find(b => b.tokenType === "native") || null;
        const tokens = balances.filter(b => b.tokenType === "erc20");

        console.log("[Vault Balances] ====== FINAL RESULT ======");
        console.log("[Vault Balances] Source:", source);
        console.log("[Vault Balances] Native balance:", nativeBalance 
            ? `${nativeBalance.balanceFormatted} ${nativeBalance.symbol}` 
            : "none");
        console.log("[Vault Balances] Tokens count:", tokens.length);
        console.log("[Vault Balances] Tokens:", tokens.map(t => `${t.balanceFormatted} ${t.symbol}`));
        console.log("[Vault Balances] Total USD:", totalUsd);

        const response: VaultBalanceResponse = {
            vaultId: vault.id,
            safeAddress: vault.safe_address,
            chainId: vault.chain_id,
            nativeBalance,
            tokens,
            totalUsd,
            source,
            lastUpdated: new Date().toISOString(),
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error("[Vault Balances] FATAL Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch vault balances" },
            { status: 500 }
        );
    }
}

// POST - Clear cache for a vault
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: vaultId } = await params;

        // Authenticate user
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        // Get vault details
        const { data: vault, error: vaultError } = await supabase
            .from("shout_vaults")
            .select("id, safe_address, chain_id")
            .eq("id", vaultId)
            .single();

        if (vaultError || !vault) {
            return NextResponse.json(
                { error: "Vault not found" },
                { status: 404 }
            );
        }

        // Verify user is a member
        const { data: membership } = await supabase
            .from("shout_vault_members")
            .select("id")
            .eq("vault_id", vaultId)
            .eq("member_address", user.userAddress.toLowerCase())
            .single();

        if (!membership) {
            return NextResponse.json(
                { error: "Not a member of this vault" },
                { status: 403 }
            );
        }

        // Clear the cache
        clearBalanceCache(vault.safe_address, vault.chain_id);
        console.log("[Vault Balances] Cache cleared for vault:", vaultId);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Vault Balances] Error clearing cache:", error);
        return NextResponse.json(
            { error: "Failed to clear cache" },
            { status: 500 }
        );
    }
}
