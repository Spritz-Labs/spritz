# Production Logging System

A comprehensive, production-grade logging system for Next.js applications deployed on Vercel with Supabase.

## Features

- **Structured JSON Logging** - Machine-parseable logs for aggregation
- **Request Tracing** - Correlation IDs for distributed tracing
- **Sensitive Data Redaction** - Automatic PII/credential removal
- **Performance Monitoring** - Request timing and slow query detection
- **Error Boundaries** - React error capture with context
- **Client-Side Logging** - Batched browser logs with offline support
- **Supabase Integration** - Database operation logging

## Environment Variables

Add these to your Vercel environment:

```bash
# Logging Configuration
LOG_LEVEL=info                    # fatal, error, warn, info, debug, trace
SERVICE_NAME=spritz-app           # Service identifier in logs
NEXT_PUBLIC_LOG_LEVEL=warn        # Client-side log level

# Optional: External Log Aggregation
DATADOG_API_KEY=                  # For Datadog integration
LOGTAIL_SOURCE_TOKEN=             # For Logtail/Better Stack
```

## Quick Start

### Server-Side Logging (API Routes)

```typescript
import { logger } from "@/lib/logger";

// Basic logging
logger.info("User signed up", { userId: "123" });
logger.warn("Rate limit approaching", { remaining: 10 });
logger.error("Payment failed", error, { orderId: "456" });

// With request context
import { withLogging } from "@/lib/logger/middleware";

export const POST = withLogging(async (request, { logger, requestId }) => {
  logger.info("Processing order");
  
  // Your logic here
  
  return NextResponse.json({ success: true });
});
```

### Client-Side Logging

```typescript
"use client";
import { clientLogger, useLogger } from "@/lib/logger/client";

// Direct usage
clientLogger.info("Button clicked", { buttonId: "submit" });
clientLogger.error("Form validation failed", { errors });

// In React components
function MyComponent() {
  const log = useLogger("MyComponent");
  
  const handleClick = () => {
    log.logEvent("button_click", { action: "submit" });
  };
  
  return <button onClick={handleClick}>Submit</button>;
}
```

### Error Boundaries

```tsx
import { LoggingErrorBoundary } from "@/components/LoggingErrorBoundary";

function App() {
  return (
    <LoggingErrorBoundary componentName="Dashboard">
      <Dashboard />
    </LoggingErrorBoundary>
  );
}
```

### Supabase Logging

```typescript
import { loggedQuery } from "@/lib/logger/supabase";
import { supabase } from "@/config/supabase";

// Wrap queries with logging
const { data, error } = await loggedQuery(
  supabase.from("users").select("*").eq("id", userId),
  { table: "users", operation: "select" }
);
```

## Log Levels

| Level | Use Case | Example |
|-------|----------|---------|
| `fatal` | System is unusable | Database connection lost |
| `error` | Error that needs attention | API request failed |
| `warn` | Unexpected but recoverable | Rate limit warning |
| `info` | Normal operational events | User signed up |
| `debug` | Development troubleshooting | Query result |
| `trace` | Very detailed debugging | Function entry/exit |

## Log Structure

Every log entry includes:

```json
{
  "level": "info",
  "time": "2024-01-15T10:30:00.000Z",
  "service": "spritz-app",
  "env": "production",
  "version": "a1b2c3d",
  "requestId": "lxyz123-abc456",
  "msg": "User signed up",
  "userId": "user_abc123"
}
```

## Vercel Integration

### Log Drains

Vercel supports log drains to forward logs to external services:

1. Go to Project Settings → Log Drains
2. Add your preferred service (Datadog, Logtail, etc.)
3. Configure the endpoint and authentication

### Recommended Services

- **Logtail/Better Stack** - Great free tier, easy setup
- **Datadog** - Full APM suite, pricier
- **Axiom** - Vercel native integration
- **New Relic** - Comprehensive monitoring

## Security & Privacy

### Automatic Redaction

These fields are automatically redacted:
- `password`, `token`, `apiKey`, `secret`
- `authorization` header
- Credit card numbers, emails (pattern-based)
- Wallet private keys and seed phrases

### IP Anonymization

IP addresses are anonymized by default (last two octets zeroed).

### Custom Redaction

```typescript
import { redactSensitiveData } from "@/lib/logger/redaction";

const safeData = redactSensitiveData({
  email: "user@example.com",
  password: "secret123"
});
// { email: "[REDACTED]", password: "[REDACTED]" }
```

## Monitoring & Alerts

### Health Check

```bash
# Quick health check
curl https://your-app.vercel.app/api/health?shallow=true

# Deep health check with dependency status
curl https://your-app.vercel.app/api/health
```

### Example Alert Rules

Set up alerts for:
- `level:error` count > 10 in 5 minutes
- `durationMs` > 5000 for API requests
- `status:unhealthy` from health endpoint

## Performance Tips

1. **Use appropriate log levels** - Debug logs are disabled in production
2. **Avoid logging large payloads** - Truncate or summarize
3. **Batch client logs** - Default 10 logs per request
4. **Sample high-volume logs** - Use `samplingRate` config

## Troubleshooting

### Logs not appearing in Vercel

1. Check LOG_LEVEL is set correctly
2. Ensure `sync: true` in serverless config
3. Check log drain is configured

### Client logs not sending

1. Check browser console for errors
2. Verify `/api/logs/client` endpoint is accessible
3. Check batch size and flush interval

### Missing request IDs

Ensure you're using `withLogging` middleware or manually passing request IDs.
