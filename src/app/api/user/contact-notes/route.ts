import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** GET /api/user/contact-notes?subject=0x... - Get my notes about another user */
export async function GET(request: NextRequest) {
    const session = await getAuthenticatedUser(request);
    if (!session?.userAddress) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const subject = request.nextUrl.searchParams
        .get("subject")
        ?.trim()
        .toLowerCase();
    if (!subject) {
        return NextResponse.json(
            { error: "subject query required" },
            { status: 400 }
        );
    }
    const viewer = session.userAddress.toLowerCase();
    const { data, error } = await supabase
        .from("shout_contact_notes")
        .select("notes, updated_at")
        .eq("viewer_address", viewer)
        .eq("subject_address", subject)
        .maybeSingle();
    if (error) {
        console.error("[ContactNotes] GET error:", error);
        return NextResponse.json(
            { error: "Failed to load notes" },
            { status: 500 }
        );
    }
    return NextResponse.json({
        notes: data?.notes ?? null,
        updatedAt: data?.updated_at ?? null,
    });
}

/** PUT /api/user/contact-notes - Upsert my notes about another user */
export async function PUT(request: NextRequest) {
    const session = await getAuthenticatedUser(request);
    if (!session?.userAddress) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    let body: { subject?: string; notes?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const subject = body.subject?.trim().toLowerCase();
    if (!subject) {
        return NextResponse.json(
            { error: "subject required" },
            { status: 400 }
        );
    }
    const viewer = session.userAddress.toLowerCase();
    const notes = typeof body.notes === "string" ? body.notes : "";
    const { data, error } = await supabase
        .from("shout_contact_notes")
        .upsert(
            {
                viewer_address: viewer,
                subject_address: subject,
                notes,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "viewer_address,subject_address" }
        )
        .select("notes, updated_at")
        .single();
    if (error) {
        console.error("[ContactNotes] PUT error:", error);
        return NextResponse.json(
            { error: "Failed to save notes" },
            { status: 500 }
        );
    }
    return NextResponse.json({
        notes: data?.notes ?? null,
        updatedAt: data?.updated_at ?? null,
    });
}
