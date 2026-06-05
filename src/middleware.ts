import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

function generateRequestId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${timestamp}-${random}`;
}

const REQUEST_ID_HEADER = "x-request-id";
const VERCEL_REQUEST_ID = "x-vercel-id";

const redis =
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
        ? new Redis({
              url: process.env.UPSTASH_REDIS_REST_URL,
              token: process.env.UPSTASH_REDIS_REST_TOKEN,
          })
        : null;

const globalApiLimiter = redis
    ? new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(2000, "60 s"),
          analytics: true,
          prefix: "ratelimit:global-api",
      })
    : null;

function getClientIp(request: NextRequest): string {
    return (
        request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        request.headers.get("x-real-ip") ||
        "unknown"
    );
}

const EXEMPT_PREFIXES = ["/api/cron/", "/api/public/"];

export async function middleware(request: NextRequest) {
    const hostname = request.headers.get("host") || "";
    const url = request.nextUrl.clone();
    const { pathname } = url;

    const requestId =
        request.headers.get(REQUEST_ID_HEADER) ||
        request.headers.get(VERCEL_REQUEST_ID) ||
        generateRequestId();

    const showLanding = request.nextUrl.searchParams.get("landing") === "true";

    if (
        pathname === "/" &&
        (hostname === "spritz.chat" || hostname === "www.spritz.chat" || showLanding)
    ) {
        url.pathname = "/landing";
        const response = NextResponse.rewrite(url);
        response.headers.set(REQUEST_ID_HEADER, requestId);
        return response;
    }

    // Global API rate limit — catches routes that don't call checkRateLimit themselves
    if (
        pathname.startsWith("/api/") &&
        globalApiLimiter &&
        !EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))
    ) {
        const ip = getClientIp(request);
        try {
            const { success, reset } = await globalApiLimiter.limit(ip);
            if (!success) {
                const retryAfter = Math.ceil((reset - Date.now()) / 1000);
                return NextResponse.json(
                    { error: "Too many requests", retryAfter },
                    {
                        status: 429,
                        headers: {
                            "Retry-After": retryAfter.toString(),
                            [REQUEST_ID_HEADER]: requestId,
                        },
                    }
                );
            }
        } catch {
            // Rate limit check failed — allow the request through
        }
    }

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
