import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { createClient } from "@supabase/supabase-js";

/** Vercel caps this by plan (e.g. 10s Hobby, up to 60s Pro). Avoids silent timeouts on large exports. */
export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const ADMIN_MESSAGE_EXPIRY_MS = 24 * 60 * 60 * 1000;

function validateMessageTimestamp(message: string): boolean {
    const match = message.match(/Issued At: ([^\n]+)/);
    if (!match) return false;

    const issuedAt = new Date(match[1]);
    if (isNaN(issuedAt.getTime())) return false;

    const messageAge = Date.now() - issuedAt.getTime();

    if (messageAge > ADMIN_MESSAGE_EXPIRY_MS || messageAge < -60000) {
        return false;
    }

    return true;
}

async function verifyAdmin(
    request: NextRequest,
): Promise<{ isAdmin: boolean; address: string | null; isSuperAdmin: boolean }> {
    const address = request.headers.get("x-admin-address");
    const signature = request.headers.get("x-admin-signature");
    const encodedMessage = request.headers.get("x-admin-message");

    if (!address || !signature || !encodedMessage || !supabase) {
        return { isAdmin: false, address: null, isSuperAdmin: false };
    }

    try {
        const message = decodeURIComponent(atob(encodedMessage));

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
            isSuperAdmin: admin?.is_super_admin || false,
        };
    } catch {
        return { isAdmin: false, address: null, isSuperAdmin: false };
    }
}

function hasDotEthName(ensName: string | null | undefined): boolean {
    if (!ensName || typeof ensName !== "string") return false;
    return ensName.toLowerCase().includes(".eth");
}

function escapeCSV(value: string | number | boolean): string {
    const str = String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
    if (arr.length === 0) return [];
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

type ShoutUserRow = Record<string, unknown> & {
    wallet_address: string;
    ens_name: string | null;
    username: string | null;
    email: string | null;
    email_verified: boolean | null;
    wallet_type: string | null;
    chain: string | null;
    first_login: string | null;
    last_login: string | null;
    login_count: number | null;
    points: number | null;
    friends_count: number | null;
    messages_sent: number | null;
    voice_minutes: number | null;
    video_minutes: number | null;
    total_calls: number | null;
    groups_count: number | null;
    invite_count: number | null;
    invite_code_used: string | null;
    referred_by: string | null;
    is_banned: boolean | null;
    ban_reason: string | null;
    notes: string | null;
};

/** Rows per Supabase request (PostgREST default max is often 1000). */
const BATCH = 1000;
/** Chunk size for `.in(wallet_address, …)` to avoid URL / query length limits. */
const IN_CHUNK = 150;

/** GET: full user list as CSV (admin auth). Walks the entire shout_users table in pages (not the admin UI page). */
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { isAdmin } = await verifyAdmin(request);
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const headers = [
        "Wallet Address",
        "Username",
        "ENS Name",
        "Has .eth Name",
        "Email",
        "Email Verified",
        "Wallet Type",
        "Chain",
        "First Login",
        "Last Login",
        "Login Count",
        "Points",
        "Friends",
        "Messages Sent",
        "Voice Minutes",
        "Video Minutes",
        "Total Calls",
        "Groups",
        "Invites Used",
        "Invite Allocation",
        "Invite Code Used",
        "Referred By",
        "Is Banned",
        "Ban Reason",
        "Notes",
    ];

    const lines: string[] = [headers.map(escapeCSV).join(",")];

    let offset = 0;
    let totalExported = 0;

    for (;;) {
        const { data: batch, error } = await supabase
            .from("shout_users")
            .select("*")
            .order("wallet_address", { ascending: true })
            .range(offset, offset + BATCH - 1);

        if (error) {
            console.error("[Admin] Export users batch error:", error);
            return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
        }

        if (!batch?.length) break;

        const users = batch as ShoutUserRow[];
        const userAddresses = users.map(u => u.wallet_address);
        totalExported += users.length;

        const usedInviteCounts: Record<string, number> = {};
        for (const addrChunk of chunkArray(userAddresses, IN_CHUNK)) {
            const { data: inviteData } = await supabase
                .from("shout_user_invites")
                .select("owner_address, used_by")
                .in("owner_address", addrChunk);

            if (inviteData) {
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

        const usernames: Record<string, string> = {};
        for (const addrChunk of chunkArray(userAddresses, IN_CHUNK)) {
            const { data: usernameData } = await supabase
                .from("shout_usernames")
                .select("wallet_address, username")
                .in("wallet_address", addrChunk);

            if (usernameData) {
                for (const un of usernameData) {
                    usernames[un.wallet_address] = un.username;
                }
            }
        }

        for (const user of users) {
            const ens = user.ens_name ?? null;
            const spritzUsername = usernames[user.wallet_address] || user.username || "";
            const invitesUsed = usedInviteCounts[user.wallet_address] || 0;
            const inviteAlloc = user.invite_count ?? 5;

            const row = [
                user.wallet_address,
                spritzUsername,
                ens ?? "",
                hasDotEthName(ens) ? "Yes" : "No",
                user.email ?? "",
                user.email_verified ? "Yes" : "No",
                user.wallet_type ?? "",
                user.chain ?? "",
                user.first_login ? new Date(user.first_login).toISOString() : "",
                user.last_login ? new Date(user.last_login).toISOString() : "",
                user.login_count ?? 0,
                user.points ?? 0,
                user.friends_count ?? 0,
                user.messages_sent ?? 0,
                user.voice_minutes ?? 0,
                user.video_minutes ?? 0,
                user.total_calls ?? 0,
                user.groups_count ?? 0,
                invitesUsed,
                inviteAlloc,
                user.invite_code_used ?? "",
                user.referred_by ?? "",
                user.is_banned ? "Yes" : "No",
                user.ban_reason ?? "",
                user.notes ?? "",
            ];

            lines.push(row.map(escapeCSV).join(","));
        }

        offset += BATCH;
        if (users.length < BATCH) break;
    }

    const csv = lines.join("\n");
    const date = new Date().toISOString().split("T")[0];

    return new NextResponse(csv, {
        status: 200,
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="spritz-users-${date}.csv"`,
            "Cache-Control": "no-store",
            // Data rows only (excludes header); should match shout_users row count
            "X-Export-User-Count": String(totalExported),
        },
    });
}
