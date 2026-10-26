import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { SUPPORTED_CHAINS, type SupportedChain } from "@/config/chains";
import { getTokenLogo, NATIVE_TOKEN_LOGOS } from "@/config/tokenLogos";
import { getAlchemyRpcUrl } from "@/lib/alchemy";

const GRAPH_TOKEN_API_KEY = process.env.GRAPH_TOKEN_API_KEY;
const GRAPH_TRANSFERS_URL = "https://token-api.thegraph.com/v1/evm/transfers";

// Per-request timeout so a hung provider falls through to the next one
const PROVIDER_TIMEOUT_MS = 8000;

// Blockscout instances for transaction history (BSC and Avalanche have none)
const BLOCKSCOUT_TX_URLS: Record<number, string> = {
    1: "https://eth.blockscout.com",
    8453: "https://base.blockscout.com",
    42161: "https://arbitrum.blockscout.com",
    10: "https://explorer.optimism.io",
    137: "https://polygon.blockscout.com",
    130: "https://unichain.blockscout.com",
};

// Blockscout sits behind Cloudflare, which challenges requests without a UA
const BLOCKSCOUT_HEADERS = {
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; Spritz/1.0; +https://spritz.chat)",
};

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
    "eth",
    "weth",
    "usdc",
    "usdt",
    "dai",
    "wbtc",
    "matic",
    "wmatic",
    "bnb",
    "wbnb",
    "avax",
    "wavax",
    "ftm",
    "wftm",
    "op",
    "arb",
    "link",
    "uni",
    "aave",
    "mkr",
    "snx",
    "crv",
    "ldo",
    "rpl",
    "cbeth",
    "reth",
    "steth",
    "wsteth",
    "frax",
    "lusd",
    "susd",
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
    /t\.me/i, // Telegram links
    /claim/i, // "Claim" tokens
    /airdrop/i, // Airdrop scams
    /visit/i, // "Visit" instructions
    /http/i, // URL in name
    /\.com/i, // Domain in name
    /\.org/i, // Domain in name
    /\.io/i, // Domain in name
    /\.xyz/i, // Domain in name
    /\.net/i, // Domain in name
    /reward/i, // "Reward" tokens
    /bonus/i, // "Bonus" tokens
    /free/i, // "Free" tokens
    /gift/i, // "Gift" tokens
    /voucher/i, // "Voucher" tokens
    /\*/, // Asterisks often used in scam names
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
function isLikelyScamToken(
    transfer: Pick<GraphTransfer, "symbol" | "name" | "contract" | "value">,
    type: "send" | "receive"
): boolean {
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
            console.log(
                `[Transactions] Filtering scam token (pattern match): ${transfer.symbol} - ${transfer.name}`
            );
            return true;
        }
    }

    // If token name is very long (>50 chars), likely scam
    if (tokenName.length > 50 || tokenSymbol.length > 20) {
        console.log(
            `[Transactions] Filtering scam token (long name): ${transfer.symbol} - ${transfer.name}`
        );
        return true;
    }

    // If the token has no USD value and isn't whitelisted, filter it
    if (!transfer.value || transfer.value <= 0.001) {
        console.log(
            `[Transactions] Filtering potential scam token (no value): ${transfer.symbol} (${transfer.contract})`
        );
        return true;
    }

    return false;
}

// Format a decimal-adjusted token amount for display
function formatAmount(amount: number): string {
    if (!Number.isFinite(amount) || amount === 0) return "0";
    if (amount < 0.000001) return "<0.000001";
    return amount.toLocaleString("en-US", { maximumFractionDigits: 6, useGrouping: false });
}

function rawToAmount(raw: string, decimals: number): number {
    try {
        return Number(BigInt(raw)) / Math.pow(10, decimals);
    } catch {
        return 0;
    }
}

// Fetch JSON, throwing on network errors, non-2xx, or non-JSON (e.g. Cloudflare challenge pages)
async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
    }
    if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error(`Non-JSON response from ${new URL(url).host}`);
    }
    return response.json() as Promise<T>;
}

