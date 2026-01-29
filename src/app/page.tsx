import type { Metadata } from "next";
import { Suspense } from "react";
import HomeClient from "./page-client";

export const metadata: Metadata = {
    title: "Spritz | Censorship-Resistant Chat for Web3",
    description:
        "Connect with friends using passkeys or wallets. Make HD video calls, go live with livestreaming, create AI agents, and chat freely on Ethereum, Base, and Solana.",
    openGraph: {
        title: "Spritz | Censorship-Resistant Chat for Web3",
        description:
            "Connect with friends using passkeys or wallets. Make HD video calls, go live with livestreaming, create AI agents, and chat freely.",
        url: "https://app.spritz.chat",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Spritz | Censorship-Resistant Chat for Web3",
        description:
            "Connect with friends using passkeys or wallets. Make HD video calls, go live with livestreaming, create AI agents, and chat freely.",
    },
};

// Static content for SEO crawlers (noscript fallback)
function SEOFallback() {
    return (
        <noscript>
            <div style={{ padding: "2rem", textAlign: "center", background: "#09090b", color: "#fff", minHeight: "100vh" }}>
                <h1>Spritz - Censorship-Resistant Chat for Web3</h1>
                <p>Connect with friends using passkeys or wallets. Make HD video calls, go live with livestreaming, create AI agents, and chat freely.</p>
                <p>Built on Ethereum, Base, and Solana.</p>
                <p>
                    <a href="https://app.spritz.chat" style={{ color: "#FF5500" }}>Get Started</a>
                </p>
            </div>
        </noscript>
    );
}

export default function HomePage() {
    return (
        <>
            <SEOFallback />
            <Suspense fallback={
                <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                    <div className="animate-pulse text-zinc-500">Loading…</div>
                </main>
            }>
                <HomeClient />
            </Suspense>
        </>
    );
}

