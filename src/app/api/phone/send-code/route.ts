import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";

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

// Twilio credentials (checked at runtime)
function getTwilioConfig() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID,
  };
}

// Generate a 6-digit verification code
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Hash phone number for privacy
function hashPhone(phone: string): string {
  return crypto.createHash("sha256").update(phone.toLowerCase()).digest("hex");
}

// Normalize phone number to E.164 format
function normalizePhone(phone: string): string {
  // Remove all non-digit characters except leading +
  let normalized = phone.replace(/[^\d+]/g, "");
  
  // If no + prefix and looks like US number (10 digits), add +1
  if (!normalized.startsWith("+")) {
    if (normalized.length === 10) {
      normalized = "+1" + normalized;
    } else if (normalized.length === 11 && normalized.startsWith("1")) {
      normalized = "+" + normalized;
    } else {
      // Assume it needs a + prefix
      normalized = "+" + normalized;
    }
  }
  
  return normalized;
}

export async function POST(request: NextRequest) {
  try {
    const twilio = getTwilioConfig();
    const db = getSupabase();
    
    // Debug logging
    console.log("[send-code] Twilio configured:", {
      hasAccountSid: !!twilio.accountSid,
      hasAuthToken: !!twilio.authToken,
      hasPhoneNumber: !!twilio.phoneNumber,
      phoneNumberFormat: twilio.phoneNumber?.substring(0, 5) + "...",
    });
    console.log("[send-code] Supabase configured:", !!db);
    
    // Check if services are configured
    if (!twilio.accountSid || !twilio.authToken || !twilio.phoneNumber) {
      console.error("[send-code] Missing Twilio config:", {
        accountSid: !twilio.accountSid ? "MISSING" : "OK",
        authToken: !twilio.authToken ? "MISSING" : "OK", 
        phoneNumber: !twilio.phoneNumber ? "MISSING" : "OK",
      });
      return NextResponse.json(
        { error: "SMS service not configured. Check TWILIO_* environment variables." },
        { status: 503 }
      );
    }
    
    if (!db) {
      console.error("[send-code] Missing Supabase service role key");
      return NextResponse.json(
        { error: "Database not configured. Check SUPABASE_SERVICE_ROLE_KEY." },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { walletAddress, phoneNumber } = body;

    if (!walletAddress || !phoneNumber) {
      return NextResponse.json(
        { error: "Missing wallet address or phone number" },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhone(phoneNumber);
    const phoneHash = hashPhone(normalizedPhone);
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Check if phone number is already verified by another user
    const { data: existingPhone } = await db
      .from("shout_phone_numbers")
      .select("wallet_address, verified")
      .eq("phone_number", normalizedPhone)
      .maybeSingle();

    if (existingPhone && existingPhone.verified && existingPhone.wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json(
        { error: "This phone number is already verified by another account" },
        { status: 409 }
      );
    }

    // Check if this wallet already has a phone number
    const { data: existingWallet } = await db
      .from("shout_phone_numbers")
      .select("id, phone_number")
      .eq("wallet_address", walletAddress.toLowerCase())
      .maybeSingle();

    if (existingWallet) {
      // Update existing record
      const { error: updateError } = await db
        .from("shout_phone_numbers")
        .update({
          phone_number: normalizedPhone,
          phone_hash: phoneHash,
          verification_code: code,
          code_expires_at: expiresAt.toISOString(),
          verified: false,
          updated_at: new Date().toISOString(),
        })
        .eq("wallet_address", walletAddress.toLowerCase());

      if (updateError) {
        console.error("[send-code] Update error:", updateError);
        return NextResponse.json(
          { error: "Failed to save verification code" },
          { status: 500 }
        );
      }
    } else {
      // Insert new record
      const { error: insertError } = await db
        .from("shout_phone_numbers")
        .insert({
          wallet_address: walletAddress.toLowerCase(),
          phone_number: normalizedPhone,
          phone_hash: phoneHash,
          verification_code: code,
          code_expires_at: expiresAt.toISOString(),
        });

      if (insertError) {
        console.error("[send-code] Insert error:", insertError);
        if (insertError.message.includes("unique")) {
          return NextResponse.json(
            { error: "This phone number is already in use" },
            { status: 409 }
          );
        }
        return NextResponse.json(
          { error: "Failed to save verification code" },
          { status: 500 }
        );
      }
    }

    const auth = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");

    // Use Twilio Verify API if configured (recommended for US numbers - bypasses A2P 10DLC requirements)
    if (twilio.verifyServiceSid) {
      console.log("[send-code] Using Twilio Verify API");
      
      const verifyUrl = `https://verify.twilio.com/v2/Services/${twilio.verifyServiceSid}/Verifications`;
      
      const verifyResponse = await fetch(verifyUrl, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: normalizedPhone,
          Channel: "sms",
        }),
      });

      const verifyResult = await verifyResponse.json();

      if (!verifyResponse.ok) {
        console.error("[send-code] Twilio Verify error:", JSON.stringify(verifyResult, null, 2));
        
        let errorMessage = "Failed to send verification code.";
        if (verifyResult.code === 60200) {
          errorMessage = "Invalid phone number format.";
        } else if (verifyResult.code === 60203) {
          errorMessage = "Too many attempts. Please wait before trying again.";
        } else if (verifyResult.code === 60205) {
          errorMessage = "SMS not supported to this number.";
        } else if (verifyResult.message) {
          errorMessage = verifyResult.message;
        }
        
        return NextResponse.json({ error: errorMessage }, { status: 500 });
      }

      console.log("[send-code] Twilio Verify SUCCESS:", JSON.stringify({
        sid: verifyResult.sid,
        status: verifyResult.status,
        to: verifyResult.to,
        channel: verifyResult.channel,
      }, null, 2));

      // Note: With Verify API, Twilio manages the code - we don't store it
      // Clear our stored code since Twilio handles it
      await db
        .from("shout_phone_numbers")
        .update({
          verification_code: "TWILIO_VERIFY", // Marker that Twilio is handling verification
          code_expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("wallet_address", walletAddress.toLowerCase());

      return NextResponse.json({
        success: true,
        message: "Verification code sent",
        useVerifyApi: true,
        expiresAt: expiresAt.toISOString(),
      });
    }

    // Fallback: Send SMS directly (may fail due to A2P 10DLC for US numbers)
    console.log("[send-code] Using direct SMS (no Verify Service configured)");
    
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`;

    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: normalizedPhone,
        From: twilio.phoneNumber!,
        Body: `Your Shout verification code is: ${code}. It expires in 10 minutes.`,
      }),
    });

    const twilioResult = await twilioResponse.json();
    
    if (!twilioResponse.ok) {
      console.error("[send-code] Twilio error:", JSON.stringify(twilioResult, null, 2));
      console.error("[send-code] Attempted to send to:", normalizedPhone);
      console.error("[send-code] From number:", twilio.phoneNumber);
      
      // Provide more specific error messages
      let errorMessage = "Failed to send SMS. Please check your phone number.";
      if (twilioResult.code === 21266) {
        errorMessage = "Cannot verify the Twilio number itself. Please enter a different phone number.";
      } else if (twilioResult.code === 21211) {
        errorMessage = "Invalid phone number format. Please use a valid phone number.";
      } else if (twilioResult.code === 21608) {
        errorMessage = "This phone number cannot receive SMS messages.";
      } else if (twilioResult.code === 21614) {
        errorMessage = "Invalid destination phone number.";
      } else if (twilioResult.code === 21408) {
        errorMessage = "Cannot send SMS to this region.";
      } else if (twilioResult.code === 20003) {
        errorMessage = "Twilio authentication failed. Check your Account SID and Auth Token.";
      } else if (twilioResult.code === 21659) {
        errorMessage = "The 'From' number is not a valid Twilio phone number.";
      } else if (twilioResult.code === 30034) {
        errorMessage = "US carrier rejected message. Please set up TWILIO_VERIFY_SERVICE_SID.";
      } else if (twilioResult.message) {
        errorMessage = `SMS error: ${twilioResult.message}`;
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }

    // Log successful Twilio response
    console.log("[send-code] Twilio SMS SUCCESS:", JSON.stringify({
      sid: twilioResult.sid,
      status: twilioResult.status,
      to: twilioResult.to,
      from: twilioResult.from,
      dateCreated: twilioResult.date_created,
    }, null, 2));

    return NextResponse.json({
      success: true,
      message: "Verification code sent",
      messageSid: twilioResult.sid,
      status: twilioResult.status,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("[send-code] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

