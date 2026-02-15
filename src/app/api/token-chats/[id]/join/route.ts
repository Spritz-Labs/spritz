import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, parseAbi, getAddress, isAddress } from "viem";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ERC20_ABI = parseAbi([
    "function balanceOf(address) view returns (uint256)",
]);

function getRpcUrl(chainId: number): string {
    const apiKey = process.env.NEXT_PUBLIC_DRPC_API_KEY || process.env.DRPC_API_KEY;
    const drpcChains: Record<number, string> = {
        1: "ethereum", 8453: "base", 42161: "arbitrum", 10: "optimism",
        137: "polygon", 56: "bsc", 43114: "avalanche", 130: "unichain",
    };
    if (apiKey && drpcChains[chainId]) {
        return `https://lb.drpc.org/ogrpc?network=${drpcChains[chainId]}&dkey=${apiKey}`;
    }
    const fallbacks: Record<number, string> = {
        1: "https://eth.llamarpc.com", 8453: "https://base.llamarpc.com",
        42161: "https://arb1.arbitrum.io/rpc", 10: "https://mainnet.optimism.io",
        137: "https://polygon-rpc.com", 56: "https://bsc-dataseed.binance.org",
        43114: "https://api.avax.network/ext/bc/C/rpc", 130: "https://mainnet.unichain.org",
    };
    return fallbacks[chainId] || fallbacks[1];
}

// Collect all wallet addresses for a user (EOA, Smart Wallet, Vaults)
async function getAllWalletAddresses(userAddress: string): Promise<{ address: string; label: string }[]> {
    const addresses: { address: string; label: string }[] = [
        { address: userAddress.toLowerCase(), label: "Wallet" },
    ];

    try {
        // Get Smart Wallet address
        const { data: userData } = await supabase
            .from("shout_users")
            .select("smart_wallet_address")
            .eq("wallet_address", userAddress.toLowerCase())
            .single();

        if (userData?.smart_wallet_address && userData.smart_wallet_address.toLowerCase() !== userAddress.toLowerCase()) {
            addresses.push({
                address: userData.smart_wallet_address.toLowerCase(),
                label: "Spritz Wallet",
            });
        }

        // Get Vault addresses
        const swAddr = userData?.smart_wallet_address?.toLowerCase() || userAddress.toLowerCase();
        const { data: vaultMembers } = await supabase
            .from("vault_members")
            .select("vault_id")
            .eq("smart_wallet_address", swAddr);

        if (vaultMembers && vaultMembers.length > 0) {
            const vaultIds = vaultMembers.map((vm) => vm.vault_id);
            const { data: vaults } = await supabase
                .from("vaults")
                .select("name, safe_address")
                .in("id", vaultIds);

            if (vaults) {
                for (const vault of vaults) {
                    if (vault.safe_address) {
                        addresses.push({
                            address: vault.safe_address.toLowerCase(),
                            label: vault.name || "Vault",
                        });
                    }
                }
            }
        }
    } catch {
        // If vault/smart wallet lookup fails, just use EOA
    }

    return addresses;
}

// POST /api/token-chats/[id]/join - Verify balance across all wallets and join
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: chatId } = await params;

    try {
        const body = await request.json();
        const { userAddress } = body;

        if (!userAddress || !isAddress(userAddress)) {
            return NextResponse.json({ error: "Invalid address" }, { status: 400 });
        }

        // Get the token chat details
        const { data: chat, error: chatError } = await supabase
            .from("shout_token_chats")
            .select("*")
            .eq("id", chatId)
            .single();

        if (chatError || !chat) {
            return NextResponse.json({ error: "Token chat not found" }, { status: 404 });
        }

        // Check if already a member
        const { data: existingMember } = await supabase
            .from("shout_token_chat_members")
            .select("id")
            .eq("chat_id", chatId)
            .eq("member_address", userAddress.toLowerCase())
            .single();

        if (existingMember) {
            return NextResponse.json({ success: true, alreadyMember: true });
        }

        // Get all wallet addresses for this user
        const walletAddresses = await getAllWalletAddresses(userAddress);
        console.log(`[token-chats/join] Checking balance across ${walletAddresses.length} wallets for ${userAddress}`);

        // Verify token balance on-chain across all wallets
        const chainId = chat.token_chain_id;
        const client = createPublicClient({
            transport: http(getRpcUrl(chainId)),
        });

        let totalBalance = BigInt(0);
        const balanceBreakdown: { label: string; address: string; balance: bigint }[] = [];

        // Check balance on all wallets in parallel
        const balanceChecks = walletAddresses.map(async (wallet) => {
            try {
                const balance = await client.readContract({
                    address: getAddress(chat.token_address),
                    abi: ERC20_ABI,
                    functionName: "balanceOf",
                    args: [getAddress(wallet.address)],
                }) as bigint;
                return { ...wallet, balance };
            } catch {
                return { ...wallet, balance: BigInt(0) };
            }
        });

        const results = await Promise.all(balanceChecks);
        for (const r of results) {
            totalBalance += r.balance;
            balanceBreakdown.push({
                label: r.label,
                address: r.address,
                balance: r.balance,
            });
        }

        const minBalance = BigInt(chat.min_balance || "0");
        if (totalBalance < minBalance) {
            const decimals = chat.token_decimals || 18;
            const required = Number(minBalance) / Math.pow(10, decimals);
            const actualTotal = Number(totalBalance) / Math.pow(10, decimals);

            // Build breakdown for the error
            const breakdown = balanceBreakdown
                .filter((b) => b.balance > BigInt(0))
                .map((b) => ({
                    label: b.label,
                    balance: (Number(b.balance) / Math.pow(10, decimals)).toLocaleString(),
                }));

            return NextResponse.json({
                error: "Insufficient token balance",
                required: required.toLocaleString(),
                actual: actualTotal.toLocaleString(),
                symbol: chat.token_symbol,
                breakdown,
                walletsChecked: walletAddresses.length,
            }, { status: 403 });
        }

        // Add as member
        const { error: joinError } = await supabase
            .from("shout_token_chat_members")
            .insert({
                chat_id: chatId,
                member_address: userAddress.toLowerCase(),
                role: "member",
                verified_balance: totalBalance.toString(),
                verified_at: new Date().toISOString(),
            });

        if (joinError) {
            console.error("[token-chats/join] Error:", joinError);
            return NextResponse.json({ error: "Failed to join" }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            walletsChecked: walletAddresses.length,
            totalBalance: (Number(totalBalance) / Math.pow(10, chat.token_decimals || 18)).toLocaleString(),
        });
    } catch (err) {
        console.error("[token-chats/join] Error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// DELETE /api/token-chats/[id]/join - Leave the chat
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: chatId } = await params;
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get("userAddress")?.toLowerCase();

    if (!userAddress) {
        return NextResponse.json({ error: "Missing userAddress" }, { status: 400 });
    }

    try {
        await supabase
            .from("shout_token_chat_members")
            .delete()
            .eq("chat_id", chatId)
            .eq("member_address", userAddress);

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[token-chats/leave] Error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
