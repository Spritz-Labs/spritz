/**
 * Agent chat cost estimation and error sanitization for analytics.
 * Prices per 1M tokens (env overrides; defaults: Gemini 2.0 Flash–style).
 */

const DEFAULT_INPUT_PER_1M = 0.1;
const DEFAULT_OUTPUT_PER_1M = 0.4;

function parsePrice(env: string | undefined, defaultVal: number): number {
    if (env == null || env === "") return defaultVal;
    const n = parseFloat(env);
    return Number.isFinite(n) && n >= 0 ? n : defaultVal;
}

export function estimateCostUsd(
    inputTokens: number | null,
    outputTokens: number | null,
): number | null {
    if (inputTokens == null && outputTokens == null) return null;
    const inputPer1M = parsePrice(
        process.env.AGENT_COST_INPUT_PER_1M,
        DEFAULT_INPUT_PER_1M,
    );
    const outputPer1M = parsePrice(
        process.env.AGENT_COST_OUTPUT_PER_1M,
        DEFAULT_OUTPUT_PER_1M,
    );
    const inCost = (inputTokens ?? 0) * (inputPer1M / 1_000_000);
    const outCost = (outputTokens ?? 0) * (outputPer1M / 1_000_000);
    const total = inCost + outCost;
    return total > 0 ? Math.round(total * 1_000_000) / 1_000_000 : null;
}

const MAX_ERROR_MESSAGE_LEN = 500;
const STACK_PATTERN = /\n\s+at\s+/;

/** Sanitize error for storage: truncate, strip stack, no PII. */
export function sanitizeErrorMessage(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    const noStack = msg.split(STACK_PATTERN)[0].trim();
    if (noStack.length <= MAX_ERROR_MESSAGE_LEN) return noStack;
    return noStack.slice(0, MAX_ERROR_MESSAGE_LEN) + "…";
}

/** Infer a simple error code from message (rate limit, timeout, etc.). */
export function inferErrorCode(err: unknown): string {
    const msg = (
        err instanceof Error ? err.message : String(err)
    ).toLowerCase();
    if (msg.includes("rate limit") || msg.includes("429")) return "RATE_LIMIT";
    if (msg.includes("timeout") || msg.includes("timed out")) return "TIMEOUT";
    if (
        msg.includes("content") &&
        (msg.includes("filter") || msg.includes("block"))
    )
        return "CONTENT_FILTER";
    if (msg.includes("quota") || msg.includes("exceeded")) return "QUOTA";
    return "STREAM_ERROR";
}
