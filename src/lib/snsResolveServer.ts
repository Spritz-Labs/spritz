import { Connection, PublicKey } from "@solana/web3.js";
import { resolve, getFavoriteDomain } from "@bonfida/spl-name-service";

export function getSnsMainnetConnection(): Connection {
    const heliusKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY || "";
    const rpc =
        process.env.SOLANA_RPC_URL ||
        (heliusKey
            ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
            : "https://api.mainnet-beta.solana.com");
    return new Connection(rpc, "confirmed");
}

/**
 * Forward resolve: e.g. "alice.sol" → owner's wallet (where funds/SOL would go for the name).
 */
export async function snsForwardResolve(
    domainInput: string
): Promise<{ address: string; name: string } | null> {
    const raw = domainInput.trim().toLowerCase();
    if (!raw.endsWith(".sol")) {
        return null;
    }
    const conn = getSnsMainnetConnection();
    const owner = await resolve(conn, raw);
    return { address: owner.toBase58(), name: raw };
}

/**
 * Reverse: wallet's primary / favorite .sol name (if set in SNS).
 */
export async function snsReverseResolve(walletBase58: string): Promise<string | null> {
    let pk: PublicKey;
    try {
        pk = new PublicKey(walletBase58.trim());
    } catch {
        return null;
    }
    const conn = getSnsMainnetConnection();
    try {
        const { reverse } = await getFavoriteDomain(conn, pk);
        if (!reverse || typeof reverse !== "string") {
            return null;
        }
        return reverse;
    } catch {
        return null;
    }
}
