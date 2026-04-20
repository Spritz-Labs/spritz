-- Fix: PostgreSQL UNIQUE(chat_type, chat_id) doesn't prevent duplicates
-- when chat_id IS NULL because NULL != NULL in unique constraints.
-- This caused every toggle click on alpha chat (chat_id = NULL) to INSERT
-- a new row instead of updating the existing one.

-- 1. Remove duplicates, keeping only the most recently updated row per (chat_type, chat_id)
DELETE FROM shout_chat_rules a
USING shout_chat_rules b
WHERE a.chat_type = b.chat_type
  AND COALESCE(a.chat_id, '__null__') = COALESCE(b.chat_id, '__null__')
  AND a.id <> b.id
  AND (a.updated_at < b.updated_at OR (a.updated_at = b.updated_at AND a.id < b.id));

-- 2. Drop the old constraint that doesn't handle NULLs
ALTER TABLE shout_chat_rules
    DROP CONSTRAINT IF EXISTS shout_chat_rules_chat_type_chat_id_key;

-- 3. Create a proper unique index using COALESCE to handle NULL chat_id
CREATE UNIQUE INDEX IF NOT EXISTS shout_chat_rules_type_id_uniq
    ON shout_chat_rules (chat_type, COALESCE(chat_id, '__null__'));
