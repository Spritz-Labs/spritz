import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userAddress = session.userAddress.toLowerCase();

    const { error } = await supabase
        .from("shout_users")
        .update({ email: null, email_verified: false })
        .eq("wallet_address", userAddress);

    if (error) {
        return NextResponse.json({ error: "Failed to remove email" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
