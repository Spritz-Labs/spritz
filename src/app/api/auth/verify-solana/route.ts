import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { createAuthResponse } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";
import { generateSecureNonce, storeNonce, verifyAndConsumeNonce, extractNonceFromMessage } from "@/lib/nonce";
import { friendRequestAddressCandidates, normalizeAddress } from "@/utils/address";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// Generate a SIWS-style message for signing
function generateSIWSMessage(address: string, nonce: string, domain: string): string {
    const issuedAt = new Date().toISOString();
    return `${domain} wants you to sign in with your Solana account:
${address}

Sign in to Spritz

URI: https://${domain}
Version: 1
Nonce: ${nonce}
Issued At: ${issuedAt}`;
}

// Verify Solana signature
function verifySolanaSignature(
    message: string,
    signature: string,
    publicKey: string
): boolean {
    try {
        const messageBytes = new TextEncoder().encode(message);
        const signatureBytes = bs58.decode(signature);
        const publicKeyBytes = bs58.decode(publicKey);
        
        return nacl.sign.detached.verify(
            messageBytes,
            signatureBytes,
            publicKeyBytes
        );
    } catch (error) {
        console.error("[SIWS] Signature verification error:", error);
        return false;
    }
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
    const message = generateSIWSMessage(address, nonce, domain);

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
        const { address, signature, message } = await request.json();

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

        // Verify the Solana signature
        const isValid = verifySolanaSignature(message, signature, address);

        if (!isValid) {
            return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }

        // Canonical base58 (never persist lowercased garbage from legacy clients)
        const normalizedAddress = normalizeAddress(address);
        try {
            new PublicKey(normalizedAddress);
        } catch {
            return NextResponse.json({ error: "Invalid Solana address" }, { status: 400 });
        }

        const lookupCandidates = friendRequestAddressCandidates(address);

        // Get or create user in database (match any legacy string for same key)
        const { data: rows, error: fetchError } = await supabase
            .from("shout_users")
            .select("*")
            .in("wallet_address", lookupCandidates.length > 0 ? lookupCandidates : [normalizedAddress])
            .limit(1);

        if (fetchError) {
            console.error("[SIWS] Error fetching user:", fetchError);
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        }

        let user = rows?.[0] ?? null;

        if (!user) {
            const { data: newUser, error: createError } = await supabase
                .from("shout_users")
                .insert({
                    wallet_address: normalizedAddress,
                    chain: "solana",
                    first_login: new Date().toISOString(),
                    last_login: new Date().toISOString(),
                    login_count: 1,
                })
                .select()
                .single();

            if (createError) {
                console.error("[SIWS] Error creating user:", createError);
                return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
            }

            user = newUser;
        } else {
            const patch: Record<string, unknown> = {
                last_login: new Date().toISOString(),
                login_count: (user.login_count || 0) + 1,
            };
            if (user.wallet_address !== normalizedAddress) {
                patch.wallet_address = normalizedAddress;
            }
            await supabase.from("shout_users").update(patch).eq("id", user.id);
            user = { ...user, wallet_address: normalizedAddress };
        }

        // Return user data with verification status and set session cookie
        return createAuthResponse(
            normalizedAddress,
            "solana",
            {
                verified: true,
                user: {
                    id: user.id,
                    wallet_address: user.wallet_address,
                    chain: "solana",
                    username: user.username,
                    ens_name: user.ens_name, // Solana doesn't have ENS but might have SNS in future
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
        console.error("[SIWS] Verification error:", error);
        return NextResponse.json({ error: "Verification failed" }, { status: 500 });
    }
}

