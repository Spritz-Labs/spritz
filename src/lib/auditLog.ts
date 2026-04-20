import { NextRequest } from "next/server";
import { supabaseService } from "@/lib/supabaseServer";

/**
 * Access audit logger.
 *
 * Design notes (important — this file was a major contributor to connection pool
 * exhaustion before this rewrite):
 *
 *   - Fire-and-forget. The caller MUST NOT await this. We never let audit writes
 *     block user-facing API responses.
 *   - Batched. We buffer events in memory and flush on a short interval. This
 *     converts N individual INSERTs per second into ~1 bulk INSERT per second.
 *   - Deduped. Repeated "read my own <X>" events within a short window collapse
 *     to a single record with a `count` metadata field.
 *   - Circuit-broken. If audit writes fail, we back off for a minute so we don't
 *     make a bad situation worse.
 *   - Singleton client. Uses the shared service-role Supabase client.
 */

type AuditDetails = {
    userAddress?: string;
    resourceTable?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
};

type BufferedEvent = {
    action: string;
    user_address: string | null;
    resource_table: string | null;
    resource_id: string | null;
    ip_address: string;
    user_agent: string;
    metadata: Record<string, unknown> | null;
    count: number;
    first_seen: number;
    last_seen: number;
};

const BUFFER_FLUSH_MS = 2_000;
const BUFFER_MAX_SIZE = 200;
const DEDUPE_WINDOW_MS = 60_000;
const CIRCUIT_BREAKER_MS = 60_000;

// High-frequency, low-sensitivity reads where logging every single event is noise
// (and was actively contributing to connection pool exhaustion). These events are
// aggressively deduped inside the buffer window. They are NOT skipped entirely —
// we still want SOME record that the user accessed their own data, but one row
// per minute per user is plenty.
const LOW_SENSITIVITY_ACTIONS = new Set<string>([
    "phone.status.read",
    "friends.list",
    "friend_requests.list",
    "messaging_keys.read",
    "email.read",
]);

type AuditGlobal = {
    buffer: Map<string, BufferedEvent>;
    flushTimer: NodeJS.Timeout | null;
    circuitOpenUntil: number;
    consecutiveFailures: number;
};

const GLOBAL_KEY = Symbol.for("spritz.audit.state.v1");
const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: AuditGlobal };

const state: AuditGlobal =
    g[GLOBAL_KEY] ??
    (g[GLOBAL_KEY] = {
        buffer: new Map(),
        flushTimer: null,
        circuitOpenUntil: 0,
        consecutiveFailures: 0,
    });

function dedupeKey(
    action: string,
    userAddress: string | null,
    resourceTable: string | null,
    resourceId: string | null
): string {
    return `${action}|${userAddress ?? ""}|${resourceTable ?? ""}|${resourceId ?? ""}`;
}

function scheduleFlush() {
    if (state.flushTimer) return;
    state.flushTimer = setTimeout(() => {
        state.flushTimer = null;
        flush().catch(() => {
            // Flush errors are swallowed inside flush(); this is a safety net.
        });
    }, BUFFER_FLUSH_MS);
    // Don't hold the Node process open just for audit flush in long-running envs.
    if (typeof state.flushTimer.unref === "function") {
        state.flushTimer.unref();
    }
}

async function flush() {
    if (state.buffer.size === 0) return;

    const now = Date.now();
    if (state.circuitOpenUntil > now) {
        // Circuit is open — drop the buffer to avoid unbounded growth.
        state.buffer.clear();
        return;
    }

    if (!supabaseService) {
        state.buffer.clear();
        return;
    }

    const rows = Array.from(state.buffer.values()).map((evt) => ({
        user_address: evt.user_address,
        action: evt.action,
        resource_table: evt.resource_table,
        resource_id: evt.resource_id,
        ip_address: evt.ip_address,
        user_agent: evt.user_agent,
        metadata:
            evt.count > 1
                ? {
                      ...(evt.metadata ?? {}),
                      _count: evt.count,
                      _first_seen: new Date(evt.first_seen).toISOString(),
                      _last_seen: new Date(evt.last_seen).toISOString(),
                  }
                : evt.metadata,
    }));

    state.buffer.clear();

    try {
        const { error } = await supabaseService
            .from("shout_access_audit")
            .insert(rows);

        if (error) {
            throw new Error(error.message);
        }

        state.consecutiveFailures = 0;
    } catch (err) {
        state.consecutiveFailures += 1;
        if (state.consecutiveFailures >= 3) {
            state.circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_MS;
            state.consecutiveFailures = 0;
            // One-line warning, not error, to avoid log spam.
            console.warn(
                "[auditLog] Circuit breaker tripped; pausing audit writes for 60s:",
                err instanceof Error ? err.message : String(err)
            );
        }
    }
}

/**
 * Log an access event. Fire-and-forget — do NOT await.
 */
export function logAccess(
    request: NextRequest,
    action: string,
    details?: AuditDetails
): void {
    try {
        if (!supabaseService) return;

        const now = Date.now();
        if (state.circuitOpenUntil > now) return;

        const ip =
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            request.headers.get("x-real-ip") ||
            "unknown";
        const userAgent = request.headers.get("user-agent") || "unknown";

        const userAddress = details?.userAddress ?? null;
        const resourceTable = details?.resourceTable ?? null;
        const resourceId = details?.resourceId ?? null;

        const key = dedupeKey(action, userAddress, resourceTable, resourceId);
        const existing = state.buffer.get(key);

        if (existing && LOW_SENSITIVITY_ACTIONS.has(action)) {
            // Collapse into existing entry if within window
            if (now - existing.first_seen < DEDUPE_WINDOW_MS) {
                existing.count += 1;
                existing.last_seen = now;
                return;
            }
        }

        if (state.buffer.size >= BUFFER_MAX_SIZE) {
            // Buffer is full — force a flush synchronously (best effort).
            flush().catch(() => {});
        }

        state.buffer.set(key, {
            action,
            user_address: userAddress,
            resource_table: resourceTable,
            resource_id: resourceId,
            ip_address: ip,
            user_agent: userAgent,
            metadata: details?.metadata ?? null,
            count: 1,
            first_seen: now,
            last_seen: now,
        });

        scheduleFlush();
    } catch {
        // Audit must never throw into the request path.
    }
}
