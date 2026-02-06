/**
 * Script to:
 * 1. Add welcome_shown_at column if not exists
 * 2. Reset welcome_shown_at to NULL for a specific user to re-test welcome modal
 * 
 * Usage: npx tsx scripts/reset-welcome-for-user.ts <wallet_address>
 */

import 'dotenv/config';
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials. Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const walletAddress = process.argv[2];
    
    if (!walletAddress) {
        console.error("Usage: npx tsx scripts/reset-welcome-for-user.ts <wallet_address>");
        process.exit(1);
    }

    const normalizedAddress = walletAddress.toLowerCase();
    console.log(`Resetting welcome for: ${normalizedAddress}`);

    // First, try to add the column if it doesn't exist (migration)
    console.log("\n1. Ensuring welcome_shown_at column exists...");
    try {
        // Try to add the column - will fail silently if exists
        await supabase.rpc('exec_sql', {
            sql: `ALTER TABLE shout_users ADD COLUMN IF NOT EXISTS welcome_shown_at TIMESTAMPTZ DEFAULT NULL;`
        });
        console.log("   Column ensured.");
    } catch (error) {
        // Column might already exist or RPC might not be available
        console.log("   Note: Could not run ALTER TABLE via RPC. Column may already exist or needs manual migration.");
    }

    // Check current user status
    console.log("\n2. Checking current user status...");
    const { data: user, error: selectError } = await supabase
        .from("shout_users")
        .select("wallet_address, username, login_count, welcome_shown_at, created_at")
        .eq("wallet_address", normalizedAddress)
        .single();

    if (selectError) {
        console.error("   Error finding user:", selectError.message);
        
        if (selectError.message.includes("column \"welcome_shown_at\" does not exist")) {
            console.log("\n   ⚠️  The welcome_shown_at column doesn't exist yet!");
            console.log("   Please run this SQL in Supabase Dashboard -> SQL Editor:");
            console.log(`
   ALTER TABLE shout_users 
   ADD COLUMN IF NOT EXISTS welcome_shown_at TIMESTAMPTZ DEFAULT NULL;
            `);
        }
        process.exit(1);
    }

    if (!user) {
        console.log("   User not found. They may need to create an account first.");
        process.exit(1);
    }

    console.log("   Current user data:");
    console.log(`   - username: ${user.username || "(none)"}`);
    console.log(`   - login_count: ${user.login_count}`);
    console.log(`   - welcome_shown_at: ${user.welcome_shown_at || "NULL (not shown yet)"}`);
    console.log(`   - created_at: ${user.created_at}`);

    // Reset welcome_shown_at to NULL and login_count to 0
    console.log("\n3. Resetting welcome_shown_at to NULL and login_count to 0...");
    const { error: updateError } = await supabase
        .from("shout_users")
        .update({ 
            welcome_shown_at: null,
            login_count: 0 
        })
        .eq("wallet_address", normalizedAddress);

    if (updateError) {
        if (updateError.message.includes("column \"welcome_shown_at\" does not exist")) {
            console.log("   ⚠️  The welcome_shown_at column doesn't exist yet!");
            console.log("   Please run this SQL in Supabase Dashboard -> SQL Editor:");
            console.log(`
   ALTER TABLE shout_users 
   ADD COLUMN IF NOT EXISTS welcome_shown_at TIMESTAMPTZ DEFAULT NULL;
            `);
            process.exit(1);
        }
        console.error("   Error updating user:", updateError.message);
        process.exit(1);
    }

    console.log("   ✅ User reset successfully!");
    console.log("\n4. Next steps:");
    console.log("   a. Clear browser localStorage keys: spritz_welcome_seen, spritz_last_login_track");
    console.log("   b. Reload the app");
    console.log("   c. The welcome modal should now appear");
}

main().catch(console.error);
