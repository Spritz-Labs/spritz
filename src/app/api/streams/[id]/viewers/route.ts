import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/streams/[id]/viewers - Increment viewer count (viewer joined)
// Also handles ?action=leave from sendBeacon for page unload
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const action = request.nextUrl.searchParams.get("action");
    
    // Handle leave action from sendBeacon
    if (action === "leave") {
        return decrementViewerCount(id);
    }

    // Increment viewer count
    const { data: stream } = await supabase
        .from("shout_streams")
        .select("viewer_count")
        .eq("id", id)
        .single();
    
    if (stream) {
        await supabase
            .from("shout_streams")
            .update({ viewer_count: (stream.viewer_count || 0) + 1 })
            .eq("id", id);
    }

    return NextResponse.json({ success: true });
}

// Helper to decrement viewer count
async function decrementViewerCount(id: string) {
    const { data: stream } = await supabase
        .from("shout_streams")
        .select("viewer_count")
        .eq("id", id)
        .single();
    
    if (stream) {
        await supabase
            .from("shout_streams")
            .update({ viewer_count: Math.max(0, (stream.viewer_count || 0) - 1) })
            .eq("id", id);
    }
    
    return NextResponse.json({ success: true });
}

// DELETE /api/streams/[id]/viewers - Decrement viewer count (viewer left)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    return decrementViewerCount(id);
}

