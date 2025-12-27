import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAddress } from "viem";

// Initialize Supabase client for server-side (service_role)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

export async function POST(req: Request) {
  console.log("[remove-phone] Request received.");

  // Check Supabase configuration
  if (!supabase) {
    console.error("[remove-phone] Supabase is not configured.");
    return NextResponse.json(
      { error: "Supabase not configured. Missing URL or Service Role Key." },
      { status: 500 }
    );
  }

  try {
    const { walletAddress } = await req.json();

    if (!walletAddress || !isAddress(walletAddress)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const normalizedWalletAddress = walletAddress.toLowerCase();

    // Delete the phone number record
    const { error: deleteError } = await supabase
      .from("shout_phone_numbers")
      .delete()
      .eq("wallet_address", normalizedWalletAddress);

    if (deleteError) {
      console.error("[remove-phone] Supabase delete error:", deleteError);
      return NextResponse.json({ error: "Failed to remove phone number" }, { status: 500 });
    }

    console.log("[remove-phone] Phone number removed for:", normalizedWalletAddress);
    return NextResponse.json({ message: "Phone number removed successfully" }, { status: 200 });
  } catch (error: unknown) {
    console.error("[remove-phone] Error:", error);
    return NextResponse.json({ error: "Failed to remove phone number" }, { status: 500 });
  }
}








