/**
 * Deterministic Messaging Encryption Key (MEK)
 * 
 * TRUE DETERMINISM - NO BACKUP NEEDED:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                                                                 │
 * │  Device A                              Device B                 │
 * │  ────────                              ────────                 │
 * │  Sign message with wallet              Sign SAME message        │
 * │         ↓                                    ↓                  │
 * │  Get signature (deterministic)         Get SAME signature       │
 * │         ↓                                    ↓                  │
 * │  Derive key from signature             Derive SAME key          │
 * │         ↓                                    ↓                  │
 * │  SAME KEYPAIR!                         SAME KEYPAIR!            │
 * │                                                                 │
 * │  ✅ No backup needed                                            │
 * │  ✅ No sync needed                                              │
 * │  ✅ No server storage of private keys                          │
 * │  ✅ Works automatically across all devices                      │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * HOW IT WORKS:
 * - EOA Wallet: signature = sign(deterministic_message) → ALWAYS SAME
 * - Passkey PRF: output = prf(salt) → ALWAYS SAME (with synced passkey)
 * - Use signature/PRF as seed → Deterministic X25519 keypair
 */

import { type WalletClient, type Address, hexToBytes } from "viem";
import nacl from "tweetnacl";
import { supabase } from "@/config/supabase";

// ============================================================================
// Constants & Types
// ============================================================================

const MEK_DOMAIN = "spritz.chat";
const MEK_VERSION = 3; // v3 = true deterministic
const MEK_CONTEXT = `${MEK_DOMAIN}:messaging-key:v${MEK_VERSION}`;

// Session cache (survives page navigation, cleared on refresh)
const sessionKeyCache = new Map<string, DerivedMessagingKey>();

export interface DerivedMessagingKey {
  publicKey: string;   // Base64 encoded X25519 public key
  privateKey: string;  // Base64 encoded X25519 private key
  derivedFrom: "eoa" | "passkey-prf" | "passkey-fallback" | "legacy";
}

export interface MessagingKeyResult {
  success: boolean;
  keypair?: DerivedMessagingKey;
  requiresPasskey?: boolean;
  prfNotSupported?: boolean;
  error?: string;
  isNewKey?: boolean;
}

export type AuthType = "wallet" | "passkey" | "email" | "digitalid" | "solana";

// ============================================================================
// Cache Management
// ============================================================================

export function hasCachedKey(userAddress: string): boolean {
  return sessionKeyCache.has(userAddress.toLowerCase());
}

export function getCachedKey(userAddress: string): DerivedMessagingKey | null {
  return sessionKeyCache.get(userAddress.toLowerCase()) || null;
}

export function clearCachedKey(userAddress: string): void {
  sessionKeyCache.delete(userAddress.toLowerCase());
}

export function clearAllCachedKeys(): void {
  sessionKeyCache.clear();
}

export function importKeypairToCache(
  userAddress: string,
  keypair: { publicKey: string; privateKey: string },
  source: DerivedMessagingKey["derivedFrom"] = "legacy"
): void {
  sessionKeyCache.set(userAddress.toLowerCase(), {
    ...keypair,
    derivedFrom: source,
  });
}

// ============================================================================
// Deterministic Key Derivation
// ============================================================================

/**
 * Derive a 32-byte seed from signature using HKDF
 * This ensures the seed is uniformly distributed
 */
async function deriveSeedFromSignature(
  signature: Uint8Array,
  userAddress: string
): Promise<Uint8Array> {
  // Create ArrayBuffer for SubtleCrypto
  const signatureBuffer = new ArrayBuffer(signature.length);
  new Uint8Array(signatureBuffer).set(signature);
  
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    signatureBuffer,
    "HKDF",
    false,
    ["deriveBits"]
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(MEK_CONTEXT),
      info: new TextEncoder().encode(`x25519-seed:${userAddress.toLowerCase()}`),
    },
    keyMaterial,
    256 // 32 bytes for X25519
  );
  
  return new Uint8Array(derivedBits);
}

