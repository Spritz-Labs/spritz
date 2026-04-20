"use client";

import { useReportWebVitals } from "next/web-vitals";

/**
 * Sends Core Web Vitals + Next.js-specific metrics to our /api/web-vitals
 * endpoint so we can correlate slowness to deploys/routes without pulling in
 * a third-party RUM vendor. Uses sendBeacon so it doesn't block unload.
 */
export function WebVitals() {
    useReportWebVitals((metric) => {
        try {
            const body = JSON.stringify({
                id: metric.id,
                name: metric.name,
                label: metric.label,
                value: metric.value,
                rating: (metric as { rating?: string }).rating ?? null,
                path:
                    typeof window !== "undefined"
                        ? window.location.pathname
                        : "",
                ts: Date.now(),
            });

            if (
                typeof navigator !== "undefined" &&
                typeof navigator.sendBeacon === "function"
            ) {
                // Blob keeps the POST Content-Type as application/json for the
                // beacon path; some browsers reject a raw string.
                navigator.sendBeacon(
                    "/api/web-vitals",
                    new Blob([body], { type: "application/json" })
                );
            } else {
                void fetch("/api/web-vitals", {
                    method: "POST",
                    body,
                    keepalive: true,
                    headers: { "Content-Type": "application/json" },
                });
            }
        } catch {
            // Telemetry must never break the page — swallow.
        }
    });

    return null;
}

export default WebVitals;
