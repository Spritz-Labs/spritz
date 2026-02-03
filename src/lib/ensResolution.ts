/**
 * ENS resolution for channel membership and POAP lookups.
 * Use when the same user may be stored by ENS (e.g. "poap.eth") or by resolved address (0x...).
 */

import { isAddress, createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { getRpcUrl } from "@/lib/rpc";

/** Resolve ENS to address; return lowercase 0x address. If input is already 0x, normalize to lowercase. */
export async function resolveToAddress(input: string): Promise<string | null> {
    const trimmed = (input || "").trim();
    if (!trimmed) return null;
    if (isAddress(trimmed)) return trimmed.toLowerCase();
    try {
        const client = createPublicClient({
            chain: mainnet,
            transport: http(getRpcUrl(1)),
        });
        const resolved = await client.getEnsAddress({ name: trimmed });
        return resolved ? resolved.toLowerCase() : null;
    } catch {
        return null;
    }
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