/**
 * Generate DETERMINISTIC X25519 keypair from seed
 * 
 * TweetNaCl's box.keyPair.fromSecretKey takes a 32-byte seed
 * and deterministically generates the keypair.
 * 
 * SAME SEED = SAME KEYPAIR (always, on any device)
 */
function generateDeterministicKeypair(seed: Uint8Array): { publicKey: string; privateKey: string } {
  // TweetNaCl expects exactly 32 bytes for X25519
  if (seed.length !== 32) {
    throw new Error("Seed must be exactly 32 bytes");
  }
  
  // Generate deterministic keypair
  const keyPair = nacl.box.keyPair.fromSecretKey(seed);
  
  return {
    publicKey: btoa(String.fromCharCode(...keyPair.publicKey)),
    privateKey: btoa(String.fromCharCode(...keyPair.secretKey)),
  };
}

// ============================================================================
// Public Key Storage (Supabase) - ONLY PUBLIC KEYS
// ============================================================================

/**
 * Upload ONLY the public key to Supabase
 * Required for key exchange with other users
 */
async function uploadPublicKeyToSupabase(
  userAddress: string,
  publicKey: string
): Promise<void> {
  if (!supabase) {
    console.warn("[MessagingKey] Supabase not available");
    return;
  }
  
  try {
    await supabase
      .from("shout_user_settings")
      .upsert({
        wallet_address: userAddress.toLowerCase(),
        messaging_public_key: publicKey,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "wallet_address",
      });
    
    console.log("[MessagingKey] ✅ Public key uploaded");
  } catch (err) {
    console.warn("[MessagingKey] Failed to upload public key:", err);
  }
}

// ============================================================================
// EOA Wallet - Deterministic Key Derivation
// ============================================================================

/**
 * Deterministic signing message
 * IMPORTANT: This message must NEVER change, or keys will be different
 */
function getEoaSigningMessage(userAddress: Address): string {
  return [
    `${MEK_DOMAIN} Messaging Key`,
    "",
    "Sign this message to generate your encryption key.",
    "This key will be the same on all your devices.",
    "",
    `Account: ${userAddress.toLowerCase()}`,
    `Version: ${MEK_VERSION}`,
  ].join("\n");
}

/**
 * Derive DETERMINISTIC messaging key from EOA wallet
 * 
 * Flow:
 * 1. Sign deterministic message → Get deterministic signature
 * 2. Derive seed from signature (HKDF)
 * 3. Generate X25519 keypair from seed (deterministic)
 * 
 * RESULT: Same wallet = Same signature = Same key (on ANY device)
 */
