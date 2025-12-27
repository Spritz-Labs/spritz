-- Add x402 payment configuration fields to agents table
-- Run this in your Supabase SQL Editor

-- Add x402 configuration columns
ALTER TABLE shout_agents 
ADD COLUMN IF NOT EXISTS x402_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS x402_price_cents INTEGER DEFAULT 1,  -- Price in cents (e.g., 1 = $0.01)
ADD COLUMN IF NOT EXISTS x402_network TEXT DEFAULT 'base',  -- 'base' or 'base-sepolia'
ADD COLUMN IF NOT EXISTS x402_wallet_address TEXT,  -- Owner's receive wallet
ADD COLUMN IF NOT EXISTS x402_total_earnings_cents INTEGER DEFAULT 0,  -- Total earnings tracked
ADD COLUMN IF NOT EXISTS x402_message_count_paid INTEGER DEFAULT 0;  -- Paid messages count

-- Add index for public x402-enabled agents
CREATE INDEX IF NOT EXISTS idx_agents_x402_enabled 
ON shout_agents (x402_enabled, visibility) 
WHERE x402_enabled = true;

-- Create table to track x402 transactions
CREATE TABLE IF NOT EXISTS shout_agent_x402_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES shout_agents(id) ON DELETE CASCADE,
    payer_address TEXT NOT NULL,  -- Who paid
    amount_cents INTEGER NOT NULL,  -- Amount paid in cents
    network TEXT NOT NULL,  -- 'base' or 'base-sepolia'
    transaction_hash TEXT,  -- On-chain tx hash
    facilitator_response JSONB,  -- Full response from x402 facilitator
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for querying transactions by agent
CREATE INDEX IF NOT EXISTS idx_x402_transactions_agent 
ON shout_agent_x402_transactions (agent_id, created_at DESC);

-- Index for querying transactions by payer
CREATE INDEX IF NOT EXISTS idx_x402_transactions_payer 
ON shout_agent_x402_transactions (payer_address, created_at DESC);

-- Function to increment paid message count and earnings
CREATE OR REPLACE FUNCTION increment_agent_paid_stats(
    agent_id_param UUID,
    amount_cents_param INTEGER
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE shout_agents 
    SET 
        x402_message_count_paid = COALESCE(x402_message_count_paid, 0) + 1,
        x402_total_earnings_cents = COALESCE(x402_total_earnings_cents, 0) + amount_cents_param
    WHERE id = agent_id_param;
END;
$$;

-- Enable realtime for transactions table (optional)
-- ALTER PUBLICATION supabase_realtime ADD TABLE shout_agent_x402_transactions;

COMMENT ON COLUMN shout_agents.x402_enabled IS 'Whether this agent accepts x402 micropayments for external API access';
COMMENT ON COLUMN shout_agents.x402_price_cents IS 'Price per message in cents (e.g., 1 = $0.01 USDC)';
COMMENT ON COLUMN shout_agents.x402_network IS 'Blockchain network for payments: base (mainnet) or base-sepolia (testnet)';
COMMENT ON COLUMN shout_agents.x402_wallet_address IS 'Wallet address to receive payments';

