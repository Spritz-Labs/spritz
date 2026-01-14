import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Verify cron secret to prevent unauthorized calls
function verifyCronSecret(request: NextRequest): boolean {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    // If no secret configured, allow in development
    if (!cronSecret) {
        return process.env.NODE_ENV === "development";
    }
    
    return authHeader === `Bearer ${cronSecret}`;
}

/**
 * GET /api/cron/refresh-calendar-tokens
 * 
 * Proactively refreshes Google Calendar tokens to prevent expiration.
 * Should be called by a cron job every 30-60 minutes.
 * 
 * This keeps refresh tokens "active" from Google's perspective,
 * preventing the 6-month inactivity expiration.
 */
export async function GET(request: NextRequest) {
    // Verify this is a legitimate cron call
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const results = {
        total: 0,
        refreshed: 0,
        failed: 0,
        skipped: 0,
        errors: [] as string[],
    };

    try {
        // Get all active calendar connections
        const { data: connections, error: fetchError } = await supabase
            .from("shout_calendar_connections")
            .select("*")
            .eq("provider", "google")
            .eq("is_active", true);

        if (fetchError) {
            console.error("[CronRefresh] Failed to fetch connections:", fetchError);
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        }

        if (!connections || connections.length === 0) {
            return NextResponse.json({ 
                message: "No active calendar connections",
                results 
            });
        }

        results.total = connections.length;
        console.log(`[CronRefresh] Processing ${connections.length} calendar connections`);

        const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
        const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
            return NextResponse.json({ error: "Google OAuth not configured" }, { status: 500 });
        }

        // Process each connection
        for (const connection of connections) {
            const userAddress = connection.wallet_address;

            // Skip if no refresh token
            if (!connection.refresh_token) {
                console.log(`[CronRefresh] Skipping ${userAddress} - no refresh token`);
                results.skipped++;
                continue;
            }

            // Check if token expires within the next 2 hours (proactive refresh)
            const tokenExpiry = connection.token_expires_at 
                ? new Date(connection.token_expires_at) 
                : null;
            const twoHoursFromNow = Date.now() + 2 * 60 * 60 * 1000;
            const needsRefresh = !tokenExpiry || tokenExpiry.getTime() < twoHoursFromNow;

            if (!needsRefresh) {
                console.log(`[CronRefresh] Skipping ${userAddress} - token still valid`);
                results.skipped++;
                continue;
            }

            try {
                const oauth2Client = new google.auth.OAuth2(
                    GOOGLE_CLIENT_ID,
                    GOOGLE_CLIENT_SECRET
                );
                
                oauth2Client.setCredentials({
                    refresh_token: connection.refresh_token,
                });

                console.log(`[CronRefresh] Refreshing token for ${userAddress}`);
                const { credentials } = await oauth2Client.refreshAccessToken();

                // Update stored tokens
                const { error: updateError } = await supabase
                    .from("shout_calendar_connections")
                    .update({
                        access_token: credentials.access_token,
                        token_expires_at: credentials.expiry_date
                            ? new Date(credentials.expiry_date).toISOString()
                            : new Date(Date.now() + 3600 * 1000).toISOString(),
                        last_sync_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("wallet_address", userAddress)
                    .eq("provider", "google");

                if (updateError) {
                    console.error(`[CronRefresh] DB update failed for ${userAddress}:`, updateError);
                    results.failed++;
                    results.errors.push(`${userAddress}: DB update failed`);
                } else {
                    console.log(`[CronRefresh] Successfully refreshed token for ${userAddress}`);
                    results.refreshed++;
                }
            } catch (refreshError: unknown) {
                const errorMessage = refreshError instanceof Error 
                    ? refreshError.message 
                    : String(refreshError);
                
                console.error(`[CronRefresh] Token refresh failed for ${userAddress}:`, errorMessage);
                results.failed++;
                results.errors.push(`${userAddress}: ${errorMessage}`);

                // Mark connection as inactive if refresh fails
                await supabase
                    .from("shout_calendar_connections")
                    .update({
                        is_active: false,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("wallet_address", userAddress)
                    .eq("provider", "google");
            }
        }

        console.log(`[CronRefresh] Complete:`, results);
        return NextResponse.json({
            message: "Token refresh complete",
            results,
        });
    } catch (error) {
        console.error("[CronRefresh] Unexpected error:", error);
        return NextResponse.json({ 
            error: "Internal error",
            results,
        }, { status: 500 });
    }
}
