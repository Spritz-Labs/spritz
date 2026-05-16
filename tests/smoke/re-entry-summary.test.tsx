import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReEntrySummary } from "@/components/ReEntrySummary";
import type { UnifiedChatItem } from "@/components/UnifiedChatList";

vi.mock("motion/react", () => ({
    motion: {
        div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
            <div {...props}>{children}</div>
        ),
    },
    AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

function makeChat(overrides: Partial<UnifiedChatItem> = {}): UnifiedChatItem {
    return {
        id: "dm-0xtest",
        type: "dm",
        displayName: "Test User",
        avatar: null,
        lastMessage: "Hey there",
        lastMessageAt: new Date().toISOString(),
        unreadCount: 0,
        isPinned: false,
        isGroup: false,
        ...overrides,
    } as UnifiedChatItem;
}

describe("ReEntrySummary", () => {
    it("renders welcome back message with unread count", () => {
        const chats = [
            makeChat({ id: "dm-0x1", displayName: "Alice", unreadCount: 3 }),
            makeChat({ id: "dm-0x2", displayName: "Bob", unreadCount: 2 }),
        ];

        render(
            <ReEntrySummary
                daysSinceLastLogin={10}
                unifiedChats={chats}
                onOpenChat={vi.fn()}
                onDismiss={vi.fn()}
            />
        );

        expect(screen.getByText("Welcome back")).toBeTruthy();
        expect(screen.getByText(/5 unread messages/)).toBeTruthy();
        expect(screen.getByText(/2 conversations/)).toBeTruthy();
    });

    it("renders null when no unread and away less than 7 days", () => {
        const chats = [makeChat({ unreadCount: 0 })];

        const { container } = render(
            <ReEntrySummary
                daysSinceLastLogin={4}
                unifiedChats={chats}
                onOpenChat={vi.fn()}
                onDismiss={vi.fn()}
            />
        );

        expect(container.innerHTML).toBe("");
    });

    it("shows 'say hi' when no unread but away 7+ days", () => {
        const chats = [makeChat({ unreadCount: 0 })];

        render(
            <ReEntrySummary
                daysSinceLastLogin={14}
                unifiedChats={chats}
                onOpenChat={vi.fn()}
                onDismiss={vi.fn()}
            />
        );

        expect(screen.getByText(/Your friends are here/)).toBeTruthy();
    });

    it("shows top 3 unread chats and +more indicator", () => {
        const chats = Array.from({ length: 5 }, (_, i) =>
            makeChat({
                id: `dm-0x${i}`,
                displayName: `User ${i}`,
                unreadCount: 5 - i,
            })
        );

        render(
            <ReEntrySummary
                daysSinceLastLogin={10}
                unifiedChats={chats}
                onOpenChat={vi.fn()}
                onDismiss={vi.fn()}
            />
        );

        expect(screen.getByText("User 0")).toBeTruthy();
        expect(screen.getByText("User 1")).toBeTruthy();
        expect(screen.getByText("User 2")).toBeTruthy();
        expect(screen.getByText(/\+2 more/)).toBeTruthy();
    });

    it("calls onOpenChat and onDismiss when clicking a chat", () => {
        const onOpenChat = vi.fn();
        const onDismiss = vi.fn();

        const chats = [makeChat({ id: "dm-0xabc", displayName: "Alice", unreadCount: 1 })];

        render(
            <ReEntrySummary
                daysSinceLastLogin={10}
                unifiedChats={chats}
                onOpenChat={onOpenChat}
                onDismiss={onDismiss}
            />
        );

        fireEvent.click(screen.getByText("Alice"));
        expect(onOpenChat).toHaveBeenCalledWith("dm-0xabc");
        expect(onDismiss).toHaveBeenCalled();
    });

    it("calls onDismiss when clicking X button", () => {
        const onDismiss = vi.fn();
        const chats = [makeChat({ id: "dm-0x1", unreadCount: 1, displayName: "Alice" })];

        render(
            <ReEntrySummary
                daysSinceLastLogin={10}
                unifiedChats={chats}
                onOpenChat={vi.fn()}
                onDismiss={onDismiss}
            />
        );

        fireEvent.click(screen.getByLabelText("Dismiss"));
        expect(onDismiss).toHaveBeenCalled();
    });

    it("formats time correctly for weeks", () => {
        const chats = [makeChat({ unreadCount: 1, displayName: "A" })];

        render(
            <ReEntrySummary
                daysSinceLastLogin={21}
                unifiedChats={chats}
                onOpenChat={vi.fn()}
                onDismiss={vi.fn()}
            />
        );

        expect(screen.getByText(/3 weeks/)).toBeTruthy();
    });
});
