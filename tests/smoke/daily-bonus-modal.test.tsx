import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DailyBonusModal } from "@/components/DailyBonusModal";

describe("DailyBonusModal", () => {
    it("renders nothing when isOpen is false", () => {
        const { container } = render(
            <DailyBonusModal
                isOpen={false}
                isAvailable={true}
                isClaiming={false}
                onClaim={vi.fn()}
                onDismiss={vi.fn()}
            />
        );
        expect(container.innerHTML).toBe("");
    });

    it("renders nothing when isAvailable is false", () => {
        const { container } = render(
            <DailyBonusModal
                isOpen={true}
                isAvailable={false}
                isClaiming={false}
                onClaim={vi.fn()}
                onDismiss={vi.fn()}
            />
        );
        expect(container.innerHTML).toBe("");
    });

    it("shows modal content when open and available", () => {
        render(
            <DailyBonusModal
                isOpen={true}
                isAvailable={true}
                isClaiming={false}
                onClaim={vi.fn()}
                onDismiss={vi.fn()}
            />
        );
        expect(screen.getByText("Daily Bonus Available!")).toBeTruthy();
        expect(screen.getByText(/\+3 points/)).toBeTruthy();
        expect(screen.getByText("Maybe later")).toBeTruthy();
    });

    it("calls onClaim when claim button is clicked", () => {
        const onClaim = vi.fn();
        render(
            <DailyBonusModal
                isOpen={true}
                isAvailable={true}
                isClaiming={false}
                onClaim={onClaim}
                onDismiss={vi.fn()}
            />
        );
        fireEvent.click(screen.getByText(/Claim \+3 Points/));
        expect(onClaim).toHaveBeenCalledTimes(1);
    });

    it("calls onDismiss when Maybe later is clicked", () => {
        const onDismiss = vi.fn();
        render(
            <DailyBonusModal
                isOpen={true}
                isAvailable={true}
                isClaiming={false}
                onClaim={vi.fn()}
                onDismiss={onDismiss}
            />
        );
        fireEvent.click(screen.getByText("Maybe later"));
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("disables claim button when isClaiming is true", () => {
        render(
            <DailyBonusModal
                isOpen={true}
                isAvailable={true}
                isClaiming={true}
                onClaim={vi.fn()}
                onDismiss={vi.fn()}
            />
        );
        expect(screen.getByText("Claiming...")).toBeTruthy();
        const button = screen.getByText("Claiming...").closest("button");
        expect(button?.disabled).toBe(true);
    });
});
