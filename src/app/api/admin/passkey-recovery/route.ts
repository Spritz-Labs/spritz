import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Verify admin status
async function verifyAdmin(request: NextRequest) {
    const authHeader = request.headers.get("authorization");
    const cookieHeader = request.cookies.get("spritz_session")?.value;
    const token = authHeader?.replace("Bearer ", "") || cookieHeader;

    if (!token) {
        return { isAdmin: false, address: null };
    }

    try {
        const payload = JSON.parse(Buffer.from(token, "base64url").toString());
        if (!payload.sub || !payload.exp || payload.exp < Date.now()) {
            return { isAdmin: false, address: null };
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: admin } = await supabase
            .from("shout_admins")
            .select("wallet_address")
            .eq("wallet_address", payload.sub.toLowerCase())
            .single();

        return {
            isAdmin: !!admin,
            address: admin?.wallet_address || null,
        };
    } catch {
        return { isAdmin: false, address: null };
    }
}

// GET: Get passkey risk summary and at-risk users
export async function GET(request: NextRequest) {
    const { isAdmin } = await verifyAdmin(request);
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "summary";

    try {
        if (action === "summary") {
            // Get risk summary
            const { data, error } = await supabase.rpc("get_passkey_risk_summary");
            
            if (error) {
                console.error("[PasskeyRecovery] Summary error:", error);
                return NextResponse.json({ error: "Failed to get summary" }, { status: 500 });
            }

            return NextResponse.json({ summary: data?.[0] || data });
        }

        if (action === "at-risk") {
            // Get at-risk users
            const { data, error } = await supabase
                .from("passkey_at_risk_users")
                .select("*")
                .in("risk_level", ["HIGH_RISK", "MEDIUM_RISK"]);

            if (error) {
                console.error("[PasskeyRecovery] At-risk query error:", error);
                return NextResponse.json({ error: "Failed to get at-risk users" }, { status: 500 });
            }

            return NextResponse.json({ atRiskUsers: data || [] });
        }

        if (action === "all-users") {
            // Get all passkey users
            const { data, error } = await supabase
                .from("passkey_at_risk_users")
                .select("*")
                .order("risk_level", { ascending: true });

            if (error) {
                console.error("[PasskeyRecovery] All users query error:", error);
                return NextResponse.json({ error: "Failed to get users" }, { status: 500 });
            }

            return NextResponse.json({ users: data || [] });
        }

        if (action === "recovery-codes") {
            // Get active recovery codes
            const { data, error } = await supabase
                .from("passkey_recovery_codes")
                .select("*")
                .eq("used", false)
                .gt("expires_at", new Date().toISOString())
                .order("created_at", { ascending: false });

            if (error) {
                console.error("[PasskeyRecovery] Recovery codes error:", error);
                return NextResponse.json({ error: "Failed to get recovery codes" }, { status: 500 });
            }

            return NextResponse.json({ recoveryCodes: data || [] });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error) {
        console.error("[PasskeyRecovery] Error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

// POST: Generate a recovery code for a user
export async function POST(request: NextRequest) {
    const { isAdmin, address: adminAddress } = await verifyAdmin(request);
    if (!isAdmin || !adminAddress) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const { userAddress, expiresDays = 30, notes } = await request.json();

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
        }

        // Verify the user has passkey credentials
        const { data: credentials } = await supabase
            .from("passkey_credentials")
            .select("credential_id")
            .eq("user_address", userAddress.toLowerCase())
            .limit(1);

        if (!credentials || credentials.length === 0) {
            return NextResponse.json({ 
                error: "No passkey credentials found for this user" 
            }, { status: 404 });
        }

        // Generate recovery code using the database function
        const { data, error } = await supabase.rpc("generate_passkey_recovery_code", {
            p_user_address: userAddress.toLowerCase(),
            p_created_by: adminAddress,
            p_expires_days: expiresDays,
            p_notes: notes || `Created by admin ${adminAddress.slice(0, 10)}...`,
        });

        if (error) {
            console.error("[PasskeyRecovery] Generate code error:", error);
            return NextResponse.json({ error: "Failed to generate recovery code" }, { status: 500 });
        }

        // Log admin activity
        await supabase.from("shout_admin_activity").insert({
            admin_address: adminAddress,
            action: "generate_passkey_recovery",
            target_address: userAddress.toLowerCase(),
            details: { recoveryCode: data, expiresDays, notes },
        });

        return NextResponse.json({ 
            success: true,
            recoveryCode: data,
            userAddress: userAddress.toLowerCase(),
            expiresIn: `${expiresDays} days`,
        });
    } catch (error) {
        console.error("[PasskeyRecovery] Error:", error);
        return NextResponse.json({ error: "Failed to generate recovery code" }, { status: 500 });
    }
}
