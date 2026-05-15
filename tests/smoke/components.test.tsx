import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpritzLogo } from "@/components/SpritzLogo";

describe("SpritzLogo", () => {
  it("renders an SVG element", () => {
    const { container } = render(<SpritzLogo />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("applies size classes", () => {
    const { container } = render(<SpritzLogo size="lg" />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("w-12");
    expect(wrapper?.className).toContain("h-12");
  });

  it("applies custom className", () => {
    const { container } = render(<SpritzLogo className="test-class" />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("test-class");
  });

  it("applies rounded classes", () => {
    const { container } = render(<SpritzLogo rounded="full" />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("rounded-full");
  });
});
