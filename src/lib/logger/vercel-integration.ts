/**
 * Vercel Log Drain Integration
 * 
 * SRE Rationale:
 * - Vercel natively supports log drains to external services
 * - This file provides helpers for common integrations
 * - Configure via Vercel dashboard or vercel.json
 * 
 * Supported Services:
 * - Datadog (via HTTP drain)
 * - Logtail / Better Stack
 * - Axiom (native Vercel integration)
 * - New Relic
 * - Custom HTTP endpoints
 */

/**
 * Log drain configuration for vercel.json
 * 
 * Add to your vercel.json:
 * ```json
 * {
 *   "logDrains": [
 *     {
 *       "deliveryFormat": "json",
 *       "url": "https://your-drain-endpoint",
 *       "headers": {
 *         "Authorization": "Bearer your-token"
 *       }
 *     }
 *   ]
 * }
 * ```
 */

/**
 * Datadog Log Drain Configuration
 * 
 * 1. Get your Datadog API key from https://app.datadoghq.com/organization-settings/api-keys
 * 2. In Vercel dashboard: Project Settings → Integrations → Log Drains
 * 3. Add a new drain with:
 *    - URL: https://http-intake.logs.datadoghq.com/v1/input
 *    - Headers: DD-API-KEY: <your-api-key>
 *    - Format: JSON
 * 
 * Or via API:
 */
export const DATADOG_CONFIG = {
    // US1 (default)
    endpoint: "https://http-intake.logs.datadoghq.com/v1/input",
    // EU
    euEndpoint: "https://http-intake.logs.datadoghq.eu/v1/input",
    // US3
    us3Endpoint: "https://http-intake.logs.us3.datadoghq.com/v1/input",
    
    requiredHeaders: {
        "Content-Type": "application/json",
        "DD-API-KEY": process.env.DATADOG_API_KEY || "",
    },
    
    // Optional: Add these tags to all logs
    defaultTags: [
        `service:${process.env.SERVICE_NAME || "spritz-app"}`,
        `env:${process.env.VERCEL_ENV || "development"}`,
    ],
};

/**
 * Logtail / Better Stack Configuration
 * 
 * 1. Create an account at https://betterstack.com/logtail
 * 2. Create a source and get your source token
 * 3. In Vercel: Add log drain with URL and token
 */
export const LOGTAIL_CONFIG = {
    endpoint: "https://in.logtail.com",
    
    requiredHeaders: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.LOGTAIL_SOURCE_TOKEN || ""}`,
    },
};

/**
 * Axiom Configuration (Native Vercel Integration)
 * 
 * 1. Install Axiom integration from Vercel marketplace
 * 2. Connect your Axiom account
 * 3. Logs are automatically forwarded
 * 
 * No additional configuration needed - Axiom handles it automatically.
 */
export const AXIOM_CONFIG = {
    // Axiom is a native Vercel integration
    // Install from: https://vercel.com/integrations/axiom
    installUrl: "https://vercel.com/integrations/axiom",
};

/**
 * New Relic Configuration
 * 
 * 1. Get your license key from New Relic
 * 2. Configure log drain with New Relic endpoint
 */
export const NEWRELIC_CONFIG = {
    // US endpoint
    endpoint: "https://log-api.newrelic.com/log/v1",
    // EU endpoint
    euEndpoint: "https://log-api.eu.newrelic.com/log/v1",
    
    requiredHeaders: {
        "Content-Type": "application/json",
        "Api-Key": process.env.NEW_RELIC_LICENSE_KEY || "",
    },
};

/**
 * Custom HTTP Endpoint
 * 
 * For custom log aggregation, you can send logs to any HTTP endpoint.
 * This is useful for self-hosted solutions like:
 * - Elasticsearch / OpenSearch
 * - Loki (Grafana)
 * - Fluentd
 * - Custom APIs
 */
export interface CustomDrainConfig {
    endpoint: string;
    headers: Record<string, string>;
    batchSize?: number;
    flushIntervalMs?: number;
}

/**
 * Example: Send logs to a custom endpoint
 * 
 * This can be used for additional log processing
 * beyond Vercel's built-in log drains.
 */
export async function sendToCustomDrain(
    logs: unknown[],
    config: CustomDrainConfig
): Promise<boolean> {
    try {
        const response = await fetch(config.endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...config.headers,
            },
            body: JSON.stringify(logs),
        });
        
        return response.ok;
    } catch (error) {
        console.error("Failed to send logs to custom drain:", error);
        return false;
    }
}

/**
 * Vercel Function Log Format
 * 
 * Vercel function logs have this structure:
 * {
 *   "timestamp": 1234567890123,
 *   "requestId": "...",
 *   "statusCode": 200,
 *   "message": "...",
 *   "source": "lambda",
 *   "proxy": {...},
 *   "projectId": "...",
 *   "deploymentId": "...",
 *   "host": "..."
 * }
 */

/**
 * Setup instructions for Vercel Log Drains
 * 
 * Via Dashboard (Recommended):
 * 1. Go to Project Settings → Log Drains
 * 2. Click "Add Log Drain"
 * 3. Select delivery format (JSON recommended)
 * 4. Enter your endpoint URL
 * 5. Add required headers (API keys, etc.)
 * 6. Select environments to drain (Production, Preview, Development)
 * 7. Save
 * 
 * Via Vercel CLI:
 * ```bash
 * vercel log-drain create --url https://your-endpoint --headers '{"Authorization": "Bearer token"}'
 * ```
 * 
 * Via vercel.json (Project-level):
 * Note: This requires Vercel Pro or Enterprise
 */
