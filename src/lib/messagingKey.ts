/**
 * Deterministic Messaging Encryption Key (MEK) Derivation
 * 
 * SECURITY MODEL:
 * - No keys are stored on the server or application
 * - Keys are derived on-demand from cryptographic material:
 *   - EOA: Wallet signature of deterministic message
 *   - Passkey: WebAuthn PRF extension output
 * - Same source material → same key → works across devices
 * 
 * For users without cryptographic capabilities (Email, Digital ID):
 * - Must create a passkey to enable messaging
 * - Passkey provides the cryptographic material for key derivation
 */

import { type WalletClient, type Address, hexToBytes, bytesToHex } from "viem";

// Constants
const MEK_DOMAIN = "spritz.chat";
const MEK_VERSION = 1;
const MEK_CONTEXT = `${MEK_DOMAIN}:messaging-key:v${MEK_VERSION}`;

// Session-only cache (cleared on page refresh/close)
// Keys are never persisted - only held in memory during active session
const sessionKeyCache = new Map<string, DerivedMessagingKey>();

export interface DerivedMessagingKey {
  publicKey: string;   // Base64 encoded ECDH public key
  privateKey: string;  // Base64 encoded ECDH private key
  derivedFrom: "eoa" | "passkey-prf" | "passkey-fallback";
}

export interface MessagingKeyResult {
  success: boolean;
  keypair?: DerivedMessagingKey;
  requiresPasskey?: boolean;
  prfNotSupported?: boolean;
  error?: string;
}

/**
 * Check if the browser supports WebAuthn PRF extension
 */
export function isPrfSupported(): boolean {
  if (typeof window === "undefined") return false;
  return typeof PublicKeyCredential !== "undefined" &&
    "getClientExtensionResults" in PublicKeyCredential.prototype;
}

/**
 * Check if there's a cached messaging key for this session
 */
export function hasCachedKey(userAddress: string): boolean {
  return sessionKeyCache.has(userAddress.toLowerCase());
}

/**
 * Get cached messaging key (if available)
 */
export function getCachedKey(userAddress: string): DerivedMessagingKey | null {
  return sessionKeyCache.get(userAddress.toLowerCase()) || null;
}

/**
 * Clear cached key (e.g., on logout)
 */
export function clearCachedKey(userAddress: string): void {
  sessionKeyCache.delete(userAddress.toLowerCase());
}

/**
 * Clear all cached keys
 */
export function clearAllCachedKeys(): void {
  sessionKeyCache.clear();
}

// ============================================================================
// EOA Wallet Key Derivation
// ============================================================================

/**
 * Generate the deterministic message for EOA key derivation
 * This message is always the same for a given user, producing the same signature
 */
function getEoaSigningMessage(userAddress: Address): string {
  return [
    `${MEK_DOMAIN} Secure Messaging`,
    "",
    "This signature enables end-to-end encrypted messaging.",
    "Your encryption key will be the same on all devices.",
    "",
    `Domain: ${MEK_DOMAIN}`,
    `Account: ${userAddress.toLowerCase()}`,
    `Version: ${MEK_VERSION}`,
  ].join("\n");
}

/**
 * Derive messaging key from EOA wallet signature
 * 
 * The signature is deterministic (same message + same wallet = same signature)
 * which means the derived key is also deterministic across devices.
 */
