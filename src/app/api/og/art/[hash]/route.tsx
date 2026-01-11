import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

// Try multiple IPFS gateways for reliability
const IPFS_GATEWAYS = [
    process.env.NEXT_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud",
    "cloudflare-ipfs.com",
    "ipfs.io",
    "dweb.link",
];

async function fetchImageAsBase64(hash: string): Promise<string | null> {
    for (const gateway of IPFS_GATEWAYS) {
        try {
            const url = `https://${gateway}/ipfs/${hash}`;
            const response = await fetch(url, {
                headers: {
                    "Accept": "image/*",
                },
                // 5 second timeout per gateway
                signal: AbortSignal.timeout(5000),
            });
            
            if (response.ok) {
                const contentType = response.headers.get("content-type") || "image/png";
                const arrayBuffer = await response.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString("base64");
                return `data:${contentType};base64,${base64}`;
            }
        } catch (e) {
            console.log(`[OG] Gateway ${gateway} failed for ${hash}:`, e);
            continue;
        }
    }
    return null;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ hash: string }> }
) {
    const { hash } = await params;
    
    // Fetch the actual image data and convert to base64
    const imageData = await fetchImageAsBase64(hash);
    
    // Fallback URL if base64 fails
    const pinataGateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud";
    const imageUrl = imageData || `https://${pinataGateway}/ipfs/${hash}`;
    
    try {
        return new ImageResponse(
            (
                <div
                    style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "linear-gradient(135deg, #18181b 0%, #09090b 50%, #18181b 100%)",
                        position: "relative",
                    }}
                >
                    {/* Background pattern */}
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            backgroundImage: "radial-gradient(circle at 25% 25%, rgba(255, 85, 0, 0.1) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(255, 136, 0, 0.1) 0%, transparent 50%)",
                        }}
                    />
                    
                    {/* Main content */}
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "40px",
                            position: "relative",
                        }}
                    >
                        {/* Pixel art container */}
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: "white",
                                borderRadius: "24px",
                                padding: "16px",
                                boxShadow: "0 25px 50px -12px rgba(255, 85, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1)",
                            }}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={imageUrl}
                                alt="Pixel Art"
                                width={400}
                                height={400}
                                style={{
                                    imageRendering: "pixelated" as const,
                                    borderRadius: "12px",
                                    objectFit: "contain",
                                }}
                            />
                        </div>
                        
                        {/* Branding */}
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                marginTop: "32px",
                                gap: "12px",
                            }}
                        >
                            {/* Spritz logo (orange circle) */}
                            <div
                                style={{
                                    width: "48px",
                                    height: "48px",
                                    borderRadius: "50%",
                                    background: "linear-gradient(135deg, #FF5500 0%, #FF8800 100%)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    boxShadow: "0 4px 12px rgba(255, 85, 0, 0.4)",
                                }}
                            >
                                <span style={{ fontSize: "24px" }}>🍊</span>
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: "28px",
                                        fontWeight: "bold",
                                        color: "white",
                                        letterSpacing: "-0.5px",
                                    }}
                                >
                                    Pixel Art on Spritz
                                </span>
                                <span
                                    style={{
                                        fontSize: "16px",
                                        color: "#a1a1aa",
                                    }}
                                >
                                    Create your own at spritz.chat
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            ),
            {
                width: 1200,
                height: 630,
            }
        );
    } catch (error) {
        console.error("[OG] Error generating OG image for", hash, ":", error);
        
        // Fallback to a simple card without the image
        return new ImageResponse(
            (
                <div
                    style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "linear-gradient(135deg, #18181b 0%, #09090b 100%)",
                    }}
                >
                    <div
                        style={{
                            width: "120px",
                            height: "120px",
                            borderRadius: "50%",
                            background: "linear-gradient(135deg, #FF5500 0%, #FF8800 100%)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            marginBottom: "24px",
                            boxShadow: "0 8px 24px rgba(255, 85, 0, 0.4)",
                        }}
                    >
                        <span style={{ fontSize: "60px" }}>🍊</span>
                    </div>
                    <span
                        style={{
                            fontSize: "48px",
                            fontWeight: "bold",
                            color: "white",
                            marginBottom: "8px",
                        }}
                    >
                        Pixel Art on Spritz
                    </span>
                    <span
                        style={{
                            fontSize: "24px",
                            color: "#a1a1aa",
                        }}
                    >
                        Create your own at spritz.chat
                    </span>
                </div>
            ),
            {
                width: 1200,
                height: 630,
            }
        );
    }
}
