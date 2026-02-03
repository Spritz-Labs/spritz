/**
 * Password-protected group key derivation
 *
 * - Encryption key is derived from password + salt (PBKDF2-SHA256, 32 bytes).
 * - Password hash is stored for verification on join (SHA-256(salt + password)).
 * - Key is never stored server-side; only salt and hash are stored.
 */

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

/**
 * Generate a random salt (hex string)
 */
export function generatePasswordSalt(): string {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    return bytesToHex(salt);
}

/**
 * Derive a 32-byte symmetric key from password and salt (PBKDF2-SHA256).
 * Returns key as hex string for storage in Waku/StoredGroup.
 */
export async function deriveKeyFromPassword(
    password: string,
    saltHex: string
): Promise<string> {
    const salt = hexToBytes(saltHex);
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );
    const saltView = new Uint8Array(salt);
    const bits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: saltView,
            iterations: PBKDF2_ITERATIONS,
            hash: "SHA-256",
        },
        keyMaterial,
        KEY_BYTES * 8
    );
    return bytesToHex(new Uint8Array(bits));
}

/**
 * Compute password hash for verification (SHA-256(salt + password)).
 * Stored in DB; on join we recompute and compare.
 */
export async function hashPasswordForVerification(
    password: string,
    saltHex: string
): Promise<string> {
    const salt = hexToBytes(saltHex);
    const enc = new TextEncoder();
    const combined = new Uint8Array(salt.length + enc.encode(password).length);
    combined.set(salt);
    combined.set(enc.encode(password), salt.length);
    const hash = await crypto.subtle.digest("SHA-256", combined);
    return bytesToHex(new Uint8Array(hash));
}

/**
 * Verify password against stored hash
 */
export async function verifyGroupPassword(
    password: string,
    saltHex: string,
    hashHex: string
): Promise<boolean> {
    const computed = await hashPasswordForVerification(password, saltHex);
    return computed === hashHex;
}
