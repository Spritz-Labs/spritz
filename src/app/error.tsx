"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function RouteError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("[route-error]", {
            message: error.message,
            digest: error.digest,
            stack: error.stack,
        });
    }, [error]);

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
            <div className="max-w-md w-full text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-4xl">
                    ⚠️
                </div>
                <h1 className="text-2xl font-bold mb-3">
                    Something went wrong
                </h1>
                <p className="text-zinc-400 mb-6">
                    This page hit an unexpected error. You can try again, or
                    head back to the app.
                </p>
                {error?.digest ? (
                    <p className="text-zinc-600 text-xs mb-6 font-mono">
                        ref: {error.digest}
                    </p>
                ) : null}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                        type="button"
                        onClick={() => reset()}
                        className="px-5 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold hover:shadow-lg hover:shadow-orange-500/25 transition-all"
                    >
                        Try again
                    </button>
                    <Link
                        href="/"
                        className="px-5 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 font-semibold hover:bg-zinc-800 transition-all"
                    >
                        Go home
                    </Link>
                </div>
            </div>
        </div>
    );
}
