import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { SUPPORTED_CHAINS, type SupportedChain } from "@/config/chains";
import { getTokenLogo, NATIVE_TOKEN_LOGOS } from "@/config/tokenLogos";

const GRAPH_TOKEN_API_KEY = process.env.GRAPH_TOKEN_API_KEY;
const GRAPH_TRANSFERS_URL = "https://token-api.thegraph.com/v1/evm/transfers";

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

interface GraphTransfer {
    block_num: number;
    datetime: string;
    timestamp: number;
    transaction_id: string;
    log_index: number;
    contract: string;
    from: string;
    to: string;
    name: string;
    symbol: string;
    decimals: number;
    amount: string;
    value: number; // USD value
    network: string;
}

async function fetchChainTransfers(
    address: string,
    chain: SupportedChain
): Promise<Transaction[]> {
    if (!GRAPH_TOKEN_API_KEY) {
        console.error("[Transactions] Missing GRAPH_TOKEN_API_KEY");
        return [];
    }

    const transactions: Transaction[] = [];

    try {
        // Fetch transfers where user is sender OR receiver
        // We need two calls since the API doesn't support OR queries
        // Note: Free tier limit is 10 items max
        const [sentResponse, receivedResponse] = await Promise.all([
            fetch(`${GRAPH_TRANSFERS_URL}?network=${chain.network}&from_address=${address}&limit=10`, {
                headers: {
                    "Authorization": `Bearer ${GRAPH_TOKEN_API_KEY}`,
                    "Accept": "application/json",
                },
                next: { revalidate: 30 },
            }),
            fetch(`${GRAPH_TRANSFERS_URL}?network=${chain.network}&to_address=${address}&limit=10`, {
                headers: {
                    "Authorization": `Bearer ${GRAPH_TOKEN_API_KEY}`,
                    "Accept": "application/json",
                },
                next: { revalidate: 30 },
            }),
        ]);

        const processResponse = async (response: Response, type: "send" | "receive") => {
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[Transactions] ${chain.name} ${type} error:`, response.status, errorText);
                return;
            }

            const data = await response.json();
            const transfers: GraphTransfer[] = data.data || [];

            for (const transfer of transfers) {
                // Get token logo
                const isNative = transfer.contract === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
                const tokenLogo = isNative 
                    ? NATIVE_TOKEN_LOGOS[transfer.symbol] 
                    : getTokenLogo(transfer.symbol, transfer.contract, chain.network);

                transactions.push({
                    hash: transfer.transaction_id,
                    chainId: chain.id,
                    chainName: chain.name,
                    chainIcon: chain.icon,
                    from: transfer.from,
                    to: transfer.to,
                    value: transfer.amount,
                    valueFormatted: transfer.value?.toString() || "0",
                    valueUsd: typeof transfer.value === "number" ? transfer.value : null,
                    tokenSymbol: transfer.symbol,
                    tokenName: transfer.name,
                    tokenDecimals: transfer.decimals,
                    tokenLogo,
                    contractAddress: transfer.contract,
                    timestamp: transfer.timestamp * 1000, // Convert to milliseconds
                    blockNumber: transfer.block_num,
                    type,
                    explorerUrl: `${chain.explorerUrl}/tx/${transfer.transaction_id}`,
                });
            }
        };

        await Promise.all([
            processResponse(sentResponse, "send"),
            processResponse(receivedResponse, "receive"),
        ]);

        return transactions;
    } catch (error) {
        console.error(`[Transactions] Error fetching ${chain.name} transfers:`, error);
        return [];
    }
}

export async function GET(request: NextRequest) {
    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    // Use the address from query params (smart wallet address from frontend)
    const address = searchParams.get("address");
    const chainFilter = searchParams.get("chain"); // Optional: filter by chain network

    if (!address) {
        return NextResponse.json({ error: "Address required" }, { status: 400 });
    }

    try {
        // Determine which chains to query
        const chainsToQuery = chainFilter
            ? Object.values(SUPPORTED_CHAINS).filter(c => c.network === chainFilter)
            : Object.values(SUPPORTED_CHAINS);

        // Fetch transfers from all chains in parallel
        const results = await Promise.all(
            chainsToQuery.map(chain => fetchChainTransfers(address, chain))
        );

        // Flatten results
        const allTransactions = results.flat();

        // Deduplicate by hash (same tx might appear in both sent and received)
        const seen = new Map<string, Transaction>();
        for (const tx of allTransactions) {
            const key = `${tx.hash}-${tx.contractAddress}`;
            if (!seen.has(key)) {
                seen.set(key, tx);
            }
        }

        // Sort by timestamp descending (newest first)
        const uniqueTransactions = Array.from(seen.values())
            .sort((a, b) => b.timestamp - a.timestamp);

        // Limit total results
        const limitedTransactions = uniqueTransactions.slice(0, 100);

        return NextResponse.json({
            transactions: limitedTransactions,
            count: limitedTransactions.length,
            address: address,
        });
    } catch (error) {
        console.error("[Transactions] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch transactions" },
            { status: 500 }
        );
    }
}
