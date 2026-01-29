/**
 * Passkey Signer utilities for Safe Smart Accounts
 * 
 * This module handles:
 * - Parsing COSE public keys to extract P256 coordinates
 * - Creating Safe WebAuthn signers
 * - Signing transactions with passkeys
 */

import { 
    type Address, 
    type Hex,
    keccak256,
    encodePacked,
    getAddress,
    concat,
    pad,
    toHex,
    hexToBytes,
    bytesToHex,
} from "viem";

// Safe WebAuthn Signer Factory addresses (deployed on all supported chains)
// These are the official Safe deployment addresses for v1.4.1
export const SAFE_WEBAUTHN_SIGNER_FACTORY = "0xF7488fFbe67327ac9f37D5F722d83Fc900852Fbf" as const;
export const SAFE_WEBAUTHN_SIGNER_SINGLETON = "0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47" as const;

// P256 (secp256r1) verifier addresses per chain
// Some chains have the precompile at 0x100, others use Safe's FCL verifier
export const P256_VERIFIER_ADDRESSES: Record<number, Address> = {
    // Base uses Safe's FCL (Fast Crypto Library) P256 verifier
    8453: "0x75cf11467937ce3f2f357ce24ffc3dbf8fd5c226",
    // Ethereum mainnet - FCL verifier
    1: "0x75cf11467937ce3f2f357ce24ffc3dbf8fd5c226",
    // Arbitrum - FCL verifier  
    42161: "0x75cf11467937ce3f2f357ce24ffc3dbf8fd5c226",
    // Optimism - has precompile at 0x100
    10: "0x0000000000000000000000000000000000000100",
    // Polygon - FCL verifier
    137: "0x75cf11467937ce3f2f357ce24ffc3dbf8fd5c226",
};

// Default verifier (FCL) for chains not explicitly listed
export const DEFAULT_P256_VERIFIER = "0x75cf11467937ce3f2f357ce24ffc3dbf8fd5c226" as const;

/**
 * Get the P256 verifier address for a specific chain
 */
export function getP256VerifierAddress(chainId: number): Address {
    return P256_VERIFIER_ADDRESSES[chainId] || DEFAULT_P256_VERIFIER;
}

// COSE key types and algorithms
const COSE_KTY_EC2 = 2; // Elliptic Curve key type
const COSE_ALG_ES256 = -7; // ECDSA with SHA-256
const COSE_CRV_P256 = 1; // P-256 curve

/**
 * Parsed P256 public key coordinates
 */
export interface P256PublicKey {
    x: Hex; // 32 bytes, hex encoded
    y: Hex; // 32 bytes, hex encoded
}

/**
 * Parse a COSE public key (from WebAuthn) to extract P256 coordinates
 * 
 * COSE key format for EC2 (P-256):
 * {
 *   1: 2,      // kty: EC2
 *   3: -7,     // alg: ES256
 *   -1: 1,     // crv: P-256
 *   -2: x,     // x coordinate (32 bytes)
 *   -3: y      // y coordinate (32 bytes)
 * }
 */
export function parseCosePublicKey(coseKeyBase64: string): P256PublicKey {
    // Decode base64 to bytes
    const coseBytes = Buffer.from(coseKeyBase64, "base64");
    
    // Parse CBOR-encoded COSE key
    // This is a simplified parser for the specific format we expect
    const parsed = parseCborMap(coseBytes);
    
    // Validate key type and algorithm
    if (parsed.get(1) !== COSE_KTY_EC2) {
        throw new Error("Invalid COSE key type: expected EC2 (2)");
    }
    if (parsed.get(3) !== COSE_ALG_ES256) {
        throw new Error("Invalid COSE algorithm: expected ES256 (-7)");
    }
    if (parsed.get(-1) !== COSE_CRV_P256) {
        throw new Error("Invalid COSE curve: expected P-256 (1)");
    }
    
    // Extract x and y coordinates
    const xBytes = parsed.get(-2);
    const yBytes = parsed.get(-3);
    
    if (!xBytes || !yBytes || typeof xBytes === "number" || typeof yBytes === "number") {
        throw new Error("Invalid public key coordinates: expected byte arrays");
    }
    
    if (xBytes.length !== 32 || yBytes.length !== 32) {
        throw new Error("Invalid public key coordinates: expected 32 bytes each");
    }
    
    return {
        x: bytesToHex(new Uint8Array(xBytes)),
        y: bytesToHex(new Uint8Array(yBytes)),
    };
}

/**
 * Parse CBOR integer (handles different encoding sizes)
 */
