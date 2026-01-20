"use client";

/**
 * Root Error Boundary Wrapper
 * 
 * SRE-012 FIX: This component wraps the entire application to catch
 * any unhandled errors and provide a graceful recovery UI.
 * 
 * Must be a client component since Error Boundaries require class components.
 */

import { ReactNode } from "react";
import { LoggingErrorBoundary } from "./LoggingErrorBoundary";

interface RootErrorBoundaryProps {
    children: ReactNode;
}

/**
 * Root-level error fallback UI
 * Provides a full-page error display with recovery options
 */
function RootErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-6">
            <div className="max-w-lg w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
                {/* Error Icon */}
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
                    <svg 
                        className="w-10 h-10 text-red-500" 
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

                {/* Branding */}
                <h1 className="text-2xl font-bold text-white mb-2">
                    Spritz encountered an error
                </h1>
                
                <p className="text-zinc-400 mb-6">
                    We apologize for the inconvenience. The application encountered an unexpected error.
                    Please try again or reload the page.
                </p>

                {/* Error message (production-safe) */}
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 mb-6 text-left">
                    <p className="text-sm text-zinc-500 font-mono">
                        {error.name}: {error.message.slice(0, 200)}
                        {error.message.length > 200 ? "..." : ""}
                    </p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4 justify-center">
                    <button
                        onClick={reset}
                        className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors font-medium"
                    >
                        Try Again
                    </button>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-colors font-medium"
                    >
                        Reload Page
                    </button>
                </div>

                {/* Help link */}
                <p className="mt-6 text-sm text-zinc-500">
                    If this problem persists, please{" "}
                    <a 
                        href="https://twitter.com/spritz_chat" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-orange-400 hover:text-orange-300"
                    >
                        contact support
                    </a>
                </p>
            </div>
        </div>
    );
}

export function RootErrorBoundary({ children }: RootErrorBoundaryProps) {
    return (
        <LoggingErrorBoundary 
            componentName="RootLayout"
            fallback={(error, reset) => <RootErrorFallback error={error} reset={reset} />}
        >
            {children}
        </LoggingErrorBoundary>
    );
}

export default RootErrorBoundary;
