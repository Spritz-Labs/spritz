import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { SignJWT } from "jose";
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
const CDP_API_KEY_NAME = process.env.CDP_API_KEY_NAME;
const CDP_API_KEY_PRIVATE_KEY = process.env.CDP_API_KEY_PRIVATE_KEY;

// Supported chains for onramp (must match Coinbase's supported networks)
const SUPPORTED_BLOCKCHAINS = ["base", "ethereum", "polygon", "arbitrum", "optimism"];

// Supported assets for onramp
const SUPPORTED_ASSETS = ["ETH", "USDC", "USDT", "DAI"];

/**
 * Generate a JWT for CDP API authentication
 */
async function generateCdpJwt(): Promise<string> {
    if (!CDP_API_KEY_NAME || !CDP_API_KEY_PRIVATE_KEY) {
        throw new Error("CDP API keys not configured");
    }

    const now = Math.floor(Date.now() / 1000);
    
    // Parse the private key (EC P-256 format from CDP)
    // CDP provides keys in PEM format
    const privateKeyPem = CDP_API_KEY_PRIVATE_KEY.replace(/\\n/g, "\n");
    
    // Import the EC private key
    const privateKey = await crypto.subtle.importKey(
        "pkcs8",
        pemToArrayBuffer(privateKeyPem),
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign"]
    );

    // Create JWT with CDP-required claims
    const jwt = await new SignJWT({
        sub: CDP_API_KEY_NAME,
        iss: "cdp",
        aud: ["cdp_service"],
    })
        .setProtectedHeader({ alg: "ES256", kid: CDP_API_KEY_NAME, typ: "JWT" })
        .setIssuedAt(now)
        .setExpirationTime(now + 120) // 2 minutes
        .setNotBefore(now)
        .sign(privateKey);

    return jwt;
}

/**
 * Convert PEM to ArrayBuffer for WebCrypto
 */
function pemToArrayBuffer(pem: string): ArrayBuffer {
    const base64 = pem
        .replace("-----BEGIN EC PRIVATE KEY-----", "")
        .replace("-----END EC PRIVATE KEY-----", "")
        .replace("-----BEGIN PRIVATE KEY-----", "")
        .replace("-----END PRIVATE KEY-----", "")
        .replace(/\s/g, "");
    
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
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
            console.error("[Onramp] CDP API keys not configured");
            return NextResponse.json(
                { error: "Onramp not configured" },
                { status: 503 }
            );
        }

        // Generate CDP JWT for API authentication
        const cdpJwt = await generateCdpJwt();

        // Get client IP for security validation
        const clientIp = getClientIp(request);

        // Request session token from Coinbase
        const tokenResponse = await fetch("https://api.developer.coinbase.com/onramp/v1/token", {
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
            return NextResponse.json(
                { error: "Failed to initialize onramp" },
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
