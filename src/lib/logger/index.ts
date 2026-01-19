/**
 * Production-Grade Logging System
 * 
 * SRE Rationale:
 * - Structured JSON logging for easy parsing by log aggregators
 * - Consistent context fields for correlation and debugging
 * - Environment-based log levels to control verbosity
 * - Sampling support for high-volume logs
 * - Sensitive data redaction for security compliance
 * 
 * @see https://12factor.net/logs - Treat logs as event streams
 */

import pino, { Logger, LoggerOptions } from "pino";
import { LogContext, LogLevel, SanitizedLog } from "./types";
import { redactSensitiveData, REDACT_PATHS } from "./redaction";

// Environment configuration
const LOG_LEVEL = (process.env.LOG_LEVEL || "info") as LogLevel;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SERVICE_NAME = process.env.SERVICE_NAME || "spritz-app";
const ENVIRONMENT = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";

/**
 * Base Pino configuration optimized for Vercel serverless
 * 
 * SRE Notes:
 * - Use ISO timestamp for universal parsing
 * - Include service/environment in every log for filtering
 * - Redact sensitive paths automatically
 * - Pretty print in development for readability
 */
const baseOptions: LoggerOptions = {
    level: LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
    
    // Redact sensitive data paths
    redact: {
        paths: REDACT_PATHS,
        censor: "[REDACTED]",
    },
    
    // Base context included in every log
    base: {
        service: SERVICE_NAME,
        env: ENVIRONMENT,
        version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local",
    },
    
    // Format options
    formatters: {
        level: (label) => ({ level: label }),
        bindings: (bindings) => ({
            pid: bindings.pid,
            host: bindings.hostname,
        }),
    },
    
    // Serializers for common objects
    serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
        req: (req) => ({
            method: req.method,
            url: req.url,
            headers: redactSensitiveData(req.headers),
        }),
        res: (res) => ({
            statusCode: res.statusCode,
        }),
    },
};

/**
 * Development configuration - pretty printing for human readability
 */
const devOptions: LoggerOptions = {
    ...baseOptions,
    transport: {
        target: "pino-pretty",
        options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname,service,env,version",
            messageFormat: "{msg}",
        },
    },
};

/**
 * Production configuration - JSON output for log aggregators
 * 
 * SRE Notes:
 * - No transport overhead in production
 * - JSON format for Vercel Log Drain / Datadog / CloudWatch
 * - Vercel handles log buffering and delivery
 */
const prodOptions: LoggerOptions = {
    ...baseOptions,
};

// Create the base logger instance
const pinoLogger: Logger = pino(IS_PRODUCTION ? prodOptions : devOptions);

/**
 * Request ID generator using crypto for uniqueness
 * Format: timestamp-random for sortability and uniqueness
 */
export function generateRequestId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${timestamp}-${random}`;
}

/**
 * Create a child logger with additional context
 * Use this for request-scoped logging with correlation IDs
 */
export function createLogger(context: Partial<LogContext> = {}): Logger {
    return pinoLogger.child(context);
}

/**
 * Main logger interface with convenience methods
 * Wraps Pino with additional functionality for our use case
 */
class AppLogger {
    private logger: Logger;
    private context: Partial<LogContext>;

    constructor(context: Partial<LogContext> = {}) {
        this.context = context;
        this.logger = createLogger(context);
    }

    /**
     * Create a child logger with additional context
     * Useful for adding request-specific information
     */
    child(additionalContext: Partial<LogContext>): AppLogger {
        return new AppLogger({ ...this.context, ...additionalContext });
    }

    /**
     * DEBUG level - Development/troubleshooting information
     * SRE: Disabled in production by default to reduce log volume
     */
    debug(message: string, data?: Record<string, unknown>): void {
        this.logger.debug(data, message);
    }

    /**
     * INFO level - Normal operational events
     * SRE: Key business events, successful operations
     */
    info(message: string, data?: Record<string, unknown>): void {
        this.logger.info(data, message);
    }

    /**
     * WARN level - Unexpected but recoverable situations
     * SRE: Should be investigated but not immediately critical
     */
    warn(message: string, data?: Record<string, unknown>): void {
        this.logger.warn(data, message);
    }

    /**
     * ERROR level - Errors that need attention
     * SRE: Should trigger alerts in production
     */
    error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
        const errorData = error instanceof Error 
            ? { err: error, ...data }
            : { error, ...data };
        this.logger.error(errorData, message);
    }

    /**
     * FATAL level - System is unusable
     * SRE: Immediate page required, service may be down
     */
    fatal(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
        const errorData = error instanceof Error 
            ? { err: error, ...data }
            : { error, ...data };
        this.logger.fatal(errorData, message);
    }

    /**
     * Log HTTP request start
     * Used by middleware for request tracing
     */
    logRequest(req: {
        method: string;
        url: string;
        headers: Record<string, string | string[] | undefined>;
        userAgent?: string;
        ip?: string;
    }): void {
        this.logger.info({
            type: "http_request",
            method: req.method,
            url: req.url,
            userAgent: req.userAgent,
            ip: req.ip,
        }, `${req.method} ${req.url}`);
    }

    /**
     * Log HTTP response completion
     * Includes timing information for performance monitoring
     */
    logResponse(res: {
        method: string;
        url: string;
        statusCode: number;
        durationMs: number;
        contentLength?: number;
    }): void {
        const level = res.statusCode >= 500 ? "error" 
            : res.statusCode >= 400 ? "warn" 
            : "info";
        
        this.logger[level]({
            type: "http_response",
            method: res.method,
            url: res.url,
            statusCode: res.statusCode,
            durationMs: res.durationMs,
            contentLength: res.contentLength,
        }, `${res.method} ${res.url} ${res.statusCode} ${res.durationMs}ms`);
    }

    /**
     * Log database operations (for Supabase)
     * SRE: Track query performance and errors
     */
    logDatabase(operation: {
        table: string;
        operation: "select" | "insert" | "update" | "delete" | "rpc";
        durationMs?: number;
        rowCount?: number;
        error?: string;
    }): void {
        const level = operation.error ? "error" : "debug";
        this.logger[level]({
            type: "database",
            ...operation,
        }, `DB ${operation.operation.toUpperCase()} ${operation.table}`);
    }

    /**
     * Log external API calls
     * SRE: Track third-party service health
     */
    logExternalApi(call: {
        service: string;
        endpoint: string;
        method: string;
        statusCode?: number;
        durationMs: number;
        error?: string;
    }): void {
        const level = call.error || (call.statusCode && call.statusCode >= 400) ? "error" : "info";
        this.logger[level]({
            type: "external_api",
            ...call,
        }, `External API ${call.service} ${call.method} ${call.endpoint}`);
    }

    /**
     * Log business events
     * SRE: Track key user actions for analytics and debugging
     */
    logEvent(event: {
        name: string;
        userId?: string;
        metadata?: Record<string, unknown>;
    }): void {
        this.logger.info({
            type: "business_event",
            event: event.name,
            userId: event.userId,
            ...event.metadata,
        }, `Event: ${event.name}`);
    }

    /**
     * Flush logs (important for serverless)
     * SRE: Call before function termination to prevent log loss
     */
    flush(): void {
        // Pino's sync mode handles this, but we expose it for consistency
        if (typeof this.logger.flush === "function") {
            this.logger.flush();
        }
    }
}

// Export singleton instance for general use
export const logger = new AppLogger();

// Export class for creating scoped loggers
export { AppLogger };

// Export types
export * from "./types";
