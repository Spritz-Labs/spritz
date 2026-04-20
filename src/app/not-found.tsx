import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Page not found",
    description: "The page you're looking for doesn't exist.",
    robots: { index: false, follow: false },
};

export default function NotFound() {
    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
            <div className="max-w-md w-full text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-4xl">
                    👀
                </div>
                <h1 className="text-3xl font-bold mb-3">Page not found</h1>
                <p className="text-zinc-400 mb-8">
                    We couldn&apos;t find that page. It may have moved or never
                    existed.
                </p>
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold hover:shadow-lg hover:shadow-orange-500/25 transition-all"
                >
                    Go to Spritz →
                </Link>
            </div>
        </div>
    );
}
