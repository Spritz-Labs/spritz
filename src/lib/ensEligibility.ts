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

export type ResolveTarget = "eoa" | "smart_account";

export interface CheckEnsOptions {
    /**
     * When true (via ENS_SUBNAME_EOA_ONLY), only external wallets (EOA) may claim.
     * Blocks passkey / email smart-account names until wallet UX is GA.
     */
    eoaOnlyClaims?: boolean;
}

/** User-facing copy: where funds go + recovery expectations (no fake “export private key” for AA). */
export function getEnsFundsCopy(user: Pick<UserRow, "wallet_type">): {
    resolveTarget: ResolveTarget;
    fundsNotice: string;
} {
    const wt = (user.wallet_type || "wallet").toLowerCase();
    const resolveTarget: ResolveTarget =
        wt === "wallet" || wt === "evm" ? "eoa" : "smart_account";
    const fundsNotice =
        resolveTarget === "eoa"
            ? "Funds sent to this name go to your connected wallet (EOA). Only share it with people you trust, and verify the resolved address before large transfers."
            : "Funds sent to this name go to your Spritz smart account (beta). Moving assets may require gas to activate the account. Recovery is your passkey / account security — smart accounts do not have an exportable private key like an EOA.";
    return { resolveTarget, fundsNotice };
}

export function checkEnsEligibility(user: UserRow, options?: CheckEnsOptions): EligibilityResult {
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

    if (options?.eoaOnlyClaims && !ELIGIBLE_WALLET_TYPES.has(wt)) {
        return {
            eligible: false,
            reason:
                "Spritz Wallet is still in beta. ENS subnames are limited to external wallets (EOA) for now so funds land in a standard wallet you control. Smart-account (passkey / email) names will return when wallet funding is generally available.",
        };
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
