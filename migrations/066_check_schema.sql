-- Check if content_hash column exists in shout_event_sources
-- Run this in Supabase SQL Editor to verify the schema

-- Check for content_hash column
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'shout_event_sources'
AND column_name = 'content_hash';

-- If the above returns no rows, the column doesn't exist and you need to run:
-- migrations/066_event_sources_content_hash.sql

-- Also verify all columns in shout_events table match what the code expects
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'shout_events'
ORDER BY ordinal_position;

-- Verify shout_event_sources table structure
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'shout_event_sources'
ORDER BY ordinal_position;
