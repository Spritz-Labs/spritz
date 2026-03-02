import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    const { id } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: existing } = await supabase
        .from("shout_developer_keys")
        .select("id, developer_address")
        .eq("id", id)
        .single();

    if (!existing) {
        return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    if (existing.developer_address !== session.userAddress) {
        return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { error } = await supabase
        .from("shout_developer_keys")
        .update({ is_active: false, revoked_at: new Date().toISOString() })
        .eq("id", id);

    if (error) {
        return NextResponse.json({ error: "Failed to revoke API key" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
