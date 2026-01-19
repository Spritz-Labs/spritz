/**
 * Request Logging Middleware for Next.js
 * 
 * SRE Rationale:
 * - Consistent request/response logging across all API routes
 * - Automatic correlation ID injection for distributed tracing
 * - Performance timing for SLO monitoring
 * - Error capture with context for debugging
 */

import { NextRequest, NextResponse } from "next/server";
import { logger, generateRequestId, AppLogger } from "./index";
import { LogContext } from "./types";
import { anonymizeIp } from "./redaction";

/**
 * Header name for request correlation ID
 * Standard header used by many APM tools
 */
export const REQUEST_ID_HEADER = "x-request-id";
export const CORRELATION_ID_HEADER = "x-correlation-id";

/**
 * Extract client IP from various proxy headers
 * Vercel and Cloudflare set specific headers
 */
function getClientIp(request: NextRequest): string {
    // Vercel
    const vercelIp = request.headers.get("x-vercel-forwarded-for");
    if (vercelIp) return vercelIp.split(",")[0].trim();
    
    // Cloudflare
    const cfIp = request.headers.get("cf-connecting-ip");
    if (cfIp) return cfIp;
    
    // Standard proxy header
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) return forwardedFor.split(",")[0].trim();
    
    // Real IP header (nginx)
    const realIp = request.headers.get("x-real-ip");
    if (realIp) return realIp;
    
    return "unknown";
}

/**
 * Extract request context for logging
 */
function extractRequestContext(request: NextRequest): LogContext {
    const requestId = request.headers.get(REQUEST_ID_HEADER) 
        || request.headers.get(CORRELATION_ID_HEADER)
        || generateRequestId();
    
    const url = new URL(request.url);
    const clientIp = getClientIp(request);
    
    return {
        requestId,
        path: url.pathname,
        method: request.method,
        clientIp: anonymizeIp(clientIp),
        userAgent: request.headers.get("user-agent") || undefined,
    };
}

/**
 * Middleware wrapper for API route handlers
 * Adds automatic logging, timing, and error handling
 * 
 * Usage:
 * ```ts
 * import { withLogging } from "@/lib/logger/middleware";
 * 
 * export const GET = withLogging(async (request, context) => {
 *   context.logger.info("Processing request");
 *   return NextResponse.json({ data: "hello" });
 * });
 * ```
 */
export function withLogging<T extends unknown[]>(
    handler: (
        request: NextRequest,
        context: { 
            params: Promise<Record<string, string>>;
            logger: AppLogger;
            requestId: string;
        }
    ) => Promise<NextResponse>
) {
    return async (
        request: NextRequest,
        context: { params: Promise<Record<string, string>> }
    ): Promise<NextResponse> => {
        const startTime = performance.now();
        const logContext = extractRequestContext(request);
        const requestLogger = new AppLogger(logContext);
        
        // Log incoming request
        requestLogger.logRequest({
            method: request.method,
            url: request.url,
            headers: Object.fromEntries(request.headers.entries()),
            userAgent: logContext.userAgent,
            ip: logContext.clientIp,
        });
        
        try {
            // Execute handler with logging context
            const response = await handler(request, {
                params: context.params,
                logger: requestLogger,
                requestId: logContext.requestId!,
            });
            
            // Calculate response time
            const durationMs = Math.round(performance.now() - startTime);
            
            // Log response
            requestLogger.logResponse({
                method: request.method,
                url: request.url,
                statusCode: response.status,
                durationMs,
                contentLength: parseInt(response.headers.get("content-length") || "0"),
            });
            
            // Add request ID to response headers for client correlation
            response.headers.set(REQUEST_ID_HEADER, logContext.requestId!);
            
            // Flush logs before returning (important for serverless)
            requestLogger.flush();
            
            return response;
            
        } catch (error) {
            // Calculate error timing
            const durationMs = Math.round(performance.now() - startTime);
            
            // Log error with full context
            requestLogger.error(
                "Request failed with unhandled error",
                error,
                {
                    durationMs,
                    url: request.url,
                    method: request.method,
                }
            );
            
            // Flush before returning error
            requestLogger.flush();
            
            // Return error response
            // Don't expose internal error details in production
            const isProduction = process.env.NODE_ENV === "production";
            
            return NextResponse.json(
                {
                    error: isProduction ? "Internal Server Error" : String(error),
                    requestId: logContext.requestId,
                },
                { 
                    status: 500,
                    headers: {
                        [REQUEST_ID_HEADER]: logContext.requestId!,
                    }
                }
            );
        }
    };
}

/**
 * Lightweight logging for routes that don't need full middleware
 * Just wraps the handler with timing and error logging
 */
export function withTiming<T extends unknown[]>(
    handler: (request: NextRequest, ...args: T) => Promise<NextResponse>
) {
    return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
        const startTime = performance.now();
        const url = new URL(request.url);
        
        try {
            const response = await handler(request, ...args);
            
            const durationMs = Math.round(performance.now() - startTime);
            
            // Only log slow requests in production to reduce volume
            if (durationMs > 1000 || process.env.NODE_ENV !== "production") {
                logger.debug("Request completed", {
                    path: url.pathname,
                    method: request.method,
                    status: response.status,
                    durationMs,
                });
            }
            
            return response;
            
        } catch (error) {
            const durationMs = Math.round(performance.now() - startTime);
            
            logger.error("Request failed", error, {
                path: url.pathname,
                method: request.method,
                durationMs,
            });
            
            throw error;
        }
    };
}

/**
 * Create a logged response helper
 * Useful for consistent response formatting with logging
 */
export function createLoggedResponse(
    requestLogger: AppLogger,
    data: unknown,
    options: {
        status?: number;
        requestId?: string;
        logMessage?: string;
    } = {}
): NextResponse {
    const { status = 200, requestId, logMessage } = options;
    
    if (logMessage) {
        if (status >= 400) {
            requestLogger.warn(logMessage, { status, data });
        } else {
            requestLogger.debug(logMessage, { status });
        }
    }
    
    const response = NextResponse.json(data, { status });
    
    if (requestId) {
        response.headers.set(REQUEST_ID_HEADER, requestId);
    }
    
    return response;
}