export async function deriveMekFromEoa(
  walletClient: WalletClient,
  userAddress: Address
): Promise<MessagingKeyResult> {
  try {
    // Check session cache
    const cached = getCachedKey(userAddress);
    if (cached) {
      return { success: true, keypair: cached, isNewKey: false };
    }
    
    const message = getEoaSigningMessage(userAddress);
    
    // Get deterministic signature
    const signature = await walletClient.signMessage({
      account: userAddress,
      message,
    });
    
    // Convert signature to bytes
    const signatureBytes = hexToBytes(signature);
    
    // Derive deterministic seed
    const seed = await deriveSeedFromSignature(signatureBytes, userAddress);
    
    // Generate deterministic keypair
    const keys = generateDeterministicKeypair(seed);
    const keypair: DerivedMessagingKey = {
      ...keys,
      derivedFrom: "eoa",
    };
    
    // Upload public key to Supabase
    await uploadPublicKeyToSupabase(userAddress, keypair.publicKey);
    
    // Cache for session
    sessionKeyCache.set(userAddress.toLowerCase(), keypair);
    
    console.log("[MessagingKey] ✅ Deterministic key derived from wallet signature");
    
    return { success: true, keypair, isNewKey: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    if (errorMessage.toLowerCase().includes("reject") ||
        errorMessage.toLowerCase().includes("denied") ||
        errorMessage.toLowerCase().includes("cancelled")) {
      return { success: false, error: "Signature request was cancelled" };
    }
    
    return { success: false, error: `Failed to derive key: ${errorMessage}` };
  }
}

// ============================================================================
// Passkey PRF - Deterministic Key Derivation
// ============================================================================

function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function isPrfSupported(): boolean {
  if (typeof window === "undefined") return false;
  return typeof PublicKeyCredential !== "undefined" &&
    "getClientExtensionResults" in PublicKeyCredential.prototype;
}

/**
 * Derive DETERMINISTIC messaging key from Passkey PRF
 * 
 * Flow:
 * 1. Request PRF with deterministic salt → Get deterministic output
 * 2. Use PRF output as seed
 * 3. Generate X25519 keypair from seed (deterministic)
 * 
 * RESULT: Same passkey + same salt = Same PRF = Same key
 * Works across devices with synced passkeys (iCloud/Google)
 */
export async function deriveMekFromPasskeyPrf(
  credentialId: string,
  rpId: string,
  userAddress: string
): Promise<MessagingKeyResult> {
  try {
    // Check session cache
    const cached = getCachedKey(userAddress);
    if (cached) {
      return { success: true, keypair: cached, isNewKey: false };
    }
    
    if (!isPrfSupported()) {
      return {
        success: false,
        prfNotSupported: true,
        error: "Your browser doesn't support PRF extension",
      };
    }
    
    // Deterministic PRF salt
    const prfSalt = new TextEncoder().encode(
      `${MEK_CONTEXT}:prf-salt:${userAddress.toLowerCase()}`
    );
    
    // Request passkey with PRF extension
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId,
        allowCredentials: [{
          id: base64UrlToArrayBuffer(credentialId),
          type: "public-key" as const,
          transports: ["internal" as AuthenticatorTransport],
        }],
        userVerification: "required",
        extensions: {
          prf: {
            eval: { first: prfSalt },
          },
        },
      },
    }) as PublicKeyCredential | null;
    
    if (!credential) {
      return { success: false, error: "Passkey authentication cancelled" };
    }
    
    // Extract PRF result
    const extensionResults = credential.getClientExtensionResults() as {
      prf?: { results?: { first?: ArrayBuffer } };
    };
    
    if (!extensionResults.prf?.results?.first) {
      return {
        success: false,
        prfNotSupported: true,
        error: "Your passkey doesn't support PRF",
      };
    }
    
    // PRF output is our deterministic seed
    let seed = new Uint8Array(extensionResults.prf.results.first);
    
    // Ensure seed is exactly 32 bytes
    if (seed.length !== 32) {
      // Hash to get 32 bytes if different size
      const hashBuffer = await crypto.subtle.digest("SHA-256", seed);
      seed = new Uint8Array(hashBuffer);
    }
    
    // Generate deterministic keypair
    const keys = generateDeterministicKeypair(seed);
    const keypair: DerivedMessagingKey = {
      ...keys,
      derivedFrom: "passkey-prf",
    };
    
    // Upload public key
    await uploadPublicKeyToSupabase(userAddress, keypair.publicKey);
    
    // Cache for session
    sessionKeyCache.set(userAddress.toLowerCase(), keypair);
    
    console.log("[MessagingKey] ✅ Deterministic key derived from passkey PRF");
    
    return { success: true, keypair, isNewKey: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    if (errorMessage.toLowerCase().includes("abort") ||
        errorMessage.toLowerCase().includes("cancel") ||
        errorMessage.includes("NotAllowedError")) {
      return { success: false, error: "Passkey authentication cancelled" };
    }
    
    return { success: false, error: `Passkey error: ${errorMessage}` };
  }
}