function parseCborInteger(data: Buffer, offset: number): { value: number; newOffset: number } {
    const firstByte = data[offset++];
    const majorType = firstByte >> 5;
    const additionalInfo = firstByte & 0x1f;
    
    let rawValue: number;
    
    if (additionalInfo < 24) {
        rawValue = additionalInfo;
    } else if (additionalInfo === 24) {
        rawValue = data[offset++];
    } else if (additionalInfo === 25) {
        rawValue = (data[offset++] << 8) | data[offset++];
    } else {
        throw new Error(`Unsupported CBOR integer size: ${additionalInfo}`);
    }
    
    // Major type 0 = unsigned, major type 1 = negative
    const value = majorType === 1 ? -1 - rawValue : rawValue;
    
    return { value, newOffset: offset };
}

/**
 * CBOR map parser for COSE keys
 * Handles the WebAuthn public key format with P256 coordinates
 */
function parseCborMap(data: Buffer): Map<number, number | Buffer> {
    const result = new Map<number, number | Buffer>();
    let offset = 0;
    
    const mapHeader = data[offset++];
    const majorType = mapHeader >> 5;
    
    if (majorType !== 5) { // Major type 5 = map
        throw new Error(`Expected CBOR map, got major type ${majorType}`);
    }
    
    const mapLength = mapHeader & 0x1f;
    
    for (let i = 0; i < mapLength; i++) {
        // Parse key (integer)
        const keyResult = parseCborInteger(data, offset);
        const key = keyResult.value;
        offset = keyResult.newOffset;
        
        // Parse value
        const valueByte = data[offset];
        const valueMajorType = valueByte >> 5;
        const valueAdditionalInfo = valueByte & 0x1f;
        offset++;
        
        let value: number | Buffer;
        
        if (valueMajorType === 0 || valueMajorType === 1) {
            // Unsigned or negative integer
            offset--; // Go back to re-parse with helper
            const intResult = parseCborInteger(data, offset);
            value = intResult.value;
            offset = intResult.newOffset;
        } else if (valueMajorType === 2) {
            // Byte string
            let length: number;
            if (valueAdditionalInfo < 24) {
                length = valueAdditionalInfo;
            } else if (valueAdditionalInfo === 24) {
                length = data[offset++];
            } else {
                throw new Error(`Unsupported byte string length encoding: ${valueAdditionalInfo}`);
            }
            value = data.subarray(offset, offset + length);
            offset += length;
        } else {
            throw new Error(`Unsupported CBOR value type: major=${valueMajorType}, info=${valueAdditionalInfo}`);
        }
        
        result.set(key, value);
    }
    
    return result;
}

/**
 * Calculate the Safe WebAuthn signer address for a given public key
 * 
 * The signer address is deterministic based on the public key coordinates.
 * It's calculated using CREATE2 with the WebAuthn signer factory.
 * 
 * @param publicKey - The P256 public key coordinates
 * @param chainId - The chain ID (needed to get correct verifier address)
 */
export function calculateWebAuthnSignerAddress(publicKey: P256PublicKey, chainId: number = 8453): Address {
    // The signer is deployed using CREATE2 with:
    // - Factory: SAFE_WEBAUTHN_SIGNER_FACTORY
    // - Salt: keccak256(abi.encode(x, y, P256_VERIFIER))
    // - Init code: proxy creation code + singleton address
    
    const verifierAddress = getP256VerifierAddress(chainId);
    console.log(`[PasskeySigner] Using P256 verifier for chain ${chainId}: ${verifierAddress}`);
    
    const salt = keccak256(
        encodePacked(
            ["uint256", "uint256", "address"],
            [BigInt(publicKey.x), BigInt(publicKey.y), verifierAddress]
        )
    );
    
    // Simplified proxy creation code for WebAuthn signer
    // This creates a minimal proxy pointing to the singleton
    const proxyCreationCode = concat([
        "0x3d602d80600a3d3981f3363d3d373d3d3d363d73" as Hex,
        SAFE_WEBAUTHN_SIGNER_SINGLETON,
        "0x5af43d82803e903d91602b57fd5bf3" as Hex,
    ]);
    
    const initCodeHash = keccak256(proxyCreationCode);
    
    // CREATE2 address calculation
    const create2Input = concat([
        "0xff" as Hex,
        SAFE_WEBAUTHN_SIGNER_FACTORY,
        salt,
        initCodeHash,
    ]);
    
    const create2Hash = keccak256(create2Input);
    const addressHex = `0x${create2Hash.slice(-40)}`;
    
    return getAddress(addressHex);
}

/**
 * Create WebAuthn assertion options for signing
 */
export function createSigningOptions(
    challenge: Hex,
    credentialId: string,
    rpId: string
): PublicKeyCredentialRequestOptions {
    const challengeBytes = hexToBytes(challenge);
    // Don't specify transports - let browser decide
    // This is critical for iCloud-synced passkeys to work correctly
    // Specifying transports causes Safari to show cross-device options
    return {
        challenge: challengeBytes.buffer.slice(
            challengeBytes.byteOffset, 
            challengeBytes.byteOffset + challengeBytes.byteLength
        ) as ArrayBuffer,
        rpId,
        allowCredentials: [{
            id: Buffer.from(credentialId, "base64url"),
            type: "public-key",
            // Don't specify transports - browser will use appropriate method
        }],
        userVerification: "required",
        timeout: 60000,
    };
}

