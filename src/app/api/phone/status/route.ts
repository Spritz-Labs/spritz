import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userAddress = session.userAddress.toLowerCase();

    const { data, error } = await supabase
        .from("shout_phone_numbers")
        .select("phone_number, verified")
        .eq("wallet_address", userAddress)
        .maybeSingle();

    if (error) {
        return NextResponse.json({ error: "Failed to fetch phone status" }, { status: 500 });
    }

    return NextResponse.json({
        phoneNumber: data?.phone_number ?? null,
        verified: data?.verified ?? false,
    });
}
