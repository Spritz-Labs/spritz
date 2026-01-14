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

// Native token contract address (used by The Graph to identify native transfers)
const NATIVE_TOKEN_CONTRACT = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

// Known legitimate tokens that should never be filtered (by symbol, case-insensitive)
// These are well-known tokens that may temporarily show $0 value but are legit
const WHITELISTED_SYMBOLS = new Set([
    "eth", "weth", "usdc", "usdt", "dai", "wbtc", "matic", "wmatic",
    "bnb", "wbnb", "avax", "wavax", "ftm", "wftm", "op", "arb",
    "link", "uni", "aave", "mkr", "snx", "crv", "ldo", "rpl",
    "cbeth", "reth", "steth", "wsteth", "frax", "lusd", "susd",
]);

// Known legitimate token contracts (lowercase) - add specific contracts here
const WHITELISTED_CONTRACTS = new Set([
    // Native token placeholder
    "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    // USDC on various chains
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // Ethereum
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // Base
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831", // Arbitrum
    "0x0b2c639c533813f4aa9d7837caf62653d097ff85", // Optimism
    // USDT
    "0xdac17f958d2ee523a2206206994597c13d831ec7", // Ethereum
    // DAI
    "0x6b175474e89094c44da98b954eedeac495271d0f", // Ethereum
    "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", // Base
    // WETH
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // Ethereum
    "0x4200000000000000000000000000000000000006", // Base/Optimism
]);

// Patterns that indicate scam/spam tokens
const SCAM_NAME_PATTERNS = [
    /t\.me/i,           // Telegram links
    /claim/i,           // "Claim" tokens
    /airdrop/i,         // Airdrop scams
    /visit/i,           // "Visit" instructions
    /http/i,            // URL in name
    /\.com/i,           // Domain in name
    /\.org/i,           // Domain in name
    /\.io/i,            // Domain in name
    /\.xyz/i,           // Domain in name
    /\.net/i,           // Domain in name
    /reward/i,          // "Reward" tokens
    /bonus/i,           // "Bonus" tokens
    /free/i,            // "Free" tokens
    /gift/i,            // "Gift" tokens
    /voucher/i,         // "Voucher" tokens
    /\*/,               // Asterisks often used in scam names
];

/**
 * Determines if a transaction is likely a scam/spam token
 * 
 * Criteria for filtering:
 * 1. Only filter RECEIVED transactions (never hide user's own sends)
 * 2. Token name/symbol contains scam patterns (URLs, "claim", etc.)
 * 3. Token is NOT in our whitelist
 * 
 * This filters out common airdrop scam coins while preserving legitimate transactions
 */
function isLikelyScamToken(transfer: GraphTransfer, type: "send" | "receive"): boolean {
    // Never filter outgoing transactions - user intentionally sent these
    if (type === "send") {
        return false;
    }

    // Check if token is whitelisted by symbol
    const symbolLower = transfer.symbol?.toLowerCase() || "";
    if (WHITELISTED_SYMBOLS.has(symbolLower)) {
        return false;
    }

    // Check if token is whitelisted by contract
    const contractLower = transfer.contract?.toLowerCase() || "";
    if (WHITELISTED_CONTRACTS.has(contractLower)) {
        return false;
    }

    // Check for scam patterns in name or symbol
    const tokenName = transfer.name || "";
    const tokenSymbol = transfer.symbol || "";
    for (const pattern of SCAM_NAME_PATTERNS) {
        if (pattern.test(tokenName) || pattern.test(tokenSymbol)) {
            console.log(`[Transactions] Filtering scam token (pattern match): ${transfer.symbol} - ${transfer.name}`);
            return true;
        }
    }

    // If token name is very long (>50 chars), likely scam
    if (tokenName.length > 50 || tokenSymbol.length > 20) {
        console.log(`[Transactions] Filtering scam token (long name): ${transfer.symbol} - ${transfer.name}`);
        return true;
    }

    // If the token has no USD value and isn't whitelisted, filter it
    if (!transfer.value || transfer.value <= 0.001) {
        console.log(`[Transactions] Filtering potential scam token (no value): ${transfer.symbol} (${transfer.contract})`);
        return true;
    }

    return false;
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
        // We need separate calls for:
        // 1. Sent ERC-20 tokens
        // 2. Received ERC-20 tokens  
        // 3. Sent native tokens (ETH/BNB/MATIC)
        // 4. Received native tokens
        // Note: Free tier limit is 10 items max per request
        const [sentResponse, receivedResponse, nativeSentResponse, nativeReceivedResponse] = await Promise.all([
            // ERC-20 sent
            fetch(`${GRAPH_TRANSFERS_URL}?network=${chain.network}&from_address=${address}&limit=10`, {
                headers: {
                    "Authorization": `Bearer ${GRAPH_TOKEN_API_KEY}`,
                    "Accept": "application/json",
                },
                next: { revalidate: 30 },
            }),
            // ERC-20 received
            fetch(`${GRAPH_TRANSFERS_URL}?network=${chain.network}&to_address=${address}&limit=10`, {
                headers: {
                    "Authorization": `Bearer ${GRAPH_TOKEN_API_KEY}`,
                    "Accept": "application/json",
                },
                next: { revalidate: 30 },
            }),
            // Native token sent (ETH, BNB, MATIC, etc.)
            fetch(`${GRAPH_TRANSFERS_URL}?network=${chain.network}&from_address=${address}&contract=${NATIVE_TOKEN_CONTRACT}&limit=10`, {
                headers: {
                    "Authorization": `Bearer ${GRAPH_TOKEN_API_KEY}`,
                    "Accept": "application/json",
                },
                next: { revalidate: 30 },
            }),
            // Native token received
            fetch(`${GRAPH_TRANSFERS_URL}?network=${chain.network}&to_address=${address}&contract=${NATIVE_TOKEN_CONTRACT}&limit=10`, {
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
                // Filter out likely scam/spam tokens
                if (isLikelyScamToken(transfer, type)) {
                    continue;
                }

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
            processResponse(nativeSentResponse, "send"),
            processResponse(nativeReceivedResponse, "receive"),
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

    // Basic address format validation
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return NextResponse.json({ error: "Invalid address format" }, { status: 400 });
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
