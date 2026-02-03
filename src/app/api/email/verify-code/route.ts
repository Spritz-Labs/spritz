import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 }
        );
    }

    try {
        const { walletAddress, code } = await request.json();

        if (!walletAddress || !code) {
            return NextResponse.json(
                { error: "Wallet address and code are required" },
                { status: 400 }
            );
        }

        // Find the verification record
        const { data: verification, error: findError } = await supabase
            .from("shout_email_verification")
            .select("*")
            .eq("wallet_address", walletAddress.toLowerCase())
            .eq("code", code)
            .eq("verified", false)
            .single();

        if (findError || !verification) {
            return NextResponse.json(
                { error: "Invalid verification code" },
                { status: 400 }
            );
        }

        // Check if expired
        if (new Date(verification.expires_at) < new Date()) {
            return NextResponse.json(
                { error: "Verification code has expired" },
                { status: 400 }
            );
        }

        // Mark verification as complete
        await supabase
            .from("shout_email_verification")
            .update({ verified: true })
            .eq("id", verification.id);

        // Update user's email and opt in to email updates when they verify
        const { error: updateError } = await supabase
            .from("shout_users")
            .update({
                email: verification.email,
                email_verified: true,
                email_verified_at: new Date().toISOString(),
                email_updates_opt_in: true,
                updated_at: new Date().toISOString(),
            })
            .eq("wallet_address", walletAddress.toLowerCase());

        if (updateError) {
            console.error("[Email] Update error:", updateError);
            return NextResponse.json(
                { error: "Failed to update user email" },
                { status: 500 }
            );
        }

        // Award points for email verification
        const { error: pointsError } = await supabase.rpc("award_points", {
            p_address: walletAddress.toLowerCase(),
            p_points: 100,
            p_reason: "Email verified",
            p_claim_key: "email_verified",
        });

        if (pointsError) {
            console.error("[Email] Points error:", pointsError);
            // Don't fail the verification if points fail
        }

        return NextResponse.json({
            success: true,
            message: "Email verified successfully",
            email: verification.email,
            pointsAwarded: 100,
        });
    } catch (error) {
        console.error("[Email] Verify error:", error);
        return NextResponse.json(
            { error: "Failed to verify code" },
            { status: 500 }
        );
    }
}

