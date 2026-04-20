"use client";

import { useEffect } from "react";

/**
 * global-error.tsx is the last line of defence: it replaces the root layout
 * when something errors during the render of the layout itself. It must
 * include its own <html> and <body>.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("[global-error]", {
            message: error?.message,
            digest: error?.digest,
            stack: error?.stack,
        });
    }, [error]);

    return (
        <html lang="en">
            <body
                style={{
                    margin: 0,
                    minHeight: "100vh",
                    background: "#0a0a0a",
                    color: "#fafafa",
                    fontFamily:
                        "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 24,
                }}
            >
                <div style={{ maxWidth: 420, textAlign: "center" }}>
                    <div
                        style={{
                            width: 72,
                            height: 72,
                            margin: "0 auto 16px",
                            borderRadius: 16,
                            background: "rgba(255,85,0,0.1)",
                            border: "1px solid rgba(255,85,0,0.3)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 32,
                        }}
                    >
                        ⚠️
                    </div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
                        Spritz couldn&apos;t load
                    </h1>
                    <p style={{ color: "#a1a1aa", marginTop: 8 }}>
                        A critical error occurred. Refresh to try again.
                    </p>
                    {error?.digest ? (
                        <p
                            style={{
                                color: "#52525b",
                                fontSize: 12,
                                fontFamily: "ui-monospace, monospace",
                                marginTop: 12,
                            }}
                        >
                            ref: {error.digest}
                        </p>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => reset()}
                        style={{
                            marginTop: 20,
                            padding: "12px 24px",
                            borderRadius: 12,
                            border: "none",
                            background:
                                "linear-gradient(90deg,#FF5500,#FB8D22)",
                            color: "white",
                            fontWeight: 600,
                            cursor: "pointer",
                        }}
                    >
                        Try again
                    </button>
                </div>
            </body>
        </html>
    );
}
