import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { encodeFunctionData, parseUnits, type Address } from "viem";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ERC20 transfer function ABI
const ERC20_TRANSFER_ABI = [
    {
        name: "transfer",
        type: "function",
        inputs: [
            { name: "to", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
    },
] as const;

// GET: List transactions for a vault
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: vaultId } = await params;
        
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Verify user is a member
        const { data: membership } = await supabase
            .from("shout_vault_members")
            .select("id")
            .eq("vault_id", vaultId)
            .eq("member_address", user.userAddress.toLowerCase())
            .single();

        if (!membership) {
            return NextResponse.json({ error: "Not a member" }, { status: 403 });
        }

        // Get transactions with confirmations count
        const { data: transactions, error } = await supabase
            .from("shout_vault_transactions")
            .select(`
                *,
                confirmations:shout_vault_confirmations(
                    id,
                    signer_address,
                    signed_at
                )
            `)
            .eq("vault_id", vaultId)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("[Vault Transactions] Error:", error);
            return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
        }

        return NextResponse.json({ transactions: transactions || [] });
    } catch (error) {
        console.error("[Vault Transactions] Error:", error);
        return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
    }
}

// PATCH: Sign or execute a transaction
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: vaultId } = await params;
        const body = await request.json();
        const { transactionId, action } = body; // action: "sign" or "execute"

        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Verify user is a member and get their smart wallet address
        const { data: membership } = await supabase
            .from("shout_vault_members")
            .select("id, smart_wallet_address")
            .eq("vault_id", vaultId)
            .eq("member_address", user.userAddress.toLowerCase())
            .single();

        if (!membership) {
            return NextResponse.json({ error: "Not a member" }, { status: 403 });
        }

        // Get the transaction
        const { data: transaction, error: txError } = await supabase
            .from("shout_vault_transactions")
            .select(`
                *,
                confirmations:shout_vault_confirmations(
                    id,
                    signer_address,
                    signed_at
                )
            `)
            .eq("id", transactionId)
            .eq("vault_id", vaultId)
            .single();

        if (txError || !transaction) {
            return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
        }

        if (transaction.status !== "pending") {
            return NextResponse.json({ error: "Transaction is not pending" }, { status: 400 });
        }

        // Get vault details
        const { data: vault } = await supabase
            .from("shout_vaults")
            .select("threshold, safe_address, chain_id")
            .eq("id", vaultId)
            .single();

        if (!vault) {
            return NextResponse.json({ error: "Vault not found" }, { status: 404 });
        }

        const signerAddress = membership.smart_wallet_address?.toLowerCase() || user.userAddress.toLowerCase();

        if (action === "sign") {
            // Check if already signed
            const alreadySigned = transaction.confirmations?.some(
                (c: { signer_address: string }) => c.signer_address.toLowerCase() === signerAddress
            );

            if (alreadySigned) {
                return NextResponse.json({ error: "Already signed" }, { status: 400 });
            }

            // Add signature
            const { error: signError } = await supabase
                .from("shout_vault_confirmations")
                .insert({
                    transaction_id: transactionId,
                    signer_address: signerAddress,
                    signature: `signed_by_${user.userAddress.toLowerCase()}`, // Placeholder
                });

            if (signError) {
                console.error("[Vault Transactions] Sign error:", signError);
                return NextResponse.json({ error: "Failed to sign" }, { status: 500 });
            }

            const newConfirmationCount = (transaction.confirmations?.length || 0) + 1;
            
            return NextResponse.json({
                success: true,
                message: newConfirmationCount >= vault.threshold
                    ? "Transaction ready to execute!"
                    : `Signed! ${vault.threshold - newConfirmationCount} more signature(s) needed.`,
                confirmations: newConfirmationCount,
                threshold: vault.threshold,
                canExecute: newConfirmationCount >= vault.threshold,
            });
        }

        if (action === "execute") {
            // Check if enough signatures
            const confirmationCount = transaction.confirmations?.length || 0;
            if (confirmationCount < vault.threshold) {
                return NextResponse.json({
                    error: `Not enough signatures. Have ${confirmationCount}, need ${vault.threshold}`,
                }, { status: 400 });
            }

            // Mark as ready for execution
            // The actual on-chain execution happens client-side via wallet
            const { error: updateError } = await supabase
                .from("shout_vault_transactions")
                .update({
                    status: "executed",
                    executed_at: new Date().toISOString(),
                })
                .eq("id", transactionId);

            if (updateError) {
                console.error("[Vault Transactions] Execute error:", updateError);
                return NextResponse.json({ error: "Failed to execute" }, { status: 500 });
            }

            // Return execution data for client-side wallet interaction
            return NextResponse.json({
                success: true,
                message: "Transaction approved! Connect wallet to execute on-chain.",
                requiresWallet: true,
                executionData: {
                    safeAddress: vault.safe_address,
                    chainId: vault.chain_id,
                    to: transaction.to_address,
                    value: transaction.value,
                    data: transaction.data,
                    operation: transaction.operation || 0,
                    nonce: transaction.nonce,
                },
            });
        }

        if (action === "cancel") {
            // Only proposer can cancel
            if (transaction.created_by.toLowerCase() !== user.userAddress.toLowerCase()) {
                return NextResponse.json({ error: "Only proposer can cancel" }, { status: 403 });
            }

            const { error: updateError } = await supabase
                .from("shout_vault_transactions")
                .update({ status: "cancelled" })
                .eq("id", transactionId);

            if (updateError) {
                return NextResponse.json({ error: "Failed to cancel" }, { status: 500 });
            }

            return NextResponse.json({ success: true, message: "Transaction cancelled" });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error) {
        console.error("[Vault Transactions] PATCH error:", error);
        return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
    }
}

