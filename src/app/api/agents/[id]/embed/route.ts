import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateAgentEmbedCode, generateSDKExample } from "@/lib/x402";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// GET: Get embed code and SDK examples for an x402-enabled agent
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress");

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Get the agent
        const { data: agent, error } = await supabase
            .from("shout_agents")
            .select("*")
            .eq("id", id)
            .single();

        if (error || !agent) {
            return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }

        // Check ownership
        if (agent.owner_address !== normalizedAddress) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // Check if x402 is enabled
        if (!agent.x402_enabled) {
            return NextResponse.json({ 
                error: "x402 not enabled",
                message: "Enable x402 payments to get embed code" 
            }, { status: 400 });
        }

        // Generate API URL based on environment
        const apiUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.spritz.chat";

        // Generate embed code and SDK examples
        const embedCode = generateAgentEmbedCode(id, apiUrl);
        const sdkExample = generateSDKExample(id, apiUrl);

        return NextResponse.json({
            agent: {
                id: agent.id,
                name: agent.name,
                emoji: agent.avatar_emoji,
            },
            endpoints: {
                info: `${apiUrl}/api/public/agents/${id}/chat`,
                chat: `${apiUrl}/api/public/agents/${id}/chat`,
            },
            pricing: {
                pricePerMessage: `$${(agent.x402_price_cents / 100).toFixed(2)}`,
                priceCents: agent.x402_price_cents,
                network: agent.x402_network,
                currency: "USDC",
                payTo: agent.x402_wallet_address || agent.owner_address,
            },
            code: {
                embed: embedCode,
                sdk: sdkExample,
                curl: `# Get agent info (no payment required)
curl ${apiUrl}/api/public/agents/${id}/chat

# Chat with agent (requires x402 payment)
# Use x402-fetch or compatible client to handle payments automatically
curl -X POST ${apiUrl}/api/public/agents/${id}/chat \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <x402-payment-header>" \\
  -d '{"message": "Hello!"}'`,
            },
            stats: {
                totalMessages: agent.message_count,
                paidMessages: agent.x402_message_count_paid || 0,
                totalEarnings: `$${((agent.x402_total_earnings_cents || 0) / 100).toFixed(2)}`,
            },
        });

    } catch (error) {
        console.error("[Agent Embed] Error:", error);
        return NextResponse.json({ error: "Failed to generate embed code" }, { status: 500 });
    }
}

