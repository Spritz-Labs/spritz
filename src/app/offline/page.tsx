"use client";

import { SpritzLogo } from "@/components/SpritzLogo";

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
      <SpritzLogo size="xl" className="mb-6" />
      <h1 className="text-2xl font-bold text-white mb-2">
        You&apos;re offline
      </h1>
      <p className="text-zinc-400 max-w-sm">
        Spritz needs an internet connection to send and receive messages.
        Check your connection and try again.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-6 px-6 py-2.5 bg-[#FF5500] hover:bg-[#E04D00] text-white rounded-xl font-medium transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
