import { NextRequest, NextResponse } from "next/server";
import { AccessToken, Role } from "@huddle01/server-sdk/auth";

const HUDDLE01_API_KEY = process.env.HUDDLE01_API_KEY || "";

export async function POST(request: NextRequest) {
    if (!HUDDLE01_API_KEY) {
        return NextResponse.json(
            { error: "Huddle01 API key not configured" },
            { status: 500 }
        );
    }

    try {
        const { roomId, userAddress, displayName } = await request.json();

        if (!roomId || !userAddress) {
            return NextResponse.json(
                { error: "roomId and userAddress are required" },
                { status: 400 }
            );
        }

        // Use the Server SDK to generate access token
        const accessToken = new AccessToken({
            apiKey: HUDDLE01_API_KEY,
            roomId: roomId,
            role: Role.HOST,
            permissions: {
                admin: true,
                canConsume: true,
                canProduce: true,
                canProduceSources: {
                    cam: true,
                    mic: true,
                    screen: true,
                },
                canRecvData: true,
                canSendData: true,
                canUpdateMetadata: true,
            },
            options: {
                metadata: {
                    displayName: displayName || userAddress.slice(0, 10),
                    walletAddress: userAddress,
                },
            },
        });

        const token = await accessToken.toJwt();
        console.log("[Huddle01] Token generated for room:", roomId);

        return NextResponse.json({ token });
    } catch (error) {
        console.error("[Huddle01] Token error:", error);
        return NextResponse.json(
            { error: "Failed to generate token" },
            { status: 500 }
        );
    }
}






