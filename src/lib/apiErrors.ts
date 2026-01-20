/**
 * Standardized API Error Handling
 * 
 * Provides consistent error responses across all API routes.
 * All errors include an error message and a machine-readable code.
 */

import { NextResponse } from "next/server";

export type ApiErrorCode = 
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "BAD_REQUEST"
    | "NOT_FOUND"
    | "CONFLICT"
    | "RATE_LIMITED"
    | "INTERNAL_ERROR"
    | "SERVICE_UNAVAILABLE"
    | "VALIDATION_ERROR"
    | "CSRF_FAILED";

export interface ApiErrorResponse {
    error: string;
    code: ApiErrorCode;
    details?: Record<string, unknown>;
}

/**
 * Create a standardized error response
 */
function createErrorResponse(
    status: number,
    error: string,
    code: ApiErrorCode,
    details?: Record<string, unknown>
): NextResponse<ApiErrorResponse> {
    return NextResponse.json(
        { error, code, ...(details && { details }) },
        { status }
    );
}

/**
 * Standardized API Error responses
 */
export const ApiError = {
    /**
     * 401 - Authentication required
     */
    unauthorized: (message = "Authentication required") =>
        createErrorResponse(401, message, "UNAUTHORIZED"),

    /**
     * 403 - Access denied / CSRF failed
     */
    forbidden: (message = "Access denied") =>
        createErrorResponse(403, message, "FORBIDDEN"),

    /**
     * 403 - CSRF validation failed
     */
    csrfFailed: () =>
        createErrorResponse(403, "Invalid request origin", "CSRF_FAILED"),

    /**
     * 400 - Bad request / validation error
     */
    badRequest: (message: string, details?: Record<string, unknown>) =>
        createErrorResponse(400, message, "BAD_REQUEST", details),

    /**
     * 400 - Validation error with field details
     */
    validationError: (message: string, fields?: Record<string, string>) =>
        createErrorResponse(400, message, "VALIDATION_ERROR", fields ? { fields } : undefined),

    /**
     * 404 - Resource not found
     */
    notFound: (resource = "Resource") =>
        createErrorResponse(404, `${resource} not found`, "NOT_FOUND"),

    /**
     * 409 - Conflict (e.g., duplicate resource)
     */
    conflict: (message: string) =>
        createErrorResponse(409, message, "CONFLICT"),

    /**
     * 429 - Rate limited
     */
    rateLimited: (retryAfter?: number) =>
        createErrorResponse(429, "Too many requests. Please try again later.", "RATE_LIMITED", 
            retryAfter ? { retryAfter } : undefined),

    /**
     * 500 - Internal server error
     */
    internal: (message = "An unexpected error occurred") =>
        createErrorResponse(500, message, "INTERNAL_ERROR"),

    /**
     * 503 - Service unavailable
     */
    serviceUnavailable: (service = "Service") =>
        createErrorResponse(503, `${service} is temporarily unavailable`, "SERVICE_UNAVAILABLE"),
};

/**
 * Success response helper
 */
export function ApiSuccess<T>(data: T, status = 200): NextResponse<T> {
    return NextResponse.json(data, { status });
}

/**
 * Type guard to check if a response is an error
 */
export function isApiError(response: unknown): response is NextResponse<ApiErrorResponse> {
    if (response instanceof NextResponse) {
        const status = response.status;
        return status >= 400;
    }
    return false;
}
