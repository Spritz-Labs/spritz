import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { sanitizeInput, INPUT_LIMITS } from "@/lib/sanitize";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Reserved usernames to prevent impersonation and scams
const RESERVED_USERNAMES = new Set([
    // Company/Brand names
    "spritz", "spritzapp", "spritzchat", "spritzlabs", "spritz_labs", "spritz_app",
    "spritz_chat", "spritz_team", "spritz_support", "spritz_official", "spritz_help",
    "spritz_admin", "spritz_mod", "spritz_bot", "spritzbot", "spritz_dao",
    
    // Official roles
    "admin", "administrator", "support", "help", "helpdesk", "moderator", "mod",
    "staff", "team", "official", "verified", "system", "operator", "manager",
    
    // Security-sensitive
    "security", "secure", "root", "sysadmin", "webmaster", "superuser", "sudo",
    
    // Financial/Trust terms
    "wallet", "vault", "treasury", "finance", "payment", "billing", "account",
    "accounts", "bank", "crypto", "token", "tokens", "nft", "nfts",
    
    // Communication/Announcements  
    "announcement", "announcements", "news", "update", "updates", "alert", "alerts",
    "notification", "notifications", "info", "information", "notice", "broadcast",
    
    // Authority titles
    "ceo", "cto", "cfo", "coo", "founder", "cofounder", "co_founder", "owner",
    "developer", "dev", "engineer", "president", "director", "lead", "head",
    
    // Support variations
    "customer_support", "customersupport", "tech_support", "techsupport",
    "official_support", "support_team", "helpteam", "help_team", "service",
    "customer_service", "customerservice",
    
    // Generic reserved
    "null", "undefined", "anonymous", "guest", "test", "testing", "demo",
    "example", "user", "username", "me", "self", "api", "www", "mail", "email",
    "ftp", "http", "https", "localhost", "server", "bot", "robot",
    
    // Scam prevention terms
    "giveaway", "airdrop", "free", "winner", "prize", "reward", "claim",
    "verify", "verification", "recovery", "restore", "unlock", "bonus",
    "promo", "promotion", "contest", "lottery", "jackpot",
    
    // Common impersonation targets
    "vitalik", "satoshi", "elon", "elonmusk", "cz", "sbf",
]);

// Check if username is reserved (also checks common patterns)
function isReservedUsername(username: string): boolean {
    const normalized = username.toLowerCase();
    
    // Direct match
    if (RESERVED_USERNAMES.has(normalized)) {
        return true;
    }
    
    // Check for patterns like "spritz_anything", "official_anything", "support_anything"
    const reservedPrefixes = ["spritz_", "official_", "support_", "admin_", "mod_", "team_"];
    for (const prefix of reservedPrefixes) {
        if (normalized.startsWith(prefix)) {
            return true;
        }
    }
    
    // Check for patterns like "anything_official", "anything_support", "anything_admin"
    const reservedSuffixes = ["_official", "_support", "_admin", "_mod", "_team", "_staff", "_verified"];
    for (const suffix of reservedSuffixes) {
        if (normalized.endsWith(suffix)) {
            return true;
        }
    }
    
    return false;
}

// Normalize address (lowercase for EVM, as-is for Solana)
function normalizeAddress(address: string): string {
    if (address.startsWith("0x")) {
        return address.toLowerCase();
    }
    return address; // Solana addresses are case-sensitive
}

