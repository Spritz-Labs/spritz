import * as Sentry from "@sentry/nextjs";

const DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
    Sentry.init({
        dsn: DSN,
        environment:
            process.env.VERCEL_ENV ??
            process.env.NODE_ENV ??
            "development",
        // Edge runtime has a tight CPU budget and is typically used for
        // middleware / web-vitals — keep tracing minimal.
        tracesSampleRate: 0.01,
        sendDefaultPii: false,
        beforeSend(event) {
            if (event.request) {
                delete event.request.cookies;
                delete event.request.headers;
            }
            return event;
        },
    });
}
