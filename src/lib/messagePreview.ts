/**
 * Formats a raw message content string into a human-friendly preview
 * for display in chat lists, notifications, etc.
 */
export function formatMessagePreview(
    content: string,
    options: { isOwn?: boolean; maxLength?: number } = {}
): string {
    const { isOwn = false, maxLength = 50 } = options;

    let preview = content;

    if (preview.startsWith("VOICE:") || preview.startsWith("ENCRYPTED_VOICE:")) {
        preview = "Voice message";
    } else if (preview.startsWith("PIXEL_ART:") || preview.startsWith("data:image/png;base64,")) {
        preview = "Pixel art";
    } else if (preview.startsWith("ENCRYPTED_IMAGE:") || preview.startsWith("[IMAGE]")) {
        preview = "Photo";
    } else if (preview.startsWith("LOCATION:")) {
        preview = "Shared a location";
    } else if (preview.startsWith("[GIF]") || preview.startsWith("GIF:")) {
        preview = "GIF";
    } else if (preview.startsWith("[POLL]")) {
        preview = "Poll";
    }

    const effectiveMax = isOwn ? maxLength - 4 : maxLength;
    if (preview.length > effectiveMax) {
        preview = preview.slice(0, effectiveMax) + "...";
    }

    return isOwn ? `You: ${preview}` : preview;
}