// Try each provider in order; a provider that throws falls through to the next.
// A provider that succeeds with zero transfers is trusted (wallet may be empty).
async function fetchChainTransfers(address: string, chain: SupportedChain): Promise<Transaction[]> {
    const providers: [string, () => Promise<Transaction[]>][] = [];
    if (GRAPH_TOKEN_API_KEY) {
        providers.push(["Graph", () => fetchGraphTransfers(address, chain)]);
    }
    if (getAlchemyRpcUrl(chain.id)) {
        providers.push(["Alchemy", () => fetchAlchemyTransfers(address, chain)]);
    }
    if (BLOCKSCOUT_TX_URLS[chain.id]) {
        providers.push(["Blockscout", () => fetchBlockscoutTransfers(address, chain)]);
    }

    for (const [name, fetchTransfers] of providers) {
        try {
            return await fetchTransfers();
        } catch (error) {
            console.error(`[Transactions] ${name} failed for ${chain.name}:`, error);
        }
    }

    console.error(`[Transactions] All providers failed for ${chain.name}`);
    return [];
}

async function fetchGraphTransfers(address: string, chain: SupportedChain): Promise<Transaction[]> {
    const transactions: Transaction[] = [];
    const graphFetch = (query: string) =>
        fetch(`${GRAPH_TRANSFERS_URL}?network=${chain.network}&${query}&limit=10`, {
            headers: {
                Authorization: `Bearer ${GRAPH_TOKEN_API_KEY}`,
                Accept: "application/json",
            },
            next: { revalidate: 30 },
            signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        });

    // Fetch transfers where user is sender OR receiver
    // We need separate calls for:
    // 1. Sent ERC-20 tokens
    // 2. Received ERC-20 tokens
    // 3. Sent native tokens (ETH/BNB/MATIC)
    // 4. Received native tokens
    // Note: Free tier limit is 10 items max per request
    // A network error (e.g. ECONNRESET) rejects here and falls through to the next provider
    const [sentResponse, receivedResponse, nativeSentResponse, nativeReceivedResponse] =
        await Promise.all([
            graphFetch(`from_address=${address}`),
            graphFetch(`to_address=${address}`),
            graphFetch(`from_address=${address}&contract=${NATIVE_TOKEN_CONTRACT}`),
            graphFetch(`to_address=${address}&contract=${NATIVE_TOKEN_CONTRACT}`),
        ]);

    const processResponse = async (
        response: Response,
        type: "send" | "receive"
    ): Promise<boolean> => {
        if (!response.ok) {
            const errorText = await response.text();
            console.error(
                `[Transactions] ${chain.name} ${type} error:`,
                response.status,
                errorText
            );
            return false;
        }

        const data = await response.json();
        const transfers: GraphTransfer[] = data.data || [];

        for (const transfer of transfers) {
            // Filter out likely scam/spam tokens
            if (isLikelyScamToken(transfer, type)) {
                continue;
            }

            // Get token logo
            const isNative = transfer.contract === NATIVE_TOKEN_CONTRACT;
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
        return true;
    };

    const results = await Promise.all([
        processResponse(sentResponse, "send"),
        processResponse(receivedResponse, "receive"),
        processResponse(nativeSentResponse, "send"),
        processResponse(nativeReceivedResponse, "receive"),
    ]);

    if (!results.some(Boolean)) {
        throw new Error("All Graph transfer requests failed");
    }

    return transactions;
}

interface AlchemyTransfer {
    blockNum: string;
    hash: string;
    from: string;
    to: string | null;
    value: number | null;
    asset: string | null;
    category: "external" | "internal" | "erc20";
    rawContract: { value: string | null; address: string | null; decimal: string | null };
    metadata: { blockTimestamp: string } | null;
}

async function fetchAlchemyTransfers(
    address: string,
    chain: SupportedChain
): Promise<Transaction[]> {
    const url = getAlchemyRpcUrl(chain.id)!;

    const getTransfers = async (direction: "fromAddress" | "toAddress", category: string[]) => {
        const data = await fetchJson<{
            result?: { transfers: AlchemyTransfer[] };
            error?: { message: string };
        }>(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "alchemy_getAssetTransfers",
                params: [
                    {
                        [direction]: address,
                        category,
                        order: "desc",
                        maxCount: "0x14",
                        withMetadata: true,
                        excludeZeroValue: true,
                    },
                ],
            }),
            cache: "no-store",
        });
        if (data.error) throw new Error(`Alchemy: ${data.error.message}`);
        return data.result?.transfers ?? [];
    };

    // "internal" catches native sends executed by the Safe itself, but isn't
    // supported on every network - retry without it if Alchemy rejects it
    const getWithFallback = async (direction: "fromAddress" | "toAddress") => {
        try {
            return await getTransfers(direction, ["external", "internal", "erc20"]);
        } catch (error) {
            if (!(error instanceof Error) || !/internal|category/i.test(error.message)) throw error;
            return getTransfers(direction, ["external", "erc20"]);
        }
    };

    const [sent, received] = await Promise.all([
        getWithFallback("fromAddress"),
        getWithFallback("toAddress"),
    ]);

    // Some networks (e.g. Avalanche, Unichain) return metadata: null, so look up
    // the missing block timestamps in one batched JSON-RPC call
    const blockTimestamps = new Map<string, number>();
    const missingBlocks = [
        ...new Set(
            [...sent, ...received].filter((t) => !t.metadata?.blockTimestamp).map((t) => t.blockNum)
        ),
    ];
    if (missingBlocks.length > 0) {
        const blocks = await fetchJson<{ id: number; result?: { timestamp: string } }[]>(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
                missingBlocks.map((blockNum, id) => ({
                    jsonrpc: "2.0",
                    id,
                    method: "eth_getBlockByNumber",
                    params: [blockNum, false],
                }))
            ),
            cache: "no-store",
        });
        for (const block of blocks) {
            if (block.result) {
                blockTimestamps.set(
                    missingBlocks[block.id],
                    parseInt(block.result.timestamp, 16) * 1000
                );
            }
        }
    }

    const toTransaction = (t: AlchemyTransfer, type: "send" | "receive"): Transaction | null => {
        const isNative = t.category !== "erc20";
        const symbol = isNative ? chain.symbol : (t.asset ?? "");
        const contract = isNative
            ? NATIVE_TOKEN_CONTRACT
            : (t.rawContract.address ?? "").toLowerCase();
        const decimals = isNative ? 18 : parseInt(t.rawContract.decimal ?? "0x12", 16);
        const amount = t.value ?? 0;

        if (isLikelyScamToken({ symbol, name: symbol, contract, value: amount }, type)) {
            return null;
        }

        return {
            hash: t.hash,
            chainId: chain.id,
            chainName: chain.name,
            chainIcon: chain.icon,
            from: t.from,
            to: t.to ?? "",
            value: t.rawContract.value ? BigInt(t.rawContract.value).toString() : "0",
            valueFormatted: formatAmount(amount),
            valueUsd: null, // Alchemy transfers don't include prices
            tokenSymbol: symbol,
            tokenName: symbol,
            tokenDecimals: decimals,
            tokenLogo: isNative
                ? NATIVE_TOKEN_LOGOS[symbol]
                : getTokenLogo(symbol, contract, chain.network),
            contractAddress: contract,
            timestamp: t.metadata?.blockTimestamp
                ? new Date(t.metadata.blockTimestamp).getTime()
                : (blockTimestamps.get(t.blockNum) ?? 0),
            blockNumber: parseInt(t.blockNum, 16),
            type,
            explorerUrl: `${chain.explorerUrl}/tx/${t.hash}`,
        };
    };

    return [
        ...sent.map((t) => toTransaction(t, "send")),
        ...received.map((t) => toTransaction(t, "receive")),
    ].filter((t): t is Transaction => t !== null);
}