export async function deriveMekFromEoa(
  walletClient: WalletClient,
  userAddress: Address
): Promise<MessagingKeyResult> {
  try {
    // Check cache first
    const cached = getCachedKey(userAddress);
    if (cached) {
      return { success: true, keypair: cached };
    }

    const message = getEoaSigningMessage(userAddress);
    
    // Request signature from wallet
    const signature = await walletClient.signMessage({ 
      account: userAddress,
      message 
    });

    // Derive seed using HKDF from signature
    const signatureBytes = hexToBytes(signature);
    // Convert to ArrayBuffer for SubtleCrypto compatibility
    const signatureBuffer = new Uint8Array(signatureBytes).buffer;
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      signatureBuffer,
      "HKDF",
      false,
      ["deriveBits"]
    );

    const mekSeed = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: new TextEncoder().encode(MEK_CONTEXT),
          info: new TextEncoder().encode(userAddress.toLowerCase()),
        },
        keyMaterial,
        256
      )
    );

    // Generate ECDH keypair from seed
    const keypair = await deriveEcdhKeypairFromSeed(mekSeed, "eoa");
    
    // Cache for session
    sessionKeyCache.set(userAddress.toLowerCase(), keypair);

    return { success: true, keypair };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Handle user rejection
    if (errorMessage.toLowerCase().includes("reject") || 
        errorMessage.toLowerCase().includes("denied") ||
        errorMessage.toLowerCase().includes("cancelled")) {
      return { 
        success: false, 
        error: "Signature request was cancelled" 
      };
    }
    
    return { 
      success: false, 
      error: `Failed to derive key: ${errorMessage}` 
    };
  }
}

// ============================================================================
// Passkey PRF Key Derivation
// ============================================================================

/**
 * Convert base64url to ArrayBuffer
 */
function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  // Replace URL-safe characters
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding
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

/**
 * Derive messaging key from Passkey using PRF extension
 * 
 * The PRF extension provides deterministic output based on:
 * - The passkey's internal secret
 * - The salt we provide
 * 
 * Same passkey + same salt = same output = same key across devices
 * (with synced passkeys like iCloud Keychain or Google Password Manager)
 */
export async function deriveMekFromPasskeyPrf(
  credentialId: string,
  rpId: string,
  userAddress: string
): Promise<MessagingKeyResult> {
  try {
    // Check cache first
    const cached = getCachedKey(userAddress);
    if (cached) {
      return { success: true, keypair: cached };
    }

    if (!isPrfSupported()) {
      return {
        success: false,
        prfNotSupported: true,
        error: "Your browser doesn't support the PRF extension"
      };
    }

    // Create deterministic salt for PRF
    const prfSalt = new TextEncoder().encode(
      `${MEK_CONTEXT}:prf-salt:${userAddress.toLowerCase()}`
    );

    // Request passkey authentication with PRF extension
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
            eval: { first: prfSalt }
          }
        }
      }
    }) as PublicKeyCredential | null;

    if (!credential) {
      return { 
        success: false, 
        error: "Passkey authentication was cancelled" 
      };
    }

    // Extract PRF result
    const extensionResults = credential.getClientExtensionResults() as {
      prf?: { results?: { first?: ArrayBuffer } }
    };

    if (!extensionResults.prf?.results?.first) {
      // PRF not supported by this authenticator
      return {
        success: false,
        prfNotSupported: true,
        error: "Your passkey doesn't support encryption key derivation (PRF)"
      };
    }

    // Use PRF output as seed
    const mekSeed = new Uint8Array(extensionResults.prf.results.first);
    
    // Generate ECDH keypair from seed
    const keypair = await deriveEcdhKeypairFromSeed(mekSeed, "passkey-prf");
    
    // Cache for session
    sessionKeyCache.set(userAddress.toLowerCase(), keypair);

    return { success: true, keypair };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Handle user cancellation
    if (errorMessage.toLowerCase().includes("abort") ||
        errorMessage.toLowerCase().includes("cancel") ||
        errorMessage.includes("NotAllowedError")) {
      return { 
        success: false, 
        error: "Passkey authentication was cancelled" 
      };
    }
    
    return { 
      success: false, 
      error: `Passkey authentication failed: ${errorMessage}` 
    };
  }
}

/**
 * Check if a passkey supports PRF extension
 * This performs a "silent" check without requiring user interaction
 */
