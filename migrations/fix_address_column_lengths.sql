-- Fix Address Column Lengths for World ID Support
-- World ID nullifier hashes are longer than 64 characters
-- This migration increases the column lengths to accommodate them

-- shout_friends table
ALTER TABLE shout_friends 
ALTER COLUMN user_address TYPE VARCHAR(255),
ALTER COLUMN friend_address TYPE VARCHAR(255);

-- shout_friend_requests table
ALTER TABLE shout_friend_requests 
ALTER COLUMN from_address TYPE VARCHAR(255),
ALTER COLUMN to_address TYPE VARCHAR(255);

-- shout_calls table
ALTER TABLE shout_calls 
ALTER COLUMN caller_address TYPE VARCHAR(255),
ALTER COLUMN callee_address TYPE VARCHAR(255);

-- Check for any other tables that might have short address columns
-- and fix them preemptively

-- shout_users (if exists with short column)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'shout_users' 
        AND column_name = 'wallet_address' 
        AND character_maximum_length < 255
    ) THEN
        ALTER TABLE shout_users ALTER COLUMN wallet_address TYPE VARCHAR(255);
    END IF;
END $$;

-- shout_usernames
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'shout_usernames' 
        AND column_name = 'wallet_address' 
        AND character_maximum_length IS NOT NULL
        AND character_maximum_length < 255
    ) THEN
        ALTER TABLE shout_usernames ALTER COLUMN wallet_address TYPE VARCHAR(255);
    END IF;
END $$;

-- shout_socials
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'shout_socials' 
        AND column_name = 'wallet_address' 
        AND character_maximum_length IS NOT NULL
        AND character_maximum_length < 255
    ) THEN
        ALTER TABLE shout_socials ALTER COLUMN wallet_address TYPE VARCHAR(255);
    END IF;
END $$;

-- shout_points
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'shout_points' 
        AND column_name = 'wallet_address' 
        AND character_maximum_length IS NOT NULL
        AND character_maximum_length < 255
    ) THEN
        ALTER TABLE shout_points ALTER COLUMN wallet_address TYPE VARCHAR(255);
    END IF;
END $$;

SELECT 'Address column lengths updated for World ID support!' as status;
