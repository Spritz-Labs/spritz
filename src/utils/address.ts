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

/**
 * Formats an address for display (truncated)
 * @param address - The full address to format
 * @param startChars - Number of characters to show at start (default 6)
 * @param endChars - Number of characters to show at end (default 4)
 */
export function formatAddress(address: string, startChars = 6, endChars = 4): string {
    if (!address) return "";
    if (address.length <= startChars + endChars) return address;
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * User info type for display name resolution
 */
export type UserDisplayInfo = {
    address: string;
    ensName?: string | null;
    username?: string | null;
    nickname?: string | null;
};

/**
 * Gets the display name for a user following priority:
 * 1. ENS name (if available)
 * 2. Spritz username with @ prefix (if available)
 * 3. Formatted address (fallback)
 * 
 * Note: Local nicknames are handled separately in FriendsList
 * as they are user-specific overrides, not global display names.
 * 
 * @param user - User info object with address, ensName, and username
 * @param includeNickname - Whether to include nickname as highest priority (default false)
 */
export function getDisplayName(
    user: UserDisplayInfo,
    includeNickname = false
): string {
    if (!user?.address) return "Unknown";
    
    // Local nickname takes highest priority when explicitly requested
    if (includeNickname && user.nickname) {
        return user.nickname;
    }
    
    // ENS name is first priority for public display
    if (user.ensName) {
        return user.ensName;
    }
    
    // Spritz username is second priority
    if (user.username) {
        return `@${user.username}`;
    }
    
    // Fallback to formatted address
    return formatAddress(user.address);
}

/**
 * Gets the secondary display text (what to show beneath the main name)
 * Shows ENS or username if not already displayed in primary name
 * 
 * @param user - User info object
 * @param primaryName - The primary display name being shown
 */
export function getSecondaryDisplayText(
    user: UserDisplayInfo,
    primaryName?: string
): string | null {
    const primary = primaryName || getDisplayName(user);
    const parts: string[] = [];
    
    // Show username if not in primary
    if (user.username && !primary.includes(user.username)) {
        parts.push(`@${user.username}`);
    }
    
    // Show ENS if not in primary
    if (user.ensName && !primary.includes(user.ensName)) {
        parts.push(user.ensName);
    }
    
    // Always include truncated address if primary isn't showing it
    if (!primary.includes("...") && !primary.includes("0x")) {
        parts.push(formatAddress(user.address));
    }
    
    return parts.length > 0 ? parts.join(" • ") : null;
}