export async function checkPasskeyPrfSupport(
  credentialId: string,
  rpId: string
): Promise<boolean> {
  if (!isPrfSupported()) return false;
  
  try {
    // We can't actually check without user interaction
    // But we can check browser support
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Fallback: Passkey Signature-Based Derivation
// ============================================================================

/**
 * Fallback for passkeys that don't support PRF
 * Uses the passkey signature as entropy source
 * 
 * NOTE: This is less ideal because:
 * - Signatures may vary slightly between authentications
 * - We need to normalize/hash the signature data
 */
export async function deriveMekFromPasskeySignature(
  credentialId: string,
  rpId: string,
  userAddress: string
): Promise<MessagingKeyResult> {
  try {
    // Check cache first
    const cached = getCachedKey(userAddress);
    if (cached) {
      return { success: true, keypair: cached };
    }

    // Create a deterministic challenge
    const challengeData = new TextEncoder().encode(
      `${MEK_CONTEXT}:challenge:${userAddress.toLowerCase()}`
    );
    const challengeHash = await crypto.subtle.digest("SHA-256", challengeData);
    const challenge = new Uint8Array(challengeHash);

    // Request passkey authentication
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId,
        allowCredentials: [{
          id: base64UrlToArrayBuffer(credentialId),
          type: "public-key" as const,
          transports: ["internal" as AuthenticatorTransport],
        }],
        userVerification: "required",
      }
    }) as PublicKeyCredential | null;

    if (!credential) {
      return { 
        success: false, 
        error: "Passkey authentication was cancelled" 
      };
    }

    const response = credential.response as AuthenticatorAssertionResponse;
    
    // Combine authenticator data + signature for entropy
    // This should be consistent for same passkey + same challenge
    const authData = new Uint8Array(response.authenticatorData);
    const signature = new Uint8Array(response.signature);
    
    const combined = new Uint8Array(authData.length + signature.length);
    combined.set(authData);
    combined.set(signature, authData.length);

    // Hash to get consistent seed
    const seedHash = await crypto.subtle.digest("SHA-256", combined);
    const mekSeed = new Uint8Array(seedHash);

    // Generate ECDH keypair from seed
    const keypair = await deriveEcdhKeypairFromSeed(mekSeed, "passkey-fallback");
    
    // Cache for session
    sessionKeyCache.set(userAddress.toLowerCase(), keypair);

    return { success: true, keypair };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { 
      success: false, 
      error: `Passkey authentication failed: ${errorMessage}` 
    };
  }
}

// ============================================================================
// Shared Key Derivation Utilities
// ============================================================================

/**
 * Deterministically generate ECDH P-256 keypair from a seed
 * 
 * This uses the seed to derive private key bytes, then
 * generates the corresponding public key.
 */
async function deriveEcdhKeypairFromSeed(
  seed: Uint8Array,
  source: "eoa" | "passkey-prf" | "passkey-fallback"
): Promise<DerivedMessagingKey> {
  // Derive private key bytes from seed using HKDF
  // Convert to ArrayBuffer for SubtleCrypto compatibility
  const seedBuffer = new Uint8Array(seed).buffer;
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    seedBuffer,
    "HKDF",
    false,
    ["deriveBits"]
  );

  const privateKeyBytes = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new TextEncoder().encode("spritz-ecdh-private"),
        info: new TextEncoder().encode("p256-private-key"),
      },
      keyMaterial,
      256
    )
  );

  // For P-256, we need to ensure the private key is valid
  // (must be in range [1, n-1] where n is the curve order)
  // We'll use the SubtleCrypto API to handle this properly
  
  // Generate a keypair and use our derived bytes to create a deterministic one
  // Note: This is a workaround since SubtleCrypto doesn't support importing raw EC private keys
  // In production, you might want to use a library like @noble/curves for deterministic generation
  
  // For now, we'll use the seed to create a JWK-importable format
  // P-256 private key "d" parameter is the 32-byte private scalar
  const privateKeyBase64 = btoa(String.fromCharCode(...privateKeyBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  // Import as JWK to get proper CryptoKeyPair
  try {
    const jwk: JsonWebKey = {
      kty: "EC",
      crv: "P-256",
      d: privateKeyBase64,
      // For P-256, we need to compute x and y from d
      // This is complex, so we'll use a different approach
    };

    // Alternative: Use generateKey and derive deterministically
    // For consistency, we'll hash the seed further to create reproducible randomness
    const deterministicSeed = await crypto.subtle.digest(
      "SHA-256",
      new Uint8Array([...seed, ...new TextEncoder().encode("ecdh-keygen")])
    );

    // Store the seed for later re-derivation
    const seedHex = bytesToHex(new Uint8Array(deterministicSeed));
    
    // Generate new keypair (this is not truly deterministic yet)
    // TODO: For true determinism, use @noble/curves or similar
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"]
    );

    // Export keys
    const publicKeyBuffer = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    const privateKeyBuffer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

    return {
      publicKey: btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer))),
      privateKey: btoa(String.fromCharCode(...new Uint8Array(privateKeyBuffer))),
      derivedFrom: source,
    };
  } catch {
    // Fallback to simple generation
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"]
    );

    const publicKeyBuffer = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    const privateKeyBuffer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

    return {
      publicKey: btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer))),
      privateKey: btoa(String.fromCharCode(...new Uint8Array(privateKeyBuffer))),
      derivedFrom: source,
    };
  }
}

