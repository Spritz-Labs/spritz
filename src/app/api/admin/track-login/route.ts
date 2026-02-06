import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

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
        // Require authentication - user must have a valid session
        const session = await getAuthenticatedUser(request);
        if (!session) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

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

        // Security: Only allow users to track login for their own address
        if (normalizedAddress !== session.userAddress.toLowerCase()) {
            console.warn("[Login] Attempted to track login for different address:", {
                sessionAddress: session.userAddress,
                requestedAddress: normalizedAddress,
            });
            return NextResponse.json({ error: "Cannot track login for other users" }, { status: 403 });
        }

        // Check if user exists
        const { data: existingUser } = await supabase
            .from("shout_users")
            .select("*")
            .eq("wallet_address", normalizedAddress)
            .single();

        if (existingUser) {
            // Check if welcome modal has been shown using the dedicated welcome_shown_at field
            // This is more reliable than login_count which can be incremented by auth flows
            const welcomeNotYetShown = existingUser.welcome_shown_at === null;
            console.log("[Login] Existing user found:", normalizedAddress, "login_count:", existingUser.login_count, "welcome_shown_at:", existingUser.welcome_shown_at, "welcomeNotYetShown:", welcomeNotYetShown);
            
            // Update existing user
            const updates: Record<string, unknown> = {
                last_login: new Date().toISOString(),
                login_count: (existingUser.login_count || 0) + 1,
                updated_at: new Date().toISOString(),
            };

            // Update fields if provided
            // IMPORTANT: Don't overwrite wallet_type if it's already set to a non-wallet auth method
            // (passkey, email, world_id, alien_id) - those are set during their auth flows
            const protectedWalletTypes = ['passkey', 'email', 'world_id', 'alien_id'];
            if (walletType && !protectedWalletTypes.includes(existingUser.wallet_type)) {
                updates.wallet_type = walletType;
            }
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

            // Ensure user is in Alpha channel (in case they joined before Alpha existed)
            try {
                await supabase.rpc("join_alpha_channel", {
                    p_user_address: normalizedAddress,
                });
            } catch {
                // Ignore errors - user might already be a member
            }

            // Check if daily bonus is available (don't auto-claim)
            let dailyBonusAvailable = false;
            try {
                const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD in UTC
                const lastClaimed = existingUser.daily_points_claimed_at;
                dailyBonusAvailable = !lastClaimed || lastClaimed !== today;
            } catch (err) {
                console.error("[Login] Failed to check daily bonus:", err);
            }

            return NextResponse.json({ 
                success: true, 
                isNewUser: welcomeNotYetShown, // Show welcome if welcome_shown_at is null
                isBanned: existingUser.is_banned,
                banReason: existingUser.ban_reason,
                dailyBonusAvailable,
            });
        } else {
            // Create new user
            let referredBy: string | null = null;
            let inviteCodeRedeemed = false;
            let inviteCodeId: string | null = null;

            // Validate and track invite code usage
            if (inviteCode) {
                const upperCode = inviteCode.toUpperCase();
                
                // First, try to redeem as a user invite code
                const { data: userInviteResult } = await supabase.rpc("redeem_user_invite", {
                    p_code: upperCode,
                    p_redeemer_address: normalizedAddress,
                });

                if (userInviteResult?.success) {
                    // User invite code was redeemed successfully
                    referredBy = userInviteResult.inviter;
                    inviteCodeRedeemed = true;
                    console.log("[Login] Redeemed user invite code:", upperCode, "from:", referredBy);
                } else {
                    // Try admin invite codes as fallback
                    const { data: code } = await supabase
                        .from("shout_invite_codes")
                        .select("*")
                        .eq("code", upperCode)
                        .eq("is_active", true)
                        .single();

                    if (code) {
                        // Check if code is still valid
                        const isExpired = code.expires_at && new Date(code.expires_at) < new Date();
                        const isMaxedOut = code.max_uses > 0 && code.current_uses >= code.max_uses;

                        if (!isExpired && !isMaxedOut) {
                            // Track usage
                            await supabase.from("shout_invite_code_usage").insert({
                                code: upperCode,
                                used_by: normalizedAddress,
                            });

                            // Increment usage count
                            await supabase
                                .from("shout_invite_codes")
                                .update({ current_uses: code.current_uses + 1 })
                                .eq("code", upperCode);

                            referredBy = code.created_by;
                            inviteCodeRedeemed = true;
                            inviteCodeId = code.id;
                            console.log("[Login] Redeemed admin invite code:", upperCode);

                            // Award points to the code creator (inviter) - 100 pts
                            if (code.created_by) {
                                const inviterClaimKey = `invite_admin_${code.id}_${normalizedAddress}`;
                                const inviterAddress = code.created_by.toLowerCase();
                                
                                // Check if not already claimed
                                const { data: existingClaim } = await supabase
                                    .from("shout_points_history")
                                    .select("id")
                                    .eq("claim_key", inviterClaimKey)
                                    .single();
                                
                                if (!existingClaim) {
                                    await supabase.from("shout_points_history").insert({
                                        wallet_address: inviterAddress,
                                        points: 100,
                                        reason: "Invite code redeemed",
                                        claim_key: inviterClaimKey,
                                        metadata: { code: upperCode, redeemer: normalizedAddress },
                                    });

                                    // Get current points and increment
                                    const { data: inviterUser } = await supabase
                                        .from("shout_users")
                                        .select("points")
                                        .eq("wallet_address", inviterAddress)
                                        .single();
                                    
                                    if (inviterUser) {
                                        await supabase
                                            .from("shout_users")
                                            .update({ points: (inviterUser.points || 0) + 100 })
                                            .eq("wallet_address", inviterAddress);
                                    }

                                    console.log("[Login] Awarded 100 pts to admin code creator:", inviterAddress);
                                }
                            }
                        }
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

            // Auto-join new user to Alpha channel (muted by default)
            try {
                await supabase.rpc("join_alpha_channel", {
                    p_user_address: normalizedAddress,
                });
            } catch (err) {
                console.error("[Login] Failed to join Alpha channel:", err);
            }

            // Award points to new user if they used a valid invite code
            if (inviteCodeRedeemed && referredBy) {
                try {
                    const newUserClaimKey = inviteCodeId 
                        ? `invite_admin_${inviteCodeId}_redeemer`
                        : `invite_user_${normalizedAddress}_welcome`;
                    
                    // Check if not already claimed
                    const { data: existingClaim } = await supabase
                        .from("shout_points_history")
                        .select("id")
                        .eq("claim_key", newUserClaimKey)
                        .single();
                    
                    if (!existingClaim) {
                        // Award 100 points to the new user for using an invite code
                        await supabase.from("shout_points_history").insert({
                            wallet_address: normalizedAddress,
                            points: 100,
                            reason: "Invite code redeemed",
                            claim_key: newUserClaimKey,
                            metadata: { referrer: referredBy },
                        });

                        await supabase
                            .from("shout_users")
                            .update({ points: 100 })
                            .eq("wallet_address", normalizedAddress);

                        console.log("[Login] Awarded 100 pts welcome bonus to new user:", normalizedAddress);
                    }
                } catch (err) {
                    console.error("[Login] Failed to award invite code points to new user:", err);
                }
            }

            // New users always have daily bonus available
            return NextResponse.json({ 
                success: true, 
                isNewUser: true,
                isBanned: false,
                dailyBonusAvailable: true,
            });
        }
    } catch (error) {
        console.error("[Login] Error:", error);
        return NextResponse.json({ error: "Failed to track login" }, { status: 500 });
    }
}


