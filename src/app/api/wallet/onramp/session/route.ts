import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { SignJWT, importPKCS8 } from "jose";
import { checkRateLimit } from "@/lib/ratelimit";

/**
 * POST /api/wallet/onramp/session
 * 
 * Generate a Coinbase Onramp session token for the authenticated user.
 * This token is required for all Coinbase Onramp/Offramp URLs as of July 2025.
 * 
 * The session token encapsulates:
 * - User wallet addresses
 * - Supported blockchains
 * - Supported assets
 * - Client IP (for security validation)
 */

// CDP API configuration
// CDP_API_KEY_NAME = API Key ID (UUID format)
// CDP_API_KEY_PRIVATE_KEY = Ed25519 private key (base64 encoded) or EC private key (PEM format)
const CDP_API_KEY_NAME = process.env.CDP_API_KEY_NAME;
const CDP_API_KEY_PRIVATE_KEY = process.env.CDP_API_KEY_PRIVATE_KEY;

// Supported chains for onramp (must match Coinbase's supported networks)
const SUPPORTED_BLOCKCHAINS = ["base", "ethereum", "polygon", "arbitrum", "optimism", "avalanche"];

// Supported assets for onramp
const SUPPORTED_ASSETS = ["ETH", "USDC", "USDT", "DAI", "AVAX"];

/**
 * Detect if the key is Ed25519 (base64) or EC (PEM format)
 */
function isEd25519Key(key: string): boolean {
    // PEM keys start with "-----BEGIN"
    // Ed25519 keys from CDP are just base64 strings
    return !key.includes("-----BEGIN");
}

/**
 * Generate a JWT for CDP API authentication
 * Supports both Ed25519 (new default) and ECDSA (legacy) keys
 * 
 * The JWT must include a 'uri' claim with the format: "METHOD HOST PATH"
 * e.g., "POST api.developer.coinbase.com /onramp/v1/token"
 */
async function generateCdpJwt(method: string, host: string, path: string): Promise<string> {
    if (!CDP_API_KEY_NAME || !CDP_API_KEY_PRIVATE_KEY) {
        throw new Error("CDP API keys not configured");
    }

    const now = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomUUID();
    
    // Construct the URI claim required by CDP
    const uri = `${method} ${host}${path}`;
    
    // Determine key type and import accordingly
    const isEd25519 = isEd25519Key(CDP_API_KEY_PRIVATE_KEY);
    
    let privateKey: CryptoKey;
    let algorithm: string;
    
    if (isEd25519) {
        // Ed25519 key (base64 encoded, 64 bytes = seed + public key, or 32 bytes = seed only)
        console.log("[Onramp] Using Ed25519 key for JWT");
        algorithm = "EdDSA";
        
        // Decode the base64 private key
        const keyBytes = Uint8Array.from(atob(CDP_API_KEY_PRIVATE_KEY), c => c.charCodeAt(0));
        
        // CDP Ed25519 keys are 64 bytes (seed + public), we need just the seed (first 32 bytes)
        // Or they might be 32 bytes (just seed)
        const seed = keyBytes.length === 64 ? keyBytes.slice(0, 32) : keyBytes;
        
        // Import as Ed25519 private key
        // Jose library expects PKCS8 format, so we need to wrap the raw key
        // For Ed25519, the PKCS8 prefix is fixed
        const pkcs8Prefix = new Uint8Array([
            0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
            0x04, 0x22, 0x04, 0x20
        ]);
        const pkcs8Key = new Uint8Array(pkcs8Prefix.length + seed.length);
        pkcs8Key.set(pkcs8Prefix);
        pkcs8Key.set(seed, pkcs8Prefix.length);
        
        privateKey = await crypto.subtle.importKey(
            "pkcs8",
            pkcs8Key,
            { name: "Ed25519" },
            false,
            ["sign"]
        );
    } else {
        // ECDSA key (PEM format)
        console.log("[Onramp] Using ECDSA key for JWT");
        algorithm = "ES256";
        
        const pem = CDP_API_KEY_PRIVATE_KEY.replace(/\\n/g, "\n");
        privateKey = await importPKCS8(pem, "ES256");
    }

    // Create JWT with CDP-required claims
    // See: https://docs.cdp.coinbase.com/get-started/authentication/jwt-authentication
    // The 'uri' claim is required for REST API authentication
    const jwt = await new SignJWT({
        sub: CDP_API_KEY_NAME,
        iss: "cdp",
        aud: ["cdp_service"],
        uri: uri,
        nonce: nonce,
    })
        .setProtectedHeader({ 
            alg: algorithm, 
            kid: CDP_API_KEY_NAME, 
            typ: "JWT",
            nonce: nonce,
        })
        .setIssuedAt(now)
        .setExpirationTime(now + 120) // 2 minutes
        .setNotBefore(now)
        .sign(privateKey);

    console.log("[Onramp] Generated JWT for URI:", uri);
    return jwt;
}

