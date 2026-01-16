import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/session";

function getSupabaseClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    
    if (!url || !key) {
        throw new Error("Supabase not configured");
    }
    
    return createClient(url, key);
}

// GET - Fetch user's theme
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("address");
        
        if (!userAddress) {
            return NextResponse.json(
                { error: "address is required" },
                { status: 400 }
            );
        }
        
        const supabase = getSupabaseClient();
        const { data: theme, error } = await supabase
            .from("profile_themes")
            .select("*")
            .eq("user_address", userAddress.toLowerCase())
            .single();
        
        if (error && error.code !== 'PGRST116') {
            throw error;
        }
        
        return NextResponse.json({ theme });
    } catch (error) {
        console.error("[Profile Theme GET] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch theme" },
            { status: 500 }
        );
    }
}

// POST/PUT - Save user's theme
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        
        if (!session?.userAddress) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        
        const body = await request.json();
        const {
            background_type,
            background_value,
            accent_color,
            secondary_color,
            text_color,
            card_style,
            card_background,
            card_border,
            font_family,
            show_spritz_badge,
            custom_css,
        } = body;
        
        // Upsert theme
        const supabase = getSupabaseClient();
        const { data: theme, error } = await supabase
            .from("profile_themes")
            .upsert({
                user_address: session.userAddress.toLowerCase(),
                background_type: background_type || 'solid',
                background_value: background_value || '#09090b',
                accent_color: accent_color || '#f97316',
                secondary_color,
                text_color: text_color || '#ffffff',
                card_style: card_style || 'rounded',
                card_background: card_background || 'rgba(24, 24, 27, 0.8)',
                card_border,
                font_family: font_family || 'system',
                show_spritz_badge: show_spritz_badge ?? true,
                custom_css,
            }, {
                onConflict: 'user_address',
            })
            .select()
            .single();
        
        if (error) throw error;
        
        return NextResponse.json({ theme });
    } catch (error) {
        console.error("[Profile Theme POST] Error:", error);
        return NextResponse.json(
            { error: "Failed to save theme" },
            { status: 500 }
        );
    }
}
