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
  derivedFrom: "eoa" | "passkey-prf" | "passkey-fallback" | "pin" | "legacy";
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
 * Upload public key AND key source to Supabase
 * Required for key exchange with other users and cross-device key source detection
 */
async function uploadPublicKeyToSupabase(
  userAddress: string,
  publicKey: string,
  keySource?: DerivedMessagingKey["derivedFrom"]
): Promise<void> {
  if (!supabase) {
    console.warn("[MessagingKey] Supabase not available");
    return;
  }
  
  try {
    const upsertData: Record<string, unknown> = {
      wallet_address: userAddress.toLowerCase(),
      messaging_public_key: publicKey,
      updated_at: new Date().toISOString(),
    };
    
    if (keySource) {
      upsertData.messaging_key_source = keySource;
    }
    
    await supabase
      .from("shout_user_settings")
      .upsert(upsertData, {
        onConflict: "wallet_address",
      });
    
    console.log("[MessagingKey] ✅ Public key uploaded (source:", keySource || "unknown", ")");
  } catch (err) {
    console.warn("[MessagingKey] Failed to upload public key:", err);
  }
}

/**
 * Check Supabase for the remote key source of a user
 * Used to detect cross-device key type (e.g., user set up PIN on another device)
 */
export async function getRemoteKeySource(
  userAddress: string
): Promise<{ source: DerivedMessagingKey["derivedFrom"] | null; hasKey: boolean }> {
  if (!supabase) {
    return { source: null, hasKey: false };
  }
  
  try {
    const { data, error } = await supabase
      .from("shout_user_settings")
      .select("messaging_public_key, messaging_key_source")
      .eq("wallet_address", userAddress.toLowerCase())
      .single();
    
    if (error || !data?.messaging_public_key) {
      return { source: null, hasKey: false };
    }
    
    return {
      source: (data.messaging_key_source as DerivedMessagingKey["derivedFrom"]) || null,
      hasKey: true,
    };
  } catch {
    return { source: null, hasKey: false };
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
    await uploadPublicKeyToSupabase(userAddress, keypair.publicKey, "eoa");
    
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
    
    // Normalize rpId - use parent domain for subdomains
    let effectiveRpId = rpId;
    if (rpId.includes("spritz.chat")) {
      effectiveRpId = "spritz.chat";
    } else if (rpId === "localhost" || rpId === "127.0.0.1") {
      effectiveRpId = "localhost";
    }
    
    console.log("[MessagingKey] Requesting passkey PRF with rpId:", effectiveRpId);
    
    // Request passkey with PRF extension
    // Don't specify allowCredentials - let user choose from ALL their passkeys for this site
    // This matches the login/signing behavior and provides better UX
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: effectiveRpId,
        // No allowCredentials = browser shows picker with all available passkeys
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
    await uploadPublicKeyToSupabase(userAddress, keypair.publicKey, "passkey-prf");
    
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
    
    // Normalize rpId - use parent domain for subdomains
    let effectiveRpId = rpId;
    if (rpId.includes("spritz.chat")) {
      effectiveRpId = "spritz.chat";
    } else if (rpId === "localhost" || rpId === "127.0.0.1") {
      effectiveRpId = "localhost";
    }
    
    console.log("[MessagingKey] Requesting passkey signature with rpId:", effectiveRpId);
    
    // Just authenticate (we can't get deterministic output without PRF)
    // Don't specify allowCredentials - let user choose from ALL their passkeys for this site
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: effectiveRpId,
        // No allowCredentials = browser shows picker with all available passkeys
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
    
    await uploadPublicKeyToSupabase(userAddress, keypair.publicKey, "passkey-fallback");
    sessionKeyCache.set(userAddress.toLowerCase(), keypair);
    
    return { success: true, keypair, isNewKey: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: `Passkey error: ${errorMessage}` };
  }
}

// ============================================================================
// PIN-Based Key Derivation (for users without passkey/wallet)
// ============================================================================

const PIN_SALT_STORAGE = "spritz_pin_salt";
const PIN_PBKDF2_ITERATIONS = 600_000; // OWASP 2023 recommendation for SHA-256

