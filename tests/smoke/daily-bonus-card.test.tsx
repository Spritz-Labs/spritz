import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DailyBonusCard } from "@/components/DailyBonusCard";

describe("DailyBonusCard", () => {
    it("renders the bonus card", () => {
        render(<DailyBonusCard isClaiming={false} onClaim={vi.fn()} />);
        expect(screen.getByText("Daily Bonus!")).toBeTruthy();
        expect(screen.getByText("+3 points today")).toBeTruthy();
    });

    it("calls onClaim when claim button is clicked", () => {
        const onClaim = vi.fn();
        render(<DailyBonusCard isClaiming={false} onClaim={onClaim} />);
        fireEvent.click(screen.getByText("Claim"));
        expect(onClaim).toHaveBeenCalledTimes(1);
    });

    it("shows spinner and disables button when claiming", () => {
        render(<DailyBonusCard isClaiming={true} onClaim={vi.fn()} />);
        const button = screen.getByRole("button");
        expect(button.disabled).toBe(true);
        expect(button.querySelector(".animate-spin")).toBeTruthy();
    });
});
