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

/**
 * Report an error to Sentry when NEXT_PUBLIC_SENTRY_DSN is set.
 * Context is redacted (no wallet addresses or tokens).
 * Safe to call from error boundaries; no-op when DSN is missing.
 *
 * Since instrumentation-client.ts already initialises @sentry/nextjs on boot,
 * this helper just forwards to the already-initialised SDK instead of doing
 * a second init (which would cause duplicate events).
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
    // Dynamic import keeps @sentry/nextjs out of the critical-path bundle when
    // the DSN isn't configured (e.g. local dev).
    import("@sentry/nextjs")
        .then((Sentry) => {
            Sentry.captureException(error, { extra: safeContext });
        })
        .catch(() => {
            // Ignore load/report errors — not actionable and we don't want
            // to recursively trigger another error from error handling.
        });
}

// Re-export for consumers that want to avoid an extra redirection and the
// PII-redaction wrapper above.
export { redactUrl };
