/**
 * Pimlico Bundler Proxy API
 * 
 * This proxy route handles bundler requests server-side, keeping the Pimlico API key
 * secure on the server rather than exposing it client-side.
 * 
 * Use cases:
 * - Gas estimation
 * - User operation status checks
 * - Non-WebAuthn transaction submissions
 * 
 * Note: WebAuthn-signed transactions still need client-side bundler access for
 * the signing flow, but those use strict domain restrictions in Pimlico dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";

const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY; // Server-side only key
const PIMLICO_BASE_URL = "https://api.pimlico.io/v2";

// Supported chains
const CHAIN_NAMES: Record<number, string> = {
    1: "ethereum",
    8453: "base",
    42161: "arbitrum",
    10: "optimism",
    137: "polygon",
    56: "binance",
    130: "unichain",
    43114: "avalanche",
};

// Allowed RPC methods (whitelist for security)
const ALLOWED_METHODS = [
    "eth_estimateUserOperationGas",
    "eth_getUserOperationByHash",
    "eth_getUserOperationReceipt",
    "eth_supportedEntryPoints",
    "pimlico_getUserOperationGasPrice",
    "pimlico_getUserOperationStatus",
];

export async function POST(request: NextRequest) {
    // Rate limit bundler requests
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

    if (!PIMLICO_API_KEY) {
        console.error("[Bundler] PIMLICO_API_KEY not configured");
        return NextResponse.json(
            { error: "Bundler service not configured" },
            { status: 500 }
        );
    }

    try {
        const body = await request.json();
        const { chainId, method, params } = body;

        // Validate chain
        const chainName = CHAIN_NAMES[chainId];
        if (!chainName) {
            return NextResponse.json(
                { error: `Unsupported chain: ${chainId}` },
                { status: 400 }
            );
        }

        // Validate method (whitelist)
        if (!ALLOWED_METHODS.includes(method)) {
            console.warn(`[Bundler] Blocked method: ${method}`);
            return NextResponse.json(
                { error: "Method not allowed" },
                { status: 403 }
            );
        }

        // Forward request to Pimlico
        const pimlicoUrl = `${PIMLICO_BASE_URL}/${chainName}/rpc?apikey=${PIMLICO_API_KEY}`;
        
        const response = await fetch(pimlicoUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method,
                params: params || [],
            }),
        });

        if (!response.ok) {
            console.error("[Bundler] Pimlico error:", response.status);
            return NextResponse.json(
                { error: "Bundler request failed" },
                { status: response.status }
            );
        }

        const result = await response.json();
        return NextResponse.json(result);

    } catch (error) {
        console.error("[Bundler] Error:", error);
        return NextResponse.json(
            { error: "Bundler request failed" },
            { status: 500 }
        );
    }
}
