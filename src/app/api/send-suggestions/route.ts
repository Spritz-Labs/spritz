import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type SuggestionType = "friend" | "vault" | "address_book" | "recent";

export interface SendSuggestion {
    type: SuggestionType;
    address: string;
    smartWalletAddress: string | null;
    label: string;
    sublabel?: string;
    avatar?: string;
    ensName?: string;
    isFavorite?: boolean;
    chainId?: number; // For vaults - the chain the vault is deployed on
}

/**
 * GET /api/send-suggestions
 * 
 * Get suggested recipients for sending:
 * - Friends with Smart Wallets
 * - Vaults user is a member of  
 * - Address book entries
 * - Recent transaction recipients (future)
 */
export async function GET(request: NextRequest) {
    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userAddress = session.userAddress.toLowerCase();

    try {
        const suggestions: SendSuggestion[] = [];

        // 1. Get friends with smart wallets
        const { data: friends } = await supabase
            .from("shout_friends")
            .select(`
                friend_address,
                nickname
            `)
            .eq("user_address", userAddress);

        if (friends && friends.length > 0) {
            // Get friend details including smart wallet addresses
            const friendAddresses = friends.map(f => f.friend_address.toLowerCase());
            
            const { data: friendUsers } = await supabase
                .from("shout_users")
                .select("wallet_address, username, display_name, avatar_url, ens_name, smart_wallet_address")
                .in("wallet_address", friendAddresses);

            const friendMap = new Map(
                (friendUsers || []).map(u => [u.wallet_address.toLowerCase(), u])
            );

            for (const friend of friends) {
                const friendData = friendMap.get(friend.friend_address.toLowerCase());
                if (friendData) {
                    suggestions.push({
                        type: "friend",
                        address: friendData.wallet_address,
                        smartWalletAddress: friendData.smart_wallet_address || null,
                        label: friend.nickname || friendData.display_name || friendData.username || `${friendData.wallet_address.slice(0, 6)}...${friendData.wallet_address.slice(-4)}`,
                        sublabel: friendData.ens_name || undefined,
                        avatar: friendData.avatar_url || undefined,
                        ensName: friendData.ens_name || undefined,
                    });
                }
            }
        }

        // 2. Get vaults user is a member of
        const { data: vaultMemberships } = await supabase
            .from("shout_vault_members")
            .select(`
                vault_id,
                shout_vaults (
                    id,
                    name,
                    emoji,
                    safe_address,
                    chain_id,
                    is_deployed
                )
            `)
            .eq("member_address", userAddress)
            .eq("status", "active");

        if (vaultMemberships) {
            for (const membership of vaultMemberships) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const vaultData = membership.shout_vaults as any;
                const vault = vaultData as {
                    id: string;
                    name: string;
                    emoji: string;
                    safe_address: string;
                    chain_id: number;
                    is_deployed: boolean;
                } | null;
                
                if (vault && vault.safe_address) {
                    const chainNames: Record<number, string> = {
                        1: "Ethereum",
                        8453: "Base",
                        42161: "Arbitrum",
                        10: "Optimism",
                        137: "Polygon",
                    };
                    
                    suggestions.push({
                        type: "vault",
                        address: vault.safe_address,
                        smartWalletAddress: vault.safe_address, // Vault IS a smart wallet
                        label: `${vault.emoji || "🔐"} ${vault.name}`,
                        sublabel: `Vault on ${chainNames[vault.chain_id] || `Chain ${vault.chain_id}`}`,
                        chainId: vault.chain_id, // Include chain for filtering
                    });
                }
            }
        }

        // 3. Get address book entries
        const { data: addressBook } = await supabase
            .from("shout_address_book")
            .select("*")
            .eq("user_address", userAddress)
            .order("is_favorite", { ascending: false })
            .order("use_count", { ascending: false })
            .limit(20);

        if (addressBook) {
            for (const entry of addressBook) {
                suggestions.push({
                    type: "address_book",
                    address: entry.address,
                    smartWalletAddress: null, // Unknown for saved addresses
                    label: entry.label,
                    sublabel: entry.ens_name || undefined,
                    ensName: entry.ens_name || undefined,
                    isFavorite: entry.is_favorite,
                });
            }
        }

        // Sort: favorites first, then by type (friends, vaults, address_book)
        suggestions.sort((a, b) => {
            // Favorites first
            if (a.isFavorite && !b.isFavorite) return -1;
            if (!a.isFavorite && b.isFavorite) return 1;
            
            // Then by type priority
            const typePriority: Record<SuggestionType, number> = {
                friend: 1,
                vault: 2,
                address_book: 3,
                recent: 4,
            };
            return typePriority[a.type] - typePriority[b.type];
        });

        return NextResponse.json({ suggestions });
    } catch (err) {
        console.error("[SendSuggestions] Error:", err);
        return NextResponse.json({ error: "Failed to fetch suggestions" }, { status: 500 });
    }
}