/**
 * Encode a WebAuthn signature for Safe verification
 * 
 * Safe expects the signature in a specific format:
 * - authenticatorData (dynamic bytes)
 * - clientDataFields (string, the part after challenge in clientDataJSON)
 * - r (uint256)
 * - s (uint256)
 */
export function encodeWebAuthnSignature(
    authenticatorData: Uint8Array,
    clientDataJSON: string,
    signature: Uint8Array
): Hex {
    // Parse the ECDSA signature (DER encoded)
    const { r, s } = parseDerSignature(signature);
    
    // Extract clientDataFields (everything after the challenge in clientDataJSON)
    // The challenge is base64url encoded in the JSON
    const clientData = JSON.parse(clientDataJSON);
    const challengeEnd = clientDataJSON.indexOf(clientData.challenge) + clientData.challenge.length + 1; // +1 for closing quote
    const clientDataFields = clientDataJSON.slice(challengeEnd);
    
    // Encode for Safe
    // Format: authenticatorData || clientDataFields || r || s
    const authenticatorDataHex = bytesToHex(authenticatorData);
    const clientDataFieldsHex = toHex(new TextEncoder().encode(clientDataFields));
    const rHex = pad(toHex(r), { size: 32 });
    const sHex = pad(toHex(s), { size: 32 });
    
    // ABI encode: (bytes authenticatorData, string clientDataFields, uint256 r, uint256 s)
    // This is what Safe's WebAuthn verifier expects
    const encodedLength = (data: Hex) => pad(toHex(BigInt((data.length - 2) / 2)), { size: 32 });
    
    return concat([
        // Offset to authenticatorData (128 = 4 * 32)
        pad(toHex(BigInt(128)), { size: 32 }),
        // Offset to clientDataFields
        pad(toHex(BigInt(128 + 32 + Math.ceil((authenticatorDataHex.length - 2) / 64) * 32)), { size: 32 }),
        // r
        rHex,
        // s  
        sHex,
        // authenticatorData length and data
        encodedLength(authenticatorDataHex),
        authenticatorDataHex as Hex,
        // Padding to 32-byte boundary
        pad("0x" as Hex, { size: (32 - ((authenticatorDataHex.length - 2) / 2) % 32) % 32 }),
        // clientDataFields length and data
        encodedLength(clientDataFieldsHex),
        clientDataFieldsHex as Hex,
    ]);
}

/**
 * Parse a DER-encoded ECDSA signature to extract r and s values
 */
function parseDerSignature(signature: Uint8Array): { r: bigint; s: bigint } {
    // DER format: 0x30 [total-length] 0x02 [r-length] [r] 0x02 [s-length] [s]
    let offset = 0;
    
    if (signature[offset++] !== 0x30) {
        throw new Error("Invalid DER signature: expected SEQUENCE");
    }
    
    // Skip total length
    offset++;
    
    if (signature[offset++] !== 0x02) {
        throw new Error("Invalid DER signature: expected INTEGER for r");
    }
    
    const rLength = signature[offset++];
    const rBytes = signature.slice(offset, offset + rLength);
    offset += rLength;
    
    if (signature[offset++] !== 0x02) {
        throw new Error("Invalid DER signature: expected INTEGER for s");
    }
    
    const sLength = signature[offset++];
    const sBytes = signature.slice(offset, offset + sLength);
    
    // Convert to BigInt, removing any leading zero bytes
    const r = BigInt(bytesToHex(rBytes.slice(rBytes[0] === 0 ? 1 : 0)));
    const s = BigInt(bytesToHex(sBytes.slice(sBytes[0] === 0 ? 1 : 0)));
    
    return { r, s };
}

/**
 * Passkey credential info with Safe signer data
 */
export interface PasskeyCredentialWithSigner {
    credentialId: string;
    publicKey: P256PublicKey;
    signerAddress: Address;
    userAddress: Address;
}

/**
 * Get passkey credential with Safe signer info
 * 
 * @param credentialId - The WebAuthn credential ID
 * @param cosePublicKey - The COSE-encoded public key
 * @param userAddress - The user's address
 * @param chainId - The chain ID (defaults to Base 8453)
 */
export function getPasskeySignerInfo(
    credentialId: string,
    cosePublicKey: string,
    userAddress: Address,
    chainId: number = 8453
): PasskeyCredentialWithSigner {
    const publicKey = parseCosePublicKey(cosePublicKey);
    const signerAddress = calculateWebAuthnSignerAddress(publicKey, chainId);
    
    return {
        credentialId,
        publicKey,
        signerAddress,
        userAddress,
    };
}
