/**
 * ENS subname eligibility — determines which users can claim username.spritz.eth
 * and what address the name should resolve to.
 *
 * Rule: only accounts where a user can receive funds AND has a signer to move them.
 * - wallet (EOA): always eligible, resolve to wallet_address
 * - passkey: eligible, resolve to smart_wallet_address (fallback wallet_address)
 * - email: eligible only if they have a passkey signer (smart_wallet_address set)
 * - alien_id, world_id: NOT eligible
 */

const ELIGIBLE_WALLET_TYPES = new Set(["wallet", "evm"]);
const CONDITIONALLY_ELIGIBLE = new Set(["passkey", "email"]);
const NEVER_ELIGIBLE = new Set(["alien_id", "world_id"]);

export interface EligibilityResult {
    eligible: boolean;
    reason?: string;
    resolveAddress?: string;
}

export interface UserRow {
    wallet_address: string;
    wallet_type?: string | null;
    smart_wallet_address?: string | null;
    username?: string | null;
    is_banned?: boolean;
    ens_subname_claimed_at?: string | null;
}

export function checkEnsEligibility(user: UserRow): EligibilityResult {
    if (!user.username || user.username.trim().length < 2) {
        return {
            eligible: false,
            reason: "Claim and save a Spritz username first — then you can link it on ENS.",
        };
    }

    if (user.is_banned) {
        return { eligible: false, reason: "Account is banned" };
    }

    const wt = (user.wallet_type || "wallet").toLowerCase();

    if (NEVER_ELIGIBLE.has(wt)) {
        return { eligible: false, reason: `Account type "${wt}" is not eligible for ENS subnames` };
    }

    if (ELIGIBLE_WALLET_TYPES.has(wt)) {
        return {
            eligible: true,
            resolveAddress: user.wallet_address,
        };
    }

    if (wt === "passkey") {
        return {
            eligible: true,
            resolveAddress: user.smart_wallet_address || user.wallet_address,
        };
    }

    if (wt === "email") {
        if (user.smart_wallet_address) {
            return {
                eligible: true,
                resolveAddress: user.smart_wallet_address,
            };
        }
        return { eligible: false, reason: "Email users need a passkey signer to claim an ENS subname" };
    }

    return { eligible: false, reason: `Unknown wallet type "${wt}"` };
}

const USERNAME_REGEX = /^[a-z0-9_]{2,32}$/;

export function isValidSubname(username: string): boolean {
    return USERNAME_REGEX.test(username.toLowerCase());
}
