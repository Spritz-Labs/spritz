/**
 * Pre-React console / error suppression.
 *
 * Runs before any framework code so we never see the console spam from
 * third-party SDKs (AppKit, Waku, React Query, Radix a11y warnings) during
 * boot. The list is intentionally conservative and hard-coded so it can't
 * be widened at runtime.
 *
 * This file is referenced from src/app/layout.tsx as an external script
 * rather than inline so our CSP doesn't need 'unsafe-inline' for this blob.
 */
(function () {
    var suppressedErrors = [
        "Endpoint URL must start with",
        "No project ID is configured",
        "Failed to dial",
        "Connection refused",
        "Query data cannot be undefined",
        "auth-deeplink",
        "Affected query key",
        "DialogContent",
        "DialogTitle",
        "aria-describedby",
        "VisuallyHidden",
        "accessible for screen reader",
    ];

    function shouldSuppress(msg) {
        if (!msg) return false;
        msg = String(msg);
        for (var i = 0; i < suppressedErrors.length; i++) {
            if (msg.indexOf(suppressedErrors[i]) !== -1) {
                return true;
            }
        }
        return false;
    }

    window.addEventListener(
        "error",
        function (e) {
            var msg = e.message || (e.error && e.error.message) || "";
            if (shouldSuppress(msg)) {
                e.preventDefault();
                e.stopImmediatePropagation();
                e.stopPropagation();
                return false;
            }
        },
        true
    );

    window.addEventListener(
        "unhandledrejection",
        function (e) {
            var msg = (e.reason && e.reason.message) || String(e.reason) || "";
            if (shouldSuppress(msg)) {
                e.preventDefault();
                e.stopImmediatePropagation();
                e.stopPropagation();
                return false;
            }
        },
        true
    );

    var originalConsoleError = console.error;
    var originalConsoleWarn = console.warn;
    console.error = function () {
        var msg = Array.prototype.join.call(arguments, " ");
        if (shouldSuppress(msg)) return;
        originalConsoleError.apply(console, arguments);
    };
    console.warn = function () {
        var msg = Array.prototype.join.call(arguments, " ");
        if (shouldSuppress(msg)) return;
        originalConsoleWarn.apply(console, arguments);
    };
})();