// GET - Fetch username for an address
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const address = searchParams.get("address");

        if (!address) {
            return NextResponse.json(
                { error: "Address is required" },
                { status: 400 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { data, error } = await supabase
            .from("shout_usernames")
            .select("username")
            .eq("wallet_address", normalizeAddress(address))
            .maybeSingle();

        if (error) {
            console.error("[Username] Fetch error:", error);
            return NextResponse.json(
                { error: "Failed to fetch username" },
                { status: 500 }
            );
        }

        return NextResponse.json({ username: data?.username || null });
    } catch (error) {
        console.error("[Username] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

// POST - Claim or update username
export async function POST(request: NextRequest) {
    try {
        const session = await getAuthenticatedUser(request);
        
        if (!session) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { username } = body;

        if (!username) {
            return NextResponse.json(
                { error: "Username is required" },
                { status: 400 }
            );
        }

        // Sanitize and normalize
        const normalizedName = sanitizeInput(username, INPUT_LIMITS.USERNAME)
            .toLowerCase()
            .trim();

        // Validate username
        if (normalizedName.length < 3) {
            return NextResponse.json(
                { error: "Username must be at least 3 characters" },
                { status: 400 }
            );
        }

        if (normalizedName.length > 20) {
            return NextResponse.json(
                { error: "Username must be 20 characters or less" },
                { status: 400 }
            );
        }

        if (!/^[a-z0-9_]+$/.test(normalizedName)) {
            return NextResponse.json(
                { error: "Username can only contain letters, numbers, and underscores" },
                { status: 400 }
            );
        }

        // Check for reserved usernames (security)
        if (isReservedUsername(normalizedName)) {
            return NextResponse.json(
                { error: "Username not available" },
                { status: 409 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const walletAddress = normalizeAddress(session.userAddress);

        // Check if username is taken by another user
        const { data: existingUsername } = await supabase
            .from("shout_usernames")
            .select("wallet_address")
            .eq("username", normalizedName)
            .maybeSingle();

        if (existingUsername && existingUsername.wallet_address !== walletAddress) {
            return NextResponse.json(
                { error: "Username already taken" },
                { status: 409 }
            );
        }

        // Check if user already has a username
        const { data: existing } = await supabase
            .from("shout_usernames")
            .select("id, username")
            .eq("wallet_address", walletAddress)
            .maybeSingle();

        if (existing) {
            // Update existing username
            const { error: updateError } = await supabase
                .from("shout_usernames")
                .update({
                    username: normalizedName,
                    updated_at: new Date().toISOString(),
                })
                .eq("wallet_address", walletAddress);

            if (updateError) {
                console.error("[Username] Update error:", updateError);
                if (updateError.message.includes("unique")) {
                    return NextResponse.json(
                        { error: "Username already taken" },
                        { status: 409 }
                    );
                }
                return NextResponse.json(
                    { error: "Failed to update username" },
                    { status: 500 }
                );
            }

            console.log("[Username] Updated:", walletAddress, "->", normalizedName);
            return NextResponse.json({ 
                success: true, 
                username: normalizedName,
                isNew: false 
            });
        } else {
            // Create new username
            const { error: insertError } = await supabase
                .from("shout_usernames")
                .insert({
                    username: normalizedName,
                    wallet_address: walletAddress,
                });

            if (insertError) {
                console.error("[Username] Insert error:", insertError);
                if (insertError.message.includes("unique")) {
                    return NextResponse.json(
                        { error: "Username already taken" },
                        { status: 409 }
                    );
                }
                return NextResponse.json(
                    { error: "Failed to claim username" },
                    { status: 500 }
                );
            }

            console.log("[Username] Created:", walletAddress, "->", normalizedName);
            return NextResponse.json({ 
                success: true, 
                username: normalizedName,
                isNew: true 
            });
        }
    } catch (error) {
        console.error("[Username] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

// DELETE - Remove username
export async function DELETE(request: NextRequest) {
    try {
        const session = await getAuthenticatedUser(request);
        
        if (!session) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const walletAddress = normalizeAddress(session.userAddress);

        const { error } = await supabase
            .from("shout_usernames")
            .delete()
            .eq("wallet_address", walletAddress);

        if (error) {
            console.error("[Username] Delete error:", error);
            return NextResponse.json(
                { error: "Failed to remove username" },
                { status: 500 }
            );
        }

        console.log("[Username] Deleted for:", walletAddress);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Username] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
