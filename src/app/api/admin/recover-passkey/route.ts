/**
 * Admin endpoint to manually trigger passkey recovery
 * This bypasses the normal rescue flow for emergency recovery
 * 
 * SECURITY: Only works in development or with admin secret
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get("address");
    const adminSecret = searchParams.get("secret");
    
    // Security check - require admin secret or dev mode
    const expectedSecret = process.env.ADMIN_RECOVERY_SECRET;
    const isDev = process.env.NODE_ENV === "development";
    
    if (!isDev && adminSecret !== expectedSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    if (!userAddress) {
        return NextResponse.json({ error: "Address required" }, { status: 400 });
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Check if user exists
    const { data: user } = await supabase
        .from("shout_users")
        .select("wallet_address, smart_wallet_address, login_count")
        .eq("wallet_address", userAddress.toLowerCase())
        .single();
    
    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    
    // Generate rescue token
    const rescueToken = crypto.randomUUID();
    const rescueExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
    
    // Store rescue token
    const { error } = await supabase.from("passkey_challenges").insert({
        challenge: rescueToken,
        ceremony_type: "rescue",
        user_address: userAddress.toLowerCase(),
        expires_at: rescueExpiry,
        used: false,
    });
    
    if (error) {
        console.error("[AdminRecovery] Failed to create rescue token:", error);
        return NextResponse.json({ error: "Failed to create token" }, { status: 500 });
    }
    
    // Return HTML page that sets localStorage and redirects
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Account Recovery</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0a0a;
            color: white;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
        }
        .container {
            text-align: center;
            padding: 2rem;
            background: #1a1a1a;
            border-radius: 1rem;
            max-width: 500px;
        }
        h1 { color: #10b981; }
        .address { 
            font-family: monospace; 
            background: #2a2a2a; 
            padding: 0.5rem 1rem; 
            border-radius: 0.5rem;
            word-break: break-all;
        }
        button {
            background: #10b981;
            color: white;
            border: none;
            padding: 1rem 2rem;
            border-radius: 0.5rem;
            font-size: 1rem;
            cursor: pointer;
            margin-top: 1rem;
        }
        button:hover { background: #059669; }
        .warning {
            color: #f59e0b;
            font-size: 0.875rem;
            margin-top: 1rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 Account Recovery</h1>
        <p>Recovering account:</p>
        <p class="address">${userAddress}</p>
        <p>Smart Wallet: <span class="address">${user.smart_wallet_address || "Not created yet"}</span></p>
        <button onclick="startRecovery()">Start Recovery</button>
        <p class="warning">⚠️ This will register a NEW passkey for your account.<br>Your wallet address will remain the same.</p>
    </div>
    <script>
        function startRecovery() {
            // Set recovery tokens in localStorage
            localStorage.setItem("spritz_recovery_token", "${rescueToken}");
            localStorage.setItem("spritz_recovery_address", "${userAddress.toLowerCase()}");
            localStorage.setItem("spritz_needs_rescue", "true");
            
            // Redirect to main app
            alert("Recovery initialized! Click OK to go to the app and complete recovery.");
            window.location.href = "/";
        }
    </script>
</body>
</html>
    `;
    
    return new NextResponse(html, {
        headers: { "Content-Type": "text/html" },
    });
}
