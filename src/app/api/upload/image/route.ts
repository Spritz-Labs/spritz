import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Max file size: 10MB (encrypted images are slightly larger than raw)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// POST /api/upload/image - Upload an encrypted image
export async function POST(request: NextRequest) {
    // Rate limit uploads
    const rateLimitResponse = await checkRateLimit(request, "general");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        // Get authenticated user from session
        const session = await getAuthenticatedUser(request);
        
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const conversationId = formData.get("conversationId") as string | null;
        const originalType = formData.get("originalType") as string | null; // Original MIME type before encryption
        
        // Use session user address
        const userAddress = session?.userAddress;

        if (!file || !userAddress) {
            return NextResponse.json(
                { error: "File and authentication are required" },
                { status: 400 }
            );
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: "File size must be less than 10MB" },
                { status: 400 }
            );
        }

        // For encrypted files, we accept application/octet-stream
        // The actual content type validation happens client-side before encryption
        const contentType = file.type || "application/octet-stream";
        
        // Convert File to Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Generate unique filename
        // Use .enc extension to indicate encrypted content
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 12);
        const conversationHash = conversationId 
            ? Buffer.from(conversationId).toString("base64url").substring(0, 8)
            : "unknown";
        const filename = `encrypted/${userAddress.toLowerCase()}/${conversationHash}/${timestamp}_${randomId}.enc`;

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from("chat-images")
            .upload(filename, buffer, {
                contentType,
                upsert: false,
            });

        if (error) {
            console.error("[EncryptedImageUpload] Storage error:", error);
            return NextResponse.json(
                { error: "Failed to upload image" },
                { status: 500 }
            );
        }

        // Get public URL (the file is encrypted, so public URL is safe)
        const { data: urlData } = supabase.storage
            .from("chat-images")
            .getPublicUrl(data.path);

        return NextResponse.json({
            url: urlData.publicUrl,
            path: data.path,
            originalType: originalType || "image/jpeg",
        });
    } catch (e) {
        console.error("[EncryptedImageUpload] Error:", e);
        return NextResponse.json(
            { error: "Failed to process upload" },
            { status: 500 }
        );
    }
}
