import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Generate a unique request ID for correlation
 * Format: timestamp-random for sortability and uniqueness
 */
function generateRequestId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${timestamp}-${random}`;
}

/**
 * Request ID header names (standard naming conventions)
 */
const REQUEST_ID_HEADER = "x-request-id";
const VERCEL_REQUEST_ID = "x-vercel-id";

export function middleware(request: NextRequest) {
    const hostname = request.headers.get("host") || "";
    const url = request.nextUrl.clone();
    
    // Get or generate request ID for tracing
    const requestId = request.headers.get(REQUEST_ID_HEADER) 
        || request.headers.get(VERCEL_REQUEST_ID)
        || generateRequestId();

    // Check for ?landing=true query param (for testing)
    const showLanding = request.nextUrl.searchParams.get("landing") === "true";

    // If accessing spritz.chat (not app.spritz.chat), show landing page
    // Also handle www.spritz.chat
    // Or if ?landing=true is passed (for local testing)
    if (
        url.pathname === "/" &&
        (hostname === "spritz.chat" || 
         hostname === "www.spritz.chat" ||
         showLanding)
    ) {
        url.pathname = "/landing";
        const response = NextResponse.rewrite(url);
        response.headers.set(REQUEST_ID_HEADER, requestId);
        return response;
    }

    // For all other requests, pass through with request ID
    const response = NextResponse.next();
    response.headers.set(REQUEST_ID_HEADER, requestId);
    
    return response;
}

export const config = {
    // Run middleware on API routes and root path
    // Excludes static files and images for performance
    matcher: [
        "/",
        "/api/:path*",
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};

