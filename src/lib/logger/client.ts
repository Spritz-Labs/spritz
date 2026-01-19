"use client";

/**
 * Client-Side Logger
 * 
 * SRE Rationale:
 * - Captures frontend errors and user interactions
 * - Batches logs to reduce network overhead
 * - Sends to server endpoint for aggregation
 * - Graceful degradation if logging fails
 * - Session correlation for user journey tracking
 */

import { LogLevel, LogContext } from "./types";

/**
 * Configuration for the client logger
 */
interface ClientLoggerConfig {
    /** Endpoint to send logs to */
    endpoint: string;
    /** Minimum log level to send */
    level: LogLevel;
    /** Batch size before flushing */
    batchSize: number;
    /** Flush interval in milliseconds */
    flushIntervalMs: number;
    /** Include console output */
    consoleOutput: boolean;
    /** Sampling rate (0-1) for info/debug logs */
    samplingRate: number;
}

/**
 * Client log entry structure
 */
interface ClientLogEntry {
    level: LogLevel;
    message: string;
    timestamp: string;
    sessionId: string;
    url: string;
    userAgent: string;
    data?: Record<string, unknown>;
}

/**
 * Log level numeric values for comparison
 */
const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
};

/**
 * Generate a unique session ID for correlation
 */
function generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `sess_${timestamp}_${random}`;
}

/**
 * Check if running in browser
 */
function isBrowser(): boolean {
    return typeof window !== "undefined";
}

/**
 * Get or create session ID from sessionStorage
 */
function getSessionId(): string {
    if (!isBrowser()) return "server";
    
    const storageKey = "spritz_log_session";
    let sessionId = sessionStorage.getItem(storageKey);
    
    if (!sessionId) {
        sessionId = generateSessionId();
        sessionStorage.setItem(storageKey, sessionId);
    }
    
    return sessionId;
}

/**
 * Client Logger Class
 * Handles batching, sampling, and sending logs to server
 */
class ClientLogger {
    private config: ClientLoggerConfig;
    private logBuffer: ClientLogEntry[] = [];
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    private sessionId: string;
    private context: Partial<LogContext> = {};

    constructor(config: Partial<ClientLoggerConfig> = {}) {
        this.config = {
            endpoint: "/api/logs/client",
            level: (process.env.NEXT_PUBLIC_LOG_LEVEL as LogLevel) || "info",
            batchSize: 10,
            flushIntervalMs: 5000,
            consoleOutput: process.env.NODE_ENV !== "production",
            samplingRate: 1.0,
            ...config,
        };

        this.sessionId = getSessionId();
        
        // Set up automatic flushing
        if (isBrowser()) {
            this.startFlushTimer();
            
            // Flush on page unload
            window.addEventListener("beforeunload", () => this.flush());
            window.addEventListener("pagehide", () => this.flush());
            
            // Capture unhandled errors
            window.addEventListener("error", (event) => {
                this.error("Unhandled error", {
                    message: event.message,
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno,
                    stack: event.error?.stack,
                });
            });
            
            // Capture unhandled promise rejections
            window.addEventListener("unhandledrejection", (event) => {
                this.error("Unhandled promise rejection", {
                    reason: String(event.reason),
                    stack: event.reason?.stack,
                });
            });
        }
    }

    /**
     * Set additional context for all logs
     */
    setContext(context: Partial<LogContext>): void {
        this.context = { ...this.context, ...context };
    }

    /**
     * Clear context
     */
    clearContext(): void {
        this.context = {};
    }

    /**
     * Create a child logger with additional context
     */
    child(context: Partial<LogContext>): ClientLogger {
        const childLogger = new ClientLogger(this.config);
        childLogger.context = { ...this.context, ...context };
        childLogger.sessionId = this.sessionId;
        return childLogger;
    }

    /**
     * Check if log level should be logged
     */
    private shouldLog(level: LogLevel): boolean {
        return LOG_LEVEL_VALUES[level] >= LOG_LEVEL_VALUES[this.config.level];
    }

    /**
     * Apply sampling for high-volume logs
     */
    private shouldSample(level: LogLevel): boolean {
        // Always log errors and warnings
        if (level === "error" || level === "warn" || level === "fatal") {
            return true;
        }
        return Math.random() < this.config.samplingRate;
    }

    /**
     * Core logging method
     */
    private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
        if (!this.shouldLog(level) || !this.shouldSample(level)) {
            return;
        }

