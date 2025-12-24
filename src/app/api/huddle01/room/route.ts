import { NextRequest, NextResponse } from "next/server";

const HUDDLE01_API_KEY = process.env.HUDDLE01_API_KEY || "";

export async function POST(request: NextRequest) {
    if (!HUDDLE01_API_KEY) {
        return NextResponse.json(
            { error: "Huddle01 API key not configured" },
            { status: 500 }
        );
    }

    try {
        const { title, hostWallet } = await request.json();

        // Use v2 API endpoint
        const response = await fetch(
            "https://api.huddle01.com/api/v2/sdk/rooms/create-room",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": HUDDLE01_API_KEY,
                },
                body: JSON.stringify({
                    roomLocked: false,
                    metadata: {
                        title: title || "Spritz Call",
                        hostWallets: hostWallet ? [hostWallet] : [],
                    },
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error(
                "[Huddle01] Room API error:",
                response.status,
                errorText
            );
            return NextResponse.json(
                { error: `Failed to create room: ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        console.log("[Huddle01] Room created:", data);
        return NextResponse.json({ roomId: data.data.roomId });
    } catch (error) {
        console.error("[Huddle01] Room error:", error);
        return NextResponse.json(
            { error: "Failed to create room" },
            { status: 500 }
        );
    }
}

