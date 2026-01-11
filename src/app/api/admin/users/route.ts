import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// Verify admin signature from headers
async function verifyAdmin(request: NextRequest): Promise<{ isAdmin: boolean; address: string | null; isSuperAdmin: boolean }> {
    const address = request.headers.get("x-admin-address");
    const signature = request.headers.get("x-admin-signature");
    const encodedMessage = request.headers.get("x-admin-message");

    if (!address || !signature || !encodedMessage || !supabase) {
        return { isAdmin: false, address: null, isSuperAdmin: false };
    }

    try {
        // Decode the base64 encoded message
        const message = decodeURIComponent(atob(encodedMessage));
        
        const isValidSignature = await verifyMessage({
            address: address as `0x${string}`,
            message,
            signature: signature as `0x${string}`,
        });

        if (!isValidSignature) {
            return { isAdmin: false, address: null, isSuperAdmin: false };
        }

        const { data: admin } = await supabase
            .from("shout_admins")
            .select("*")
            .eq("wallet_address", address.toLowerCase())
            .single();

        return { 
            isAdmin: !!admin, 
            address: address.toLowerCase(),
            isSuperAdmin: admin?.is_super_admin || false 
        };
    } catch {
        return { isAdmin: false, address: null, isSuperAdmin: false };
    }
}

// GET: List all users
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { isAdmin } = await verifyAdmin(request);
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const search = searchParams.get("search");
    const sortBy = searchParams.get("sortBy") || "last_login";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const betaAccessFilter = searchParams.get("betaAccessFilter");

    let query = supabase
        .from("shout_users")
        .select("*", { count: "exact" });

    if (search) {
        // Sanitize search to prevent SQL injection - escape special chars
        const sanitizedSearch = search.replace(/[%_\\'"]/g, '\\$&');
        query = query.or(`wallet_address.ilike.%${sanitizedSearch}%,ens_name.ilike.%${sanitizedSearch}%,username.ilike.%${sanitizedSearch}%`);
    }

    // Apply beta access filter
    if (betaAccessFilter === "has_access") {
        query = query.eq("beta_access", true);
    } else if (betaAccessFilter === "applied") {
        query = query.eq("beta_access_applied", true).eq("beta_access", false);
    } else if (betaAccessFilter === "neither") {
        // Users who don't have beta access AND haven't applied
        // Use .or() for each field, then filter results in memory for the AND condition
        query = query.or("beta_access.is.null,beta_access.eq.false");
    }

    query = query
        .order(sortBy, { ascending: sortOrder === "asc" })
        .range((page - 1) * limit, page * limit - 1);

    const { data: users, error, count } = await query;

    if (error) {
        console.error("[Admin] Error fetching users:", error);
        return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    }

    // Filter for "neither" case in memory (users without beta access AND without application)
    let filteredUsers = users || [];
    if (betaAccessFilter === "neither") {
        filteredUsers = filteredUsers.filter(
            (user) => !user.beta_access && !user.beta_access_applied
        );
    }

    // Fetch used invite counts for all users
    const userAddresses = filteredUsers.map(u => u.wallet_address);
    let usedInviteCounts: Record<string, number> = {};
    
    if (userAddresses.length > 0) {
        const { data: inviteData } = await supabase
            .from("shout_user_invites")
            .select("owner_address, used_by")
            .in("owner_address", userAddresses);
        
        if (inviteData) {
            // Count used invites per user
            for (const invite of inviteData) {
                if (!usedInviteCounts[invite.owner_address]) {
                    usedInviteCounts[invite.owner_address] = 0;
                }
                if (invite.used_by) {
                    usedInviteCounts[invite.owner_address]++;
                }
            }
        }
    }

    // Add used_invites to each user
    const usersWithInvites = filteredUsers.map(user => ({
        ...user,
        invites_used: usedInviteCounts[user.wallet_address] || 0,
    }));

    // For "neither" filter, we need to recalculate total count
    const finalCount = betaAccessFilter === "neither" 
        ? usersWithInvites.length 
        : (count || 0);

    return NextResponse.json({
        users: usersWithInvites,
        total: finalCount,
        page,
        limit,
        totalPages: Math.ceil(finalCount / limit),
    });
}

// PATCH: Update user (ban, add notes, etc.)
export async function PATCH(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { isAdmin, address: adminAddress } = await verifyAdmin(request);
    if (!isAdmin || !adminAddress) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { userAddress, updates } = await request.json();

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
        }

        // Allowed fields to update
        const allowedFields = ["is_banned", "ban_reason", "notes", "beta_access"];
        const filteredUpdates: Record<string, unknown> = {};
        for (const key of allowedFields) {
            if (key in updates) {
                filteredUpdates[key] = updates[key];
            }
        }

        filteredUpdates.updated_at = new Date().toISOString();

        const { error } = await supabase
            .from("shout_users")
            .update(filteredUpdates)
            .eq("wallet_address", userAddress.toLowerCase());

        if (error) {
            console.error("[Admin] Error updating user:", error);
            return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
        }

        // Log activity
        await supabase.from("shout_admin_activity").insert({
            admin_address: adminAddress,
            action: updates.is_banned ? "ban_user" : "update_user",
            target_address: userAddress.toLowerCase(),
            details: filteredUpdates,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Admin] Error:", error);
        return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
    }
}

