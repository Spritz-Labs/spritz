import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

/**
 * GET /api/events/brands
 * Get current user's brand (one per user)
 */
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }

    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const walletAddress = session.userAddress.toLowerCase();

    try {
        const { data: brand, error } = await supabase
            .from("shout_event_brands")
            .select("*")
            .eq("wallet_address", walletAddress)
            .single();

        if (error && error.code !== "PGRST116") {
            console.error("[Events Brands] Error:", error);
            return NextResponse.json(
                { error: "Failed to fetch brand" },
                { status: 500 },
            );
        }

        return NextResponse.json({ brand: brand || null });
    } catch (error) {
        console.error("[Events Brands] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch brand" },
            { status: 500 },
        );
    }
}

/**
 * POST /api/events/brands
 * Create or update current user's brand (one per user; upsert by wallet_address)
 */
export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }

    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const walletAddress = session.userAddress.toLowerCase();

    try {
        const body = await request.json();
        const { name, logo_url, website } = body;

        if (!name || typeof name !== "string" || !name.trim()) {
            return NextResponse.json(
                { error: "Brand name is required" },
                { status: 400 },
            );
        }

        const { data: existing } = await supabase
            .from("shout_event_brands")
            .select("id")
            .eq("wallet_address", walletAddress)
            .single();

        if (existing) {
            const { data: updated, error } = await supabase
                .from("shout_event_brands")
                .update({
                    name: name.trim(),
                    logo_url: logo_url || null,
                    website: website || null,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", existing.id)
                .select()
                .single();

            if (error) {
                console.error("[Events Brands] Update error:", error);
                return NextResponse.json(
                    { error: "Failed to update brand" },
                    { status: 500 },
                );
            }
            return NextResponse.json({ success: true, brand: updated });
        }

        const { data: brand, error } = await supabase
            .from("shout_event_brands")
            .insert({
                wallet_address: walletAddress,
                name: name.trim(),
                logo_url: logo_url || null,
                website: website || null,
            })
            .select()
            .single();

        if (error) {
            console.error("[Events Brands] Insert error:", error);
            return NextResponse.json(
                { error: error.message || "Failed to create brand" },
                { status: 500 },
            );
        }

        return NextResponse.json({ success: true, brand });
    } catch (error) {
        console.error("[Events Brands] Error:", error);
        return NextResponse.json(
            { error: "Failed to save brand" },
            { status: 500 },
        );
    }
}
