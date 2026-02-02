"use client";

/**
 * Optional front-end error reporting to Sentry.
 * Only active when NEXT_PUBLIC_SENTRY_DSN is set (e.g. in .env).
 * Redacts PII (wallet addresses, tokens) from URLs and context.
 */

const DSN =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SENTRY_DSN : "";

/** Redact wallet-like addresses and tokens from a string */
function redactPii(value: string): string {
    if (!value || typeof value !== "string") return value;
    return value
        .replace(/0x[a-fA-F0-9]{40}/g, "[REDACTED]")
        .replace(/[1-9A-HJ-NP-Za-km-z]{32,44}/g, "[REDACTED]");
}

/** Redact URL query params that might contain addresses or tokens */
function redactUrl(url: string): string {
    try {
        const u = new URL(url);
        const redacted = new URL(u.origin + u.pathname);
        u.searchParams.forEach((_v, k) => {
            const lower = k.toLowerCase();
            if (
                lower.includes("address") ||
                lower.includes("token") ||
                lower.includes("key") ||
                lower.includes("wallet")
            ) {
                redacted.searchParams.set(k, "[REDACTED]");
            } else {
                redacted.searchParams.set(k, u.searchParams.get(k) ?? "");
            }
        });
        return redacted.toString();
    } catch {
        return "[REDACTED]";
    }
}

let initialized = false;

/**
 * Report an error to Sentry when NEXT_PUBLIC_SENTRY_DSN is set.
 * Context is redacted (no wallet addresses or tokens).
 * Safe to call from error boundaries; no-op when DSN is missing.
 */
export function captureClientException(
    error: Error,
    context?: Record<string, unknown>,
): void {
    if (typeof window === "undefined" || !DSN) return;
    const safeContext: Record<string, unknown> = {};
    if (context) {
        for (const [k, v] of Object.entries(context)) {
            safeContext[k] = typeof v === "string" ? redactPii(v) : v;
        }
    }
    // Use browser SDK only to avoid pulling server/Prisma code (same DSN works)
    import("@sentry/browser")
        .then((Sentry) => {
            if (!initialized) {
                Sentry.init({
                    dsn: DSN,
                    sendDefaultPii: false,
                    beforeSend(event) {
                        if (event.request?.url) {
                            event.request.url = redactUrl(event.request.url);
                        }
                        if (event.extra) {
                            const extra: Record<string, unknown> = {};
                            for (const [k, v] of Object.entries(event.extra)) {
                                extra[k] =
                                    typeof v === "string" ? redactPii(v) : v;
                            }
                            event.extra = extra;
                        }
                        return event;
                    },
                    tracesSampleRate: 0,
                    replaysSessionSampleRate: 0,
                    replaysOnErrorSampleRate: 0,
                });
                initialized = true;
            }
            Sentry.captureException(error, { extra: safeContext });
        })
        .catch(() => {
            // Ignore load/report errors
        });
}
