"use client";

export const huddle01ProjectId = process.env.NEXT_PUBLIC_HUDDLE01_PROJECT_ID || "";

// Check if Huddle01 is configured (only need project ID on client, API key is server-side)
export const isHuddle01Configured = !!huddle01ProjectId;

// Generate a room ID from two addresses (sorted for consistency)
export function generateRoomId(address1: string, address2: string): string {
    const sorted = [address1.toLowerCase(), address2.toLowerCase()].sort();
    return `spritz-${sorted[0].slice(2, 10)}-${sorted[1].slice(2, 10)}`;
}

// Create a room via our API route (which calls Huddle01 server-side)
export async function createHuddle01Room(
    title: string = "Spritz Call"
): Promise<{ roomId: string } | null> {
    try {
        const response = await fetch("/api/huddle01/room", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ title }),
        });

        if (!response.ok) {
            const error = await response.json();
            console.error("[Huddle01] Failed to create room:", error);
            return null;
        }

        const data = await response.json();
        return { roomId: data.roomId };
    } catch (error) {
        console.error("[Huddle01] Error creating room:", error);
        return null;
    }
}

// Generate access token via our API route (which calls Huddle01 server-side)
export async function getHuddle01Token(
    roomId: string,
    userAddress: string,
    displayName?: string
): Promise<string | null> {
    try {
        const response = await fetch("/api/huddle01/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                roomId,
                userAddress,
                displayName,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            console.error("[Huddle01] Failed to get token:", error);
            return null;
        }

        const data = await response.json();
        return data.token;
    } catch (error) {
        console.error("[Huddle01] Error getting token:", error);
        return null;
    }
}






