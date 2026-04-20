/**
 * Next.js instrumentation hook. Runs exactly once when each runtime
 * (nodejs / edge / browser) boots. We use it to initialise Sentry so server
 * and edge routes get proper error capture, and to forward request errors
 * to Sentry's captureRequestError.
 *
 * Everything here is gated on SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN — if the
 * DSN is not set the SDK is still imported but does nothing, which is the
 * documented behaviour of @sentry/nextjs.
 */
export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        await import("./sentry.server.config");
    }
    if (process.env.NEXT_RUNTIME === "edge") {
        await import("./sentry.edge.config");
    }
}

// Forward React Server Component / Server Action errors to Sentry. This is a
// dynamic re-export so a missing Sentry install doesn't break type-checking
// in dev environments that don't have the SDK yet.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
