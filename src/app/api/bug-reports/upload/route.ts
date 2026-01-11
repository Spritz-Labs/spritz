import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";
import { validateMediaContent, getFileExtension, ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES } from "@/lib/file-validation";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Max file sizes
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB for images
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB for videos

// POST /api/bug-reports/upload - Upload media for bug reports
export async function POST(request: NextRequest) {
    // Rate limit uploads
    const rateLimitResponse = await checkRateLimit(request, "general");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        // Get authenticated user from session
        const session = await getAuthenticatedUser(request);
        
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const formUserAddress = formData.get("userAddress") as string | null;
        
        // Use session address, fall back to form for backward compatibility
        const userAddress = session?.userAddress || formUserAddress;

        if (!file || !userAddress) {
            return NextResponse.json(
                { error: "File and authentication are required" },
                { status: 400 }
            );
        }

        // Quick size check based on header type (detailed check after reading)
        const headerIsImage = ALLOWED_IMAGE_TYPES.includes(file.type);
        const headerIsVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
        const maxSize = headerIsImage ? MAX_IMAGE_SIZE : (headerIsVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE);
        
        if (file.size > maxSize) {
            const maxSizeMB = maxSize / (1024 * 1024);
            return NextResponse.json(
                { error: `File size must be less than ${maxSizeMB}MB` },
                { status: 400 }
            );
        }

        // Convert File to ArrayBuffer then to Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Validate actual file content using magic bytes
        const validation = await validateMediaContent(buffer);
        if (!validation.isValid) {
            console.warn("[BugReport Upload] File validation failed:", validation.error);
            return NextResponse.json(
                { error: validation.error || "Invalid file type" },
                { status: 400 }
            );
        }

        const detectedType = validation.detectedType!;
        const isImage = ALLOWED_IMAGE_TYPES.includes(detectedType);
        const isVideo = ALLOWED_VIDEO_TYPES.includes(detectedType);

        // Generate unique filename with proper extension
        const detectedExt = await getFileExtension(buffer);
        const ext = detectedExt || file.name.split(".").pop() || (isImage ? "jpg" : "mp4");
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 10);
        const filename = `bug-reports/${userAddress.toLowerCase()}/${timestamp}_${randomId}.${ext}`;

        // Upload to Supabase Storage (use detected content type)
        const bucket = "chat-images";
        const { data, error } = await supabase.storage
            .from(bucket)
            .upload(filename, buffer, {
                contentType: detectedType,
                upsert: false,
            });

        if (error) {
            console.error("[Bug Report Upload] Storage error:", error);
            return NextResponse.json(
                { error: "Failed to upload file" },
                { status: 500 }
            );
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from(bucket)
            .getPublicUrl(data.path);

        return NextResponse.json({
            url: urlData.publicUrl,
            path: data.path,
            type: isImage ? "image" : "video",
        });
    } catch (e) {
        console.error("[Bug Report Upload] Error:", e);
        return NextResponse.json(
            { error: "Failed to process upload" },
            { status: 500 }
        );
    }
}

