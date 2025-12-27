import type { NextRequest } from "next/server";

export interface X402Config {
    priceUSD: string;  // e.g., "$0.01"
    network: "base" | "base-sepolia";
    payToAddress: string;
    description?: string;
}

export interface X402PaymentResult {
    isValid: boolean;
    payerAddress?: string;
    amountPaid?: number;
    transactionHash?: string;
    error?: string;
}

/**
 * Generate x402 payment requirements for a 402 response
 */
export function generatePaymentRequirements(config: X402Config) {
    const priceInCents = parseFloat(config.priceUSD.replace("$", "")) * 100;
    const priceInMicroUSDC = priceInCents * 10000; // USDC has 6 decimals
    
    return {
        x402Version: 1,
        accepts: [
            {
                scheme: "exact",
                network: config.network,
                maxAmountRequired: priceInMicroUSDC.toString(),
                resource: "", // Will be filled by the endpoint
                description: config.description || "API access",
                mimeType: "application/json",
                asset: config.network === "base" 
                    ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" // USDC on Base mainnet
                    : "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
                payTo: config.payToAddress,
                maxTimeoutSeconds: 300,
                extra: {
                    name: "USD Coin",
                    version: 2,
                },
            },
        ],
    };
}

/**
 * Create a 402 Payment Required response
 */
export function createPaymentRequiredResponse(
    config: X402Config, 
    resourceUrl: string
) {
    const requirements = generatePaymentRequirements(config);
    requirements.accepts[0].resource = resourceUrl;

    return new Response(
        JSON.stringify({
            error: "Payment Required",
            message: `This API requires a payment of ${config.priceUSD} USDC`,
            paymentRequirements: requirements,
        }),
        {
            status: 402,
            headers: {
                "Content-Type": "application/json",
                "X-Payment-Required": JSON.stringify(requirements),
            },
        }
    );
}

/**
 * Verify x402 payment from request headers
 */
export async function verifyX402Payment(
    request: NextRequest,
    config: X402Config
): Promise<X402PaymentResult> {
    const paymentHeader = request.headers.get("X-Payment");
    
    if (!paymentHeader) {
        return { isValid: false, error: "No payment header" };
    }

    try {
        // Parse the payment payload
        const paymentPayload = JSON.parse(paymentHeader);
        
        // Generate requirements for verification
        const requirements = generatePaymentRequirements(config);
        requirements.accepts[0].resource = request.url;

        // Use Coinbase facilitator to verify
        const facilitatorUrl = process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator";
        
        const verifyResponse = await fetch(`${facilitatorUrl}/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                paymentPayload,
                paymentRequirements: requirements.accepts[0],
            }),
        });

        if (!verifyResponse.ok) {
            return { isValid: false, error: "Payment verification failed" };
        }

        const verification = await verifyResponse.json();
        
        if (!verification.isValid) {
            return { 
                isValid: false, 
                error: verification.invalidReason || "Invalid payment" 
            };
        }

        // Settle the payment
        const settleResponse = await fetch(`${facilitatorUrl}/settle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                paymentPayload,
                paymentRequirements: requirements.accepts[0],
            }),
        });

        if (!settleResponse.ok) {
            return { isValid: false, error: "Payment settlement failed" };
        }

        const settlement = await settleResponse.json();

        return {
            isValid: true,
            payerAddress: paymentPayload.from,
            amountPaid: parseInt(paymentPayload.amount) / 10000, // Convert back to cents
            transactionHash: settlement.transactionHash,
        };

    } catch (error) {
        console.error("[x402] Verification error:", error);
        return { 
            isValid: false, 
            error: error instanceof Error ? error.message : "Verification error" 
        };
    }
}

/**
 * Middleware helper for x402 protected routes
 * Returns null if payment is valid, otherwise returns a 402 response
 */
export async function requireX402Payment(
    request: NextRequest,
    config: X402Config
): Promise<Response | null> {
    // Check for payment header
    const paymentHeader = request.headers.get("X-Payment");
    
    if (!paymentHeader) {
        // No payment - return 402
        return createPaymentRequiredResponse(config, request.url);
    }

    // Verify the payment
    const result = await verifyX402Payment(request, config);
    
    if (!result.isValid) {
        return new Response(
            JSON.stringify({ 
                error: "Payment Invalid", 
                message: result.error 
            }),
            { status: 402, headers: { "Content-Type": "application/json" } }
        );
    }

    // Payment valid - return null to continue
    return null;
}

/**
 * Generate embed code for an x402-enabled agent
 */
export function generateAgentEmbedCode(agentId: string, apiUrl: string): string {
    return `<!-- Spritz AI Agent Embed -->
<script src="https://cdn.spritz.chat/agent-widget.js"></script>
<script>
  SpritzAgent.init({
    agentId: "${agentId}",
    apiUrl: "${apiUrl}/api/public/agents/${agentId}/chat",
    // Configure your wallet for x402 payments
    // walletConfig: { ... }
  });
</script>

<!-- Or use the SDK directly -->
<script type="module">
import { wrapFetchWithPayment } from 'https://esm.sh/x402-fetch';
import { createWalletClient, http } from 'https://esm.sh/viem';
import { base } from 'https://esm.sh/viem/chains';

// Your wallet setup
const walletClient = createWalletClient({
  chain: base,
  transport: http(),
});

const fetchWithPay = wrapFetchWithPayment(fetch, walletClient);

// Chat with the agent (auto-handles payments)
const response = await fetchWithPay('${apiUrl}/api/public/agents/${agentId}/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hello!' }),
});

const data = await response.json();
console.log(data.message);
</script>`;
}

/**
 * Generate SDK usage example
 */
export function generateSDKExample(agentId: string, apiUrl: string): string {
    return `// Install: npm install x402-fetch viem

import { wrapFetchWithPayment } from 'x402-fetch';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

// Setup wallet (use your own private key securely)
const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(),
});

// Wrap fetch with x402 payment handling
const fetchWithPay = wrapFetchWithPayment(fetch, walletClient);

// Chat with the agent
async function chat(message, sessionId = null) {
  const response = await fetchWithPay('${apiUrl}/api/public/agents/${agentId}/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      message,
      sessionId, // Optional: maintain conversation context
    }),
  });

  return response.json();
}

// Usage
const result = await chat('What can you help me with?');
console.log(result.message);

// Continue conversation
const followUp = await chat('Tell me more', result.sessionId);
`;
}

