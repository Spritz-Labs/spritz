import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// GET: Fetch user registration preferences
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const session = await getAuthenticatedUser(request);
        if (!session) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const { data: prefs, error } = await supabase
            .from("shout_user_registration_prefs")
            .select("*")
            .eq("wallet_address", session.userAddress.toLowerCase())
            .single();

        if (error && error.code !== "PGRST116") { // PGRST116 = not found
            console.error("[Registration Prefs] Error:", error);
            return NextResponse.json({ error: "Failed to fetch preferences" }, { status: 500 });
        }

        return NextResponse.json({ preferences: prefs || null });
    } catch (error) {
        console.error("[Registration Prefs] Error:", error);
        return NextResponse.json({ error: "Failed to fetch preferences" }, { status: 500 });
    }
}

// POST/PUT: Save user registration preferences
export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const session = await getAuthenticatedUser(request);
        if (!session) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const body = await request.json();
        const {
            full_name,
            email,
            phone,
            company,
            job_title,
            twitter_handle,
            linkedin_url,
            dietary_restrictions,
            accessibility_needs,
            notes,
        } = body;

        const walletAddress = session.userAddress.toLowerCase();

        // Check if preferences exist
        const { data: existing } = await supabase
            .from("shout_user_registration_prefs")
            .select("id")
            .eq("wallet_address", walletAddress)
            .single();

        const prefsData = {
            wallet_address: walletAddress,
            full_name: full_name || null,
            email: email || null,
            phone: phone || null,
            company: company || null,
            job_title: job_title || null,
            twitter_handle: twitter_handle || null,
            linkedin_url: linkedin_url || null,
            dietary_restrictions: dietary_restrictions || null,
            accessibility_needs: accessibility_needs || null,
            notes: notes || null,
            updated_at: new Date().toISOString(),
        };

        let result;
        if (existing) {
            // Update existing
            const { data, error } = await supabase
                .from("shout_user_registration_prefs")
                .update(prefsData)
                .eq("wallet_address", walletAddress)
                .select()
                .single();

            if (error) {
                console.error("[Registration Prefs] Update error:", error);
                return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 });
            }
            result = data;
        } else {
            // Insert new
            const { data, error } = await supabase
                .from("shout_user_registration_prefs")
                .insert(prefsData)
                .select()
                .single();

            if (error) {
                console.error("[Registration Prefs] Insert error:", error);
                return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
            }
            result = data;
        }

        return NextResponse.json({ preferences: result, success: true });
    } catch (error) {
        console.error("[Registration Prefs] Error:", error);
        return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
    }
}
