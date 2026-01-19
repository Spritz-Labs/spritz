import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { sanitizeInput, INPUT_LIMITS } from "@/lib/sanitize";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type VaultMember = {
    address: string;
    smartWalletAddress: string;
    isCreator: boolean;
    nickname: string | null;
    status: string;
    joinedAt: string | null;
    // Populated from profile
    username?: string;
    avatar?: string;
};

export type VaultDetails = {
    id: string;
    name: string;
    description: string | null;
    emoji: string;
    safeAddress: string;
    chainId: number;
    threshold: number;
    isDeployed: boolean;
    deployTxHash: string | null;
    creatorAddress: string;
    members: VaultMember[];
    createdAt: string;
    updatedAt: string;
};

// GET /api/vault/[id] - Get vault details
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        
        // Get authenticated user
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        const userAddress = session.userAddress.toLowerCase();

        // Verify user is a member of this vault
        const { data: membership } = await supabase
            .from("shout_vault_members")
            .select("*")
            .eq("vault_id", id)
            .eq("member_address", userAddress)
            .eq("status", "active")
            .single();

        if (!membership) {
            return NextResponse.json(
                { error: "Vault not found or access denied" },
                { status: 404 }
            );
        }

        // Get vault details
        const { data: vault, error: vaultError } = await supabase
            .from("shout_vaults")
            .select("*")
            .eq("id", id)
            .single();

        if (vaultError || !vault) {
            return NextResponse.json(
                { error: "Vault not found" },
                { status: 404 }
            );
        }

        // Get all members
        const { data: members } = await supabase
            .from("shout_vault_members")
            .select("*")
            .eq("vault_id", id)
            .order("is_creator", { ascending: false })
            .order("joined_at", { ascending: true });

        // Get user info for members (from shout_users)
        const memberAddresses = (members || []).map(m => m.member_address);
        const { data: users } = await supabase
            .from("shout_users")
            .select("wallet_address, avatar_url")
            .in("wallet_address", memberAddresses);

        const { data: usernames } = await supabase
            .from("shout_usernames")
            .select("wallet_address, username")
            .in("wallet_address", memberAddresses);

        const profileMap = (users || []).reduce((acc, u) => {
            acc[u.wallet_address.toLowerCase()] = { avatar: u.avatar_url };
            return acc;
        }, {} as Record<string, { avatar: string | null }>);

        const usernameMap = (usernames || []).reduce((acc, u) => {
            acc[u.wallet_address.toLowerCase()] = u.username;
            return acc;
        }, {} as Record<string, string>);

        // Format members
        const formattedMembers: VaultMember[] = (members || []).map(m => ({
            address: m.member_address,
            smartWalletAddress: m.smart_wallet_address,
            isCreator: m.is_creator,
            nickname: m.nickname,
            status: m.status,
            joinedAt: m.joined_at,
            username: usernameMap[m.member_address.toLowerCase()],
            avatar: profileMap[m.member_address.toLowerCase()]?.avatar || undefined,
        }));

        const response: VaultDetails = {
            id: vault.id,
            name: vault.name,
            description: vault.description,
            emoji: vault.emoji,
            safeAddress: vault.safe_address,
            chainId: vault.chain_id,
            threshold: vault.threshold,
            isDeployed: vault.is_deployed,
            deployTxHash: vault.deploy_tx_hash,
            creatorAddress: vault.creator_address,
            members: formattedMembers,
            createdAt: vault.created_at,
            updatedAt: vault.updated_at,
        };

        return NextResponse.json({ vault: response });
    } catch (error) {
        console.error("[Vault] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch vault" },
            { status: 500 }
        );
    }
}

// PATCH /api/vault/[id] - Update vault metadata
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        
        // Get authenticated user
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        const userAddress = session.userAddress.toLowerCase();

        // Verify user is the creator
        const { data: vault } = await supabase
            .from("shout_vaults")
            .select("*")
            .eq("id", id)
            .eq("creator_address", userAddress)
            .single();

        if (!vault) {
            return NextResponse.json(
                { error: "Vault not found or you're not the creator" },
                { status: 404 }
            );
        }

        const body = await request.json();
        const updates: Record<string, unknown> = {};

        if (body.name) {
            updates.name = sanitizeInput(body.name, INPUT_LIMITS.SHORT_TEXT);
        }
        if (body.description !== undefined) {
            updates.description = body.description 
                ? sanitizeInput(body.description, INPUT_LIMITS.MEDIUM_TEXT)
                : null;
        }
        if (body.emoji) {
            updates.emoji = body.emoji.slice(0, 10);
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json(
                { error: "No valid updates provided" },
                { status: 400 }
            );
        }

        updates.updated_at = new Date().toISOString();

        const { data: updatedVault, error } = await supabase
            .from("shout_vaults")
            .update(updates)
            .eq("id", id)
            .select()
            .single();

        if (error) {
            console.error("[Vault] Error updating:", error);
            return NextResponse.json(
                { error: "Failed to update vault" },
                { status: 500 }
            );
        }

        return NextResponse.json({ vault: updatedVault });
    } catch (error) {
        console.error("[Vault] Error:", error);
        return NextResponse.json(
            { error: "Failed to update vault" },
            { status: 500 }
        );
    }
}

// DELETE /api/vault/[id] - Delete vault (only if not deployed)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        
        // Get authenticated user
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        const userAddress = session.userAddress.toLowerCase();

        // Verify user is the creator and vault is not deployed
        const { data: vault } = await supabase
            .from("shout_vaults")
            .select("*")
            .eq("id", id)
            .eq("creator_address", userAddress)
            .single();

        if (!vault) {
            return NextResponse.json(
                { error: "Vault not found or you're not the creator" },
                { status: 404 }
            );
        }

        if (vault.is_deployed) {
            return NextResponse.json(
                { error: "Cannot delete a deployed vault" },
                { status: 400 }
            );
        }

        // Delete vault (cascade will delete members)
        const { error } = await supabase
            .from("shout_vaults")
            .delete()
            .eq("id", id);

        if (error) {
            console.error("[Vault] Error deleting:", error);
            return NextResponse.json(
                { error: "Failed to delete vault" },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Vault] Error:", error);
        return NextResponse.json(
            { error: "Failed to delete vault" },
            { status: 500 }
        );
    }
}
