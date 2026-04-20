import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
// P0 Env: importing env triggers a one-shot server-side validation (see src/lib/env.ts).
import "@/lib/env";
import { Web3Provider } from "@/context/Web3Provider";
import { PasskeyProvider } from "@/context/PasskeyProvider";
import { EmailAuthProvider } from "@/context/EmailAuthProvider";
import { AlienAuthProvider } from "@/context/AlienAuthProvider";
import { WorldIdProvider } from "@/context/WorldIdProvider";
import { AuthProvider } from "@/context/AuthProvider";
import { RootErrorBoundary } from "@/components/RootErrorBoundary";
import { Toaster } from "@/components/Toaster";
import { WebVitals } from "@/components/WebVitals";

const dmSans = DM_Sans({
    subsets: ["latin"],
    variable: "--font-dm-sans",
    display: "swap",
    // PERF: primary UI font — preload so it's available during LCP and we
    // avoid the "flash of unstyled text" on first navigation.
    preload: true,
    fallback: [
        "system-ui",
        "-apple-system",
        "Segoe UI",
        "Roboto",
        "sans-serif",
    ],
    adjustFontFallback: true,
});

const jetbrainsMono = JetBrains_Mono({
    subsets: ["latin"],
    variable: "--font-jetbrains",
    display: "swap",
    // PERF: mono is only used in a few admin/dev views — don't eat the LCP
    // budget preloading it.
    preload: false,
    fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

export const metadata: Metadata = {
    metadataBase: new URL("https://app.spritz.chat"),
    title: {
        default: "Spritz | Censorship-Resistant Chat for Web3",
        template: "%s | Spritz",
    },
    description:
        "The censorship-resistant chat app for Web3. Connect with friends using passkeys or wallets, make HD video calls, go live with livestreaming, create AI agents, and chat freely. Built on Ethereum, Base, and Solana.",
    keywords: [
        "Web3 chat",
        "decentralized messaging",
        "crypto chat",
        "blockchain communication",
        "Ethereum chat",
        "Solana chat",
        "passkey authentication",
        "Web3 video calls",
        "livestreaming",
        "AI agents",
        "censorship resistant",
        "privacy focused chat",
        "Waku protocol",
        "Huddle01",
        "Livepeer",
    ],
    authors: [{ name: "Spritz" }],
    creator: "Spritz",
    publisher: "Spritz",
    manifest: "/manifest.json",
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            "max-video-preview": -1,
            "max-image-preview": "large",
            "max-snippet": -1,
        },
    },
    openGraph: {
        title: "Spritz | Censorship-Resistant Chat for Web3",
        description:
            "The censorship-resistant chat app for Web3. Connect with friends using passkeys or wallets, make HD video calls, go live with livestreaming, create AI agents, and chat freely.",
        url: "https://app.spritz.chat",
        siteName: "Spritz",
        images: [
            {
                url: "/og-image.png",
                width: 1200,
                height: 630,
                alt: "Spritz - Censorship-Resistant Chat for Web3",
            },
        ],
        locale: "en_US",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Spritz | Censorship-Resistant Chat for Web3",
        description:
            "The censorship-resistant chat app for Web3. Connect with friends using passkeys or wallets, make HD video calls, go live with livestreaming, create AI agents, and chat freely.",
        images: ["/og-image.png"],
        creator: "@spritz_chat",
    },
    appleWebApp: {
        capable: true,
        statusBarStyle: "black-translucent",
        title: "Spritz",
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
    alternates: {
        canonical: "https://app.spritz.chat",
    },
    verification: {
        // Add Google Search Console verification when available
        // google: "your-verification-code",
    },
};

export const viewport: Viewport = {
    themeColor: "#FF5500",
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
            {/* Google Analytics — gtag library + bootstrap, both external
                so our CSP doesn't need 'unsafe-inline' for the config call. */}
            <Script
                src="https://www.googletagmanager.com/gtag/js?id=G-EXM67L0P13"
                strategy="afterInteractive"
            />
            <Script src="/ga-init.js" strategy="afterInteractive" />
            <head>
                <meta name="application-name" content="Spritz" />
                <meta name="mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta
                    name="apple-mobile-web-app-status-bar-style"
                    content="black-translucent"
                />
                <meta name="apple-mobile-web-app-title" content="Spritz" />
                <link
                    rel="apple-touch-icon"
                    href="/icons/apple-touch-icon.png"
                />
                {/* Structured Data for SEO */}
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify({
                            "@context": "https://schema.org",
                            "@type": "WebApplication",
                            name: "Spritz",
                            applicationCategory: "CommunicationApplication",
                            operatingSystem: "Web, iOS, Android",
                            offers: {
                                "@type": "Offer",
                                price: "0",
                                priceCurrency: "USD",
                            },
                            description:
                                "Censorship-resistant chat app for Web3. Connect with friends using passkeys or wallets, make HD video calls, go live with livestreaming, create AI agents, and chat freely.",
                            url: "https://app.spritz.chat",
                            author: {
                                "@type": "Organization",
                                name: "Spritz",
                            },
                            featureList: [
                                "Decentralized messaging",
                                "HD video calls",
                                "Livestreaming",
                                "AI agents",
                                "Passkey authentication",
                                "Multi-chain support (Ethereum, Base, Solana)",
                            ],
                        }),
                    }}
                />
                {/* Pre-React console/error suppression. Externalised to
                    public/console-suppress.js so our CSP doesn't need
                    'unsafe-inline' for this blob. Uses beforeInteractive so
                    it runs before any framework code has a chance to log. */}
                <Script
                    src="/console-suppress.js"
                    strategy="beforeInteractive"
                />
            </head>
            <body
                className={`${dmSans.variable} ${jetbrainsMono.variable} font-sans antialiased`}
            >
                {/* P0 Accessibility: Skip navigation link for keyboard users */}
                <a href="#main-content" className="skip-nav">
                    Skip to main content
                </a>
                
                {/* OBSERVABILITY: report Core Web Vitals + Next-specific
                    metrics so we can see real-user LCP/INP/CLS by route. */}
                <WebVitals />

                {/* SRE-012 FIX: Root Error Boundary catches unhandled errors */}
                <RootErrorBoundary>
                    <Web3Provider>
                        <AuthProvider>
                            <PasskeyProvider>
                                <EmailAuthProvider>
                                    <AlienAuthProvider>
                                        <WorldIdProvider>
                                            <main id="main-content">
                                                {children}
                                            </main>
                                            {/* P1 UX: Global toast notification system */}
                                            <Toaster />
                                        </WorldIdProvider>
                                    </AlienAuthProvider>
                                </EmailAuthProvider>
                            </PasskeyProvider>
                        </AuthProvider>
                    </Web3Provider>
                </RootErrorBoundary>
            </body>
        </html>
    );
}
