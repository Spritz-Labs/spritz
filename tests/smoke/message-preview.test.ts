import { describe, it, expect } from "vitest";
import { formatMessagePreview } from "@/lib/messagePreview";

describe("formatMessagePreview", () => {
    it("returns plain text as-is when short", () => {
        expect(formatMessagePreview("Hello!")).toBe("Hello!");
    });

    it("truncates long messages with ellipsis", () => {
        const long = "A".repeat(60);
        const result = formatMessagePreview(long, { maxLength: 50 });
        expect(result.length).toBeLessThanOrEqual(53); // 50 + "..."
        expect(result.endsWith("...")).toBe(true);
    });

    it("formats voice messages", () => {
        expect(formatMessagePreview("VOICE:abc123")).toBe("Voice message");
        expect(formatMessagePreview("ENCRYPTED_VOICE:xyz")).toBe("Voice message");
    });

    it("formats pixel art messages", () => {
        expect(formatMessagePreview("PIXEL_ART:data")).toBe("Pixel art");
        expect(formatMessagePreview("data:image/png;base64,abc")).toBe("Pixel art");
    });

    it("formats image messages", () => {
        expect(formatMessagePreview("ENCRYPTED_IMAGE:data")).toBe("Photo");
        expect(formatMessagePreview("[IMAGE]https://example.com/img.png")).toBe("Photo");
    });

    it("formats location messages", () => {
        expect(formatMessagePreview("LOCATION:lat,lng")).toBe("Shared a location");
    });

    it("formats GIF messages", () => {
        expect(formatMessagePreview("[GIF]https://tenor.com/abc")).toBe("GIF");
        expect(formatMessagePreview("GIF:https://example.com/gif")).toBe("GIF");
    });

    it("formats poll messages", () => {
        expect(formatMessagePreview("[POLL]data")).toBe("Poll");
    });

    it("prepends 'You: ' for own messages", () => {
        expect(formatMessagePreview("Hey", { isOwn: true })).toBe("You: Hey");
    });

    it("truncates own messages accounting for 'You: ' prefix", () => {
        const msg = "B".repeat(60);
        const result = formatMessagePreview(msg, { isOwn: true, maxLength: 50 });
        expect(result.startsWith("You: ")).toBe(true);
        expect(result.endsWith("...")).toBe(true);
    });

    it("handles empty string", () => {
        expect(formatMessagePreview("")).toBe("");
    });
});
