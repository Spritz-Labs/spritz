import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Web3Provider } from "@/context/Web3Provider";
import { PasskeyProvider } from "@/context/PasskeyProvider";

const dmSans = DM_Sans({
    subsets: ["latin"],
    variable: "--font-dm-sans",
    display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
    subsets: ["latin"],
    variable: "--font-jetbrains",
    display: "swap",
});

export const metadata: Metadata = {
    title: "Reach | Voice Calls for Web3",
    description:
        "Voice calls for Web3. Connect with friends using passkeys or wallets and make voice calls.",
    manifest: "/manifest.json",
    appleWebApp: {
        capable: true,
        statusBarStyle: "black-translucent",
        title: "Reach",
    },
    formatDetection: {
        telephone: false,
    },
    icons: {
        icon: [
            {
                url: "/icons/favicon-16x16.png",
                sizes: "16x16",
                type: "image/png",
            },
            {
                url: "/icons/favicon-32x32.png",
                sizes: "32x32",
                type: "image/png",
            },
        ],
        apple: [
            {
                url: "/icons/apple-touch-icon.png",
                sizes: "180x180",
                type: "image/png",
            },
        ],
    },
};

export const viewport: Viewport = {
    themeColor: "#8b5cf6",
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className="dark">
            <head>
                <meta name="application-name" content="Reach" />
                <meta name="mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta
                    name="apple-mobile-web-app-status-bar-style"
                    content="black-translucent"
                />
                <meta name="apple-mobile-web-app-title" content="Reach" />
                <link
                    rel="apple-touch-icon"
                    href="/icons/apple-touch-icon.png"
                />
                {/* Suppress known AppKit/Solana/XMTP errors before React loads */}
                <script
                    dangerouslySetInnerHTML={{
                        __html: `
                            (function() {
                                var suppressedErrors = [
                                    'Endpoint URL must start with',
                                    'No project ID is configured',
                                    'Group is inactive',
                                    'Errors Occured During Sync'
                                ];
                                window.addEventListener('error', function(e) {
                                    var msg = e.message || (e.error && e.error.message) || '';
                                    for (var i = 0; i < suppressedErrors.length; i++) {
                                        if (msg.indexOf(suppressedErrors[i]) !== -1) {
                                            e.preventDefault();
                                            e.stopImmediatePropagation();
                                            return false;
                                        }
                                    }
                                }, true);
                                window.addEventListener('unhandledrejection', function(e) {
                                    var msg = (e.reason && e.reason.message) || String(e.reason) || '';
                                    for (var i = 0; i < suppressedErrors.length; i++) {
                                        if (msg.indexOf(suppressedErrors[i]) !== -1) {
                                            e.preventDefault();
                                            e.stopImmediatePropagation();
                                            return false;
                                        }
                                    }
                                }, true);
                                // Also suppress console.error for these XMTP messages
                                var origError = console.error;
                                console.error = function() {
                                    var msg = Array.prototype.join.call(arguments, ' ');
                                    for (var i = 0; i < suppressedErrors.length; i++) {
                                        if (msg.indexOf(suppressedErrors[i]) !== -1) {
                                            return;
                                        }
                                    }
                                    origError.apply(console, arguments);
                                };
                            })();
                        `,
                    }}
                />
            </head>
            <body
                className={`${dmSans.variable} ${jetbrainsMono.variable} font-sans antialiased`}
            >
                <Web3Provider>
                    <PasskeyProvider>{children}</PasskeyProvider>
                </Web3Provider>
            </body>
        </html>
    );
}