interface BlockscoutAddressRef {
    hash: string;
}

interface BlockscoutTx {
    hash: string;
    timestamp: string;
    block_number: number;
    from: BlockscoutAddressRef;
    to: BlockscoutAddressRef | null;
    value: string;
    result: string;
    exchange_rate: string | null;
}

interface BlockscoutInternalTx {
    transaction_hash: string;
    timestamp: string;
    block_number: number;
    from: BlockscoutAddressRef;
    to: BlockscoutAddressRef | null;
    value: string;
    success: boolean;
}

interface BlockscoutTokenTransfer {
    transaction_hash: string;
    timestamp: string;
    block_number: number;
    from: BlockscoutAddressRef;
    to: BlockscoutAddressRef;
    total: { value: string; decimals: string | null };
    token: {
        address_hash?: string;
        address?: string;
        symbol: string | null;
        name: string | null;
        decimals: string | null;
        exchange_rate: string | null;
        reputation?: string | null;
    };
}

async function fetchBlockscoutTransfers(
    address: string,
    chain: SupportedChain
): Promise<Transaction[]> {
    const base = `${BLOCKSCOUT_TX_URLS[chain.id]}/api/v2/addresses/${address}`;
    const get = <T>(path: string) =>
        fetchJson<{ items: T[] }>(`${base}${path}`, {
            headers: BLOCKSCOUT_HEADERS,
            cache: "no-store",
        }).then((data) => data.items ?? []);

    const [txsResult, internalResult, tokenResult] = await Promise.allSettled([
        get<BlockscoutTx>("/transactions"),
        get<BlockscoutInternalTx>("/internal-transactions"),
        get<BlockscoutTokenTransfer>("/token-transfers?type=ERC-20"),
    ]);

    if ([txsResult, internalResult, tokenResult].every((r) => r.status === "rejected")) {
        throw (txsResult as PromiseRejectedResult).reason;
    }

    const lower = address.toLowerCase();
    const transactions: Transaction[] = [];
    const nativeLogo = NATIVE_TOKEN_LOGOS[chain.symbol];

    const pushNative = (
        hash: string,
        from: string,
        to: string,
        rawValue: string,
        timestamp: string,
        blockNumber: number,
        exchangeRate: string | null
    ) => {
        const amount = rawToAmount(rawValue, 18);
        transactions.push({
            hash,
            chainId: chain.id,
            chainName: chain.name,
            chainIcon: chain.icon,
            from,
            to,
            value: rawValue,
            valueFormatted: formatAmount(amount),
            valueUsd: exchangeRate ? amount * parseFloat(exchangeRate) : null,
            tokenSymbol: chain.symbol,
            tokenName: chain.symbol,
            tokenDecimals: 18,
            tokenLogo: nativeLogo,
            contractAddress: NATIVE_TOKEN_CONTRACT,
            timestamp: new Date(timestamp).getTime(),
            blockNumber,
            type: from.toLowerCase() === lower ? "send" : "receive",
            explorerUrl: `${chain.explorerUrl}/tx/${hash}`,
        });
    };

    if (txsResult.status === "fulfilled") {
        for (const tx of txsResult.value) {
            if (tx.result !== "success" || tx.value === "0" || !tx.to) continue;
            pushNative(
                tx.hash,
                tx.from.hash,
                tx.to.hash,
                tx.value,
                tx.timestamp,
                tx.block_number,
                tx.exchange_rate
            );
        }
    }

    if (internalResult.status === "fulfilled") {
        for (const tx of internalResult.value) {
            if (!tx.success || tx.value === "0" || !tx.to) continue;
            pushNative(
                tx.transaction_hash,
                tx.from.hash,
                tx.to.hash,
                tx.value,
                tx.timestamp,
                tx.block_number,
                null
            );
        }
    }

    if (tokenResult.status === "fulfilled") {
        for (const transfer of tokenResult.value) {
            const type = transfer.from.hash.toLowerCase() === lower ? "send" : "receive";
            const contract = (
                transfer.token.address_hash ??
                transfer.token.address ??
                ""
            ).toLowerCase();
            const symbol = transfer.token.symbol ?? "";
            const name = transfer.token.name ?? symbol;
            const decimals = parseInt(
                transfer.token.decimals ?? transfer.total.decimals ?? "18",
                10
            );
            const amount = rawToAmount(transfer.total.value, decimals);

            // Blockscout flags known spam tokens; never hide the user's own sends
            if (
                type === "receive" &&
                transfer.token.reputation &&
                transfer.token.reputation !== "ok"
            )
                continue;
            if (isLikelyScamToken({ symbol, name, contract, value: amount }, type)) continue;

            transactions.push({
                hash: transfer.transaction_hash,
                chainId: chain.id,
                chainName: chain.name,
                chainIcon: chain.icon,
                from: transfer.from.hash,
                to: transfer.to.hash,
                value: transfer.total.value,
                valueFormatted: formatAmount(amount),
                valueUsd: transfer.token.exchange_rate
                    ? amount * parseFloat(transfer.token.exchange_rate)
                    : null,
                tokenSymbol: symbol,
                tokenName: name,
                tokenDecimals: decimals,
                tokenLogo: getTokenLogo(symbol, contract, chain.network),
                contractAddress: contract,
                timestamp: new Date(transfer.timestamp).getTime(),
                blockNumber: transfer.block_number,
                type,
                explorerUrl: `${chain.explorerUrl}/tx/${transfer.transaction_hash}`,
            });
        }
    }

    return transactions;
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
            ? Object.values(SUPPORTED_CHAINS).filter((c) => c.network === chainFilter)
            : Object.values(SUPPORTED_CHAINS);

        // Fetch transfers from all chains in parallel
        const results = await Promise.all(
            chainsToQuery.map((chain) => fetchChainTransfers(address, chain))
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
        const uniqueTransactions = Array.from(seen.values()).sort(
            (a, b) => b.timestamp - a.timestamp
        );

        // Limit total results
        const limitedTransactions = uniqueTransactions.slice(0, 100);

        return NextResponse.json({
            transactions: limitedTransactions,
            count: limitedTransactions.length,
            address: address,
        });
    } catch (error) {
        console.error("[Transactions] Error:", error);
        return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
    }
}
