import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function POST(request: NextRequest) {
    try {
        const { walletAddress } = await request.json();

        if (!walletAddress) {
            return NextResponse.json(
                { error: "Wallet address is required" },
                { status: 400 }
            );
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

