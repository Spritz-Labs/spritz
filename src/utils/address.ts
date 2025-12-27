/**
 * Normalizes an address for database storage/comparison.
 * All addresses are lowercased for consistent storage and lookup.
 * The original case is preserved in the UI for display purposes only.
 */
export function normalizeAddress(address: string): string {
    if (!address) return address;

    // Lowercase all addresses for consistent database storage/comparison
    return address.toLowerCase();
}

/**
 * Checks if an address is an EVM address
 */
export function isEvmAddress(address: string): boolean {
    return address?.startsWith("0x") ?? false;
}

/**
 * Checks if an address is a Solana address
 */
export function isSolanaAddress(address: string): boolean {
    if (!address || address.startsWith("0x")) return false;
    // Solana addresses are base58 encoded, typically 32-44 characters
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return base58Regex.test(address);
}




