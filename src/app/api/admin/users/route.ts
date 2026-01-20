import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// Admin message expiry time (24 hours)
// Note: The signature includes a timestamp for initial verification,
// but credentials are cached for 24 hours in the client. The signature
// itself remains valid - the timestamp is just to prevent ancient replays.
const ADMIN_MESSAGE_EXPIRY_MS = 24 * 60 * 60 * 1000;

// Extract and validate timestamp from message
function validateMessageTimestamp(message: string): boolean {
    const match = message.match(/Issued At: ([^\n]+)/);
    if (!match) return false;
    
    const issuedAt = new Date(match[1]);
    if (isNaN(issuedAt.getTime())) return false;
    
    const messageAge = Date.now() - issuedAt.getTime();
    
    // Reject if too old or too far in the future
    if (messageAge > ADMIN_MESSAGE_EXPIRY_MS || messageAge < -60000) {
        return false;
    }
    
    return true;
}

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
        
        // Validate timestamp to prevent replay attacks
        if (!validateMessageTimestamp(message)) {
            console.warn("[Admin] Rejected expired or invalid message timestamp for:", address);
            return { isAdmin: false, address: null, isSuperAdmin: false };
        }
        
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

    // If searching by username, first look up addresses from shout_usernames table
    let usernameAddresses: string[] = [];
    if (search) {
        const sanitizedSearch = search.replace(/[%_\\'"]/g, '\\$&').toLowerCase();
        const { data: usernameMatches } = await supabase
            .from("shout_usernames")
            .select("wallet_address")
            .ilike("username", `%${sanitizedSearch}%`);
        
        if (usernameMatches) {
            usernameAddresses = usernameMatches.map(u => u.wallet_address);
        }
    }

    let query = supabase
        .from("shout_users")
        .select("*", { count: "exact" });

    if (search) {
        // Sanitize search to prevent SQL injection - escape special chars
        const sanitizedSearch = search.replace(/[%_\\'"]/g, '\\$&');
        
        // Build search condition: address, ENS, or username matches
        let searchCondition = `wallet_address.ilike.%${sanitizedSearch}%,ens_name.ilike.%${sanitizedSearch}%`;
        
        // If we found username matches, add those addresses to the search
        if (usernameAddresses.length > 0) {
            // Add each username-matched address to the search
            const addressConditions = usernameAddresses.map(addr => `wallet_address.eq.${addr}`).join(',');
            searchCondition += `,${addressConditions}`;
        }
        
        query = query.or(searchCondition);
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

    // Fetch usernames from shout_usernames table
    let usernames: Record<string, string> = {};
    if (userAddresses.length > 0) {
        const { data: usernameData } = await supabase
            .from("shout_usernames")
            .select("wallet_address, username")
            .in("wallet_address", userAddresses);
        
        if (usernameData) {
            for (const un of usernameData) {
                usernames[un.wallet_address] = un.username;
            }
        }
    }

    // Add used_invites and username to each user
    const usersWithInvites = filteredUsers.map(user => ({
        ...user,
        invites_used: usedInviteCounts[user.wallet_address] || 0,
        username: usernames[user.wallet_address] || user.username || null,
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

