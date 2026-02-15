import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function canEditTokenChatIcon(
    userAddress: string,
    chatId: string,
): Promise<boolean> {
    // Check global admin
    const { data: admin } = await supabase
        .from("shout_admins")
        .select("id")
        .eq("wallet_address", userAddress)
        .single();
    if (admin) return true;

    // Check token chat creator
    const { data: chat } = await supabase
        .from("shout_token_chats")
        .select("created_by")
        .eq("id", chatId)
        .single();
    if (chat?.created_by?.toLowerCase() === userAddress) return true;

    // Check if member with admin/moderator role
    const { data: member } = await supabase
        .from("shout_token_chat_members")
        .select("role")
        .eq("chat_id", chatId)
        .eq("member_address", userAddress)
        .single();
    if (member?.role === "admin" || member?.role === "moderator") return true;

    return false;
}

// POST /api/token-chats/[id]/icon - Upload token chat icon
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const userAddress = (formData.get("userAddress") as string)?.toLowerCase();

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
        }
        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const canEdit = await canEditTokenChatIcon(userAddress, id);
        if (!canEdit) {
            return NextResponse.json(
                { error: "Only admins, moderators, and chat creators can update the icon" },
                { status: 403 },
            );
        }

        const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json(
                { error: "Only JPEG, PNG, GIF, and WebP images are allowed" },
                { status: 400 },
            );
        }
        if (file.size > 2 * 1024 * 1024) {
            return NextResponse.json({ error: "File size must be less than 2MB" }, { status: 400 });
        }

        const fileExt = file.name.split(".").pop() || "png";
        const fileName = `token-chat-icons/${id}.${fileExt}`;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);

        const { error: uploadError } = await supabase.storage
            .from("public")
            .upload(fileName, buffer, { contentType: file.type, upsert: true });

        if (uploadError) {
            console.error("[Token Chat Icon] Upload error:", uploadError);
            return NextResponse.json({ error: "Failed to upload icon" }, { status: 500 });
        }

        const { data: urlData } = supabase.storage.from("public").getPublicUrl(fileName);
        const iconUrl = urlData.publicUrl;

        const { error: updateError } = await supabase
            .from("shout_token_chats")
            .update({ icon_url: iconUrl })
            .eq("id", id);

        if (updateError) {
            console.error("[Token Chat Icon] Update error:", updateError);
            return NextResponse.json({ error: "Failed to update chat icon" }, { status: 500 });
        }

        return NextResponse.json({ success: true, icon_url: iconUrl });
    } catch (e) {
        console.error("[Token Chat Icon] Error:", e);
        return NextResponse.json({ error: "Failed to upload icon" }, { status: 500 });
    }
}

// DELETE /api/token-chats/[id]/icon - Remove token chat icon
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;

    try {
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress")?.toLowerCase();

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
        }

        const canEdit = await canEditTokenChatIcon(userAddress, id);
        if (!canEdit) {
            return NextResponse.json(
                { error: "Only admins, moderators, and chat creators can update the icon" },
                { status: 403 },
            );
        }

        const { error: updateError } = await supabase
            .from("shout_token_chats")
            .update({ icon_url: null })
            .eq("id", id);

        if (updateError) {
            console.error("[Token Chat Icon] Delete error:", updateError);
            return NextResponse.json({ error: "Failed to remove icon" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("[Token Chat Icon] Error:", e);
        return NextResponse.json({ error: "Failed to remove icon" }, { status: 500 });
    }
}
