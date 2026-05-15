import { describe, it, expect, vi, beforeEach } from "vitest";
import { reportError } from "@/lib/reportError";

const mockError = vi.fn();
vi.mock("@/lib/logger/client", () => ({
    clientLogger: { error: (...args: unknown[]) => mockError(...args) },
}));

const mockCapture = vi.fn();
vi.mock("@/lib/sentryClient", () => ({
    captureClientException: (...args: unknown[]) => mockCapture(...args),
}));

describe("reportError", () => {
    beforeEach(() => {
        mockError.mockClear();
        mockCapture.mockClear();
    });

    it("logs Error instances with context", () => {
        const err = new Error("connection lost");
        reportError(err, { context: "WebSocket" });

        expect(mockError).toHaveBeenCalledWith(
            "[WebSocket] connection lost",
            expect.objectContaining({ context: "WebSocket" })
        );
    });

    it("logs string errors by wrapping in Error", () => {
        reportError("something broke", { context: "fetchData" });

        expect(mockError).toHaveBeenCalledWith(
            "[fetchData] something broke",
            expect.objectContaining({ context: "fetchData" })
        );
    });

    it("reports to Sentry", () => {
        const err = new Error("crash");
        reportError(err, { context: "ChatModal" });

        expect(mockCapture).toHaveBeenCalledWith(err, { context: "ChatModal" });
    });

    it("calls toast when provided and not silent", () => {
        const toast = vi.fn();
        reportError(new Error("fail"), { context: "send", toast });

        expect(toast).toHaveBeenCalledWith("Something went wrong. Please try again.");
    });

    it("uses custom userMessage for toast", () => {
        const toast = vi.fn();
        reportError(new Error("fail"), {
            context: "send",
            toast,
            userMessage: "Message failed to send",
        });

        expect(toast).toHaveBeenCalledWith("Message failed to send");
    });

    it("does not call toast when silent", () => {
        const toast = vi.fn();
        reportError(new Error("fail"), { context: "bg", toast, silent: true });

        expect(toast).not.toHaveBeenCalled();
    });

    it("does not throw even if error is null/undefined", () => {
        expect(() => reportError(null)).not.toThrow();
        expect(() => reportError(undefined)).not.toThrow();
    });

    it("defaults context to 'unknown'", () => {
        reportError(new Error("oops"));

        expect(mockError).toHaveBeenCalledWith(
            "[unknown] oops",
            expect.objectContaining({ context: "unknown" })
        );
    });
});
