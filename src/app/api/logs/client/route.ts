/**
 * Client Log Ingestion API
 * 
 * SRE Rationale:
 * - Centralized endpoint for client-side log collection
 * - Rate limiting to prevent abuse
 * - Validation and sanitization of incoming logs
 * - Batched processing for efficiency
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { redactSensitiveData, anonymizeIp } from "@/lib/logger/redaction";

/**
 * Structure of a client log entry
 */
interface ClientLogEntry {
    level: string;
    message: string;
    timestamp: string;
    sessionId: string;
    url: string;
    userAgent: string;
    data?: Record<string, unknown>;
}

/**
 * Validate log level
 */
function isValidLogLevel(level: string): boolean {
    return ["trace", "debug", "info", "warn", "error", "fatal"].includes(level);
}

/**
 * Validate timestamp format (ISO 8601)
 */
function isValidTimestamp(timestamp: string): boolean {
    const date = new Date(timestamp);
    return !isNaN(date.getTime());
}

/**
 * POST: Receive client logs
 * 
 * Request body: { logs: ClientLogEntry[] }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    const startTime = performance.now();
    
    try {
        // Get client IP for rate limiting context
        const clientIp = request.headers.get("x-vercel-forwarded-for")
            || request.headers.get("x-forwarded-for")?.split(",")[0]
            || "unknown";
        
        // Parse request body
        const body = await request.json();
        
        if (!body || !Array.isArray(body.logs)) {
            return NextResponse.json(
                { error: "Invalid request body" },
                { status: 400 }
            );
        }

        const logs: ClientLogEntry[] = body.logs;

        // Limit batch size to prevent abuse
        if (logs.length > 100) {
            logger.warn("Client log batch too large", {
                batchSize: logs.length,
                clientIp: anonymizeIp(clientIp),
            });
            return NextResponse.json(
                { error: "Batch too large, max 100 logs per request" },
                { status: 400 }
            );
        }

        // Process each log entry
        let processedCount = 0;
        let errorCount = 0;

        for (const logEntry of logs) {
            try {
                // Validate log entry
                if (!logEntry.message || typeof logEntry.message !== "string") {
                    errorCount++;
                    continue;
                }

                if (!isValidLogLevel(logEntry.level)) {
                    logEntry.level = "info"; // Default to info
                }

                if (!isValidTimestamp(logEntry.timestamp)) {
                    logEntry.timestamp = new Date().toISOString();
                }

                // Sanitize the data payload
                const sanitizedData = logEntry.data 
                    ? redactSensitiveData(logEntry.data)
                    : undefined;

                // Log to server using appropriate level
                const logData = {
                    source: "client",
                    sessionId: logEntry.sessionId,
                    clientUrl: logEntry.url,
                    clientUserAgent: logEntry.userAgent?.substring(0, 200), // Truncate UA
                    clientTimestamp: logEntry.timestamp,
                    ...sanitizedData,
                };

                switch (logEntry.level) {
                    case "fatal":
                    case "error":
                        logger.error(`[Client] ${logEntry.message}`, undefined, logData);
                        break;
                    case "warn":
                        logger.warn(`[Client] ${logEntry.message}`, logData);
                        break;
                    case "info":
                        logger.info(`[Client] ${logEntry.message}`, logData);
                        break;
                    case "debug":
                    case "trace":
                    default:
                        logger.debug(`[Client] ${logEntry.message}`, logData);
                        break;
                }

                processedCount++;
                
            } catch (parseError) {
                errorCount++;
                logger.debug("Failed to process client log entry", {
                    error: String(parseError),
                });
            }
        }

        const durationMs = Math.round(performance.now() - startTime);

        // Log summary for monitoring
        if (logs.length > 0) {
            logger.debug("Processed client logs batch", {
                batchSize: logs.length,
                processedCount,
                errorCount,
                durationMs,
            });
        }

        return NextResponse.json({
            success: true,
            processed: processedCount,
            errors: errorCount,
        });

    } catch (error) {
        const durationMs = Math.round(performance.now() - startTime);
        
        logger.error("Failed to process client logs", error as Error, {
            durationMs,
        });

        return NextResponse.json(
            { error: "Failed to process logs" },
            { status: 500 }
        );
    }
}

/**
 * OPTIONS: Handle CORS preflight
 */
export async function OPTIONS(): Promise<NextResponse> {
    return new NextResponse(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400",
        },
    });
}
