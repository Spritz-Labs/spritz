import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

type AnalyticsEvent = 
    | { type: "message_sent" }
    | { type: "friend_added" }
    | { type: "friend_removed" }
    | { type: "voice_call"; durationMinutes: number }
    | { type: "video_call"; durationMinutes: number }
    | { type: "group_joined" }
    | { type: "group_left" }
    | { type: "sync_friends"; count: number }
    | { type: "sync_groups"; count: number }
    | { type: "stream_created" }
    | { type: "stream_started" }
    | { type: "stream_ended"; durationMinutes: number }
    | { type: "stream_viewed"; durationMinutes?: number }
    | { type: "room_created" }
    | { type: "room_joined" }
    | { type: "schedule_created" }
    | { type: "schedule_joined" }
    | { type: "channel_joined" }
    | { type: "channel_left" };

// POST: Track analytics event
export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        // Require authentication - user must have a valid session
        const session = await getAuthenticatedUser(request);
        if (!session) {
            // Return silently for unauthenticated requests (don't expose auth errors for analytics)
            return NextResponse.json({ success: true, skipped: true });
        }

        // Safely parse JSON body
        let body: { walletAddress?: string; event?: AnalyticsEvent };
        try {
            body = await request.json();
        } catch {
            // Empty body or invalid JSON - silently ignore
            return NextResponse.json({ success: true, skipped: true });
        }

        const { walletAddress, event } = body;

        if (!walletAddress || !event) {
            // Missing required fields - silently ignore (common with prefetch requests)
            return NextResponse.json({ success: true, skipped: true });
        }

        const normalizedAddress = walletAddress.toLowerCase();

        // Security: Only allow users to track events for their own address
        if (normalizedAddress !== session.userAddress.toLowerCase()) {
            console.warn("[Analytics] Attempted to track event for different address:", {
                sessionAddress: session.userAddress,
                requestedAddress: normalizedAddress,
                eventType: event.type,
            });
            return NextResponse.json({ success: true, skipped: true }); // Silent fail for security
        }

        // First ensure user exists
        const { data: existingUser } = await supabase
            .from("shout_users")
            .select("id")
            .eq("wallet_address", normalizedAddress)
            .single();

        if (!existingUser) {
            // Create user if they don't exist
            await supabase.from("shout_users").insert({
                wallet_address: normalizedAddress,
            });
        }

        // Update based on event type
        let updateQuery;
        
        switch (event.type) {
            case "message_sent":
                updateQuery = supabase.rpc("increment_user_stat", {
                    p_address: normalizedAddress,
                    p_column: "messages_sent",
                    p_amount: 1,
                });
                break;
                
            case "friend_added":
                updateQuery = supabase.rpc("increment_user_stat", {
                    p_address: normalizedAddress,
                    p_column: "friends_count",
                    p_amount: 1,
                });
                break;
                
            case "friend_removed":
                updateQuery = supabase.rpc("increment_user_stat", {
                    p_address: normalizedAddress,
                    p_column: "friends_count",
                    p_amount: -1,
                });
                break;
                
            case "voice_call":
                // Update both total calls and voice minutes
                await supabase.rpc("increment_user_stat", {
                    p_address: normalizedAddress,
                    p_column: "total_calls",
                    p_amount: 1,
                });
                updateQuery = supabase.rpc("increment_user_stat", {
                    p_address: normalizedAddress,
                    p_column: "voice_minutes",
                    p_amount: Math.round(event.durationMinutes),
                });
                break;
                
            case "video_call":
                // Update both total calls and video minutes
                await supabase.rpc("increment_user_stat", {
                    p_address: normalizedAddress,
                    p_column: "total_calls",
                    p_amount: 1,
                });
                updateQuery = supabase.rpc("increment_user_stat", {
                    p_address: normalizedAddress,
                    p_column: "video_minutes",
                    p_amount: Math.round(event.durationMinutes),
                });
                break;
                
            case "group_joined":
                updateQuery = supabase.rpc("increment_user_stat", {
                    p_address: normalizedAddress,
                    p_column: "groups_count",
                    p_amount: 1,
                });
                break;
                
            case "group_left":
                updateQuery = supabase.rpc("increment_user_stat", {
                    p_address: normalizedAddress,
                    p_column: "groups_count",
                    p_amount: -1,
                });
                break;
                
            case "sync_friends":
                // Directly set the friends count (for syncing)
                updateQuery = supabase
                    .from("shout_users")
                    .update({ friends_count: event.count, updated_at: new Date().toISOString() })
                    .eq("wallet_address", normalizedAddress);
                break;
                
            case "sync_groups":
                // Directly set the groups count (for syncing)
                updateQuery = supabase
                    .from("shout_users")
                    .update({ groups_count: event.count, updated_at: new Date().toISOString() })
                    .eq("wallet_address", normalizedAddress);
                break;
                
            case "stream_created":
                updateQuery = supabase.rpc("increment_user_stat", {
                    p_address: normalizedAddress,
                    p_column: "streams_created",
                    p_amount: 1,
                });
                break;
                
            case "stream_started":
                updateQuery = supabase.rpc("increment_user_stat", {
                    p_address: normalizedAddress,
                    p_column: "streams_started",
                    p_amount: 1,
                });
                break;
                
            case "stream_ended":
                // Update both stream count and total streaming minutes
                await supabase.rpc("increment_user_stat", {
                    p_address: normalizedAddress,
                    p_column: "streams_ended",
                    p_amount: 1,
                });
                updateQuery = supabase.rpc("increment_user_stat", {
                    p_address: normalizedAddress,
                    p_column: "streaming_minutes",
                    p_amount: Math.round(event.durationMinutes),
                });
                break;
                
            case "stream_viewed":
                updateQuery = supabase.rpc("increment_user_stat", {
                    p_address: normalizedAddress,
                    p_column: "streams_viewed",
                    p_amount: 1,
                });
                // Optionally track viewing minutes if provided
                if (event.durationMinutes) {
                    await supabase.rpc("increment_user_stat", {
                        p_address: normalizedAddress,
                        p_column: "stream_viewing_minutes",
                        p_amount: Math.round(event.durationMinutes),
                    });
                }
                break;
                
            case "room_created":
                updateQuery = supabase.rpc("increment_user_stat", {
                    p_address: normalizedAddress,
                    p_column: "rooms_created",
                    p_amount: 1,
                });
                break;
                
            case "room_joined":
                updateQuery = supabase.rpc("increment_user_stat", {
                    p_address: normalizedAddress,
                    p_column: "rooms_joined",
                    p_amount: 1,
                });
                break;
                
            case "schedule_created":
                updateQuery = supabase.rpc("increment_user_stat", {
                    p_address: normalizedAddress,
                    p_column: "schedules_created",
                    p_amount: 1,
                });
                break;
                
            case "schedule_joined":
                updateQuery = supabase.rpc("increment_user_stat", {
                    p_address: normalizedAddress,
                    p_column: "schedules_joined",
                    p_amount: 1,
                });
                break;
                
            case "channel_joined":
                updateQuery = supabase.rpc("increment_user_stat", {
                    p_address: normalizedAddress,
                    p_column: "channels_joined",
                    p_amount: 1,
                });
                break;
                
            case "channel_left":
                updateQuery = supabase.rpc("increment_user_stat", {
                    p_address: normalizedAddress,
                    p_column: "channels_joined",
                    p_amount: -1,
                });
                break;
                
            default:
                return NextResponse.json({ error: "Unknown event type" }, { status: 400 });
        }

        if (updateQuery) {
            const { error } = await updateQuery;
            if (error) {
                console.error("[Analytics] Error updating:", error);
                // Don't fail the request, just log the error
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Analytics] Error:", error);
        return NextResponse.json({ error: "Failed to track analytics" }, { status: 500 });
    }
}


