-- SQL Query to check events schema via Supabase MCP execute_sql tool
-- Project ID: vitcsvjssnxtncvtkmqq (from NEXT_PUBLIC_SUPABASE_URL)

-- 1. Check if content_hash column exists in shout_event_sources
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_schema = 'public'
            AND table_name = 'shout_event_sources' 
            AND column_name = 'content_hash'
        ) 
        THEN '✅ content_hash column EXISTS'
        ELSE '❌ content_hash column MISSING - Run migration 066_event_sources_content_hash.sql'
    END AS content_hash_status;

-- 2. Get all columns in shout_event_sources table
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'shout_event_sources'
ORDER BY ordinal_position;

-- 3. Get all columns in shout_events table (verify all required columns exist)
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'shout_events'
ORDER BY ordinal_position;

-- 4. Check for indexes on both tables
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('shout_events', 'shout_event_sources')
ORDER BY tablename, indexname;
