import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type ChannelMember = {
    user_address: string;
    joined_at: string;
    username?: string;
    avatar?: string;
    ens_name?: string;
};

// GET /api/channels/[id]/members - Get channel members
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "100"), 200); // Max 200 per request
    const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0");

    try {
        // For "global" channel, return all members from shout_alpha_membership
        // Also include recent active users from messages who might not be in membership table
        if (id === "global") {
            // Get all active members from membership table
            const { data: memberships, error: membershipError } = await supabase
                .from("shout_alpha_membership")
                .select("user_address, joined_at")
                .is("left_at", null)
                .order("joined_at", { ascending: false });

            if (membershipError) {
                console.error("[Channel Members] Error fetching global memberships:", membershipError);
                return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
            }

            // Also get recent message senders (last 200 messages) to catch active users
            const { data: recentMessages, error: messagesError } = await supabase
                .from("shout_alpha_messages")
                .select("sender_address, created_at")
                .not("sender_address", "like", "agent:%")
                .order("created_at", { ascending: false })
                .limit(200);

            if (messagesError) {
                console.error("[Channel Members] Error fetching global messages:", messagesError);
            }

            // Combine membership addresses with message sender addresses
            const membershipAddresses = new Set(
                memberships?.map(m => m.user_address.toLowerCase()) || []
            );
            const messageSenderAddresses = new Set(
                recentMessages?.map(m => m.sender_address.toLowerCase()) || []
            );

            // Merge both sets - prioritize membership data for joined_at
            const allAddresses = new Set([...membershipAddresses, ...messageSenderAddresses]);
            
            // Create a map of joined_at times (from membership if available, otherwise from first message)
            const joinedAtMap = new Map<string, string>();
            memberships?.forEach(m => {
                joinedAtMap.set(m.user_address.toLowerCase(), m.joined_at);
            });
            recentMessages?.forEach(m => {
                const addr = m.sender_address.toLowerCase();
                if (!joinedAtMap.has(addr)) {
                    joinedAtMap.set(addr, m.created_at);
                }
            });

            // Convert to array and sort by joined_at (most recent first)
            const sortedAddresses = Array.from(allAddresses).sort((a, b) => {
                const aTime = joinedAtMap.get(a) || "";
                const bTime = joinedAtMap.get(b) || "";
                return bTime.localeCompare(aTime);
            });

            // Apply pagination
            const paginatedAddresses = sortedAddresses.slice(offset, offset + limit);
            
            // Fetch user info for these addresses (batch if needed - Supabase has limits on IN clause)
            let userInfoMap = new Map();
            if (paginatedAddresses.length > 0) {
                // Batch queries if we have more than 100 addresses (Supabase limit is typically 100-200)
                const batchSize = 100;
                const batches: string[][] = [];
                for (let i = 0; i < paginatedAddresses.length; i += batchSize) {
                    batches.push(paginatedAddresses.slice(i, i + batchSize));
                }

                const allUsersInfo: any[] = [];
                for (const batch of batches) {
                    const { data: usersInfo } = await supabase
                        .from("shout_users")
                        .select("wallet_address, username, avatar, ens_name")
                        .in("wallet_address", batch);
                    
                    if (usersInfo) {
                        allUsersInfo.push(...usersInfo);
                    }
                }

                userInfoMap = new Map(
                    allUsersInfo.map(u => [u.wallet_address.toLowerCase(), u])
                );
            }

            const members: ChannelMember[] = paginatedAddresses.map(addr => {
                const info = userInfoMap.get(addr);
                return {
                    user_address: addr,
                    joined_at: joinedAtMap.get(addr) || new Date().toISOString(),
                    username: info?.username || undefined,
                    avatar: info?.avatar || undefined,
                    ens_name: info?.ens_name || undefined,
                };
            });

            return NextResponse.json({ 
                members,
                total: sortedAddresses.length,
                hasMore: (offset + limit) < sortedAddresses.length
            });
        }

        // For regular channels, get from shout_channel_members
        const { data: memberships, error, count } = await supabase
            .from("shout_channel_members")
            .select("user_address, joined_at", { count: "exact" })
            .eq("channel_id", id)
            .order("joined_at", { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            console.error("[Channel Members] Error fetching members:", error);
            return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
        }

        // Get user info for these addresses (normalize to lowercase for lookup)
        const addresses = memberships?.map(m => m.user_address.toLowerCase()) || [];
        
        // Only fetch user info if we have addresses (batch if needed)
        let userInfoMap = new Map();
        if (addresses.length > 0) {
            // Batch queries if we have more than 100 addresses
            const batchSize = 100;
            const batches: string[][] = [];
            for (let i = 0; i < addresses.length; i += batchSize) {
                batches.push(addresses.slice(i, i + batchSize));
            }

            const allUsersInfo: any[] = [];
            for (const batch of batches) {
                const { data: usersInfo } = await supabase
                    .from("shout_users")
                    .select("wallet_address, username, avatar, ens_name")
                    .in("wallet_address", batch);
                
                if (usersInfo) {
                    allUsersInfo.push(...usersInfo);
                }
            }

            userInfoMap = new Map(
                allUsersInfo.map(u => [u.wallet_address.toLowerCase(), u])
            );
        }

        const members: ChannelMember[] = (memberships || []).map(m => {
            const normalizedAddr = m.user_address.toLowerCase();
            const info = userInfoMap.get(normalizedAddr);
            return {
                user_address: m.user_address, // Keep original casing for display
                joined_at: m.joined_at,
                username: info?.username || undefined,
                avatar: info?.avatar || undefined,
                ens_name: info?.ens_name || undefined,
            };
        });

        return NextResponse.json({ 
            members,
            total: count || 0,
            hasMore: (offset + limit) < (count || 0)
        });
    } catch (e) {
        console.error("[Channel Members] Error:", e);
        return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
    }
}
