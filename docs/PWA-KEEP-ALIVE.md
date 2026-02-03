# PWA Keep-Alive Strategies

Ways we try to keep connections alive (or recover quickly) when the app runs as a PWA and the OS backgrounds it or kills sockets.

## 1. Wallet (Wagmi / AppKit)

-   **`usePWAWalletPersistence`**: On `visibilitychange` and `focus`, if the user had a saved session but wagmi shows disconnected, we call `attemptReconnect()` so the wallet reconnects when the user returns.
-   **`page-client.tsx`**: Listens for `visibilitychange` and `focus` and triggers wallet reconnect when the app is foregrounded and session exists.
-   **Cal/schedule pages**: Call `reconnect()` from wagmi on mount for PWA users who land on those pages.
-   **WalletModal**: When the user opens the Send tab, we attempt a silent wallet reconnect for PWA.

## 2. Presence (Supabase)

-   **`usePresence`**: Sends a heartbeat every 30s to update `last_seen`. On `visibilitychange` → visible, sends an immediate heartbeat so we don’t show “offline” right after returning to the app.

## 3. Waku (messaging)

-   **`WakuProvider`**: On `visibilitychange` → visible:
    -   If Waku was never initialized, we call `initialize()`.
    -   If the app was in the background for more than 2 minutes and Waku was initialized, we call `close()` then `initialize()` to recreate the node and peer connections (avoids stale/broken connections after long background).

## 4. Call signaling (Supabase Realtime)

-   **`useCallSignaling`**: On `visibilitychange` and `focus`, calls `checkExistingCalls()` so we don’t miss incoming calls that arrived while the app was backgrounded.

## 5. Screen Wake Lock

-   **`useWakeLock`**: When the user is in an active call or has a chat open, we request a screen wake lock so the device doesn’t dim/lock as quickly, which can help avoid the OS killing connections. When the page becomes visible again, we re-acquire the wake lock if still in call/chat.

## 6. Auth (Passkey / Email)

-   **`PasskeyProvider`**, **`EmailAuthProvider`**, **`useAuth`**, **`useSolanaAuth`**: On `visibilitychange` (and sometimes focus), we re-check or refresh session so the user doesn’t appear logged out after a long background.

## Optional improvements

-   **Supabase Realtime**: Re-subscribe or ping on visibility if we detect a stale channel (e.g. no events for a long time after becoming visible).
-   **Periodic lightweight ping**: A small heartbeat (e.g. OPTIONS or a no-op API call) every 1–2 minutes while visible could help keep HTTP/WS connections from being closed by proxies or the OS (use sparingly to avoid battery impact).
