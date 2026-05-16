import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Service Worker push notification actions", () => {
    const swContent = readFileSync(resolve(__dirname, "../../worker/index.js"), "utf-8");

    it("includes Reply action for message notifications", () => {
        expect(swContent).toContain('"message"');
        expect(swContent).toContain('"group_message"');
        expect(swContent).toContain('action: "open"');
        expect(swContent).toContain('title: "Reply"');
    });

    it("includes Answer/Decline for incoming calls", () => {
        expect(swContent).toContain('action: "answer"');
        expect(swContent).toContain('action: "decline"');
    });

    it("handles notificationclick with deep link to chat", () => {
        expect(swContent).toContain("/?chat=");
        expect(swContent).toContain("OPEN_CHAT");
        expect(swContent).toContain("senderAddress");
    });

    it("has unhandledrejection listener for crash resilience", () => {
        expect(swContent).toContain("unhandledrejection");
    });
});
