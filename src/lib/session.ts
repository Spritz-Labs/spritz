import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || "fallback-secret-change-me";
const SESSION_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds
const SESSION_COOKIE_NAME = "spritz_session";

// Allowed origins for CSRF protection
const ALLOWED_ORIGINS = [
    "https://spritz.chat",
    "https://app.spritz.chat",
    "https://www.spritz.chat",
    process.env.NEXT_PUBLIC_APP_URL,
    // Development
    ...(process.env.NODE_ENV === "development" ? [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ] : []),
].filter(Boolean) as string[];

// Encode secret for jose library
const encodedSecret = new TextEncoder().encode(SESSION_SECRET);

export interface SessionPayload {
    userAddress: string;
    userId?: string;
    authMethod: "wallet" | "email" | "passkey" | "world_id" | "alien_id" | "solana";
    iat: number;
    exp: number;
}

/**
 * Create a signed JWT session token
 */
export async function createSessionToken(
    userAddress: string,
    authMethod: SessionPayload["authMethod"],
    userId?: string
): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    
    return new SignJWT({
        userAddress: userAddress.toLowerCase(),
        userId,
        authMethod,
    })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt(now)
        .setExpirationTime(now + SESSION_DURATION)
        .sign(encodedSecret);
}

/**
 * Verify and decode a session token
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
    try {
        const { payload } = await jwtVerify(token, encodedSecret);
        return payload as unknown as SessionPayload;
    } catch (error) {
        // Token invalid or expired
        return null;
    }
}

/**
 * Set session cookie on a NextResponse
 */
export function setSessionCookie(response: NextResponse, token: string): NextResponse {
    response.cookies.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: SESSION_DURATION,
        path: "/",
    });
    return response;
}

/**
 * Clear session cookie (for logout)
 */
export function clearSessionCookie(response: NextResponse): NextResponse {
    response.cookies.set(SESSION_COOKIE_NAME, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 0,
        path: "/",
    });
    return response;
}

/**
 * Get authenticated user from request (for API routes)
 * Returns the verified user address or null if not authenticated
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<SessionPayload | null> {
    // Try cookie first
    const cookieToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (cookieToken) {
        const payload = await verifySessionToken(cookieToken);
        if (payload) return payload;
    }
    
    // Fallback: Check Authorization header (for API clients)
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        const payload = await verifySessionToken(token);
        if (payload) return payload;
    }
    
    return null;
}

/**
 * Validate CSRF protection by checking Origin header
 * Returns true if request is from an allowed origin
 */
export function validateCsrf(request: NextRequest): boolean {
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    
    // For same-origin requests, origin might not be set
    // In that case, check referer
    if (!origin && !referer) {
        // No origin/referer - could be same-origin or API client
        // Allow if it's a GET request (safe method)
        if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
            return true;
        }
        // For mutations without origin, check for custom header (API clients)
        // API clients typically set custom headers which browsers can't do cross-origin
        const hasCustomHeader = request.headers.get("x-requested-with") === "XMLHttpRequest" ||
                                (request.headers.get("authorization")?.startsWith("Bearer ") ?? false);
        return hasCustomHeader;
    }
    
    // Check if origin is allowed
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        return true;
    }
    
    // Check referer as fallback
    if (referer) {
        try {
            const refererUrl = new URL(referer);
            const refererOrigin = refererUrl.origin;
            if (ALLOWED_ORIGINS.includes(refererOrigin)) {
                return true;
            }
        } catch {
            // Invalid referer URL
        }
    }
    
    return false;
}

/**
 * Require authentication - returns user or 401 response
 * Usage: const user = await requireAuth(request); if (user instanceof NextResponse) return user;
 */
export async function requireAuth(request: NextRequest): Promise<SessionPayload | NextResponse> {
    const session = await getAuthenticatedUser(request);
    
    if (!session) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 }
        );
    }
    
    return session;
}

/**
 * Require authentication with CSRF protection for mutations
 * Use this for state-changing operations (POST, PUT, DELETE, PATCH)
 */
export async function requireAuthWithCsrf(request: NextRequest): Promise<SessionPayload | NextResponse> {
    // Validate CSRF for mutation requests
    if (!validateCsrf(request)) {
        console.warn("[CSRF] Blocked request from invalid origin:", request.headers.get("origin"));
        return NextResponse.json(
            { error: "Invalid request origin" },
            { status: 403 }
        );
    }
    
    return requireAuth(request);
}

/**
 * Get session from cookies() in Server Components
 * Note: This only works in Server Components, not API routes
 */
export async function getSession(): Promise<SessionPayload | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
        if (!token) return null;
        return verifySessionToken(token);
    } catch {
        return null;
    }
}

/**
 * Create a successful auth response with session cookie
 */
export async function createAuthResponse(
    userAddress: string,
    authMethod: SessionPayload["authMethod"],
    responseData: Record<string, unknown>,
    userId?: string
): Promise<NextResponse> {
    const token = await createSessionToken(userAddress, authMethod, userId);
    
    const response = NextResponse.json({
        ...responseData,
        authenticated: true,
    });
    
    return setSessionCookie(response, token);
}
