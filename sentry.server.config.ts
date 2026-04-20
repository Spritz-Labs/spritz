import * as Sentry from "@sentry/nextjs";

const DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
    Sentry.init({
        dsn: DSN,
        environment:
            process.env.VERCEL_ENV ??
            process.env.NODE_ENV ??
            "development",
        // Traces are expensive and generate a lot of noise for a chat app; we
        // can crank this back up per-route once we have a budget baseline.
        tracesSampleRate: 0.05,
        // PII redaction is handled by src/lib/sentryClient.ts for the
        // browser. On the server we never want to send user addresses or
        // tokens by default.
        sendDefaultPii: false,
        beforeSend(event) {
            // Strip request cookies/headers — they may contain the session
            // cookie, and we don't want that ever leaving the server.
            if (event.request) {
                delete event.request.cookies;
                delete event.request.headers;
            }
            return event;
        },
    });
}
