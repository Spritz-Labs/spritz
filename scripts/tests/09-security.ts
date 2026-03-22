import { suite, assert, summary } from "../helpers/assert.js";
import { supabaseAnon } from "../helpers/http.js";

async function run() {
    // --- shout_users: email column should be hidden from anon ---
    suite("Security: shout_users email column blocked from anon");

    const usersRes = await supabaseAnon("shout_users", "select=email&limit=1");
    assert(usersRes.status === 403 || usersRes.status === 400 || usersRes.status === 401,
        `Email column blocked (HTTP ${usersRes.status})`);

    // --- shout_users: safe columns should still work ---
    suite("Security: shout_users safe columns accessible");

    const safeRes = await supabaseAnon("shout_users", "select=wallet_address,username,display_name&limit=1");
    assert(safeRes.status === 200, `Safe columns accessible (HTTP ${safeRes.status})`);

    // --- shout_users: subscription_stripe_id blocked ---
    suite("Security: shout_users subscription_stripe_id blocked");

    const stripeRes = await supabaseAnon("shout_users", "select=subscription_stripe_id&limit=1");
    assert(stripeRes.status === 403 || stripeRes.status === 400 || stripeRes.status === 401,
        `Stripe ID blocked (HTTP ${stripeRes.status})`);

    // --- shout_users: is_banned blocked ---
    suite("Security: shout_users is_banned blocked");

    const banRes = await supabaseAnon("shout_users", "select=is_banned&limit=1");
    assert(banRes.status === 403 || banRes.status === 400 || banRes.status === 401,
        `Ban info blocked (HTTP ${banRes.status})`);

    // --- shout_phone_numbers: fully inaccessible ---
    suite("Security: shout_phone_numbers fully blocked from anon");

    const phoneRes = await supabaseAnon("shout_phone_numbers", "select=phone_number&limit=1");
    assert(phoneRes.status === 403 || phoneRes.status === 401 || phoneRes.status === 404,
        `Phone numbers blocked (HTTP ${phoneRes.status})`);

    // --- shout_email_verification: fully inaccessible ---
    suite("Security: shout_email_verification blocked from anon");

    const emailVerRes = await supabaseAnon("shout_email_verification", "select=email,code&limit=1");
    assert(emailVerRes.status === 403 || emailVerRes.status === 401 || emailVerRes.status === 404,
        `Email verification blocked (HTTP ${emailVerRes.status})`);

    // --- passkey_email_recovery: fully inaccessible ---
    suite("Security: passkey_email_recovery blocked from anon");

    const passkeyRes = await supabaseAnon("passkey_email_recovery", "select=email&limit=1");
    assert(passkeyRes.status === 403 || passkeyRes.status === 401 || passkeyRes.status === 404,
        `Passkey recovery blocked (HTTP ${passkeyRes.status})`);

    // --- shout_user_settings: private key column blocked ---
    suite("Security: shout_user_settings encrypted keys blocked");

    const privKeyRes = await supabaseAnon("shout_user_settings", "select=messaging_private_key_encrypted&limit=1");
    assert(privKeyRes.status === 403 || privKeyRes.status === 400 || privKeyRes.status === 401,
        `Private key blocked (HTTP ${privKeyRes.status})`);

    // --- shout_user_settings: safe columns still work ---
    suite("Security: shout_user_settings safe columns accessible");

    const settingsSafeRes = await supabaseAnon("shout_user_settings", "select=wallet_address,messaging_public_key&limit=1");
    assert(settingsSafeRes.status === 200, `Settings safe columns accessible (HTTP ${settingsSafeRes.status})`);

    return summary();
}

run().then(({ failed }) => process.exit(failed > 0 ? 1 : 0));
