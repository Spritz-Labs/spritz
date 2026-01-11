import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type CallHistoryEntry = {
    id: string;
    caller_address: string;
    callee_address: string;
    call_type: "audio" | "video";
    status: "completed" | "missed" | "declined" | "failed";
    started_at: string;
    ended_at: string | null;
    duration_seconds: number;
    channel_name: string | null;
    created_at: string;
};

// GET /api/calls - Get call history for a user
export async function GET(request: NextRequest) {
    // Get authenticated user
    const session = await getAuthenticatedUser(request);
    const paramUserAddress = request.nextUrl.searchParams.get("userAddress");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50");

    // Use session address, fall back to param for backward compatibility
    const userAddress = session?.userAddress || paramUserAddress;

    if (!userAddress) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 }
        );
    }
    
    // Warn if using unauthenticated fallback
    if (!session && paramUserAddress) {
        console.warn("[Calls] Using unauthenticated userAddress - migrate to session auth");
    }

    const normalizedAddress = userAddress.toLowerCase();

    // Get calls where user is either caller or callee
    const { data: calls, error } = await supabase
        .from("shout_call_history")
        .select("*")
        .or(`caller_address.eq.${normalizedAddress},callee_address.eq.${normalizedAddress}`)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) {
        console.error("[Calls API] Error fetching call history:", error);
        return NextResponse.json(
            { error: "Failed to fetch call history" },
            { status: 500 }
        );
    }

    return NextResponse.json({ calls: calls || [] });
}

// POST /api/calls - Log a new call
export async function POST(request: NextRequest) {
    // Rate limit
    const rateLimitResponse = await checkRateLimit(request, "general");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        // Get authenticated user
        const session = await getAuthenticatedUser(request);
        
        const body = await request.json();
        const {
            callerAddress: bodyCallerAddress,
            calleeAddress,
            callType,
            status,
            channelName,
            startedAt,
            endedAt,
            durationSeconds,
        } = body;
        
        // Use session address as caller, fall back to body for backward compatibility
        const callerAddress = session?.userAddress || bodyCallerAddress;

        if (!callerAddress || !calleeAddress || !callType || !status) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }
        
        // Warn if using unauthenticated fallback
        if (!session && bodyCallerAddress) {
            console.warn("[Calls] Using unauthenticated callerAddress - migrate to session auth");
        }

        const { data: call, error } = await supabase
            .from("shout_call_history")
            .insert({
                caller_address: callerAddress.toLowerCase(),
                callee_address: calleeAddress.toLowerCase(),
                call_type: callType,
                status,
                channel_name: channelName || null,
                started_at: startedAt || new Date().toISOString(),
                ended_at: endedAt || null,
                duration_seconds: durationSeconds || 0,
            })
            .select()
            .single();

        if (error) {
            console.error("[Calls API] Error logging call:", error);
            return NextResponse.json(
                { error: "Failed to log call" },
                { status: 500 }
            );
        }

        return NextResponse.json({ call });
    } catch (e) {
        console.error("[Calls API] Error:", e);
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 }
        );
    }
}

// PATCH /api/calls - Update a call (e.g., when it ends)
export async function PATCH(request: NextRequest) {
    try {
        // Get authenticated user
        const session = await getAuthenticatedUser(request);
        
        const body = await request.json();
        const { callId, endedAt, durationSeconds, status } = body;

        if (!callId) {
            return NextResponse.json(
                { error: "Call ID is required" },
                { status: 400 }
            );
        }
        
        // Verify the user is part of this call before allowing updates
        if (session) {
            const { data: existingCall } = await supabase
                .from("shout_call_history")
                .select("caller_address, callee_address")
                .eq("id", callId)
                .single();
            
            if (existingCall) {
                const normalizedSession = session.userAddress.toLowerCase();
                if (existingCall.caller_address !== normalizedSession && 
                    existingCall.callee_address !== normalizedSession) {
                    return NextResponse.json(
                        { error: "Not authorized to update this call" },
                        { status: 403 }
                    );
                }
            }
        }

        const updates: Record<string, unknown> = {};
        if (endedAt) updates.ended_at = endedAt;
        if (durationSeconds !== undefined) updates.duration_seconds = durationSeconds;
        if (status) updates.status = status;

        const { data: call, error } = await supabase
            .from("shout_call_history")
            .update(updates)
            .eq("id", callId)
            .select()
            .single();

        if (error) {
            console.error("[Calls API] Error updating call:", error);
            return NextResponse.json(
                { error: "Failed to update call" },
                { status: 500 }
            );
        }

        return NextResponse.json({ call });
    } catch (e) {
        console.error("[Calls API] Error:", e);
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 }
        );
    }
}

