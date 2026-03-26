/**
 * SNS / Bonfida resolve expects "alice.sol", not "@alice.sol" (the latter 404s on-chain).
 * Same for Spritz username lookups (stored without @).
 */
export function stripLeadingAt(input: string): string {
    const t = input.trim();
    return t.startsWith("@") ? t.slice(1).trim() : t;
}
