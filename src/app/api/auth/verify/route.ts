import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/ratelimit";
import { createAuthResponse } from "@/lib/session";
import { generateSecureNonce, storeNonce, verifyAndConsumeNonce, extractNonceFromMessage } from "@/lib/nonce";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// Generate a SIWE-style message for signing
function generateSIWEMessage(address: string, nonce: string, domain: string): string {
    const issuedAt = new Date().toISOString();
    return `${domain} wants you to sign in with your Ethereum account:
${address}

Sign in to Spritz

URI: https://${domain}
Version: 1
Chain ID: 1
Nonce: ${nonce}
Issued At: ${issuedAt}`;
}

// GET: Generate a message to sign (stores nonce for verification)
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");

    if (!address) {
        return NextResponse.json({ error: "Address required" }, { status: 400 });
    }

    // Generate cryptographically secure nonce
    const nonce = generateSecureNonce();
    const domain = request.headers.get("host") || "app.spritz.chat";
    const message = generateSIWEMessage(address, nonce, domain);

    // Store nonce for later verification (expires in 5 minutes)
    await storeNonce(address, nonce);

    return NextResponse.json({ message, nonce });
}

// POST: Verify signature and return user data
export async function POST(request: NextRequest) {
    // Rate limit: 10 requests per minute for auth
    const rateLimitResponse = await checkRateLimit(request, "auth");
    if (rateLimitResponse) return rateLimitResponse;

    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        let body;
        try {
            const text = await request.text();
            if (!text) {
                return NextResponse.json({ error: "Request body is required" }, { status: 400 });
            }
            body = JSON.parse(text);
        } catch {
            return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
        }
        
        const { address, signature, message } = body;

        if (!address || !signature || !message) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Extract and verify nonce from message (prevents replay attacks)
        const nonce = extractNonceFromMessage(message);
        if (!nonce) {
            return NextResponse.json({ error: "Invalid message format - missing nonce" }, { status: 400 });
        }

        const nonceValid = await verifyAndConsumeNonce(address, nonce);
        if (!nonceValid) {
            return NextResponse.json({ error: "Invalid or expired nonce - please request a new message" }, { status: 401 });
        }

        // Verify the signature
        const isValid = await verifyMessage({
            address: address as `0x${string}`,
            message,
            signature: signature as `0x${string}`,
        });

        if (!isValid) {
            return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }

        const normalizedAddress = address.toLowerCase();

        // Get or create user in database
        let { data: user, error: fetchError } = await supabase
            .from("shout_users")
            .select("*")
            .eq("wallet_address", normalizedAddress)
            .single();

        if (fetchError && fetchError.code === "PGRST116") {
            // User doesn't exist, create them with wallet_type = "wallet"
            const { data: newUser, error: createError } = await supabase
                .from("shout_users")
                .insert({
                    wallet_address: normalizedAddress,
                    wallet_type: "wallet", // IMPORTANT: Set wallet_type for EOA users
                    first_login: new Date().toISOString(),
                    last_login: new Date().toISOString(),
                    login_count: 1,
                })
                .select()
                .single();

            if (createError) {
                console.error("[Auth] Error creating user:", createError);
                return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
            }

            user = newUser;
        } else if (fetchError) {
            console.error("[Auth] Error fetching user:", fetchError);
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        } else if (user) {
            // Update last login and ensure wallet_type is correct
            // If user is logging in via wallet signature, they should be wallet type
            // (unless they were originally a passkey user - but passkey users can't login via wallet signature)
            const updateData: Record<string, unknown> = {
                last_login: new Date().toISOString(),
                login_count: (user.login_count || 0) + 1,
            };
            
            // Ensure wallet_type is set to "wallet" for users logging in via wallet signature
            if (!user.wallet_type || user.wallet_type !== "wallet") {
                updateData.wallet_type = "wallet";
                console.log("[Auth] Setting wallet_type to 'wallet' for:", normalizedAddress.slice(0, 10));
            }
            
            await supabase
                .from("shout_users")
                .update(updateData)
                .eq("wallet_address", normalizedAddress);
        }

        // Return user data with verification status and set session cookie
        return createAuthResponse(
            normalizedAddress,
            "wallet",
            {
                verified: true,
                user: {
                    id: user.id,
                    wallet_address: user.wallet_address,
                    username: user.username,
                    ens_name: user.ens_name,
                    email: user.email,
                    email_verified: user.email_verified || false,
                    beta_access: user.beta_access || false,
                    subscription_tier: user.subscription_tier || "free",
                    subscription_expires_at: user.subscription_expires_at || null,
                    points: user.points || 0,
                    invite_count: user.invite_count || 0,
                    is_banned: user.is_banned || false,
                },
            },
            user.id
        );
    } catch (error) {
        console.error("[Auth] Verification error:", error);
        return NextResponse.json({ error: "Verification failed" }, { status: 500 });
    }
}

