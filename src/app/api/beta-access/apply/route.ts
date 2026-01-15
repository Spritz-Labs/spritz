import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Helper to check if address is a Solana address
function isSolanaAddress(address: string): boolean {
    return !address.startsWith("0x") && address.length >= 32 && address.length <= 44;
}

// GET - Check beta access status
export async function GET(request: NextRequest) {
    try {
        // Get authenticated user from session
        const session = await getAuthenticatedUser(request);

        if (!session?.userAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        // Normalize address
        const normalizedAddress = isSolanaAddress(session.userAddress)
            ? session.userAddress
            : session.userAddress.toLowerCase();

        // Fetch user's beta status
        const { data: user, error } = await supabase
            .from("shout_users")
            .select("beta_access, beta_access_applied, beta_access_applied_at")
            .eq("wallet_address", normalizedAddress)
            .single();

        if (error && error.code !== "PGRST116") {
            console.error("[Beta Access Check] Error:", error);
            return NextResponse.json(
                { error: "Failed to check status" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            hasBetaAccess: user?.beta_access || false,
            hasApplied: user?.beta_access_applied || false,
            appliedAt: user?.beta_access_applied_at || null,
        });
    } catch (error) {
        console.error("[Beta Access Check] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    // Rate limit - strict to prevent spam applications
    const rateLimitResponse = await checkRateLimit(request, "strict");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        // Get authenticated user from session
        const session = await getAuthenticatedUser(request);
        const body = await request.json();
        const bodyWalletAddress = body.walletAddress;
        
        // Use session address if available, fall back to body for backward compatibility
        const walletAddress = session?.userAddress || bodyWalletAddress;

        if (!walletAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }
        
        // Warn if using unauthenticated fallback
        if (!session && bodyWalletAddress) {
            console.warn("[Beta Access Apply] Using unauthenticated address - migrate to session auth");
        }

        // Normalize address (Solana addresses are case-sensitive, EVM addresses should be lowercased)
        const normalizedAddress = isSolanaAddress(walletAddress)
            ? walletAddress
            : walletAddress.toLowerCase();

        // Check if user exists, create if not
        const { data: existingUser, error: fetchError } = await supabase
            .from("shout_users")
            .select("id, beta_access, beta_access_applied")
            .eq("wallet_address", normalizedAddress)
            .single();

        if (fetchError && fetchError.code !== "PGRST116") {
            // PGRST116 means no rows found, which is fine
            console.error("[Beta Access Apply] Error fetching user:", fetchError);
            return NextResponse.json(
                { error: "Failed to check user status" },
                { status: 500 }
            );
        }

        // If user already has beta access, return success
        if (existingUser?.beta_access) {
            return NextResponse.json({
                success: true,
                message: "You already have beta access",
                hasBetaAccess: true,
            });
        }

        // If user already applied, return success but indicate they already applied
        if (existingUser?.beta_access_applied) {
            return NextResponse.json({
                success: true,
                message: "You have already applied for beta access",
                alreadyApplied: true,
            });
        }

        // Update or insert user with beta_access_applied = true
        const updateData: {
            beta_access_applied: boolean;
            beta_access_applied_at: string;
            wallet_address?: string;
            first_login?: string;
            last_login?: string;
        } = {
            beta_access_applied: true,
            beta_access_applied_at: new Date().toISOString(),
        };

        if (!existingUser) {
            // Create new user record
            updateData.wallet_address = normalizedAddress;
            updateData.first_login = new Date().toISOString();
            updateData.last_login = new Date().toISOString();
        }

        const { error: updateError } = await supabase
            .from("shout_users")
            .upsert(
                {
                    wallet_address: normalizedAddress,
                    ...updateData,
                    ...(existingUser ? {} : { first_login: updateData.first_login, last_login: updateData.last_login }),
                },
                {
                    onConflict: "wallet_address",
                }
            );

        if (updateError) {
            console.error("[Beta Access Apply] Error updating user:", updateError);
            return NextResponse.json(
                { error: "Failed to submit application" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "Your application for beta access has been submitted",
            applied: true,
        });
    } catch (error) {
        console.error("[Beta Access Apply] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