/**
 * Check if user has set up a PIN for messaging encryption
 */
export function hasPinSetup(userAddress: string): boolean {
  if (typeof window === "undefined") return false;
  const salt = localStorage.getItem(`${PIN_SALT_STORAGE}:${userAddress.toLowerCase()}`);
  return !!salt;
}

/**
 * Get the stored PIN verification hash (to verify PIN on re-entry)
 */
function getPinVerificationHash(userAddress: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(`${PIN_SALT_STORAGE}:${userAddress.toLowerCase()}`);
}

/**
 * Store PIN verification hash in localStorage
 */
function storePinVerificationHash(userAddress: string, hash: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${PIN_SALT_STORAGE}:${userAddress.toLowerCase()}`, hash);
}

/**
 * Clear stored PIN data
 */
export function clearPinData(userAddress: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(`${PIN_SALT_STORAGE}:${userAddress.toLowerCase()}`);
}

/**
 * Derive DETERMINISTIC messaging key from a user-chosen PIN
 * 
 * Flow:
 * 1. PIN + userAddress → HKDF seed (deterministic)
 * 2. Seed → X25519 keypair (deterministic)
 * 
 * RESULT: Same PIN + Same address = Same key (on ANY device, if they remember their PIN)
 * 
 * Security: Much stronger than legacy (address-only) because attacker needs the PIN.
 * The PIN is never stored — only a verification hash to detect wrong PINs.
 */
export async function deriveMekFromPin(
  pin: string,
  userAddress: string
): Promise<MessagingKeyResult> {
  try {
    if (!pin || pin.length < 6 || !/^\d+$/.test(pin)) {
      return { success: false, error: "PIN must be at least 6 digits (numbers only)" };
    }

    // Check session cache
    const cached = getCachedKey(userAddress);
    if (cached) {
      return { success: true, keypair: cached, isNewKey: false };
    }

    // Use PBKDF2 with 600k iterations for brute-force resistance
    // This makes each PIN guess take ~100ms, so 10^6 guesses ≈ 28 hours
    const pinKeyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(pin),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    
    const pbkdf2Salt = new TextEncoder().encode(
      `${MEK_CONTEXT}:pin-salt:${userAddress.toLowerCase()}`
    );
    
    const pinBytes = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          salt: pbkdf2Salt,
          iterations: PIN_PBKDF2_ITERATIONS,
        },
        pinKeyMaterial,
        256 // 32 bytes
      )
    );

    // Derive seed via HKDF for domain separation
    const seed = await deriveSeedFromSignature(pinBytes, userAddress);

    // Generate deterministic keypair
    const keys = generateDeterministicKeypair(seed);
    const keypair: DerivedMessagingKey = {
      ...keys,
      derivedFrom: "pin",
    };

    // Store a verification hash so we can check if PIN is correct on re-entry
    // This hash is of (PIN + address + public key), NOT the PIN alone
    // Brute-forcing this hash still requires PBKDF2 per attempt (to derive the public key)
    const verifyInput = new TextEncoder().encode(
      `${MEK_CONTEXT}:pin-verify:${userAddress.toLowerCase()}:${keypair.publicKey}`
    );
    const verifyHash = await crypto.subtle.digest("SHA-256", verifyInput);
    const verifyHex = Array.from(new Uint8Array(verifyHash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    storePinVerificationHash(userAddress, verifyHex);

    // Upload public key to Supabase
    await uploadPublicKeyToSupabase(userAddress, keypair.publicKey, "pin");

    // Cache for session
    sessionKeyCache.set(userAddress.toLowerCase(), keypair);

    console.log("[MessagingKey] PIN-derived key generated (PBKDF2-hardened)");

    return { success: true, keypair, isNewKey: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: `PIN key error: ${errorMessage}` };
  }
}

/**
 * Verify a PIN against the stored verification hash
 * Returns true if PIN matches, false if wrong, null if no PIN is set up
 */
export async function verifyPin(
  pin: string,
  userAddress: string
): Promise<boolean | null> {
  const storedHash = getPinVerificationHash(userAddress);
  if (!storedHash) return null; // No PIN set up yet

  // Re-derive the key using the same PBKDF2 path to get public key for verification
  const pinKeyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  
  const pbkdf2Salt = new TextEncoder().encode(
    `${MEK_CONTEXT}:pin-salt:${userAddress.toLowerCase()}`
  );
  
  const pinBytes = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: pbkdf2Salt,
        iterations: PIN_PBKDF2_ITERATIONS,
      },
      pinKeyMaterial,
      256
    )
  );
  
  const seed = await deriveSeedFromSignature(pinBytes, userAddress);
  const keys = generateDeterministicKeypair(seed);

  const verifyInput = new TextEncoder().encode(
    `${MEK_CONTEXT}:pin-verify:${userAddress.toLowerCase()}:${keys.publicKey}`
  );
  const verifyHash = await crypto.subtle.digest("SHA-256", verifyInput);
  const verifyHex = Array.from(new Uint8Array(verifyHash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return verifyHex === storedHash;
}

/**
 * Verify a PIN against the public key stored in Supabase (for cross-device unlock)
 * Used when a user set up a PIN on one device and is unlocking on another
 * Returns true if the PIN derives the same public key, false if wrong
 */
export async function verifyPinAgainstRemote(
  pin: string,
  userAddress: string
): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    // Get the public key from Supabase
    const { data, error } = await supabase
      .from("shout_user_settings")
      .select("messaging_public_key")
      .eq("wallet_address", userAddress.toLowerCase())
      .single();
    
    if (error || !data?.messaging_public_key) return false;
    
    // Derive what the public key WOULD be with this PIN
    const pinKeyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(pin),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    
    const pbkdf2Salt = new TextEncoder().encode(
      `${MEK_CONTEXT}:pin-salt:${userAddress.toLowerCase()}`
    );
    
    const pinBytes = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          salt: pbkdf2Salt,
          iterations: PIN_PBKDF2_ITERATIONS,
        },
        pinKeyMaterial,
        256
      )
    );
    
    const seed = await deriveSeedFromSignature(pinBytes, userAddress);
    const keys = generateDeterministicKeypair(seed);
    
    // Compare derived public key with Supabase public key
    return keys.publicKey === data.messaging_public_key;
  } catch {
    return false;
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
  pin?: string;
  /** Key source from Supabase — used to prevent cross-device key conflicts */
  remoteKeySource?: DerivedMessagingKey["derivedFrom"] | null;
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
    case "solana": {
      const existingSourceIsPin = 
        params.remoteKeySource === "pin" || hasPinSetup(userAddress);
      
      // PRIORITY: If user already has a PIN-derived key (locally or remotely),
      // ALWAYS use PIN — even if they also have a passkey on this device.
      // This prevents passkey from overwriting the PIN key and breaking other devices.
      if (existingSourceIsPin) {
        if (params.pin) {
          return deriveMekFromPin(params.pin, userAddress);
        }
        return {
          success: false,
          requiresPasskey: false,
          error: "Enter your PIN to unlock messaging",
        };
      }
      
      // No PIN exists — try passkey (only safe if no PIN key was ever established)
      if (hasPasskey && passkeyCredentialId && rpId) {
        // Double-check remote: if remote source is passkey, it's safe to use passkey
        // If remote source is null/unknown, this is the first key — passkey is fine
        const result = await deriveMekFromPasskeyPrf(passkeyCredentialId, rpId, userAddress);
        if (result.success) return result;
        if (result.prfNotSupported) {
          return deriveMekFromPasskeySignature(passkeyCredentialId, rpId, userAddress);
        }
        return result;
      }
      
      // Fall back to PIN if provided (new setup)
      if (params.pin) {
        return deriveMekFromPin(params.pin, userAddress);
      }
      
      // No key exists yet — prompt user to set up
      return {
        success: false,
        requiresPasskey: !hasPasskey,
        error: hasPasskey 
          ? "Authenticate with your passkey to enable secure messaging"
          : "Set up a PIN or add a passkey to enable secure messaging",
      };
    }
    
    default:
      return { success: false, error: "Unknown auth type" };
  }
}

export function exportSessionKey(userAddress: string): DerivedMessagingKey | null {
  return getCachedKey(userAddress);
}
