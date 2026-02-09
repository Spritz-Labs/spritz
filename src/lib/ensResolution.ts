/**
 * ENS resolution for channel membership and POAP lookups.
 * Use when the same user may be stored by ENS (e.g. "poap.eth") or by resolved address (0x...).
 * Also supports non-Ethereum addresses (e.g. Alien ID identifiers) by passing them through as-is.
 */

import { isAddress, createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { getRpcUrl } from "@/lib/rpc";

/**
 * Check if input looks like an ENS name (contains a dot, e.g. "vitalik.eth").
 * Used to distinguish ENS names from non-Ethereum identity addresses (e.g. Alien ID).
 */
function looksLikeEns(input: string): boolean {
    return input.includes(".");
}

/**
 * Resolve address/ENS to a normalized lowercase string.
 * - Valid Ethereum addresses (0x...): normalized to lowercase
 * - ENS names (*.eth): resolved to Ethereum address
 * - Other identifiers (e.g. Alien ID, World ID): returned as-is lowercase
 *   These are valid user identifiers stored in the database from non-Ethereum auth providers.
 */
export async function resolveToAddress(input: string): Promise<string | null> {
    const trimmed = (input || "").trim();
    if (!trimmed) return null;
    // Standard Ethereum address
    if (isAddress(trimmed)) return trimmed.toLowerCase();
    // Try ENS resolution only if it looks like an ENS name
    if (looksLikeEns(trimmed)) {
        try {
            const client = createPublicClient({
                chain: mainnet,
                transport: http(getRpcUrl(1)),
            });
            const resolved = await client.getEnsAddress({ name: trimmed });
            if (resolved) return resolved.toLowerCase();
        } catch {
            // ENS resolution failed, fall through
        }
    }
    // Non-Ethereum identifier (Alien ID, World ID, etc.) - return as-is lowercase
    // These are valid user identifiers stored in the DB from alternative auth providers
    return trimmed.toLowerCase();
}

/**
 * Return list of addresses to use when querying shout_channel_members (or any user_address lookup).
 * Includes resolved 0x address and, if different, the original input (e.g. ENS).
 * Use with .in("user_address", addresses) so ENS users find rows stored by resolved address and vice versa.
 */
export async function getMembershipLookupAddresses(
    input: string
): Promise<string[]> {
    const trimmed = (input || "").trim().toLowerCase();
    if (!trimmed) return [];
    const resolved = await resolveToAddress(trimmed);
    const addresses: string[] = [];
    if (resolved) addresses.push(resolved);
    if (trimmed !== resolved) addresses.push(trimmed);
    return [...new Set(addresses)];
}