/**
 * Fallback for passkeys without PRF support
 * 
 * NOTE: This is NOT fully deterministic because WebAuthn signatures
 * include a counter. Users should use PRF-compatible passkeys.
 */
export async function deriveMekFromPasskeySignature(
  credentialId: string,
  rpId: string,
  userAddress: string
): Promise<MessagingKeyResult> {
  try {
    const cached = getCachedKey(userAddress);
    if (cached) {
      return { success: true, keypair: cached, isNewKey: false };
    }
    
    // Just authenticate (we can't get deterministic output without PRF)
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId,
        allowCredentials: [{
          id: base64UrlToArrayBuffer(credentialId),
          type: "public-key" as const,
          transports: ["internal" as AuthenticatorTransport],
        }],
        userVerification: "required",
      },
    }) as PublicKeyCredential | null;
    
    if (!credential) {
      return { success: false, error: "Passkey authentication cancelled" };
    }
    
    // Without PRF, we generate a random key (NOT deterministic)
    // User will need manual backup for cross-device
    console.warn("[MessagingKey] ⚠️ PRF not supported - key is NOT deterministic");
    
    const randomSeed = crypto.getRandomValues(new Uint8Array(32));
    const keys = generateDeterministicKeypair(randomSeed);
    const keypair: DerivedMessagingKey = {
      ...keys,
      derivedFrom: "passkey-fallback",
    };
    
    await uploadPublicKeyToSupabase(userAddress, keypair.publicKey);
    sessionKeyCache.set(userAddress.toLowerCase(), keypair);
    
    return { success: true, keypair, isNewKey: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: `Passkey error: ${errorMessage}` };
  }
}

// ============================================================================
// Unified Key Derivation
// ============================================================================

export interface GetMessagingKeyParams {
  authType: AuthType;
  userAddress: string;
  walletClient?: WalletClient;
  passkeyCredentialId?: string;
  rpId?: string;
  hasPasskey?: boolean;
}

/**
 * Unified deterministic key derivation
 */
export async function getOrDeriveMessagingKey(
  params: GetMessagingKeyParams
): Promise<MessagingKeyResult> {
  const {
    authType,
    userAddress,
    walletClient,
    passkeyCredentialId,
    rpId,
    hasPasskey,
  } = params;
  
  // Check cache
  const cached = getCachedKey(userAddress);
  if (cached) {
    return { success: true, keypair: cached, isNewKey: false };
  }
  
  switch (authType) {
    case "wallet":
      if (!walletClient) {
        return { success: false, error: "Wallet not connected" };
      }
      return deriveMekFromEoa(walletClient, userAddress as Address);
    
    case "passkey":
      if (!passkeyCredentialId || !rpId) {
        return { success: false, error: "Passkey credentials required" };
      }
      // Try PRF first (deterministic), fallback to signature (not deterministic)
      const prfResult = await deriveMekFromPasskeyPrf(passkeyCredentialId, rpId, userAddress);
      if (prfResult.success) return prfResult;
      if (prfResult.prfNotSupported) {
        console.log("[MessagingKey] PRF not supported, using fallback");
        return deriveMekFromPasskeySignature(passkeyCredentialId, rpId, userAddress);
      }
      return prfResult;
    
    case "email":
    case "digitalid":
    case "solana":
      if (hasPasskey && passkeyCredentialId && rpId) {
        const result = await deriveMekFromPasskeyPrf(passkeyCredentialId, rpId, userAddress);
        if (result.success) return result;
        if (result.prfNotSupported) {
          return deriveMekFromPasskeySignature(passkeyCredentialId, rpId, userAddress);
        }
        return result;
      }
      return {
        success: false,
        requiresPasskey: true,
        error: "Add a passkey to enable secure messaging",
      };
    
    default:
      return { success: false, error: "Unknown auth type" };
  }
}

export function exportSessionKey(userAddress: string): DerivedMessagingKey | null {
  return getCachedKey(userAddress);
}
