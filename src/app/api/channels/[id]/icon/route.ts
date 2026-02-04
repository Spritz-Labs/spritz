import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper to check if channel is POAP or Collection (icon is locked)
async function isPoapOrCollectionChannel(channelId: string): Promise<boolean> {
    const { data } = await supabase
        .from("shout_public_channels")
        .select("poap_event_id, poap_collection_id")
        .eq("id", channelId)
        .single();
    return !!(data?.poap_event_id ?? data?.poap_collection_id);
}

// Helper to check if user can edit channel icon
async function canEditChannelIcon(
    userAddress: string,
    channelId: string
): Promise<boolean> {
    // POAP and Collection channels: icon cannot be changed
    if (await isPoapOrCollectionChannel(channelId)) return false;

    // Check if global admin
    const { data: admin } = await supabase
        .from("shout_admins")
        .select("id")
        .eq("wallet_address", userAddress)
        .single();

    if (admin) return true;

    // Check if channel owner
    const { data: channel } = await supabase
        .from("shout_public_channels")
        .select("creator_address")
        .eq("id", channelId)
        .single();

    if (channel?.creator_address?.toLowerCase() === userAddress) return true;

    // Check if moderator for this channel
    const { data: moderator } = await supabase
        .from("shout_moderators")
        .select("id")
        .eq("user_address", userAddress)
        .eq("channel_id", channelId)
        .single();

    if (moderator) return true;

    // Check if global moderator
    const { data: globalMod } = await supabase
        .from("shout_moderators")
        .select("id")
        .eq("user_address", userAddress)
        .is("channel_id", null)
        .single();

    return !!globalMod;
}

// POST /api/channels/[id]/icon - Upload channel icon
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const userAddress = (
            formData.get("userAddress") as string
        )?.toLowerCase();

        if (!userAddress) {
            return NextResponse.json(
                { error: "User address is required" },
                { status: 400 }
            );
        }

        if (!file) {
            return NextResponse.json(
                { error: "No file provided" },
                { status: 400 }
            );
        }

        // Check permissions (also blocks POAP/Collection channels)
        const canEdit = await canEditChannelIcon(userAddress, id);
        if (!canEdit) {
            const isLocked = await isPoapOrCollectionChannel(id);
            return NextResponse.json(
                {
                    error: isLocked
                        ? "Cannot change icon for POAP or Collection channels"
                        : "Only admins, moderators, and channel owners can update the icon",
                },
                { status: 403 }
            );
        }

        // Validate file type
        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
        ];
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
        const fileName = `channel-icons/${id}.${fileExt}`;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);

        const { error: uploadError } = await supabase.storage
            .from("public")
            .upload(fileName, buffer, {
                contentType: file.type,
                upsert: true,
            });

        if (uploadError) {
            console.error("[Channel Icon] Upload error:", uploadError);
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

        // Update channel with new icon URL
        const { error: updateError } = await supabase
            .from("shout_public_channels")
            .update({ icon_url: iconUrl })
            .eq("id", id);

        if (updateError) {
            console.error("[Channel Icon] Update error:", updateError);
            return NextResponse.json(
                { error: "Failed to update channel icon" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            icon_url: iconUrl,
        });
    } catch (e) {
        console.error("[Channel Icon] Error:", e);
        return NextResponse.json(
            { error: "Failed to upload icon" },
            { status: 500 }
        );
    }
}

// DELETE /api/channels/[id]/icon - Remove channel icon (revert to emoji)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress")?.toLowerCase();

        if (!userAddress) {
            return NextResponse.json(
                { error: "User address is required" },
                { status: 400 }
            );
        }

        // Check permissions (also blocks POAP/Collection channels)
        const canEdit = await canEditChannelIcon(userAddress, id);
        if (!canEdit) {
            const isLocked = await isPoapOrCollectionChannel(id);
            return NextResponse.json(
                {
                    error: isLocked
                        ? "Cannot change icon for POAP or Collection channels"
                        : "Only admins, moderators, and channel owners can update the icon",
                },
                { status: 403 }
            );
        }

        // Update channel to remove icon URL
        const { error: updateError } = await supabase
            .from("shout_public_channels")
            .update({ icon_url: null })
            .eq("id", id);

        if (updateError) {
            console.error("[Channel Icon] Delete error:", updateError);
            return NextResponse.json(
                { error: "Failed to remove channel icon" },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("[Channel Icon] Error:", e);
        return NextResponse.json(
            { error: "Failed to remove icon" },
            { status: 500 }
        );
    }
}
