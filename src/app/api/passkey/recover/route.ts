import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// POST: Redeem a recovery code
// This allows a user who has lost access to their passkey to verify they
// should be allowed to register a new passkey for their existing account
export async function POST(request: NextRequest) {
    try {
        const { recoveryCode } = await request.json();

        if (!recoveryCode) {
            return NextResponse.json(
                { error: "Recovery code required" },
                { status: 400 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Redeem the recovery code using the database function
        const { data, error } = await supabase.rpc("redeem_passkey_recovery_code", {
            p_recovery_code: recoveryCode.toUpperCase().trim(),
        });

        if (error) {
            console.error("[PasskeyRecover] Redeem error:", error);
            return NextResponse.json(
                { error: "Failed to process recovery code" },
                { status: 500 }
            );
        }

        const result = data as { success: boolean; error?: string; user_address?: string; message?: string };

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || "Invalid recovery code" },
                { status: 400 }
            );
        }

        // The recovery code is valid and has been marked as used
        // Return the user address so the frontend can initiate re-registration
        return NextResponse.json({
            success: true,
            userAddress: result.user_address,
            message: result.message || "Recovery code accepted. You can now register a new passkey.",
            // Include a temporary recovery token that the registration flow can use
            recoveryToken: Buffer.from(JSON.stringify({
                userAddress: result.user_address,
                type: "passkey_recovery",
                exp: Date.now() + 10 * 60 * 1000, // 10 minutes to complete re-registration
            })).toString("base64url"),
        });
    } catch (error) {
        console.error("[PasskeyRecover] Error:", error);
        return NextResponse.json(
            { error: "Failed to process recovery code" },
            { status: 500 }
        );
    }
}

// GET: Check if a recovery code is valid without redeeming it
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const recoveryCode = searchParams.get("code");
    
    // If accessed from browser without code, redirect to the UI page
    const acceptHeader = request.headers.get("accept") || "";
    if (!recoveryCode && acceptHeader.includes("text/html")) {
        return NextResponse.redirect(new URL("/recover", request.url));
    }

    if (!recoveryCode) {
        return NextResponse.json(
            { error: "Recovery code required. Visit /recover to enter your code." },
            { status: 400 }
        );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // Check if the code exists and is valid
        const { data, error } = await supabase
            .from("passkey_recovery_codes")
            .select("user_address, expires_at, used")
            .eq("recovery_code", recoveryCode.toUpperCase().trim())
            .single();

        if (error || !data) {
            return NextResponse.json({
                valid: false,
                error: "Recovery code not found",
            });
        }

        if (data.used) {
            return NextResponse.json({
                valid: false,
                error: "Recovery code has already been used",
            });
        }

        if (new Date(data.expires_at) < new Date()) {
            return NextResponse.json({
                valid: false,
                error: "Recovery code has expired",
            });
        }

        // Return masked address for user confirmation
        const maskedAddress = data.user_address
            ? `${data.user_address.slice(0, 6)}...${data.user_address.slice(-4)}`
            : "Unknown";

        return NextResponse.json({
            valid: true,
            maskedAddress,
            userAddress: data.user_address, // Include full address for recovery flow
            expiresAt: data.expires_at,
        });
    } catch (error) {
        console.error("[PasskeyRecover] Check error:", error);
        return NextResponse.json(
            { error: "Failed to check recovery code" },
            { status: 500 }
        );
    }
}
