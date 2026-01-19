/**
 * Supabase Logging Wrapper
 * 
 * SRE Rationale:
 * - Automatic logging of all database operations
 * - Query timing for performance monitoring
 * - Error capture with context for debugging
 * - Row count tracking for capacity planning
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { logger, AppLogger } from "./index";

/**
 * Configuration for the Supabase logger
 */
interface SupabaseLoggerConfig {
    /** Log all queries (debug level) */
    logAllQueries: boolean;
    /** Log slow queries (warn level) - threshold in ms */
    slowQueryThreshold: number;
    /** Log query results (debug level) - may contain sensitive data */
    logResults: boolean;
    /** Maximum rows to log */
    maxRowsToLog: number;
}

const defaultConfig: SupabaseLoggerConfig = {
    logAllQueries: process.env.NODE_ENV !== "production",
    slowQueryThreshold: 1000, // 1 second
    logResults: false,
    maxRowsToLog: 100,
};

/**
 * Wrap a Supabase query with logging
 * 
 * Usage:
 * ```ts
 * const { data, error } = await loggedQuery(
 *   supabase.from("users").select("*").eq("id", userId),
 *   { table: "users", operation: "select" }
 * );
 * ```
 */
export async function loggedQuery<T>(
    queryBuilder: PromiseLike<{ data: T | null; error: Error | null; count?: number | null }>,
    context: {
        table: string;
        operation: "select" | "insert" | "update" | "delete" | "rpc";
        requestLogger?: AppLogger;
    },
    config: Partial<SupabaseLoggerConfig> = {}
): Promise<{ data: T | null; error: Error | null; count?: number | null }> {
    const mergedConfig = { ...defaultConfig, ...config };
    const log = context.requestLogger || logger;
    const startTime = performance.now();

    try {
        const result = await queryBuilder;
        const durationMs = Math.round(performance.now() - startTime);
        
        // Determine row count
        const rowCount = result.count ?? (Array.isArray(result.data) ? result.data.length : result.data ? 1 : 0);

        // Log based on conditions
        if (result.error) {
            // Always log errors
            log.error(`Database error on ${context.table}`, result.error, {
                table: context.table,
                operation: context.operation,
                durationMs,
                errorMessage: result.error.message,
            });
        } else if (durationMs > mergedConfig.slowQueryThreshold) {
            // Log slow queries as warnings
            log.warn(`Slow database query on ${context.table}`, {
                table: context.table,
                operation: context.operation,
                durationMs,
                rowCount,
            });
        } else if (mergedConfig.logAllQueries) {
            // Log all queries in debug mode
            log.debug(`Database query on ${context.table}`, {
                table: context.table,
                operation: context.operation,
                durationMs,
                rowCount,
            });
        }

        // Track in structured format for log database
        log.logDatabase({
            table: context.table,
            operation: context.operation,
            durationMs,
            rowCount,
            error: result.error?.message,
        });

        return result;
        
    } catch (error) {
        const durationMs = Math.round(performance.now() - startTime);
        
        log.error(`Database exception on ${context.table}`, error as Error, {
            table: context.table,
            operation: context.operation,
            durationMs,
        });

        log.logDatabase({
            table: context.table,
            operation: context.operation,
            durationMs,
            error: String(error),
        });

        throw error;
    }
}

/**
 * Create a logged Supabase client wrapper
 * 
 * Usage:
 * ```ts
 * const loggedSupabase = createLoggedSupabaseClient(supabase, requestLogger);
 * const { data } = await loggedSupabase.from("users").select("*");
 * ```
 */