/**
 * Get client IP from request headers
 */
function getClientIp(request: NextRequest): string {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
        return forwardedFor.split(",")[0].trim();
    }
    
    const realIp = request.headers.get("x-real-ip");
    if (realIp) {
        return realIp;
    }
    
    // Fallback (shouldn't happen in production)
    return "0.0.0.0";
}

export async function POST(request: NextRequest) {
    // Rate limit - 20 requests per minute
    const rateLimitResponse = await checkRateLimit(request, "general");
    if (rateLimitResponse) return rateLimitResponse;

    // Require authentication
    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 }
        );
    }

    try {
        const body = await request.json().catch(() => ({}));
        const { walletAddress } = body;
        
        // Use provided address or fall back to session address
        const targetAddress = walletAddress || session.userAddress;
        
        if (!targetAddress) {
            return NextResponse.json(
                { error: "Wallet address required" },
                { status: 400 }
            );
        }

        // Check if CDP keys are configured
        if (!CDP_API_KEY_NAME || !CDP_API_KEY_PRIVATE_KEY) {
            console.error("[Onramp] CDP API keys not configured - CDP_API_KEY_NAME:", !!CDP_API_KEY_NAME, "CDP_API_KEY_PRIVATE_KEY:", !!CDP_API_KEY_PRIVATE_KEY);
            return NextResponse.json(
                { error: "Onramp not configured" },
                { status: 503 }
            );
        }
        
        console.log("[Onramp] CDP API Key configured:", CDP_API_KEY_NAME?.slice(0, 8) + "...", "Key type:", isEd25519Key(CDP_API_KEY_PRIVATE_KEY) ? "Ed25519" : "ECDSA");

        // API endpoint details for JWT
        const apiHost = "api.developer.coinbase.com";
        const apiPath = "/onramp/v1/token";
        const apiMethod = "POST";

        // Generate CDP JWT for API authentication
        const cdpJwt = await generateCdpJwt(apiMethod, apiHost, apiPath);

        // Get client IP for security validation
        const clientIp = getClientIp(request);

        // Request session token from Coinbase
        const tokenResponse = await fetch(`https://${apiHost}${apiPath}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${cdpJwt}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                addresses: [{
                    address: targetAddress,
                    blockchains: SUPPORTED_BLOCKCHAINS,
                }],
                assets: SUPPORTED_ASSETS,
                clientIp: clientIp,
            }),
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error("[Onramp] Failed to get session token:", tokenResponse.status, errorText);
            console.error("[Onramp] Request payload:", JSON.stringify({
                addresses: [{
                    address: targetAddress.slice(0, 10) + "...",
                    blockchains: SUPPORTED_BLOCKCHAINS,
                }],
                assets: SUPPORTED_ASSETS,
                clientIp: clientIp,
            }));
            
            // Parse error for more details
            let errorMessage = "Failed to initialize onramp";
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.message) {
                    errorMessage = errorJson.message;
                } else if (errorJson.error) {
                    errorMessage = errorJson.error;
                }
            } catch {
                // Use default error message
            }
            
            return NextResponse.json(
                { error: errorMessage, details: errorText },
                { status: 500 }
            );
        }

        const tokenData = await tokenResponse.json();
        
        console.log("[Onramp] Session token generated for:", targetAddress.slice(0, 10) + "...");

        return NextResponse.json({
            sessionToken: tokenData.token,
            expiresAt: tokenData.expires_at,
        });

    } catch (error) {
        console.error("[Onramp] Error:", error);
        return NextResponse.json(
            { error: "Failed to generate onramp session" },
            { status: 500 }
        );
    }
}
