import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";
import { validateImageContent, getFileExtension } from "@/lib/file-validation";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Max file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// POST /api/upload - Upload an image
export async function POST(request: NextRequest) {
    // Rate limit uploads
    const rateLimitResponse = await checkRateLimit(request, "general");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        // Get authenticated user from session
        const session = await getAuthenticatedUser(request);
        
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const context = formData.get("context") as string | null; // e.g., "channel", "group", "chat"
        
        // Use session user address, or fall back to form data for backward compatibility
        const formUserAddress = formData.get("userAddress") as string | null;
        const userAddress = session?.userAddress || formUserAddress;

        if (!file || !userAddress) {
            return NextResponse.json(
                { error: "File and authentication are required" },
                { status: 400 }
            );
        }
        
        // Warn if using unauthenticated fallback (remove this fallback later)
        if (!session && formUserAddress) {
            console.warn("[Upload] Using unauthenticated userAddress param - migrate to session auth");
        }

        // Validate file size first (cheap check)
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: "File size must be less than 5MB" },
                { status: 400 }
            );
        }

        // Convert File to ArrayBuffer then to Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Validate actual file content using magic bytes (not just header MIME type)
        const validation = await validateImageContent(buffer);
        if (!validation.isValid) {
            console.warn("[Upload] File validation failed:", validation.error, "Detected type:", validation.detectedType);
            return NextResponse.json(
                { error: validation.error || "Invalid file type" },
                { status: 400 }
            );
        }

        // Get proper extension from detected file type
        const detectedExt = await getFileExtension(buffer);
        const ext = detectedExt || file.name.split(".").pop() || "jpg";
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 10);
        const filename = `${context || "chat"}/${userAddress.toLowerCase()}/${timestamp}_${randomId}.${ext}`;

        // Upload to Supabase Storage (use detected content type, not header)
        const { data, error } = await supabase.storage
            .from("chat-images")
            .upload(filename, buffer, {
                contentType: validation.detectedType || file.type,
                upsert: false,
            });

        if (error) {
            console.error("[Upload] Storage error:", error);
            return NextResponse.json(
                { error: "Failed to upload image" },
                { status: 500 }
            );
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from("chat-images")
            .getPublicUrl(data.path);

        return NextResponse.json({
            url: urlData.publicUrl,
            path: data.path,
        });
    } catch (e) {
        console.error("[Upload] Error:", e);
        return NextResponse.json(
            { error: "Failed to process upload" },
            { status: 500 }
        );
    }
}

