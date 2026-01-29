"use client";

import { useState } from "react";
import { registerForEvent } from "@/lib/eventUtils";

interface EventRegistrationButtonProps {
    eventUrl: string;
    eventId?: string;
    agentId?: string;
    className?: string;
}

export function EventRegistrationButton({
    eventUrl,
    eventId,
    agentId,
    className = "",
}: EventRegistrationButtonProps) {
    const [isRegistering, setIsRegistering] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [needsSetup, setNeedsSetup] = useState(false);

    const handleRegister = async () => {
        setIsRegistering(true);
        setError(null);
        setNeedsSetup(false);

        try {
            const result = await registerForEvent(eventUrl, eventId, agentId);

            if (result.needsSetup) {
                setNeedsSetup(true);
                // Trigger a custom event to open the preferences modal
                window.dispatchEvent(new CustomEvent("openRegistrationPreferences"));
                return;
            }

            if (result.success && result.registrationLink) {
                // Open registration link
                window.open(result.registrationLink, "_blank");
            } else {
                setError(result.error || result.message || "Failed to register");
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to register");
        } finally {
            setIsRegistering(false);
        }
    };

    if (needsSetup) {
        return (
            <div className={`flex flex-col gap-2 ${className}`}>
                <button
                    onClick={handleRegister}
                    disabled={isRegistering}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-full text-sm font-medium transition-all shadow-lg hover:shadow-purple-500/50 disabled:opacity-50"
                >
                    <span>🎫</span>
                    {isRegistering ? "Setting up..." : "Register Now"}
                </button>
                <p className="text-xs text-zinc-400">
                    Please set up your registration preferences first
                </p>
            </div>
        );
    }

    return (
        <div className={`flex flex-col gap-2 ${className}`}>
            <button
                onClick={handleRegister}
                disabled={isRegistering}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-full text-sm font-medium transition-all shadow-lg hover:shadow-purple-500/50 disabled:opacity-50"
            >
                {isRegistering ? (
                    <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Registering...
                    </>
                ) : (
                    <>
                        <span>🎫</span>
                        Register Now
                    </>
                )}
            </button>
            {error && (
                <p className="text-xs text-red-400">{error}</p>
            )}
        </div>
    );
}
