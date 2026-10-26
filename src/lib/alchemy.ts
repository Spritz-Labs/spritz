/**
 * Alchemy config shared by wallet balance and transaction fallbacks.
 * Each network must be enabled on the Alchemy app or requests return 403.
 */

export const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;

// Alchemy network subdomains (https://<network>.g.alchemy.com/v2/<key>)
export const ALCHEMY_NETWORKS: Record<number, string> = {
    1: "eth-mainnet",
    8453: "base-mainnet",
    42161: "arb-mainnet",
    10: "opt-mainnet",
    137: "polygon-mainnet",
    56: "bnb-mainnet",
    43114: "avax-mainnet",
    130: "unichain-mainnet",
};

export function getAlchemyRpcUrl(chainId: number): string | null {
    const network = ALCHEMY_NETWORKS[chainId];
    if (!ALCHEMY_API_KEY || !network) return null;
    return `https://${network}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
}

export function getAlchemyPricesUrl(path: string): string | null {
    if (!ALCHEMY_API_KEY) return null;
    return `https://api.g.alchemy.com/prices/v1/${ALCHEMY_API_KEY}${path}`;
}