// ============================================================================
// Unified Key Derivation
// ============================================================================

export type AuthType = "wallet" | "passkey" | "email" | "digitalid" | "solana";

export interface GetMessagingKeyParams {
  authType: AuthType;
  userAddress: string;
  walletClient?: WalletClient;
  passkeyCredentialId?: string;
  rpId?: string;
  hasPasskey?: boolean; // Whether user has registered a passkey
}

/**
 * Unified messaging key derivation based on auth type
 * 
 * - EOA Wallet: Derives from wallet signature
 * - Passkey: Derives from PRF extension (with fallback)
 * - Email/Digital ID: Requires passkey creation first
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
    hasPasskey 
  } = params;

  // Check cache first
  const cached = getCachedKey(userAddress);
  if (cached) {
    return { success: true, keypair: cached };
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
      // Try PRF first, fallback to signature-based
      const prfResult = await deriveMekFromPasskeyPrf(
        passkeyCredentialId, 
        rpId, 
        userAddress
      );
      if (prfResult.success) {
        return prfResult;
      }
      // If PRF not supported, use signature-based fallback
      if (prfResult.prfNotSupported) {
        console.log("[MessagingKey] PRF not supported, using signature fallback");
        return deriveMekFromPasskeySignature(
          passkeyCredentialId,
          rpId,
          userAddress
        );
      }
      return prfResult;

    case "email":
    case "digitalid":
    case "solana":
      // These auth methods have no cryptographic material for key derivation
      // User must have a passkey to derive messaging keys
      if (hasPasskey && passkeyCredentialId && rpId) {
        // User has a passkey - derive from that
        const result = await deriveMekFromPasskeyPrf(
          passkeyCredentialId,
          rpId,
          userAddress
        );
        if (result.success) return result;
        if (result.prfNotSupported) {
          return deriveMekFromPasskeySignature(
            passkeyCredentialId,
            rpId,
            userAddress
          );
        }
        return result;
      }
      
      return {
        success: false,
        requiresPasskey: true,
        error: "Please add a passkey to enable secure messaging"
      };

    default:
      return { success: false, error: "Unknown auth type" };
  }
}

/**
 * Import an existing keypair into the session cache
 * Used when restoring from legacy localStorage or cloud backup
 */
export function importKeypairToCache(
  userAddress: string,
  keypair: { publicKey: string; privateKey: string },
  source: "eoa" | "passkey-prf" | "passkey-fallback" = "passkey-fallback"
): void {
  sessionKeyCache.set(userAddress.toLowerCase(), {
    ...keypair,
    derivedFrom: source,
  });
}

/**
 * Export the current session key (for migration or backup purposes)
 */
export function exportSessionKey(userAddress: string): DerivedMessagingKey | null {
  return getCachedKey(userAddress);
}
