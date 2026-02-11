import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { supabase, isSupabaseConfigured } from "@/config/supabase";

export const dynamic = "force-dynamic";

// Report types - validation only (types exported from hooks)
const VALID_REPORT_TYPES = [
    "spam",
    "harassment", 
    "hate_speech",
    "violence",
    "scam",
    "impersonation",
    "inappropriate_content",
    "other",
];

// GET /api/users/report - Get reports (admin only) or user's own reports
export async function GET(request: NextRequest) {
    if (!isSupabaseConfigured || !supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const session = await getAuthenticatedUser(request);
    if (!session?.userAddress) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const isAdmin = searchParams.get("admin") === "true";
        const status = searchParams.get("status");

        let query = supabase
            .from("shout_user_reports")
            .select("*")
            .order("created_at", { ascending: false });

        // Check if user is admin
        const { data: adminCheck } = await supabase
            .from("shout_admins")
            .select("id")
            .eq("wallet_address", session.userAddress.toLowerCase())
            .single();

        if (isAdmin && adminCheck) {
            // Admin can see all reports
            if (status) {
                query = query.eq("status", status);
            }
        } else {
            // Regular users can only see their own reports
            query = query.eq("reporter_address", session.userAddress.toLowerCase());
        }

        const { data, error } = await query.limit(100);

        if (error) {
            console.error("[Report API] Error fetching reports:", error);
            return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
        }

        return NextResponse.json({ 
            reports: data || [],
            isAdmin: !!adminCheck,
        });
    } catch (err) {
        console.error("[Report API] Error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

// POST /api/users/report - Submit a report
export async function POST(request: NextRequest) {
    if (!isSupabaseConfigured || !supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const session = await getAuthenticatedUser(request);
    if (!session?.userAddress) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { 
            reportedAddress, 
            reportType, 
            description, 
            conversationType, 
            conversationId,
            messageId,
            messageContent,
            alsoBlock,
        } = body;

        if (!reportedAddress || !reportType) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Can't report yourself
        if (reportedAddress.toLowerCase() === session.userAddress.toLowerCase()) {
            return NextResponse.json({ error: "Cannot report yourself" }, { status: 400 });
        }

        // Validate report type
        if (!VALID_REPORT_TYPES.includes(reportType)) {
            return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
        }

        // Check for duplicate report (same reporter, reported, type in last 24h)
        const { data: existingReport } = await supabase
            .from("shout_user_reports")
            .select("id")
            .eq("reporter_address", session.userAddress.toLowerCase())
            .eq("reported_address", reportedAddress.toLowerCase())
            .eq("report_type", reportType)
            .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .limit(1);

        if (existingReport && existingReport.length > 0) {
            return NextResponse.json({ 
                error: "You've already reported this user for this reason recently" 
            }, { status: 400 });
        }

        // Create the report
        const { data, error } = await supabase
            .from("shout_user_reports")
            .insert({
                reporter_address: session.userAddress.toLowerCase(),
                reported_address: reportedAddress.toLowerCase(),
                report_type: reportType,
                description: description || null,
                conversation_type: conversationType || null,
                conversation_id: conversationId || null,
                message_id: messageId || null,
                message_content: messageContent ? messageContent.substring(0, 1000) : null, // Limit content
                status: "pending",
            })
            .select()
            .single();

        if (error) {
            console.error("[Report API] Error creating report:", error);
            return NextResponse.json({ error: "Failed to submit report" }, { status: 500 });
        }

        // Optionally block the user
        if (alsoBlock) {
            await supabase
                .from("shout_blocked_users")
                .upsert({
                    blocker_address: session.userAddress.toLowerCase(),
                    blocked_address: reportedAddress.toLowerCase(),
                    reason: `Reported for: ${reportType}`,
                }, {
                    onConflict: "blocker_address,blocked_address",
                });
        }

        return NextResponse.json({ success: true, report: data });
    } catch (err) {
        console.error("[Report API] Error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

// PATCH /api/users/report - Update report status (admin only)
export async function PATCH(request: NextRequest) {
    if (!isSupabaseConfigured || !supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const session = await getAuthenticatedUser(request);
    if (!session?.userAddress) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Check if user is admin
        const { data: adminCheck } = await supabase
            .from("shout_admins")
            .select("id")
            .eq("wallet_address", session.userAddress.toLowerCase())
            .single();

        if (!adminCheck) {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        const body = await request.json();
        const { reportId, status, adminNotes } = body;

        if (!reportId || !status) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const validStatuses = ["pending", "reviewed", "action_taken", "dismissed"];
        if (!validStatuses.includes(status)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }

        const { data, error } = await supabase
            .from("shout_user_reports")
            .update({
                status,
                admin_notes: adminNotes || null,
                reviewed_at: new Date().toISOString(),
                reviewed_by: session.userAddress.toLowerCase(),
            })
            .eq("id", reportId)
            .select()
            .single();

        if (error) {
            console.error("[Report API] Error updating report:", error);
            return NextResponse.json({ error: "Failed to update report" }, { status: 500 });
        }

        return NextResponse.json({ success: true, report: data });
    } catch (err) {
        console.error("[Report API] Error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
