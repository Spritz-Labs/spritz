# POAP Collections migration (Supabase MCP)

Apply the POAP collections schema using the **Supabase MCP**:

1. **Get project ID**  
   Use the Supabase MCP tool `list_projects` (no args). Pick the project ID for this app, or use the ref from `NEXT_PUBLIC_SUPABASE_URL` (e.g. `https://vitcsvjssnxtncvtkmqq.supabase.co` → project ref `vitcsvjssnxtncvtkmqq`; the MCP project ID may be the same or listed in `list_projects`).

2. **Apply the migration**  
   Use the Supabase MCP tool **`apply_migration`** with:
   - **project_id**: (from step 1)
   - **name**: `poap_collections`
   - **query**: (contents of `migrations/083_poap_collections.sql` below)

## SQL (migrations/083_poap_collections.sql)

```sql
-- POAP Collections: link channel to a POAP collection (user can join if they hold any POAP in the collection)
ALTER TABLE shout_public_channels
ADD COLUMN IF NOT EXISTS poap_collection_id INTEGER UNIQUE;

ALTER TABLE shout_public_channels
ADD COLUMN IF NOT EXISTS poap_collection_name TEXT;

ALTER TABLE shout_public_channels
ADD COLUMN IF NOT EXISTS poap_collection_image_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_poap_collection_id
ON shout_public_channels(poap_collection_id) WHERE poap_collection_id IS NOT NULL;

COMMENT ON COLUMN shout_public_channels.poap_collection_id IS 'POAP collection id from POAP SDK; at most one channel per collection';
COMMENT ON COLUMN shout_public_channels.poap_collection_name IS 'Display name of the POAP collection';
COMMENT ON COLUMN shout_public_channels.poap_collection_image_url IS 'Collection logo/banner URL for the channel icon';
```

## Alternative: Supabase Dashboard

In **Supabase Dashboard** → **SQL Editor**, run the SQL above against your project.
