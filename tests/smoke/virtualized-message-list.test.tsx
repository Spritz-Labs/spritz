import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { VirtualizedMessageList } from "@/components/VirtualizedMessageList";

type TestMessage = { id: string; text: string };

const mockMessages: TestMessage[] = Array.from({ length: 100 }, (_, i) => ({
    id: `msg-${i}`,
    text: `Message ${i}`,
}));

describe("VirtualizedMessageList", () => {
    it("renders without crashing with empty list", () => {
        const { container } = render(
            <VirtualizedMessageList<TestMessage>
                messages={[]}
                renderMessage={(msg) => <div>{msg.text}</div>}
                getKey={(msg) => msg.id}
            />
        );
        expect(container.querySelector("[class*='overflow-y-auto']")).toBeTruthy();
    });

    it("provides virtualizer structure for long lists", () => {
        const renderMessage = vi.fn((msg: TestMessage) => (
            <div data-testid={`msg-${msg.id}`}>{msg.text}</div>
        ));

        const { container } = render(
            <VirtualizedMessageList<TestMessage>
                messages={mockMessages}
                renderMessage={renderMessage}
                getKey={(msg) => msg.id}
                estimateSize={() => 50}
                overscan={5}
                className="h-[300px]"
            />
        );

        // Virtualizer creates a sized container with total height
        const innerDiv = container.querySelector("[style]");
        expect(innerDiv).toBeTruthy();
        // The total size div should exist with calculated height
        const style = innerDiv?.getAttribute("style") || "";
        expect(style).toContain("height");
    });

    it("uses getKey for stable keys", () => {
        const getKey = vi.fn((msg: TestMessage) => msg.id);

        render(
            <VirtualizedMessageList<TestMessage>
                messages={mockMessages.slice(0, 5)}
                renderMessage={(msg) => <div>{msg.text}</div>}
                getKey={getKey}
                estimateSize={() => 50}
            />
        );

        expect(getKey).toHaveBeenCalled();
    });

    it("applies custom className", () => {
        const { container } = render(
            <VirtualizedMessageList<TestMessage>
                messages={mockMessages.slice(0, 3)}
                renderMessage={(msg) => <div>{msg.text}</div>}
                getKey={(msg) => msg.id}
                className="h-[500px] custom-class"
            />
        );

        const scrollEl = container.firstElementChild;
        expect(scrollEl?.className).toContain("custom-class");
    });
});
