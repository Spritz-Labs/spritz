import { Connection, PublicKey } from "@solana/web3.js";
import { resolve, getFavoriteDomain } from "@bonfida/spl-name-service";

const DEFAULT_SOLANA_MAINNET_RPC = "https://api.mainnet-beta.solana.com";

export function getSnsMainnetConnection(): Connection {
    const rpc =
        process.env.SOLANA_RPC_URL?.trim() || DEFAULT_SOLANA_MAINNET_RPC;
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
