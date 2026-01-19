import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type VaultListItem = {
    id: string;
    name: string;
    description: string | null;
    emoji: string;
    safeAddress: string;
    chainId: number;
    threshold: number;
    isDeployed: boolean;
    creatorAddress: string;
    isCreator: boolean;
    memberCount: number;
    createdAt: string;
};

export async function GET(request: NextRequest) {
    try {
        // Get authenticated user
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        const userAddress = session.userAddress.toLowerCase();

        // Get all vaults where user is a member
        const { data: memberships, error: membershipError } = await supabase
            .from("shout_vault_members")
            .select("vault_id, is_creator")
            .eq("member_address", userAddress)
            .eq("status", "active");

        if (membershipError) {
            console.error("[Vault] Error fetching memberships:", membershipError);
            return NextResponse.json(
                { error: "Failed to fetch vaults" },
                { status: 500 }
            );
        }

        if (!memberships || memberships.length === 0) {
            return NextResponse.json({ vaults: [] });
        }

        const vaultIds = memberships.map(m => m.vault_id);
        const creatorMap = memberships.reduce((acc, m) => {
            acc[m.vault_id] = m.is_creator;
            return acc;
        }, {} as Record<string, boolean>);

        // Fetch vault details
        const { data: vaults, error: vaultsError } = await supabase
            .from("shout_vaults")
            .select("*")
            .in("id", vaultIds)
            .order("created_at", { ascending: false });

        if (vaultsError) {
            console.error("[Vault] Error fetching vaults:", vaultsError);
            return NextResponse.json(
                { error: "Failed to fetch vault details" },
                { status: 500 }
            );
        }

        // Get member counts for each vault
        const { data: memberCounts } = await supabase
            .from("shout_vault_members")
            .select("vault_id")
            .in("vault_id", vaultIds)
            .eq("status", "active");

        const countMap: Record<string, number> = {};
        for (const m of memberCounts || []) {
            countMap[m.vault_id] = (countMap[m.vault_id] || 0) + 1;
        }

        // Format response
        const formattedVaults: VaultListItem[] = (vaults || []).map(v => ({
            id: v.id,
            name: v.name,
            description: v.description,
            emoji: v.emoji,
            safeAddress: v.safe_address,
            chainId: v.chain_id,
            threshold: v.threshold,
            isDeployed: v.is_deployed,
            creatorAddress: v.creator_address,
            isCreator: creatorMap[v.id] || false,
            memberCount: countMap[v.id] || 0,
            createdAt: v.created_at,
        }));

        return NextResponse.json({ vaults: formattedVaults });
    } catch (error) {
        console.error("[Vault] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch vaults" },
            { status: 500 }
        );
    }
}
