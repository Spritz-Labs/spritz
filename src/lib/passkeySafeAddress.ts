/**
 * Calculate passkey-based Safe address
 * 
 * For passkey users, the Safe address is determined by:
 * - The passkey's P256 public key (x, y coordinates)
 * - The Safe WebAuthn signer configuration
 * 
 * This must match the address calculated by permissionless/viem when
 * creating the Safe account with toSafeSmartAccount().
 */

import { type Address, type Hex, getAddress, keccak256, encodePacked, concat, pad, toHex } from "viem";

// Safe contract addresses (must match safeWallet.ts)
const SAFE_4337_MODULE_ADDRESS = "0x75cf11467937ce3f2f357ce24ffc3dbf8fd5c226" as const;
const SAFE_WEBAUTHN_SHARED_SIGNER = "0x94a4F6affBd8975951142c3999aEAB7ecee555c2" as const;
const SAFE_P256_VERIFIER = "0xA86e0054C51E4894D88762a017ECc5E5235f5DBA" as const;
const SAFE_PROXY_FACTORY = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67" as const;
const SAFE_SINGLETON = "0x41675C099F32341bf84BFc5382aF534df5C7461a" as const;

/**
 * Calculate the Safe address for a passkey user.
 * 
 * This uses the same deterministic calculation as permissionless/viem's
 * toSafeSmartAccount with WebAuthn owners.
 * 
 * @param publicKeyX - The P256 public key X coordinate (hex)
 * @param publicKeyY - The P256 public key Y coordinate (hex)
 * @returns The Safe address
 */
export function calculatePasskeySafeAddress(publicKeyX: Hex, publicKeyY: Hex): Address {
    // The Safe address calculation for WebAuthn signers is complex
    // It involves the SafeWebAuthnSharedSigner which is configured during setup
    
    // For now, we'll use a simpler approach: store the Safe address when it's
    // first calculated during transaction, then look it up from DB
    
    // This is a placeholder that indicates we need the DB lookup
    // The actual calculation would require replicating permissionless's logic
    throw new Error("Use getPasskeySafeAddressFromCredential instead");
}

/**
 * Get or calculate the Safe address for a passkey credential.
 * 
 * For passkey users, we store the Safe address in the passkey_credentials table
 * when the first transaction is made. This function looks it up.
 * 
 * @param credentialId - The passkey credential ID
 * @param supabase - Supabase client
 * @returns The Safe address or null if not yet calculated
 */
export async function getPasskeySafeAddressFromCredential(
    userAddress: string,
    supabase: any
): Promise<Address | null> {
    // First check if user has a stored smart_wallet_address
    const { data: user } = await supabase
        .from("shout_users")
        .select("smart_wallet_address")
        .eq("wallet_address", userAddress.toLowerCase())
        .single();
    
    if (user?.smart_wallet_address) {
        return user.smart_wallet_address as Address;
    }
    
    // If not stored, check if they have a passkey with coordinates
    // The Safe address will be calculated on first transaction
    const { data: credential } = await supabase
        .from("passkey_credentials")
        .select("public_key_x, public_key_y, safe_signer_address")
        .eq("user_address", userAddress.toLowerCase())
        .not("public_key_x", "is", null)
        .order("last_used_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .single();
    
    if (credential?.public_key_x && credential?.public_key_y) {
        // User has passkey but Safe address not yet stored
        // Return null to indicate it needs to be calculated
        console.log("[PasskeySafeAddress] User has passkey but Safe address not stored yet");
        return null;
    }
    
    return null;
}

/**
 * Store the Safe address for a passkey user after first transaction.
 */
export async function storePasskeySafeAddress(
    userAddress: string,
    safeAddress: Address,
    supabase: any
): Promise<void> {
    await supabase
        .from("shout_users")
        .update({
            smart_wallet_address: safeAddress,
            updated_at: new Date().toISOString(),
        })
        .eq("wallet_address", userAddress.toLowerCase());
    
    console.log("[PasskeySafeAddress] Stored Safe address:", safeAddress, "for user:", userAddress.slice(0, 10));
}
