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

// GET - Fetch user's widgets
export async function GET(request: NextRequest) {
    try {
        const supabase = getSupabaseClient();
        
        // Check if fetching for a specific user (public view)
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("address");
        
        if (userAddress) {
            // Public view - fetch visible widgets for a user
            const { data: widgets, error } = await supabase
                .from("profile_widgets")
                .select("*")
                .eq("user_address", userAddress.toLowerCase())
                .eq("is_visible", true)
                .order("position", { ascending: true });
            
            if (error) throw error;
            
            // Also fetch theme
            const { data: theme } = await supabase
                .from("profile_themes")
                .select("*")
                .eq("user_address", userAddress.toLowerCase())
                .single();
            
            return NextResponse.json({ widgets: widgets || [], theme });
        }
        
        // Private view - fetch current user's widgets
        const session = await getSession();
        
        if (!session?.userAddress) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        
        const { data: widgets, error } = await supabase
            .from("profile_widgets")
            .select("*")
            .eq("user_address", session.userAddress.toLowerCase())
            .order("position", { ascending: true });
        
        if (error) throw error;
        
        // Also fetch theme
        const { data: theme } = await supabase
            .from("profile_themes")
            .select("*")
            .eq("user_address", session.userAddress.toLowerCase())
            .single();
        
        return NextResponse.json({ widgets: widgets || [], theme });
    } catch (error) {
        console.error("[Profile Widgets GET] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch widgets" },
            { status: 500 }
        );
    }
}

// POST - Create a new widget
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        
        if (!session?.userAddress) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        
        const supabase = getSupabaseClient();
        const body = await request.json();
        const { widget_type, size, position, config } = body;
        
        if (!widget_type) {
            return NextResponse.json(
                { error: "widget_type is required" },
                { status: 400 }
            );
        }
        
        // Get current max position
        const { data: existing } = await supabase
            .from("profile_widgets")
            .select("position")
            .eq("user_address", session.userAddress.toLowerCase())
            .order("position", { ascending: false })
            .limit(1);
        
        const newPosition = position ?? ((existing?.[0]?.position ?? -1) + 1);
        
        const { data: widget, error } = await supabase
            .from("profile_widgets")
            .insert({
                user_address: session.userAddress.toLowerCase(),
                widget_type,
                size: size || '1x1',
                position: newPosition,
                config: config || {},
            })
            .select()
            .single();
        
        if (error) throw error;
        
        return NextResponse.json({ widget });
    } catch (error) {
        console.error("[Profile Widgets POST] Error:", error);
        return NextResponse.json(
            { error: "Failed to create widget" },
            { status: 500 }
        );
    }
}

// PUT - Update widgets (bulk update for reordering)
export async function PUT(request: NextRequest) {
    try {
        const session = await getSession();
        
        if (!session?.userAddress) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        
        const supabase = getSupabaseClient();
        const body = await request.json();
        const { widgets } = body;
        
        if (!Array.isArray(widgets)) {
            return NextResponse.json(
                { error: "widgets array is required" },
                { status: 400 }
            );
        }
        
        // Update each widget
        const updates = widgets.map((w: { id: string; position?: number; size?: string; config?: Record<string, unknown>; is_visible?: boolean }) => 
            supabase
                .from("profile_widgets")
                .update({
                    ...(w.position !== undefined && { position: w.position }),
                    ...(w.size && { size: w.size }),
                    ...(w.config && { config: w.config }),
                    ...(w.is_visible !== undefined && { is_visible: w.is_visible }),
                })
                .eq("id", w.id)
                .eq("user_address", session.userAddress.toLowerCase())
        );
        
        await Promise.all(updates);
        
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Profile Widgets PUT] Error:", error);
        return NextResponse.json(
            { error: "Failed to update widgets" },
            { status: 500 }
        );
    }
}

// DELETE - Delete a widget
export async function DELETE(request: NextRequest) {
    try {
        const session = await getSession();
        
        if (!session?.userAddress) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        
        const supabase = getSupabaseClient();
        const { searchParams } = new URL(request.url);
        const widgetId = searchParams.get("id");
        
        if (!widgetId) {
            return NextResponse.json(
                { error: "Widget ID is required" },
                { status: 400 }
            );
        }
        
        const { error } = await supabase
            .from("profile_widgets")
            .delete()
            .eq("id", widgetId)
            .eq("user_address", session.userAddress.toLowerCase());
        
        if (error) throw error;
        
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Profile Widgets DELETE] Error:", error);
        return NextResponse.json(
            { error: "Failed to delete widget" },
            { status: 500 }
        );
    }
}
