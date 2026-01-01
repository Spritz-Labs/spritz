import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
    const hostname = request.headers.get("host") || "";
    const url = request.nextUrl.clone();

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
        return NextResponse.rewrite(url);
    }

    // Allow all other requests to proceed normally
    return NextResponse.next();
}

export const config = {
    // Only run middleware on the root path to avoid unnecessary processing
    matcher: ["/"],
};

