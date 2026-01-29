import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { logError, type ErrorLogInput, type ErrorType } from "@/lib/errorLogger";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// Check if user is admin
async function isAdmin(address: string): Promise<boolean> {
    if (!supabase) return false;
    
    const { data } = await supabase
        .from("shout_admins")
        .select("id")
        .eq("wallet_address", address.toLowerCase())
        .single();
    
    return !!data;
}

// POST: Log an error from client
export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        // Get user context (optional - errors can be logged without auth)
        const session = await getAuthenticatedUser(request);
        
        const body = await request.json() as ErrorLogInput;
        
        // Validate error type
        const validTypes: ErrorType[] = [
            "safe_transaction",
            "passkey_signing",
            "passkey_registration",
            "wallet_connect",
            "wallet_send",
            "vault_transaction",
            "api_error",
            "other",
        ];
        
        if (!validTypes.includes(body.errorType)) {
            return NextResponse.json({ error: "Invalid error type" }, { status: 400 });
        }
        
        if (!body.errorMessage) {
            return NextResponse.json({ error: "Error message required" }, { status: 400 });
        }
        
        // Add request context
        const context = body.context || {};
        context.userAddress = context.userAddress || session?.userAddress;
        context.userAgent = request.headers.get("user-agent") || undefined;
        context.ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0] || 
                           request.headers.get("x-real-ip") || 
                           undefined;
        context.requestPath = request.nextUrl.pathname;
        context.requestMethod = "POST";
        
        const errorId = await logError({
            ...body,
            context,
        });
        
        return NextResponse.json({ 
            success: true, 
            errorId,
        });
    } catch (error) {
        console.error("[ErrorLog API] Error:", error);
        return NextResponse.json({ error: "Failed to log error" }, { status: 500 });
    }
}

// GET: Fetch error logs (admin only)
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        // Require admin authentication
        const session = await getAuthenticatedUser(request);
        if (!session) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }
        
        if (!await isAdmin(session.userAddress)) {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }
        
        // Parse query params
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
        const offset = parseInt(searchParams.get("offset") || "0");
        const errorType = searchParams.get("type");
        const unresolvedOnly = searchParams.get("unresolved") === "true";
        const userAddress = searchParams.get("user");
        const errorCode = searchParams.get("code");
        
        // Build query
        let query = supabase
            .from("shout_error_logs")
            .select("*", { count: "exact" })
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);
        
        if (errorType) {
            query = query.eq("error_type", errorType);
        }
        
        if (unresolvedOnly) {
            query = query.eq("is_resolved", false);
        }
        
        if (userAddress) {
            query = query.eq("user_address", userAddress.toLowerCase());
        }
        
        if (errorCode) {
            query = query.eq("error_code", errorCode);
        }
        
        const { data, error, count } = await query;
        
        if (error) {
            console.error("[ErrorLog API] Query error:", error);
            return NextResponse.json({ error: "Failed to fetch errors" }, { status: 500 });
        }
        
        return NextResponse.json({
            errors: data,
            total: count,
            limit,
            offset,
        });
    } catch (error) {
        console.error("[ErrorLog API] Error:", error);
        return NextResponse.json({ error: "Failed to fetch errors" }, { status: 500 });
    }
}

// PATCH: Update error (mark resolved, add notes)
export async function PATCH(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        // Require admin authentication
        const session = await getAuthenticatedUser(request);
        if (!session) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }
        
        if (!await isAdmin(session.userAddress)) {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }
        
        const { id, isResolved, resolutionNotes } = await request.json();
        
        if (!id) {
            return NextResponse.json({ error: "Error ID required" }, { status: 400 });
        }
        
        const updates: Record<string, unknown> = {};
        
        if (typeof isResolved === "boolean") {
            updates.is_resolved = isResolved;
            if (isResolved) {
                updates.resolved_by = session.userAddress;
                updates.resolved_at = new Date().toISOString();
            } else {
                updates.resolved_by = null;
                updates.resolved_at = null;
            }
        }
        
        if (resolutionNotes !== undefined) {
            updates.resolution_notes = resolutionNotes;
        }
        
        const { error } = await supabase
            .from("shout_error_logs")
            .update(updates)
            .eq("id", id);
        
        if (error) {
            console.error("[ErrorLog API] Update error:", error);
            return NextResponse.json({ error: "Failed to update error" }, { status: 500 });
        }
        
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[ErrorLog API] Error:", error);
        return NextResponse.json({ error: "Failed to update error" }, { status: 500 });
    }
}