export function createLoggedSupabaseClient(
    supabase: SupabaseClient,
    requestLogger?: AppLogger,
    config: Partial<SupabaseLoggerConfig> = {}
): SupabaseClient & { __logged: true } {
    const mergedConfig = { ...defaultConfig, ...config };
    const log = requestLogger || logger;

    // Create a proxy to intercept calls
    return new Proxy(supabase, {
        get(target, prop, receiver) {
            const original = Reflect.get(target, prop, receiver);

            // Intercept the `from` method
            if (prop === "from" && typeof original === "function") {
                return function(table: string) {
                    const builder = original.call(target, table);
                    
                    // Wrap common methods
                    const wrapMethod = (method: "select" | "insert" | "update" | "delete") => {
                        const originalMethod = builder[method];
                        if (typeof originalMethod === "function") {
                            builder[method] = function(...args: unknown[]) {
                                const queryBuilder = originalMethod.apply(builder, args);
                                const startTime = performance.now();
                                
                                // Wrap the then method to capture timing
                                const originalThen = queryBuilder.then.bind(queryBuilder);
                                queryBuilder.then = function(onFulfilled: (value: unknown) => unknown, onRejected: (reason: unknown) => unknown) {
                                    return originalThen((result: { data: unknown; error: Error | null; count?: number | null }) => {
                                        const durationMs = Math.round(performance.now() - startTime);
                                        const rowCount = result.count ?? (Array.isArray(result.data) ? result.data.length : result.data ? 1 : 0);
                                        
                                        if (result.error) {
                                            log.error(`Database error on ${table}`, result.error, {
                                                table,
                                                operation: method,
                                                durationMs,
                                            });
                                        } else if (durationMs > mergedConfig.slowQueryThreshold) {
                                            log.warn(`Slow database query on ${table}`, {
                                                table,
                                                operation: method,
                                                durationMs,
                                                rowCount,
                                            });
                                        } else if (mergedConfig.logAllQueries) {
                                            log.debug(`Database query on ${table}`, {
                                                table,
                                                operation: method,
                                                durationMs,
                                                rowCount,
                                            });
                                        }
                                        
                                        if (onFulfilled) return onFulfilled(result);
                                        return result;
                                    }, onRejected);
                                };
                                
                                return queryBuilder;
                            };
                        }
                    };
                    
                    wrapMethod("select");
                    wrapMethod("insert");
                    wrapMethod("update");
                    wrapMethod("delete");
                    
                    return builder;
                };
            }

            // Intercept RPC calls
            if (prop === "rpc" && typeof original === "function") {
                return function(fn: string, params?: unknown) {
                    const startTime = performance.now();
                    const queryBuilder = original.call(target, fn, params);
                    
                    const originalThen = queryBuilder.then.bind(queryBuilder);
                    queryBuilder.then = function(onFulfilled: (value: unknown) => unknown, onRejected: (reason: unknown) => unknown) {
                        return originalThen((result: { data: unknown; error: Error | null }) => {
                            const durationMs = Math.round(performance.now() - startTime);
                            
                            if (result.error) {
                                log.error(`RPC error on ${fn}`, result.error, {
                                    function: fn,
                                    operation: "rpc",
                                    durationMs,
                                });
                            } else if (durationMs > mergedConfig.slowQueryThreshold) {
                                log.warn(`Slow RPC call: ${fn}`, {
                                    function: fn,
                                    operation: "rpc",
                                    durationMs,
                                });
                            } else if (mergedConfig.logAllQueries) {
                                log.debug(`RPC call: ${fn}`, {
                                    function: fn,
                                    operation: "rpc",
                                    durationMs,
                                });
                            }
                            
                            if (onFulfilled) return onFulfilled(result);
                            return result;
                        }, onRejected);
                    };
                    
                    return queryBuilder;
                };
            }

            return original;
        },
    }) as SupabaseClient & { __logged: true };
}

/**
 * Log a Supabase auth event
 */
export function logAuthEvent(
    event: string,
    session: { user?: { id: string; email?: string } } | null,
    requestLogger?: AppLogger
): void {
    const log = requestLogger || logger;
    
    log.info(`Auth event: ${event}`, {
        eventType: "auth",
        event,
        userId: session?.user?.id,
        // Don't log email for privacy
    });
}

/**
 * Log a Supabase realtime event
 */
export function logRealtimeEvent(
    channel: string,
    event: string,
    payload?: unknown,
    requestLogger?: AppLogger
): void {
    const log = requestLogger || logger;
    
    log.debug(`Realtime event: ${channel}/${event}`, {
        eventType: "realtime",
        channel,
        event,
        // Only log payload structure, not content
        payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : undefined,
    });
}

/**
 * Log Supabase storage operations
 */
export function logStorageEvent(
    bucket: string,
    operation: "upload" | "download" | "delete" | "list",
    path: string,
    durationMs?: number,
    error?: string,
    requestLogger?: AppLogger
): void {
    const log = requestLogger || logger;
    
    if (error) {
        log.error(`Storage error: ${operation} ${bucket}/${path}`, undefined, {
            eventType: "storage",
            bucket,
            operation,
            path,
            error,
        });
    } else {
        log.debug(`Storage: ${operation} ${bucket}/${path}`, {
            eventType: "storage",
            bucket,
            operation,
            path,
            durationMs,
        });
    }
}
