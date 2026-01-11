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

// @ts-expect-error - next-pwa type compatibility issue with Next.js config
export default withPWA(nextConfig);
