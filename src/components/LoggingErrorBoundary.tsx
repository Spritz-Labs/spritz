"use client";

/**
 * Error Boundary with Logging
 *
 * SRE Rationale:
 * - Catches React component errors that would otherwise crash the app
 * - Logs errors with full context for debugging
 * - Provides user-friendly error UI with recovery options
 * - Tracks error frequency for reliability metrics
 */

import React, { Component, ErrorInfo, ReactNode } from "react";
import { clientLogger } from "@/lib/logger/client";
import { captureClientException } from "@/lib/sentryClient";

interface ErrorBoundaryProps {
    /** Child components to render */
    children: ReactNode;

    /** Optional fallback UI component */
    fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);

    /** Component name for logging context */
    componentName?: string;

    /** Called when an error is caught */
    onError?: (error: Error, errorInfo: ErrorInfo) => void;

    /** Show error details (development only) */
    showDetails?: boolean;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
    errorId: string | null;
}

/**
 * Generate a unique error ID for support reference
 */
function generateErrorId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `ERR-${timestamp}-${random}`.toUpperCase();
}

/**
 * Error Boundary Component
 *
 * Usage:
 * ```tsx
 * <LoggingErrorBoundary componentName="Dashboard">
 *   <Dashboard />
 * </LoggingErrorBoundary>
 * ```
 */
export class LoggingErrorBoundary extends Component<
    ErrorBoundaryProps,
    ErrorBoundaryState
> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
            errorId: null,
        };
    }

    /**
     * Update state when an error is caught
     */
    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return {
            hasError: true,
            error,
            errorId: generateErrorId(),
        };
    }

    /**
     * Log the error with full context
     */
    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        const { componentName, onError } = this.props;
        const { errorId } = this.state;

        // Update state with error info
        this.setState({ errorInfo });

        // Log to client logger
        clientLogger.error("React Error Boundary caught an error", {
            errorId,
            componentName: componentName || "Unknown",
            errorMessage: error.message,
            errorName: error.name,
            errorStack: error.stack,
            componentStack: errorInfo.componentStack,
            url:
                typeof window !== "undefined"
                    ? window.location.href
                    : "unknown",
        });

        // Report to Sentry when NEXT_PUBLIC_SENTRY_DSN is set (PII redacted)
        captureClientException(error, {
            errorId: this.state.errorId ?? undefined,
            componentName: componentName || "Unknown",
            url:
                typeof window !== "undefined"
                    ? window.location.pathname
                    : "unknown",
            componentStack: errorInfo.componentStack?.slice(0, 500),
        });

        // Call optional error callback
        if (onError) {
            onError(error, errorInfo);
        }
    }

    /**
     * Reset the error boundary to try rendering again
     */
    handleReset = (): void => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
            errorId: null,
        });
    };

    /**
     * Reload the page
     */
    handleReload = (): void => {
        window.location.reload();
    };

    render(): ReactNode {
        const { children, fallback, showDetails } = this.props;
        const { hasError, error, errorInfo, errorId } = this.state;

        if (hasError && error) {
            // If a custom fallback is provided, use it
            if (fallback) {
                if (typeof fallback === "function") {
                    return fallback(error, this.handleReset);
                }
                return fallback;
            }

            // Default error UI
            const isDev = process.env.NODE_ENV !== "production";
            const shouldShowDetails = showDetails ?? isDev;

            return (
                <div className="min-h-[200px] flex items-center justify-center p-6">
                    <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
                        {/* Error Icon */}
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                            <svg
                                className="w-8 h-8 text-red-500"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                />
                            </svg>
                        </div>

                        {/* Error Message */}
                        <h2 className="text-xl font-semibold text-white mb-2">
                            Something went wrong
                        </h2>
                        <p className="text-zinc-400 mb-4">
                            An unexpected error occurred. Our team has been
                            notified.
                        </p>

                        {/* Error ID for support */}
                        {errorId && (
                            <p className="text-xs text-zinc-500 mb-4">
                                Error ID:{" "}
                                <code className="bg-zinc-800 px-2 py-1 rounded">
                                    {errorId}
                                </code>
                            </p>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={this.handleReset}
                                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
                            >
                                Try Again
                            </button>
                            <button
                                onClick={this.handleReload}
                                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
                            >
                                Reload Page
                            </button>
                        </div>

                        {/* Error Details (Development) */}
                        {shouldShowDetails && (
                            <details className="mt-6 text-left">
                                <summary className="text-sm text-zinc-500 cursor-pointer hover:text-zinc-400">
                                    Error Details
                                </summary>
                                <div className="mt-2 p-3 bg-zinc-950 rounded-lg overflow-auto max-h-[200px]">
                                    <p className="text-red-400 font-mono text-xs mb-2">
                                        {error.name}: {error.message}
                                    </p>
                                    {error.stack && (
                                        <pre className="text-zinc-500 font-mono text-xs whitespace-pre-wrap">
                                            {error.stack}
                                        </pre>
                                    )}
                                    {errorInfo?.componentStack && (
                                        <>
                                            <p className="text-zinc-400 font-mono text-xs mt-4 mb-2">
                                                Component Stack:
                                            </p>
                                            <pre className="text-zinc-500 font-mono text-xs whitespace-pre-wrap">
                                                {errorInfo.componentStack}
                                            </pre>
                                        </>
                                    )}
                                </div>
                            </details>
                        )}
                    </div>
                </div>
            );
        }

        return children;
    }
}

/**
 * HOC to wrap a component with error boundary
 *
 * Usage:
 * ```tsx
 * export default withErrorBoundary(MyComponent, "MyComponent");
 * ```
 */
export function withErrorBoundary<P extends object>(
    WrappedComponent: React.ComponentType<P>,
    componentName?: string,
): React.ComponentType<P> {
    const displayName =
        componentName ||
        WrappedComponent.displayName ||
        WrappedComponent.name ||
        "Component";

    const WithErrorBoundary: React.FC<P> = (props) => (
        <LoggingErrorBoundary componentName={displayName}>
            <WrappedComponent {...props} />
        </LoggingErrorBoundary>
    );

    WithErrorBoundary.displayName = `WithErrorBoundary(${displayName})`;

    return WithErrorBoundary;
}

/**
 * Hook-based error boundary for functional components
 * Note: This requires React 18+ and experimental features
 * For now, use the class-based LoggingErrorBoundary
 */

export default LoggingErrorBoundary;
