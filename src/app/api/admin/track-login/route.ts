import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// POST: Track user login
export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const { 
            walletAddress, 
            walletType, 
            chain, 
            ensName, 
            username,
            inviteCode 
        } = await request.json();

        if (!walletAddress) {
            return NextResponse.json({ error: "Wallet address required" }, { status: 400 });
        }

        const normalizedAddress = walletAddress.toLowerCase();

        // Check if user exists
        const { data: existingUser } = await supabase
            .from("shout_users")
            .select("*")
            .eq("wallet_address", normalizedAddress)
            .single();

        if (existingUser) {
            // Update existing user
            const updates: Record<string, unknown> = {
                last_login: new Date().toISOString(),
                login_count: (existingUser.login_count || 0) + 1,
                updated_at: new Date().toISOString(),
            };

            // Update fields if provided
            if (walletType) updates.wallet_type = walletType;
            if (chain) updates.chain = chain;
            if (ensName) updates.ens_name = ensName;
            if (username) updates.username = username;

            const { error } = await supabase
                .from("shout_users")
                .update(updates)
                .eq("wallet_address", normalizedAddress);

            if (error) {
                console.error("[Login] Error updating user:", error);
            }

            return NextResponse.json({ 
                success: true, 
                isNewUser: false,
                isBanned: existingUser.is_banned,
                banReason: existingUser.ban_reason,
            });
        } else {
            // Create new user
            let referredBy: string | null = null;

            // Validate and track invite code usage
            if (inviteCode) {
                const { data: code } = await supabase
                    .from("shout_invite_codes")
                    .select("*")
                    .eq("code", inviteCode.toUpperCase())
                    .eq("is_active", true)
                    .single();

                if (code) {
                    // Check if code is still valid
                    const isExpired = code.expires_at && new Date(code.expires_at) < new Date();
                    const isMaxedOut = code.max_uses > 0 && code.current_uses >= code.max_uses;

                    if (!isExpired && !isMaxedOut) {
                        // Track usage
                        await supabase.from("shout_invite_code_usage").insert({
                            code: inviteCode.toUpperCase(),
                            used_by: normalizedAddress,
                        });

                        // Increment usage count
                        await supabase
                            .from("shout_invite_codes")
                            .update({ current_uses: code.current_uses + 1 })
                            .eq("code", inviteCode.toUpperCase());

                        referredBy = code.created_by;
                    }
                }
            }

            const { error } = await supabase.from("shout_users").insert({
                wallet_address: normalizedAddress,
                wallet_type: walletType || null,
                chain: chain || "ethereum",
                ens_name: ensName || null,
                username: username || null,
                invite_code_used: inviteCode?.toUpperCase() || null,
                referred_by: referredBy,
            });

            if (error) {
                console.error("[Login] Error creating user:", error);
                return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
            }

            return NextResponse.json({ 
                success: true, 
                isNewUser: true,
                isBanned: false,
            });
        }
    } catch (error) {
        console.error("[Login] Error:", error);
        return NextResponse.json({ error: "Failed to track login" }, { status: 500 });
    }
}

