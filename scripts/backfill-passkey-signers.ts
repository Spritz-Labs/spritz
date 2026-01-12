/**
 * Backfill script for passkey Safe signer data
 * 
 * This script extracts P256 public key coordinates from existing
 * passkey credentials and updates them with Safe signer information.
 * 
 * Run with: npx tsx scripts/backfill-passkey-signers.ts
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { keccak256, encodePacked, getAddress, bytesToHex } from "viem";

// Load environment variables from .env file
function loadEnv() {
    try {
        const envContent = readFileSync(".env", "utf-8");
        for (const line of envContent.split("\n")) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith("#")) {
                const [key, ...valueParts] = trimmed.split("=");
                if (key && valueParts.length > 0) {
                    process.env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
                }
            }
        }
    } catch {
        // .env file not found, use existing env vars
    }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing SUPABASE environment variables");
    console.error("Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set");
    process.exit(1);
}

// Safe WebAuthn constants
const P256_VERIFIER_ADDRESS = "0x0000000000000000000000000000000000000100";
const SAFE_WEBAUTHN_SIGNER_FACTORY = "0xF7488fFbe67327ac9f37D5F722d83Fc900852Fbf";
const SAFE_WEBAUTHN_SIGNER_SINGLETON = "0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47";

// COSE constants
const COSE_KTY_EC2 = 2;
const COSE_ALG_ES256 = -7;
const COSE_CRV_P256 = 1;

interface P256PublicKey {
    x: `0x${string}`;
    y: `0x${string}`;
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
 * Parse CBOR map (handles COSE public key format)
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
 * Parse COSE public key to extract P256 coordinates
 */
function parseCosePublicKey(coseKeyBase64: string): P256PublicKey {
    const coseBytes = Buffer.from(coseKeyBase64, "base64");
    const parsed = parseCborMap(coseBytes);
    
    if (parsed.get(1) !== COSE_KTY_EC2) {
        throw new Error("Invalid COSE key type");
    }
    if (parsed.get(3) !== COSE_ALG_ES256) {
        throw new Error("Invalid COSE algorithm");
    }
    if (parsed.get(-1) !== COSE_CRV_P256) {
        throw new Error("Invalid COSE curve");
    }
    
    const xBytes = parsed.get(-2);
    const yBytes = parsed.get(-3);
    
    if (!xBytes || !yBytes || typeof xBytes === "number" || typeof yBytes === "number") {
        throw new Error("Invalid public key coordinates");
    }
    
    if (xBytes.length !== 32 || yBytes.length !== 32) {
        throw new Error("Invalid coordinate length");
    }
    
    return {
        x: bytesToHex(new Uint8Array(xBytes)) as `0x${string}`,
        y: bytesToHex(new Uint8Array(yBytes)) as `0x${string}`,
    };
}

/**
 * Calculate Safe WebAuthn signer address
 */
function calculateWebAuthnSignerAddress(publicKey: P256PublicKey): string {
    const salt = keccak256(
        encodePacked(
            ["uint256", "uint256", "address"],
            [BigInt(publicKey.x), BigInt(publicKey.y), P256_VERIFIER_ADDRESS as `0x${string}`]
        )
    );
    
    // Minimal proxy creation code
    const proxyCreationCode = `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${SAFE_WEBAUTHN_SIGNER_SINGLETON.slice(2)}5af43d82803e903d91602b57fd5bf3`;
    const initCodeHash = keccak256(proxyCreationCode as `0x${string}`);
    
    const create2Input = `0xff${SAFE_WEBAUTHN_SIGNER_FACTORY.slice(2)}${salt.slice(2)}${initCodeHash.slice(2)}`;
    const create2Hash = keccak256(create2Input as `0x${string}`);
    
    return getAddress(`0x${create2Hash.slice(-40)}`);
}

async function main() {
    console.log("🔑 Passkey Safe Signer Backfill Script\n");
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Fetch credentials needing backfill
    const { data: credentials, error: fetchError } = await supabase
        .from("passkey_credentials")
        .select("id, credential_id, public_key, user_address")
        .is("public_key_x", null)
        .order("created_at", { ascending: true });
    
    if (fetchError) {
        console.error("❌ Failed to fetch credentials:", fetchError);
        process.exit(1);
    }
    
    if (!credentials || credentials.length === 0) {
        console.log("✅ No credentials need backfilling");
        return;
    }
    
    console.log(`📋 Found ${credentials.length} credentials to process\n`);
    
    let success = 0;
    let failed = 0;
    
    for (const cred of credentials) {
        const shortId = cred.credential_id.slice(0, 15) + "...";
        
        try {
            // Parse COSE key
            const p256Key = parseCosePublicKey(cred.public_key);
            
            // Calculate signer address
            const signerAddress = calculateWebAuthnSignerAddress(p256Key);
            
            // Update database
            const { error: updateError } = await supabase
                .from("passkey_credentials")
                .update({
                    public_key_x: p256Key.x,
                    public_key_y: p256Key.y,
                    safe_signer_address: signerAddress,
                })
                .eq("id", cred.id);
            
            if (updateError) {
                throw new Error(updateError.message);
            }
            
            console.log(`✅ ${shortId} -> ${signerAddress.slice(0, 10)}...`);
            success++;
            
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            console.log(`❌ ${shortId} -> ${msg}`);
            failed++;
        }
    }
    
    console.log(`\n📊 Results: ${success} success, ${failed} failed`);
}

main().catch(console.error);
