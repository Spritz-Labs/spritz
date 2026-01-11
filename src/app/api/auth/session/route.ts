import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// GET /api/auth/session - Get current session info
export async function GET(request: NextRequest) {
    const session = await getAuthenticatedUser(request);
    
    if (!session) {
        return NextResponse.json({ 
            authenticated: false,
            user: null,
        });
    }
    
    // Optionally fetch fresh user data from database
    let userData = null;
    if (supabase) {
        const { data: user } = await supabase
            .from("shout_users")
            .select("id, wallet_address, username, ens_name, email, email_verified, beta_access, subscription_tier, points, invite_count, is_banned, display_name, avatar_url")
            .eq("wallet_address", session.userAddress)
            .single();
        
        userData = user;
    }
    
    return NextResponse.json({
        authenticated: true,
        session: {
            userAddress: session.userAddress,
            authMethod: session.authMethod,
            expiresAt: new Date(session.exp * 1000).toISOString(),
        },
        user: userData,
    });
}
