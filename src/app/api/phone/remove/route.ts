import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { supabaseService } from "@/lib/supabaseServer";
import { invalidatePhoneStatusCache } from "@/lib/phoneStatusCache";

export async function POST(req: Request) {
  if (!supabaseService) {
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

    const { error: deleteError } = await supabaseService
      .from("shout_phone_numbers")
      .delete()
      .eq("wallet_address", normalizedWalletAddress);

    if (deleteError) {
      console.error("[remove-phone] Supabase delete error:", deleteError);
      return NextResponse.json({ error: "Failed to remove phone number" }, { status: 500 });
    }

    invalidatePhoneStatusCache(normalizedWalletAddress);

    return NextResponse.json({ message: "Phone number removed successfully" }, { status: 200 });
  } catch (error: unknown) {
    console.error("[remove-phone] Error:", error);
    return NextResponse.json({ error: "Failed to remove phone number" }, { status: 500 });
  }
}
