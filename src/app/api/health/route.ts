/**
 * Health Check API Endpoint
 * 
 * SRE Rationale:
 * - Standard health check endpoint for load balancers and monitoring
 * - Includes detailed system status for troubleshooting
 * - Checks critical dependencies (database, external services)
 * - Returns appropriate HTTP status codes for automated monitoring
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { supabase } from "@/config/supabase";

/**
 * Health status for a dependency
 */
interface DependencyStatus {
    status: "healthy" | "degraded" | "unhealthy";
    latencyMs?: number;
    message?: string;
}

/**
 * Overall health response
 */
interface HealthResponse {
    status: "healthy" | "degraded" | "unhealthy";
    timestamp: string;
    version: string;
    environment: string;
    uptime: number;
    dependencies: {
        database: DependencyStatus;
        logging: DependencyStatus;
    };
}

// Track process start time for uptime calculation
const startTime = Date.now();

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<DependencyStatus> {
    const start = performance.now();
    
    try {
        // Check if supabase client is available
        if (!supabase) {
            return {
                status: "unhealthy",
                message: "Supabase client not configured",
            };
        }
        
        // Simple query to check database connectivity
        const { error } = await supabase
            .from("shout_profiles")
            .select("id")
            .limit(1)
            .single();
        
        const latencyMs = Math.round(performance.now() - start);
        
        // Even if no data is returned, connection is working
        if (error && error.code !== "PGRST116") { // PGRST116 = no rows returned
            return {
                status: latencyMs > 5000 ? "unhealthy" : "degraded",
                latencyMs,
                message: error.message,
            };
        }
        
        return {
            status: latencyMs > 1000 ? "degraded" : "healthy",
            latencyMs,
        };
        
    } catch (error) {
        const latencyMs = Math.round(performance.now() - start);
        return {
            status: "unhealthy",
            latencyMs,
            message: String(error),
        };
    }
}

/**
 * Check logging system
 */
function checkLogging(): DependencyStatus {
    try {
        // Try to write a debug log
        logger.debug("Health check logging test");
        return { status: "healthy" };
    } catch {
        return {
            status: "degraded",
            message: "Logging may not be functioning correctly",
        };
    }
}

/**
 * GET: Health check endpoint
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    const start = performance.now();
    
    // Check if this is a deep health check or shallow
    const shallow = request.nextUrl.searchParams.get("shallow") === "true";
    
    try {
        // Build health response
        const health: HealthResponse = {
            status: "healthy",
            timestamp: new Date().toISOString(),
            version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local",
            environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
            uptime: Math.round((Date.now() - startTime) / 1000), // seconds
            dependencies: {
                database: { status: "healthy" }, // Will be updated below
                logging: { status: "healthy" },  // Will be updated below
            },
        };

        // For shallow checks, skip dependency checks (used by load balancers)
        if (!shallow) {
            // Check dependencies in parallel
            const [dbStatus, loggingStatus] = await Promise.all([
                checkDatabase(),
                Promise.resolve(checkLogging()),
            ]);

            health.dependencies.database = dbStatus;
            health.dependencies.logging = loggingStatus;

            // Determine overall status based on dependencies
            const statuses = Object.values(health.dependencies);
            
            if (statuses.some(d => d.status === "unhealthy")) {
                health.status = "unhealthy";
            } else if (statuses.some(d => d.status === "degraded")) {
                health.status = "degraded";
            }
        }

        const durationMs = Math.round(performance.now() - start);

        // Log health check (at debug level to avoid noise)
        logger.debug("Health check completed", {
            status: health.status,
            durationMs,
            shallow,
        });

        // Return appropriate status code
        const statusCode = health.status === "unhealthy" ? 503 
            : health.status === "degraded" ? 200 
            : 200;

        return NextResponse.json(health, { 
            status: statusCode,
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate",
                "X-Response-Time": `${durationMs}ms`,
            },
        });

    } catch (error) {
        logger.error("Health check failed", error as Error);

        return NextResponse.json(
            {
                status: "unhealthy",
                timestamp: new Date().toISOString(),
                error: "Health check failed",
            },
            { 
                status: 503,
                headers: {
                    "Cache-Control": "no-store",
                },
            }
        );
    }
}
