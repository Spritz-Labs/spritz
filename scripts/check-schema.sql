-- ============================================
-- Check Events Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Check if content_hash column exists in shout_event_sources
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'shout_event_sources' 
            AND column_name = 'content_hash'
        ) 
        THEN '✅ content_hash column EXISTS'
        ELSE '❌ content_hash column MISSING - Run migration 066_event_sources_content_hash.sql'
    END AS content_hash_status;

-- 2. List all columns in shout_event_sources
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'shout_event_sources'
ORDER BY ordinal_position;

-- 3. List all columns in shout_events (verify all required columns exist)
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'shout_events'
ORDER BY ordinal_position;

-- 4. Check for any missing indexes
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('shout_events', 'shout_event_sources')
ORDER BY tablename, indexname;

-- 5. Test insert to verify RLS policies (will be rolled back)
BEGIN;
    -- This should work if RLS is configured correctly
    INSERT INTO shout_events (
        name, event_type, event_date, source, created_by, status
    ) VALUES (
        'TEST_EVENT_DELETE_ME', 'other', CURRENT_DATE, 'manual', '0x0000000000000000000000000000000000000000', 'draft'
    );
ROLLBACK;

SELECT '✅ Schema check complete! If content_hash is missing, run the migration.' AS result;
