import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jwtVerify } from "jose";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// SEC-010 FIX: Use the same secret as session for verifying OAuth state
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET;
const encodedSecret = new TextEncoder().encode(SESSION_SECRET || "dev-only-insecure-secret");

// SECURITY: hard-coded allowlist of origins we'll ever redirect the OAuth
// flow back to. Anything not in this list falls back to the first entry.
// We do NOT trust x-forwarded-host / host for this any more — those are
// attacker-controllable in non-Vercel environments and make it easy to
// turn this callback into an open redirect.
const ALLOWED_APP_ORIGINS = [
    "https://app.spritz.chat",
    "https://spritz.chat",
    "http://localhost:3000",
];

function getAppUrl(request: NextRequest): string {
    const envUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (envUrl) {
        try {
            const origin = new URL(envUrl).origin;
            if (ALLOWED_APP_ORIGINS.includes(origin)) {
                return origin;
            }
        } catch {
            // fall through to allowlist default
        }
    }

    // Prefer the request's own host, but only if it's in the allowlist.
    // This preserves localhost dev while hardening prod.
    const proto = request.headers.get("x-forwarded-proto") || "https";
    const host =
        request.headers.get("x-forwarded-host") ||
        request.headers.get("host") ||
        "";
    if (host) {
        const candidate = `${proto}://${host}`;
        try {
            const origin = new URL(candidate).origin;
            if (ALLOWED_APP_ORIGINS.includes(origin)) {
                return origin;
            }
        } catch {
            // fall through
        }
    }

    // Safe default.
    return ALLOWED_APP_ORIGINS[0];
}

// GET /api/calendar/callback - Handle Google OAuth callback
export async function GET(request: NextRequest) {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const error = request.nextUrl.searchParams.get("error");
    const appUrl = getAppUrl(request);

    if (error) {
        return NextResponse.redirect(
            `${appUrl}?calendar_error=${encodeURIComponent(error)}`
        );
    }

    if (!code || !state) {
        return NextResponse.redirect(
            `${appUrl}?calendar_error=missing_params`
        );
    }

    try {
        // SEC-010 FIX: Verify the signed OAuth state parameter
        // This prevents CSRF attacks where an attacker tries to link their calendar
        // to a victim's account
        let userAddress: string;
        try {
            const { payload } = await jwtVerify(state, encodedSecret);
            userAddress = payload.userAddress as string;
            if (!userAddress) {
                throw new Error("Invalid state payload");
            }
        } catch (jwtError) {
            console.error("[Calendar] Invalid or expired state token:", jwtError);
            return NextResponse.redirect(
                `${appUrl}?calendar_error=${encodeURIComponent("OAuth session expired or invalid. Please try again.")}`
            );
        }

        // Exchange code for tokens
        const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
        const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
        const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/calendar/callback`;

        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                code,
                client_id: GOOGLE_CLIENT_ID!,
                client_secret: GOOGLE_CLIENT_SECRET!,
                redirect_uri: REDIRECT_URI,
                grant_type: "authorization_code",
            }),
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.text();
            console.error("[Calendar] Token exchange error:", errorData);
            throw new Error("Failed to exchange code for tokens");
        }

        const tokens = await tokenResponse.json();
        const { access_token, refresh_token, expires_in } = tokens;

        // Get user's email from Google userinfo endpoint (doesn't require calendar scopes)
        // This works because we get basic profile info with the OAuth flow
        let calendarEmail = "primary";
        try {
            const userInfoResponse = await fetch(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                {
                    headers: {
                        Authorization: `Bearer ${access_token}`,
                    },
                }
            );
            if (userInfoResponse.ok) {
                const userInfo = await userInfoResponse.json();
                calendarEmail = userInfo.email || "primary";
            }
        } catch (userInfoError) {
            console.log("[Calendar] Could not fetch user info, using 'primary':", userInfoError);
        }
        
        // Use "primary" as the calendar ID - this always refers to the user's main calendar
        // and works with calendar.freebusy and calendar.events scopes
        const calendarId = "primary";

        // Calculate token expiration
        const tokenExpiresAt = expires_in
            ? new Date(Date.now() + expires_in * 1000).toISOString()
            : null;

        // Store connection in database
        const { error: dbError } = await supabase
            .from("shout_calendar_connections")
            .upsert(
                {
                    wallet_address: userAddress.toLowerCase(),
                    provider: "google",
                    access_token, // In production, encrypt this
                    refresh_token, // In production, encrypt this
                    token_expires_at: tokenExpiresAt,
                    calendar_id: calendarId,
                    calendar_email: calendarEmail,
                    is_active: true,
                    last_sync_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
                {
                    onConflict: "wallet_address,provider",
                }
            );

        if (dbError) {
            console.error("[Calendar] Database error:", dbError);
            // If table doesn't exist, redirect with a helpful error message
            if (dbError.code === "PGRST205" || dbError.code === "42P01" || 
                dbError.message?.includes("does not exist") || 
                dbError.message?.includes("Could not find the table")) {
                return NextResponse.redirect(
                    `${appUrl}?calendar_error=${encodeURIComponent("Database tables not found. Please run the google_calendar.sql migration in Supabase.")}`
                );
            }
            throw new Error("Failed to save calendar connection: " + dbError.message);
        }

        console.log("[Calendar] Successfully saved connection for:", userAddress.toLowerCase());

        // Redirect back to app
        return NextResponse.redirect(
            `${appUrl}?calendar_connected=true`
        );
    } catch (err) {
        console.error("[Calendar] Callback error:", err);
        return NextResponse.redirect(
            `${appUrl}?calendar_error=${encodeURIComponent(err instanceof Error ? err.message : "unknown_error")}`
        );
    }
}

