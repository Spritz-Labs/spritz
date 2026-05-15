"use client";

import { clientLogger } from "@/lib/logger/client";
import { captureClientException } from "@/lib/sentryClient";

interface ReportOptions {
    context?: string;
    silent?: boolean;
    toast?: (msg: string) => void;
    userMessage?: string;
}

/**
 * Centralized client-side error reporter.
 *
 * Usage:
 *   try { ... } catch (err) { reportError(err, { context: "sendMessage" }); }
 *
 * This replaces the anti-pattern of empty catch blocks or console.error-only handling.
 */
export function reportError(error: unknown, options: ReportOptions = {}): void {
    const { context = "unknown", silent = false, toast, userMessage } = options;

    const err = error instanceof Error ? error : new Error(String(error));

    clientLogger.error(`[${context}] ${err.message}`, {
        context,
        stack: err.stack,
    });

    captureClientException(err, { context });

    if (!silent && toast) {
        toast(userMessage || "Something went wrong. Please try again.");
    }
}
