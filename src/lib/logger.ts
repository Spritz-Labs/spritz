/**
 * Centralized logger utility for Spritz
 * 
 * - In production: Only errors are logged
 * - In development: All logs are shown
 * - Debug logs can be enabled via localStorage: localStorage.setItem('spritz_debug', 'true')
 */

const isDev = process.env.NODE_ENV === 'development';

// Check if debug mode is enabled (can be toggled in browser console)
const isDebugEnabled = (): boolean => {
    if (typeof window === 'undefined') return isDev;
    return isDev || localStorage.getItem('spritz_debug') === 'true';
};

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
    prefix?: string;
    enabled?: boolean;
}

class Logger {
    private prefix: string;
    private enabled: boolean;

    constructor(options: LoggerOptions = {}) {
        this.prefix = options.prefix ? `[${options.prefix}]` : '';
        this.enabled = options.enabled ?? true;
    }

    private formatArgs(args: unknown[]): unknown[] {
        if (this.prefix) {
            return [this.prefix, ...args];
        }
        return args;
    }

    debug(...args: unknown[]): void {
        if (this.enabled && isDebugEnabled()) {
            console.log(...this.formatArgs(args));
        }
    }

    info(...args: unknown[]): void {
        if (this.enabled && isDebugEnabled()) {
            console.info(...this.formatArgs(args));
        }
    }

    warn(...args: unknown[]): void {
        if (this.enabled) {
            console.warn(...this.formatArgs(args));
        }
    }

    error(...args: unknown[]): void {
        if (this.enabled) {
            console.error(...this.formatArgs(args));
        }
    }

    // For temporary debugging - always logs regardless of environment
    trace(...args: unknown[]): void {
        console.log(...this.formatArgs(['[TRACE]', ...args]));
    }
}

// Create named loggers for different modules
export const createLogger = (prefix: string, enabled = true): Logger => {
    return new Logger({ prefix, enabled });
};

// Default logger instance
export const logger = new Logger();

// Pre-configured loggers for common modules
export const authLogger = createLogger('Auth');
export const chatLogger = createLogger('Chat');
export const callLogger = createLogger('Call');
export const walletLogger = createLogger('Wallet');
export const apiLogger = createLogger('API');

export default logger;
