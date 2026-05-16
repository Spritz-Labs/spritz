// Custom service worker code for push notifications
// This file is automatically included by next-pwa

console.log("[SW] Service worker loaded");

self.addEventListener("unhandledrejection", (event) => {
    console.error("[SW] Unhandled rejection:", event.reason);
    event.preventDefault();
});

// Handle push notifications
self.addEventListener("push", (event) => {
    console.log("[SW] Push event received!");

    if (!event.data) {
        console.log("[SW] No data in push event");
        return;
    }

    try {
        const data = event.data.json();
        console.log("[SW] Push data:", JSON.stringify(data));

        const options = {
            body: data.body || "You have a notification",
            icon: "/icons/icon-192x192.png",
            badge: "/icons/icon-72x72.png",
            vibrate: [200, 100, 200, 100, 200],
            tag: data.tag || "spritz-notification",
            renotify: true,
            requireInteraction: data.type === "incoming_call",
            data: {
                url: data.url || "/",
                type: data.type,
                callerId: data.callerId,
                callerName: data.callerName,
                senderAddress: data.senderAddress,
            },
            actions:
                data.type === "incoming_call"
                    ? [
                          { action: "answer", title: "Answer" },
                          { action: "decline", title: "Decline" },
                      ]
                    : [],
        };

        console.log("[SW] Showing notification with title:", data.title || "Spritz");

        event.waitUntil(
            self.registration
                .showNotification(data.title || "Spritz", options)
                .then(() => {
                    console.log("[SW] Notification shown successfully");
                })
                .catch((err) => {
                    console.error("[SW] Failed to show notification:", err);
                })
        );
    } catch (err) {
        console.error("[SW] Error processing push:", err);
    }
});

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
    console.log("[SW] Notification click:", event);

    event.notification.close();

    const data = event.notification.data || {};
    const action = event.action;

    // Handle call actions
    if (data.type === "incoming_call") {
        if (action === "decline") {
            // Just close the notification
            return;
        }
        // For answer or general click, open the app
    }

    // Determine the URL to open
    let targetUrl = data.url || "/";

    // For message notifications, add the sender address as a query param to open the chat
    if (data.type === "message" && data.senderAddress) {
        targetUrl = `/?chat=${encodeURIComponent(data.senderAddress)}`;
        console.log("[SW] Opening chat with:", data.senderAddress);
    }

    // Open or focus the app
    event.waitUntil(
        clients
            .matchAll({ type: "window", includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin)) {
                        if (data.type === "message" && data.senderAddress) {
                            client.postMessage({
                                type: "OPEN_CHAT",
                                senderAddress: data.senderAddress,
                            });
                        }
                        return client.focus();
                    }
                }
                return clients.openWindow(targetUrl);
            })
            .catch((err) => {
                console.error("[SW] notificationclick error:", err);
            })
    );
});

// Handle subscription change
self.addEventListener("pushsubscriptionchange", (event) => {
    console.log("[SW] Subscription changed");
    event.waitUntil(
        self.registration.showNotification("Spritz", {
            body: "Please open the app to restore notifications",
            icon: "/icons/icon-192x192.png",
        })
    );
});

// Log when SW is activated
self.addEventListener("activate", (event) => {
    console.log("[SW] Service worker activated");
});

// Log when SW is installed
self.addEventListener("install", (event) => {
    console.log("[SW] Service worker installed");
    // Don't skip waiting immediately - let the update prompt handle it
});

// Handle messages from the client
self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        console.log("[SW] Skipping waiting, activating new service worker");
        self.skipWaiting();
    }
});
