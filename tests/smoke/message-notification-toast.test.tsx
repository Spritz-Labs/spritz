import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageNotificationToast } from "@/components/MessageNotificationToast";

describe("MessageNotificationToast", () => {
    it("renders nothing when toast is null", () => {
        const { container } = render(
            <MessageNotificationToast toast={null} onDismiss={vi.fn()} onTap={vi.fn()} />
        );
        expect(container.textContent).toBe("");
    });

    it("shows sender and message when toast is present", () => {
        render(
            <MessageNotificationToast
                toast={{ sender: "Alice", message: "Hey there!" }}
                onDismiss={vi.fn()}
                onTap={vi.fn()}
            />
        );
        expect(screen.getByText("Alice")).toBeTruthy();
        expect(screen.getByText("Hey there!")).toBeTruthy();
    });

    it("calls onTap with sender and onDismiss when clicked", () => {
        const onDismiss = vi.fn();
        const onTap = vi.fn();
        render(
            <MessageNotificationToast
                toast={{ sender: "Bob", message: "Hello" }}
                onDismiss={onDismiss}
                onTap={onTap}
            />
        );
        fireEvent.click(screen.getByText("Bob"));
        expect(onTap).toHaveBeenCalledWith("Bob");
        expect(onDismiss).toHaveBeenCalled();
    });

    it("calls onDismiss when close button is clicked without triggering onTap", () => {
        const onDismiss = vi.fn();
        const onTap = vi.fn();
        const { container } = render(
            <MessageNotificationToast
                toast={{ sender: "Eve", message: "Hi" }}
                onDismiss={onDismiss}
                onTap={onTap}
            />
        );
        // The close button is the shrink-0 button with the X SVG
        const closeBtn = container.querySelector("button.shrink-0");
        if (closeBtn) fireEvent.click(closeBtn);
        expect(onDismiss).toHaveBeenCalled();
        expect(onTap).not.toHaveBeenCalled();
    });
});
