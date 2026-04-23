/**
 * Shared session refresh helper used by all auth providers on tab
 * visibility change.
 *
 * The POST /api/auth/session endpoint extends the session. It may return 401
 * transiently (e.g. server cold-start, clock skew, concurrent refresh race,
 * intermittent cookie header issue on mobile PWAs). If we treat a single 401
 * as "session expired" we end up kicking the user out of whatever screen
 * they are on (commonly an active chat room).
 *
 * To avoid that, we verify with a GET before concluding the session is
 * really gone. Only `"expired"` should actually clear client auth state.
 */
export type SessionRefreshResult =
    | "ok"          // Session was successfully extended (POST 200)
    | "network"     // Network / other transient error — do NOT clear auth
    | "unknown"     // Non-OK, non-401 response — do NOT clear auth
    | "expired";    // Confirmed expired via GET — safe to clear auth

export async function refreshSessionSafely(): Promise<SessionRefreshResult> {
    try {
        const res = await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
        });

        if (res.ok) return "ok";

        if (res.status !== 401) return "unknown";

        // POST returned 401 — verify with GET before concluding the session
        // is actually gone. This prevents transient 401s from kicking users
        // out of active chat rooms.
        try {
            const check = await fetch("/api/auth/session", {
                credentials: "include",
            });
            if (check.ok) {
                const data = await check.json().catch(() => null);
                if (data?.authenticated) return "ok";
            }
            return "expired";
        } catch {
            // GET itself failed — treat as network error, keep user signed in
            return "network";
        }
    } catch {
        return "network";
    }
}
