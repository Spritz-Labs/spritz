import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LoggingErrorBoundary } from "@/components/LoggingErrorBoundary";

vi.mock("@/lib/logger/client", () => ({
    clientLogger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
    },
}));

vi.mock("@/lib/sentryClient", () => ({
    captureClientException: vi.fn(),
}));

function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
    if (shouldThrow) {
        throw new Error("Test explosion");
    }
    return <div>All good</div>;
}

function ThrowOnRender() {
    throw new Error("Render crash");
}

describe("LoggingErrorBoundary", () => {
    beforeEach(() => {
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("renders children when no error occurs", () => {
        render(
            <LoggingErrorBoundary componentName="TestComponent">
                <div>Child content</div>
            </LoggingErrorBoundary>
        );
        expect(screen.getByText("Child content")).toBeTruthy();
    });

    it("shows default fallback UI when a child throws", () => {
        render(
            <LoggingErrorBoundary componentName="TestComponent">
                <ThrowOnRender />
            </LoggingErrorBoundary>
        );
        expect(screen.getByText("Something went wrong")).toBeTruthy();
        expect(screen.getByText("Try Again")).toBeTruthy();
        expect(screen.getByText("Reload Page")).toBeTruthy();
    });

    it("displays an error ID for support reference", () => {
        render(
            <LoggingErrorBoundary componentName="TestComponent">
                <ThrowOnRender />
            </LoggingErrorBoundary>
        );
        expect(screen.getByText(/Error ID:/)).toBeTruthy();
        expect(screen.getByText(/ERR-/)).toBeTruthy();
    });

    it("renders custom fallback ReactNode when provided", () => {
        render(
            <LoggingErrorBoundary
                componentName="TestComponent"
                fallback={<div>Custom fallback</div>}
            >
                <ThrowOnRender />
            </LoggingErrorBoundary>
        );
        expect(screen.getByText("Custom fallback")).toBeTruthy();
        expect(screen.queryByText("Something went wrong")).toBeNull();
    });

    it("renders custom fallback function with error and reset", () => {
        render(
            <LoggingErrorBoundary
                componentName="TestComponent"
                fallback={(error, reset) => (
                    <div>
                        <span>Error: {error.message}</span>
                        <button onClick={reset}>Reset</button>
                    </div>
                )}
            >
                <ThrowOnRender />
            </LoggingErrorBoundary>
        );
        expect(screen.getByText("Error: Render crash")).toBeTruthy();
        expect(screen.getByText("Reset")).toBeTruthy();
    });

    it("calls onError callback when error is caught", () => {
        const onError = vi.fn();
        render(
            <LoggingErrorBoundary componentName="ChatModal" onError={onError}>
                <ThrowOnRender />
            </LoggingErrorBoundary>
        );
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0][0].message).toBe("Render crash");
    });

    it("resets state when Try Again is clicked via custom fallback", () => {
        let resetFn: (() => void) | null = null;
        render(
            <LoggingErrorBoundary
                componentName="TestComponent"
                fallback={(_error, reset) => {
                    resetFn = reset;
                    return (
                        <div>
                            Crashed - <button onClick={reset}>Retry</button>
                        </div>
                    );
                }}
            >
                <ThrowOnRender />
            </LoggingErrorBoundary>
        );

        expect(screen.getByText(/Crashed/)).toBeTruthy();
        expect(resetFn).not.toBeNull();
    });

    it("logs error to clientLogger with component name", async () => {
        const { clientLogger } = await import("@/lib/logger/client");
        render(
            <LoggingErrorBoundary componentName="AlphaChatModal">
                <ThrowOnRender />
            </LoggingErrorBoundary>
        );
        expect(clientLogger.error).toHaveBeenCalledWith(
            "React Error Boundary caught an error",
            expect.objectContaining({
                componentName: "AlphaChatModal",
                errorMessage: "Render crash",
            })
        );
    });

    it("reports to Sentry with context", async () => {
        const { captureClientException } = await import("@/lib/sentryClient");
        render(
            <LoggingErrorBoundary componentName="GroupChatModal">
                <ThrowOnRender />
            </LoggingErrorBoundary>
        );
        expect(captureClientException).toHaveBeenCalledWith(
            expect.objectContaining({ message: "Render crash" }),
            expect.objectContaining({ componentName: "GroupChatModal" })
        );
    });
});
