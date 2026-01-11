import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/ratelimit";
import { generateSecureNonce, storeNonce, verifyAndConsumeNonce, extractNonceFromMessage } from "@/lib/nonce";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// Admin message expiry time (5 minutes)
const ADMIN_MESSAGE_EXPIRY_MS = 5 * 60 * 1000;

// Generate a SIWE-style message for signing
function generateSIWEMessage(address: string, nonce: string, domain: string): string {
    const issuedAt = new Date().toISOString();
    return `${domain} wants you to sign in with your Ethereum account:
${address}

Sign in to Spritz Admin

URI: https://${domain}
Version: 1
Chain ID: 1
Nonce: ${nonce}
Issued At: ${issuedAt}`;
}

// Extract and validate timestamp from message
function extractAndValidateTimestamp(message: string): { valid: boolean; error?: string } {
    const match = message.match(/Issued At: ([^\n]+)/);
    if (!match) {
        return { valid: false, error: "Missing timestamp in message" };
    }
    
    const issuedAt = new Date(match[1]);
    if (isNaN(issuedAt.getTime())) {
        return { valid: false, error: "Invalid timestamp format" };
    }
    
    const now = Date.now();
    const messageAge = now - issuedAt.getTime();
    
    if (messageAge > ADMIN_MESSAGE_EXPIRY_MS) {
        return { valid: false, error: "Message has expired - please sign a new message" };
    }
    
    if (messageAge < -60000) { // Allow 1 minute clock skew into the future
        return { valid: false, error: "Message timestamp is in the future" };
    }
    
    return { valid: true };
}

// POST: Verify signature and check if user is admin
export async function POST(request: NextRequest) {
    // Rate limit admin auth attempts
    const rateLimitResponse = await checkRateLimit(request, "auth");
    if (rateLimitResponse) return rateLimitResponse;
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 }
        );
    }

    try {
        const { address, signature, message } = await request.json();

        if (!address || !signature || !message) {
            return NextResponse.json(
                { error: "Missing address, signature, or message" },
                { status: 400 }
            );
        }

        // Validate timestamp to prevent replay attacks
        const timestampValidation = extractAndValidateTimestamp(message);
        if (!timestampValidation.valid) {
            return NextResponse.json(
                { error: timestampValidation.error },
                { status: 401 }
            );
        }

        // Verify and consume nonce (one-time use)
        const nonce = extractNonceFromMessage(message);
        if (nonce) {
            const nonceValid = await verifyAndConsumeNonce(address, nonce);
            if (!nonceValid) {
                return NextResponse.json(
                    { error: "Invalid or already used nonce - please request a new message" },
                    { status: 401 }
                );
            }
        }

        // Verify the signature
        const isValidSignature = await verifyMessage({
            address: address as `0x${string}`,
            message,
            signature: signature as `0x${string}`,
        });

        if (!isValidSignature) {
            return NextResponse.json(
                { error: "Invalid signature" },
                { status: 401 }
            );
        }

        // Check if user is an admin
        const { data: admin, error: adminError } = await supabase
            .from("shout_admins")
            .select("*")
            .eq("wallet_address", address.toLowerCase())
            .single();

        if (adminError || !admin) {
            return NextResponse.json(
                { error: "Not authorized - admin access required" },
                { status: 403 }
            );
        }

        // Log the admin activity
        await supabase.from("shout_admin_activity").insert({
            admin_address: address.toLowerCase(),
            action: "admin_login",
            details: { timestamp: new Date().toISOString() },
        });

        return NextResponse.json({
            success: true,
            isAdmin: true,
            isSuperAdmin: admin.is_super_admin,
            address: address.toLowerCase(),
        });
    } catch (error) {
        console.error("[Admin] Verification error:", error);
        return NextResponse.json(
            { error: "Verification failed" },
            { status: 500 }
        );
    }
}

// GET: Generate a nonce for signing
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    const domain = request.headers.get("host") || "spritz.chat";

    if (!address) {
        return NextResponse.json(
            { error: "Address required" },
            { status: 400 }
        );
    }

    // Generate cryptographically secure nonce
    const nonce = generateSecureNonce();
    
    // Store nonce for verification (expires in 5 minutes)
    await storeNonce(address, nonce);

    const message = generateSIWEMessage(address, nonce, domain);

    return NextResponse.json({ message, nonce });
}