// POST: Create a new transaction proposal
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: vaultId } = await params;
        const body = await request.json();
        const { 
            toAddress, 
            amount, 
            tokenAddress, // null for native token
            tokenDecimals,
            tokenSymbol,
            description 
        } = body;

        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Verify user is a member
        const { data: membership } = await supabase
            .from("shout_vault_members")
            .select("id, smart_wallet_address")
            .eq("vault_id", vaultId)
            .eq("member_address", user.userAddress.toLowerCase())
            .single();

        if (!membership) {
            return NextResponse.json({ error: "Not a member" }, { status: 403 });
        }

        // Get vault details
        const { data: vault, error: vaultError } = await supabase
            .from("shout_vaults")
            .select("id, safe_address, threshold")
            .eq("id", vaultId)
            .single();

        if (vaultError || !vault) {
            return NextResponse.json({ error: "Vault not found" }, { status: 404 });
        }

        // Get current nonce (count of transactions)
        const { count: txCount } = await supabase
            .from("shout_vault_transactions")
            .select("id", { count: "exact", head: true })
            .eq("vault_id", vaultId);

        const nonce = txCount || 0;

        // Prepare transaction data
        let txData = "0x";
        let txValue = "0";
        let txTo = toAddress;

        if (tokenAddress) {
            // ERC20 transfer
            const amountWei = parseUnits(amount, tokenDecimals || 18);
            txData = encodeFunctionData({
                abi: ERC20_TRANSFER_ABI,
                functionName: "transfer",
                args: [toAddress as Address, amountWei],
            });
            txTo = tokenAddress;
            txValue = "0";
        } else {
            // Native token transfer
            const amountWei = parseUnits(amount, 18);
            txValue = amountWei.toString();
        }

        // Generate a pseudo safe_tx_hash (in production, this would be calculated properly)
        const safeTxHash = `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`;

        // Create transaction
        const { data: transaction, error: txError } = await supabase
            .from("shout_vault_transactions")
            .insert({
                vault_id: vaultId,
                safe_tx_hash: safeTxHash,
                to_address: txTo.toLowerCase(),
                value: txValue,
                data: txData,
                operation: 0, // Call
                nonce,
                status: "pending",
                description: description || `Send ${amount} ${tokenSymbol || "ETH"} to ${toAddress.slice(0, 6)}...${toAddress.slice(-4)}`,
                token_symbol: tokenSymbol || "ETH",
                token_address: tokenAddress || null,
                created_by: user.userAddress.toLowerCase(),
            })
            .select()
            .single();

        if (txError) {
            console.error("[Vault Transactions] Create error:", txError);
            return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 });
        }

        // Auto-sign by creator
        const { error: signError } = await supabase
            .from("shout_vault_confirmations")
            .insert({
                transaction_id: transaction.id,
                signer_address: membership.smart_wallet_address?.toLowerCase() || user.userAddress.toLowerCase(),
                signature: "auto_signed_by_proposer", // Placeholder - real signature would come from wallet
            });

        if (signError) {
            console.error("[Vault Transactions] Auto-sign error:", signError);
        }

        return NextResponse.json({ 
            success: true, 
            transaction,
            message: vault.threshold === 1 
                ? "Transaction ready to execute" 
                : `Transaction proposed. ${vault.threshold - 1} more signature(s) needed.`
        });
    } catch (error) {
        console.error("[Vault Transactions] Error:", error);
        return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 });
    }
}