        const entry: ClientLogEntry = {
            level,
            message,
            timestamp: new Date().toISOString(),
            sessionId: this.sessionId,
            url: isBrowser() ? window.location.href : "server",
            userAgent: isBrowser() ? navigator.userAgent : "server",
            data: {
                ...this.context,
                ...data,
            },
        };

        // Console output in development
        if (this.config.consoleOutput) {
            const consoleMethod = level === "fatal" ? "error" : level;
            const consoleFn = console[consoleMethod as keyof Console] as (...args: unknown[]) => void;
            if (typeof consoleFn === "function") {
                consoleFn(`[${level.toUpperCase()}] ${message}`, data || "");
            }
        }

        // Add to buffer
        this.logBuffer.push(entry);

        // Flush if buffer is full
        if (this.logBuffer.length >= this.config.batchSize) {
            this.flush();
        }
    }

    /**
     * DEBUG level logging
     */
    debug(message: string, data?: Record<string, unknown>): void {
        this.log("debug", message, data);
    }

    /**
     * INFO level logging
     */
    info(message: string, data?: Record<string, unknown>): void {
        this.log("info", message, data);
    }

    /**
     * WARN level logging
     */
    warn(message: string, data?: Record<string, unknown>): void {
        this.log("warn", message, data);
    }

    /**
     * ERROR level logging
     */
    error(message: string, data?: Record<string, unknown>): void {
        this.log("error", message, data);
    }

    /**
     * FATAL level logging
     */
    fatal(message: string, data?: Record<string, unknown>): void {
        this.log("fatal", message, data);
        // Immediately flush fatal logs
        this.flush();
    }

    /**
     * Log a user interaction/event
     */
    logEvent(eventName: string, properties?: Record<string, unknown>): void {
        this.info(`Event: ${eventName}`, {
            eventType: "user_event",
            eventName,
            ...properties,
        });
    }

    /**
     * Log a page view
     */
    logPageView(pageName?: string): void {
        if (!isBrowser()) return;
        
        this.info("Page view", {
            eventType: "page_view",
            pageName: pageName || document.title,
            path: window.location.pathname,
            referrer: document.referrer,
        });
    }

    /**
     * Log API call timing
     */
    logApiCall(endpoint: string, method: string, durationMs: number, status: number): void {
        const level = status >= 500 ? "error" : status >= 400 ? "warn" : "debug";
        this.log(level, `API ${method} ${endpoint}`, {
            eventType: "api_call",
            endpoint,
            method,
            durationMs,
            status,
        });
    }

    /**
     * Log performance metric
     */
    logPerformance(metric: string, value: number, unit = "ms"): void {
        this.debug(`Performance: ${metric}`, {
            eventType: "performance",
            metric,
            value,
            unit,
        });
    }

    /**
     * Start the automatic flush timer
     */
    private startFlushTimer(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        
        this.flushTimer = setInterval(() => {
            if (this.logBuffer.length > 0) {
                this.flush();
            }
        }, this.config.flushIntervalMs);
    }

    /**
     * Flush logs to the server
     */
    flush(): void {
        if (this.logBuffer.length === 0 || !isBrowser()) {
            return;
        }

        const logsToSend = [...this.logBuffer];
        this.logBuffer = [];

        // Use sendBeacon for reliable delivery on page unload
        // Fall back to fetch for normal operation
        const payload = JSON.stringify({ logs: logsToSend });
        
        if (navigator.sendBeacon) {
            const success = navigator.sendBeacon(this.config.endpoint, payload);
            if (!success) {
                // Fall back to fetch if sendBeacon fails
                this.sendViaFetch(payload);
            }
        } else {
            this.sendViaFetch(payload);
        }
    }

    /**
     * Send logs via fetch API
     */
    private async sendViaFetch(payload: string): Promise<void> {
        try {
            await fetch(this.config.endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: payload,
                // Don't wait for response, just fire and forget
                keepalive: true,
            });
        } catch (error) {
            // Silently fail - don't let logging errors affect the app
            if (process.env.NODE_ENV !== "production") {
                console.warn("Failed to send logs:", error);
            }
        }
    }
}

// Export singleton instance
export const clientLogger = new ClientLogger();

// Export class for custom instances
export { ClientLogger };

// Export hook for React components
export function useLogger(component?: string) {
    const logger = component 
        ? clientLogger.child({ component }) 
        : clientLogger;
    
    return logger;
}
