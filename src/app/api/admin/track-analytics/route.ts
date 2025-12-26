import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    | { type: "sync_groups"; count: number };

// POST: Track analytics event
export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const { walletAddress, event } = await request.json() as { 
            walletAddress: string; 
            event: AnalyticsEvent;
        };

        if (!walletAddress || !event) {
            return NextResponse.json({ error: "Missing walletAddress or event" }, { status: 400 });
        }

        const normalizedAddress = walletAddress.toLowerCase();

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

