-- Add token columns to vault transactions
ALTER TABLE shout_vault_transactions
ADD COLUMN IF NOT EXISTS token_symbol TEXT,
ADD COLUMN IF NOT EXISTS token_address TEXT;

-- Add executed_at and executed_tx_hash columns
ALTER TABLE shout_vault_transactions
ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS executed_tx_hash TEXT;
