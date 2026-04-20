/**
 * Google Analytics 4 bootstrap.
 *
 * Externalized so our CSP doesn't need 'unsafe-inline' for this snippet.
 * The gtag.js library itself is loaded via a separate <Script> tag in
 * src/app/layout.tsx.
 */
window.dataLayer = window.dataLayer || [];
function gtag() {
    dataLayer.push(arguments);
}
gtag("js", new Date());
gtag("config", "G-EXM67L0P13");
