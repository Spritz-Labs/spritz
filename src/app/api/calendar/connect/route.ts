import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// SEC-010 FIX: Use the same secret as session for signing OAuth state
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET;
const encodedSecret = new TextEncoder().encode(SESSION_SECRET || "dev-only-insecure-secret");

// Helper to get the app's base URL from the request
function getAppUrl(request: NextRequest): string {
    // Check environment variable first
    if (process.env.NEXT_PUBLIC_APP_URL) {
        return process.env.NEXT_PUBLIC_APP_URL;
    }
    // Use the request's origin (handles both production and development)
    const proto = request.headers.get("x-forwarded-proto") || "https";
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
    return `${proto}://${host}`;
}

// GET /api/calendar/connect - Initiate Google Calendar OAuth flow
export async function GET(request: NextRequest) {
    const userAddress = request.nextUrl.searchParams.get("userAddress");
    
    if (!userAddress) {
        return NextResponse.json({ error: "User address required" }, { status: 400 });
    }

    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    const appUrl = getAppUrl(request);
    const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/calendar/callback`;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return NextResponse.json(
            { error: "Google Calendar not configured" },
            { status: 500 }
        );
    }

    // Generate OAuth URL with minimal required scopes
    // - userinfo.email: Get user's email address for display
    // - calendar.freebusy: Read-only access to check availability (busy/free times)
    // - calendar.events: Create calendar events when calls are scheduled
    // Note: We do NOT request calendar.readonly as it's broader than needed
    const scopes = [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/calendar.freebusy",
        "https://www.googleapis.com/auth/calendar.events",
    ].join(" ");

    // SEC-010 FIX: Sign the OAuth state parameter to prevent CSRF attacks
    // The state is now a signed JWT that expires in 10 minutes
    const state = await new SignJWT({ userAddress: userAddress.toLowerCase() })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("10m")
        .sign(encodedSecret);

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}&` +
        `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `state=${encodeURIComponent(state)}`;

    return NextResponse.json({ authUrl });
}

