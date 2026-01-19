/**
 * TypeScript types for the logging system
 * 
 * SRE Rationale:
 * - Strong typing prevents runtime errors in logging
 * - Consistent context structure for log aggregation queries
 * - Explicit log levels for proper filtering
 */

/**
 * Supported log levels following syslog severity
 * @see https://tools.ietf.org/html/rfc5424
 */
export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

/**
 * Context that can be attached to every log entry
 * Used for correlation and filtering in log aggregators
 */
export interface LogContext {
    /** Unique identifier for the request, used for distributed tracing */
    requestId: string;
    
    /** User's wallet address or identifier (hashed for privacy if needed) */
    userId?: string;
    
    /** Session identifier for tracking user sessions */
    sessionId?: string;
    
    /** API route or page path */
    path?: string;
    
    /** HTTP method */
    method?: string;
    
    /** Client IP address (may be anonymized) */
    clientIp?: string;
    
    /** User agent string */
    userAgent?: string;
    
    /** Feature or component name for log categorization */
    component?: string;
    
    /** Operation or action being performed */
    action?: string;
    
    /** Additional custom metadata */
    metadata?: Record<string, unknown>;
}

/**
 * Structure of a sanitized log entry
 * This is what gets sent to log aggregators
 */
export interface SanitizedLog {
    level: LogLevel;
    time: string;
    service: string;
    env: string;
    version: string;
    msg: string;
    requestId?: string;
    userId?: string;
    [key: string]: unknown;
}

/**
 * HTTP request log structure
 */
export interface HttpRequestLog {
    type: "http_request";
    method: string;
    url: string;
    path: string;
    query?: Record<string, string>;
    userAgent?: string;
    ip?: string;
    referer?: string;
}

/**
 * HTTP response log structure
 */
export interface HttpResponseLog {
    type: "http_response";
    method: string;
    url: string;
    statusCode: number;
    durationMs: number;
    contentLength?: number;
    cached?: boolean;
}

/**
 * Database operation log structure
 */
export interface DatabaseLog {
    type: "database";
    table: string;
    operation: "select" | "insert" | "update" | "delete" | "rpc";
    durationMs?: number;
    rowCount?: number;
    error?: string;
}

/**
 * External API call log structure
 */
export interface ExternalApiLog {
    type: "external_api";
    service: string;
    endpoint: string;
    method: string;
    statusCode?: number;
    durationMs: number;
    error?: string;
}

/**
 * Business event log structure
 */
export interface BusinessEventLog {
    type: "business_event";
    event: string;
    userId?: string;
    [key: string]: unknown;
}

/**
 * Error log structure with stack trace
 */
export interface ErrorLog {
    type: "error";
    message: string;
    stack?: string;
    code?: string;
    name?: string;
    cause?: unknown;
}

/**
 * Performance metrics log structure
 */
export interface PerformanceLog {
    type: "performance";
    metric: string;
    value: number;
    unit: "ms" | "bytes" | "count" | "percent";
    tags?: Record<string, string>;
}

/**
 * Audit log structure for compliance
 */
export interface AuditLog {
    type: "audit";
    action: string;
    actorId: string;
    targetId?: string;
    targetType?: string;
    changes?: {
        field: string;
        oldValue?: unknown;
        newValue?: unknown;
    }[];
    reason?: string;
}

/**
 * Union type for all log entry types
 */
export type LogEntry = 
    | HttpRequestLog 
    | HttpResponseLog 
    | DatabaseLog 
    | ExternalApiLog 
    | BusinessEventLog 
    | ErrorLog 
    | PerformanceLog 
    | AuditLog;

/**
 * Configuration options for the logger
 */
export interface LoggerConfig {
    /** Minimum log level to output */
    level: LogLevel;
    
    /** Service name for log identification */
    serviceName: string;
    
    /** Environment name (production, staging, development) */
    environment: string;
    
    /** Whether to pretty print logs (development only) */
    prettyPrint: boolean;
    
    /** Paths to redact from logs */
    redactPaths: string[];
    
    /** Whether to include stack traces */
    includeStackTraces: boolean;
    
    /** Sampling rate for high-volume logs (0-1) */
    samplingRate?: number;
}

/**
 * Options for log aggregator integration
 */
export interface LogDrainConfig {
    /** Target service (datadog, newrelic, cloudwatch, etc.) */
    provider: "datadog" | "newrelic" | "cloudwatch" | "logtail" | "custom";
    
    /** API key or token for the service */
    apiKey?: string;
    
    /** Custom endpoint URL */
    endpoint?: string;
    
    /** Additional headers to send */
    headers?: Record<string, string>;
    
    /** Batch size for sending logs */
    batchSize?: number;
    
    /** Flush interval in milliseconds */
    flushIntervalMs?: number;
}
