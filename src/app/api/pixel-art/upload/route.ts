import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";

const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;
const PINATA_GATEWAY =
    process.env.NEXT_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud";

export async function POST(request: NextRequest) {
    // Rate limit uploads
    const rateLimitResponse = await checkRateLimit(request, "general");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        // Check for Pinata credentials
        if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
            console.error("[PixelArt] Missing Pinata credentials");
            return NextResponse.json(
                { error: "Pinata not configured" },
                { status: 500 }
            );
        }

        // Get authenticated user from session
        const session = await getAuthenticatedUser(request);

        const { imageData, senderAddress: bodySenderAddress } = await request.json();
        
        // Use session address, fall back to body for backward compatibility
        const senderAddress = session?.userAddress || bodySenderAddress;

        if (!imageData || !imageData.startsWith("data:image/png;base64,")) {
            return NextResponse.json(
                { error: "Invalid image data" },
                { status: 400 }
            );
        }
        
        // Validate base64 data size (max 5MB decoded)
        const base64Data = imageData.replace(/^data:image\/png;base64,/, "");
        const estimatedSize = (base64Data.length * 3) / 4;
        if (estimatedSize > 5 * 1024 * 1024) {
            return NextResponse.json(
                { error: "Image too large (max 5MB)" },
                { status: 400 }
            );
        }

        // Convert base64 to buffer (already extracted above)
        const buffer = Buffer.from(base64Data, "base64");

        // Create form data for Pinata
        const formData = new FormData();
        const blob = new Blob([buffer], { type: "image/png" });
        const filename = `pixel-art-${Date.now()}.png`;
        formData.append("file", blob, filename);

        // Add metadata
        const metadata = JSON.stringify({
            name: filename,
            keyvalues: {
                type: "pixel-art",
                sender: senderAddress || "unknown",
                timestamp: new Date().toISOString(),
            },
        });
        formData.append("pinataMetadata", metadata);

        // Pin options
        const options = JSON.stringify({
            cidVersion: 1,
        });
        formData.append("pinataOptions", options);

        // Upload to Pinata
        const pinataResponse = await fetch(
            "https://api.pinata.cloud/pinning/pinFileToIPFS",
            {
                method: "POST",
                headers: {
                    pinata_api_key: PINATA_API_KEY,
                    pinata_secret_api_key: PINATA_SECRET_KEY,
                },
                body: formData,
            }
        );

        if (!pinataResponse.ok) {
            const errorText = await pinataResponse.text();
            console.error("[PixelArt] Pinata error:", errorText);
            return NextResponse.json(
                { error: "Failed to upload to IPFS" },
                { status: 500 }
            );
        }

        const pinataResult = await pinataResponse.json();

        // Return IPFS URLs - use dedicated gateway as primary for instant loading
        const ipfsHash = pinataResult.IpfsHash;
        // Use dedicated Pinata gateway for instant availability
        const ipfsUrl = `https://${PINATA_GATEWAY}/ipfs/${ipfsHash}`;

        console.log("[PixelArt] Uploaded successfully:", ipfsUrl);

        return NextResponse.json({
            success: true,
            ipfsHash,
            ipfsUrl,
            // Also return alternative gateways as fallback
            alternativeUrls: [
                `https://ipfs.io/ipfs/${ipfsHash}`,
                `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`,
                `https://dweb.link/ipfs/${ipfsHash}`,
            ],
        });
    } catch (error) {
        console.error("[PixelArt] Upload error:", error);
        return NextResponse.json(
            { error: "Failed to upload pixel art" },
            { status: 500 }
        );
    }
}
