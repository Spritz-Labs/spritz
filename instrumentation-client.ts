import * as Sentry from "@sentry/nextjs";

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN && typeof window !== "undefined") {
    Sentry.init({
        dsn: DSN,
        environment:
            process.env.NEXT_PUBLIC_VERCEL_ENV ??
            process.env.NODE_ENV ??
            "development",
        // Off by default. Session replay is expensive and we haven't done
        // the legal review yet. Flip to >0 once we do.
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        tracesSampleRate: 0.05,
        sendDefaultPii: false,
        // Noise that we've already debugged (wallet/provider detection
        // probes, extension errors etc). Drop them at the source so Issues
        // stays signal-over-noise.
        ignoreErrors: [
            // Browser extensions commonly throw these when injecting into
            // our page; not actionable.
            "Non-Error promise rejection captured",
            "ResizeObserver loop limit exceeded",
            "ResizeObserver loop completed with undelivered notifications",
            // Third-party wallet providers
            "The user rejected the request",
            "User rejected the request",
            // WalletConnect / Waku transport warnings we already ignore in
            // sentryClient + our own logger.
            "WebSocket connection closed before the connection is established",
        ],
        beforeSend(event) {
            if (event.request?.url) {
                try {
                    const u = new URL(event.request.url);
                    for (const [k] of u.searchParams) {
                        const lower = k.toLowerCase();
                        if (
                            lower.includes("address") ||
                            lower.includes("token") ||
                            lower.includes("key") ||
                            lower.includes("wallet")
                        ) {
                            u.searchParams.set(k, "[REDACTED]");
                        }
                    }
                    event.request.url = u.toString();
                } catch {
                    // ignore — url stays as-is
                }
            }
            return event;
        },
    });
}

// Report client-side navigations so the performance tab in Sentry has
// something to correlate errors against.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
