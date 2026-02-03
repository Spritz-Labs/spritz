import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// GET: Fetch email updates opt-in status (optional; useEmailVerification also loads from DB)
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const session = await getAuthenticatedUser(request);
        if (!session) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const { data, error } = await supabase
            .from("shout_users")
            .select("email_updates_opt_in")
            .eq("wallet_address", session.userAddress.toLowerCase())
            .single();

        if (error) {
            console.error("[Email Updates] GET error:", error);
            return NextResponse.json({ error: "Failed to fetch preference" }, { status: 500 });
        }

        return NextResponse.json({
            email_updates_opt_in: data?.email_updates_opt_in ?? false,
        });
    } catch (error) {
        console.error("[Email Updates] Error:", error);
        return NextResponse.json({ error: "Failed to fetch preference" }, { status: 500 });
    }
}

// PATCH: Update email updates opt-in (user must have email on file)
export async function PATCH(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const session = await getAuthenticatedUser(request);
        if (!session) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const body = await request.json();
        const emailUpdatesOptIn = body.email_updates_opt_in;

        if (typeof emailUpdatesOptIn !== "boolean") {
            return NextResponse.json(
                { error: "email_updates_opt_in must be a boolean" },
                { status: 400 }
            );
        }

        const addr = session.userAddress.toLowerCase();

        // Ensure user has email on file before allowing opt-in (opt-out is always allowed)
        if (emailUpdatesOptIn) {
            const { data: user } = await supabase
                .from("shout_users")
                .select("email, email_verified")
                .eq("wallet_address", addr)
                .single();
            if (!user?.email || !user?.email_verified) {
                return NextResponse.json(
                    { error: "Verify your email first to opt in to updates" },
                    { status: 400 }
                );
            }
        }

        const { error: updateError } = await supabase
            .from("shout_users")
            .update({
                email_updates_opt_in: emailUpdatesOptIn,
                updated_at: new Date().toISOString(),
            })
            .eq("wallet_address", addr);

        if (updateError) {
            console.error("[Email Updates] PATCH error:", updateError);
            return NextResponse.json({ error: "Failed to update preference" }, { status: 500 });
        }

        return NextResponse.json({ email_updates_opt_in: emailUpdatesOptIn });
    } catch (error) {
        console.error("[Email Updates] Error:", error);
        return NextResponse.json({ error: "Failed to update preference" }, { status: 500 });
    }
}
