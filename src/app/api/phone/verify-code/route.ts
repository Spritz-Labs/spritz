import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy initialization of Supabase client
let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase;
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }
  
  supabase = createClient(supabaseUrl, supabaseServiceKey);
  return supabase;
}

// Twilio credentials
function getTwilioConfig() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID,
  };
}

export async function POST(request: NextRequest) {
  try {
    const db = getSupabase();
    const twilio = getTwilioConfig();
    
    if (!db) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }
    
    const body = await request.json();
    const { walletAddress, code } = body;

    if (!walletAddress || !code) {
      return NextResponse.json(
        { error: "Missing wallet address or verification code" },
        { status: 400 }
      );
    }

    // Get the pending verification
    const { data: pending, error: fetchError } = await db
      .from("shout_phone_numbers")
      .select("*")
      .eq("wallet_address", walletAddress.toLowerCase())
      .maybeSingle();

    if (fetchError) {
      console.error("[verify-code] Fetch error:", fetchError);
      return NextResponse.json(
        { error: "Failed to verify code" },
        { status: 500 }
      );
    }

    if (!pending) {
      return NextResponse.json(
        { error: "No pending verification found. Please request a new code." },
        { status: 404 }
      );
    }

    if (pending.verified) {
      return NextResponse.json({
        success: true,
        message: "Phone number already verified",
        phoneNumber: pending.phone_number,
      });
    }

    // Check if code has expired
    if (pending.code_expires_at && new Date(pending.code_expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Verification code has expired. Please request a new one." },
        { status: 410 }
      );
    }

    // If using Twilio Verify API, verify through their API
    if (pending.verification_code === "TWILIO_VERIFY" && twilio.verifyServiceSid) {
      console.log("[verify-code] Using Twilio Verify API");
      
      const auth = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");
      const verifyUrl = `https://verify.twilio.com/v2/Services/${twilio.verifyServiceSid}/VerificationCheck`;
      
      const verifyResponse = await fetch(verifyUrl, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: pending.phone_number,
          Code: code,
        }),
      });

      const verifyResult = await verifyResponse.json();
      console.log("[verify-code] Twilio Verify result:", JSON.stringify(verifyResult, null, 2));

      if (!verifyResponse.ok || verifyResult.status !== "approved") {
        let errorMessage = "Invalid verification code";
        if (verifyResult.status === "pending") {
          errorMessage = "Invalid code. Please try again.";
        } else if (verifyResult.code === 60202) {
          errorMessage = "Too many failed attempts. Please request a new code.";
        }
        
        return NextResponse.json({ error: errorMessage }, { status: 400 });
      }

      // Mark as verified
      const { error: updateError } = await db
        .from("shout_phone_numbers")
        .update({
          verified: true,
          verified_at: new Date().toISOString(),
          verification_code: null,
          code_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("wallet_address", walletAddress.toLowerCase());

      if (updateError) {
        console.error("[verify-code] Update error:", updateError);
        return NextResponse.json({ error: "Failed to verify phone number" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: "Phone number verified successfully",
        phoneNumber: pending.phone_number,
      });
    }

    // Fallback: Verify against our stored code
    if (pending.verification_code !== code) {
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 400 }
      );
    }

    // Mark as verified
    const { error: updateError } = await db
      .from("shout_phone_numbers")
      .update({
        verified: true,
        verified_at: new Date().toISOString(),
        verification_code: null,
        code_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("wallet_address", walletAddress.toLowerCase());

    if (updateError) {
      console.error("[verify-code] Update error:", updateError);
      return NextResponse.json(
        { error: "Failed to verify phone number" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Phone number verified successfully",
      phoneNumber: pending.phone_number,
    });
  } catch (error) {
    console.error("[verify-code] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

