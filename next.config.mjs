// @ts-check
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
    dest: "public",
    register: true,
    skipWaiting: false, // Let the app control when to update via PWAInstallPrompt
    disable: process.env.NODE_ENV === "development",
    runtimeCaching: [
        {
            urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
                cacheName: "google-fonts",
                expiration: {
                    maxEntries: 4,
                    maxAgeSeconds: 365 * 24 * 60 * 60,
                },
            },
        },
        {
            urlPattern: /\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,
            handler: "StaleWhileRevalidate",
            options: {
                cacheName: "static-font-assets",
                expiration: {
                    maxEntries: 4,
                    maxAgeSeconds: 7 * 24 * 60 * 60,
                },
            },
        },
        {
            urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
            handler: "StaleWhileRevalidate",
            options: {
                cacheName: "static-image-assets",
                expiration: {
                    maxEntries: 64,
                    maxAgeSeconds: 24 * 60 * 60,
                },
            },
        },
        {
            urlPattern: /\/_next\/static.*/i,
            handler: "CacheFirst",
            options: {
                cacheName: "next-static",
                expiration: {
                    maxEntries: 64,
                    maxAgeSeconds: 24 * 60 * 60,
                },
            },
        },
        {
            urlPattern: /\.(?:js)$/i,
            handler: "StaleWhileRevalidate",
            options: {
                cacheName: "static-js-assets",
                expiration: {
                    maxEntries: 32,
                    maxAgeSeconds: 24 * 60 * 60,
                },
            },
        },
        {
            urlPattern: /\.(?:css|less)$/i,
            handler: "StaleWhileRevalidate",
            options: {
                cacheName: "static-style-assets",
                expiration: {
                    maxEntries: 32,
                    maxAgeSeconds: 24 * 60 * 60,
                },
            },
        },
        {
            urlPattern: /^https:\/\/api\.*/i,
            handler: "NetworkFirst",
            options: {
                cacheName: "apis",
                networkTimeoutSeconds: 10,
                expiration: {
                    maxEntries: 16,
                    maxAgeSeconds: 24 * 60 * 60,
                },
            },
        },
        {
            urlPattern: /.*/i,
            handler: "NetworkFirst",
            options: {
                cacheName: "others",
                networkTimeoutSeconds: 10,
                expiration: {
                    maxEntries: 32,
                    maxAgeSeconds: 24 * 60 * 60,
                },
            },
        },
    ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Disable the development indicator in the corner
    devIndicators: false,

    // Security headers
    async headers() {
        return [
            {
                // Apply to all routes
                source: "/:path*",
                headers: [
                    {
                        key: "X-DNS-Prefetch-Control",
                        value: "on",
                    },
                    {
                        key: "Strict-Transport-Security",
                        value: "max-age=63072000; includeSubDomains; preload",
                    },
                    {
                        key: "X-Frame-Options",
                        value: "SAMEORIGIN",
                    },
                    {
                        key: "X-Content-Type-Options",
                        value: "nosniff",
                    },
                    {
                        key: "X-XSS-Protection",
                        value: "1; mode=block",
                    },
                    {
                        key: "Referrer-Policy",
                        value: "strict-origin-when-cross-origin",
                    },
                    {
                        key: "Permissions-Policy",
                        value: "camera=(self), microphone=(self), geolocation=()",
                    },
                    // SEC-012 FIX: Content Security Policy
                    // Allows safe inline scripts (needed for Next.js), external APIs, and WebSocket connections
                    {
                        // SECURITY: 'unsafe-inline' is still required because
                        // Next.js App Router emits inline hydration / Flight
                        // payload scripts per request; removing it requires
                        // nonce-based CSP via middleware (tracked as a
                        // follow-up). Our own inline blobs (console-suppress +
                        // GA bootstrap) have been externalised so compromising
                        // them via XSS now requires the attacker to control
                        // same-origin script hosting.
                        key: "Content-Security-Policy",
                        value: [
                            "default-src 'self'",
                            // Scripts: self + inline (Next.js needs this) + eval (for some libraries) + SDKs
                            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://va.vercel-scripts.com https://cdn.worldcoin.org https://*.huddle01.com https://alien.org https://*.alien.org https://www.googletagmanager.com https://www.google-analytics.com https://ssl.google-analytics.com",
                            // script-src-elem explicitly set to match (modern browsers use this for <script src=...> elements)
                            "script-src-elem 'self' 'unsafe-inline' https://vercel.live https://va.vercel-scripts.com https://cdn.worldcoin.org https://*.huddle01.com https://alien.org https://*.alien.org https://www.googletagmanager.com https://www.google-analytics.com https://ssl.google-analytics.com",
                            // Styles: self + inline (Tailwind, etc.)
                            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                            // Images: self + data URIs + external sources
                            "img-src 'self' data: blob: https: http:",
                            // Fonts: self + Google Fonts + Reown (WalletConnect AppKit pulls KHTeka from fonts.reown.com)
                            "font-src 'self' https://fonts.gstatic.com https://fonts.reown.com data: blob:",
                            // Connect: APIs, WebSockets, Waku, etc.
                            "connect-src 'self' https: wss: ws: blob: https://alien.org https://*.alien.org https://sso.alien-api.com https://*.alien-api.com",
                            // Media: self + blob for video/audio
                            "media-src 'self' blob: https:",
                            // Frame: self + WalletConnect + Cloudflare + Alien SSO + World ID + Huddle01 + Google OAuth + media embeds (Spotify, YouTube, Vimeo, Loom) + OpenStreetMap (location embeds in chat)
                            "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com https://alien.org https://*.alien.org https://sso.alien-api.com https://*.alien-api.com https://id.worldcoin.org https://*.worldcoin.org https://app.huddle01.com https://*.huddle01.com https://accounts.google.com https://open.spotify.com https://www.youtube.com https://www.youtube-nocookie.com https://youtube-nocookie.com https://player.vimeo.com https://www.loom.com https://www.openstreetmap.org",
                            // Object: none (no plugins)
                            "object-src 'none'",
                            // Base URI: self only
                            "base-uri 'self'",
                            // Form action: self only
                            "form-action 'self'",
                            // Upgrade insecure requests in production
                            "upgrade-insecure-requests",
                        ].join("; "),
                    },
                ],
            },
            // SECURITY: force `no-store` on every response from routes that
            // return sensitive user state (session, passkey material, wallet
            // recovery signer, admin APIs). This is a default — any
            // individual handler can still override its own Cache-Control
            // header and wins over the platform header. Putting it here
            // means we can't forget when adding a new route under these
            // prefixes.
            {
                source: "/api/auth/:path*",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "no-store, no-cache, must-revalidate, max-age=0",
                    },
                    { key: "Pragma", value: "no-cache" },
                ],
            },
            {
                source: "/api/passkey/:path*",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "no-store, no-cache, must-revalidate, max-age=0",
                    },
                    { key: "Pragma", value: "no-cache" },
                ],
            },
            {
                source: "/api/wallet/recovery-signer",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "no-store, no-cache, must-revalidate, max-age=0",
                    },
                    { key: "Pragma", value: "no-cache" },
                ],
            },
            {
                source: "/api/wallet/smart-wallet",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "no-store, no-cache, must-revalidate, max-age=0",
                    },
                    { key: "Pragma", value: "no-cache" },
                ],
            },
            {
                source: "/api/admin/:path*",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "no-store, no-cache, must-revalidate, max-age=0",
                    },
                    { key: "Pragma", value: "no-cache" },
                ],
            },
            {
                source: "/api/phone/:path*",
                headers: [
                    // /api/phone/status currently sets `private, max-age=30`
                    // itself and that handler-level override still wins; the
                    // default here covers the verify/send/remove mutations
                    // that were never explicitly set.
                    {
                        key: "Cache-Control",
                        value: "no-store, no-cache, must-revalidate, max-age=0",
                    },
                    { key: "Pragma", value: "no-cache" },
                ],
            },
        ];
    },

    transpilePackages: [
        "@reown/appkit",
        "@reown/appkit-adapter-wagmi",
        "@reown/appkit-adapter-solana",
        "@walletconnect/universal-provider",
        "@walletconnect/utils",
        "@walletconnect/logger",
        "@solana/wallet-adapter-wallets",
    ],
    serverExternalPackages: ["pino", "pino-pretty", "thread-stream"],
    turbopack: {},
    webpack: (config) => {
        config.resolve.alias = {
            ...config.resolve.alias,
            porto: false,
            "porto/internal": false,
            "@gemini-wallet/core": false,
            "@react-native-async-storage/async-storage": false,
            "@solana/kit": false,
            "@solana-program/system": false,
            "@solana-program/token": false,
            "@coinbase/cdp-sdk": false,
            "@base-org/account": false,
        };

        config.resolve.fallback = {
            ...config.resolve.fallback,
            fs: false,
            net: false,
            tls: false,
            crypto: false,
        };

        return config;
    },
};

export default withPWA(nextConfig);
