import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper to check if user is admin
async function isAdmin(userAddress: string): Promise<boolean> {
    const { data } = await supabase
        .from("shout_admins")
        .select("id")
        .eq("wallet_address", userAddress.toLowerCase())
        .single();
    
    return !!data;
}

// POST /api/admin/settings/global-chat-icon - Upload global chat icon
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const userAddress = (formData.get("userAddress") as string)?.toLowerCase();

        if (!userAddress) {
            return NextResponse.json(
                { error: "User address is required" },
                { status: 400 }
            );
        }

        // Check if admin
        const adminCheck = await isAdmin(userAddress);
        if (!adminCheck) {
            return NextResponse.json(
                { error: "Only admins can update the global chat icon" },
                { status: 403 }
            );
        }

        if (!file) {
            return NextResponse.json(
                { error: "No file provided" },
                { status: 400 }
            );
        }

        // Validate file type
        const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json(
                { error: "Only JPEG, PNG, GIF, and WebP images are allowed" },
                { status: 400 }
            );
        }

        // Validate file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            return NextResponse.json(
                { error: "File size must be less than 2MB" },
                { status: 400 }
            );
        }

        // Upload to Supabase Storage
        const fileExt = file.name.split(".").pop() || "png";
        const fileName = `app-icons/global-chat.${fileExt}`;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);

        const { error: uploadError } = await supabase.storage
            .from("public")
            .upload(fileName, buffer, {
                contentType: file.type,
                upsert: true,
            });

        if (uploadError) {
            console.error("[Global Chat Icon] Upload error:", uploadError);
            return NextResponse.json(
                { error: "Failed to upload icon" },
                { status: 500 }
            );
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from("public")
            .getPublicUrl(fileName);

        const iconUrl = urlData.publicUrl;

        // Update app settings
        const { error: updateError } = await supabase
            .from("shout_app_settings")
            .upsert({
                key: "global_chat_icon",
                value: { emoji: "🌍", icon_url: iconUrl },
                updated_by: userAddress,
                updated_at: new Date().toISOString(),
            }, { onConflict: "key" });

        if (updateError) {
            console.error("[Global Chat Icon] Update error:", updateError);
            return NextResponse.json(
                { error: "Failed to update setting" },
                { status: 500 }
            );
        }

        return NextResponse.json({ 
            success: true, 
            icon_url: iconUrl 
        });
    } catch (e) {
        console.error("[Global Chat Icon] Error:", e);
        return NextResponse.json(
            { error: "Failed to upload icon" },
            { status: 500 }
        );
    }
}

// DELETE /api/admin/settings/global-chat-icon - Remove global chat icon
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress")?.toLowerCase();

        if (!userAddress) {
            return NextResponse.json(
                { error: "User address is required" },
                { status: 400 }
            );
        }

        // Check if admin
        const adminCheck = await isAdmin(userAddress);
        if (!adminCheck) {
            return NextResponse.json(
                { error: "Only admins can update the global chat icon" },
                { status: 403 }
            );
        }

        // Update app settings to remove icon
        const { error: updateError } = await supabase
            .from("shout_app_settings")
            .upsert({
                key: "global_chat_icon",
                value: { emoji: "🌍", icon_url: null },
                updated_by: userAddress,
                updated_at: new Date().toISOString(),
            }, { onConflict: "key" });

        if (updateError) {
            console.error("[Global Chat Icon] Delete error:", updateError);
            return NextResponse.json(
                { error: "Failed to remove icon" },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("[Global Chat Icon] Error:", e);
        return NextResponse.json(
            { error: "Failed to remove icon" },
            { status: 500 }
        );
    }
}
