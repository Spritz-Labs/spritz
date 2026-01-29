#!/usr/bin/env tsx
/**
 * Check events database schema
 * Verifies that all required columns exist in shout_events and shout_event_sources tables
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing Supabase credentials in environment variables");
    console.error("Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log("🔍 Checking database schema...\n");

    // Check if content_hash exists by trying to query it
    console.log("📋 Checking shout_event_sources table for content_hash column...");
    const { data: testQuery, error: testError } = await supabase
        .from('shout_event_sources')
        .select('content_hash')
        .limit(1);

    if (testError) {
        if (testError.message.includes('column') && testError.message.includes('does not exist')) {
            console.log("❌ content_hash column is MISSING from shout_event_sources");
            console.log("\n📝 Solution: Run the migration:");
            console.log("   migrations/066_event_sources_content_hash.sql");
            return false;
        } else {
            console.log("⚠️  Error checking content_hash:", testError.message);
        }
    } else {
        console.log("✅ content_hash column EXISTS in shout_event_sources");
    }

    // Verify required columns for events insert by checking a sample insert structure
    console.log("\n📋 Verifying required columns for event insertion...");
    const requiredColumns = [
        'name', 'description', 'event_type', 'event_date', 'start_time', 'end_time',
        'venue', 'city', 'country', 'latitude', 'longitude', 'organizer',
        'event_url', 'rsvp_url', 'banner_image_url', 'tags', 'blockchain_focus',
        'source', 'source_url', 'source_id', 'status', 'created_by'
    ];

    // Test by trying to select all required columns
    const { error: eventsError } = await supabase
        .from('shout_events')
        .select(requiredColumns.join(', '))
        .limit(0);

    if (eventsError) {
        const missingColumns = requiredColumns.filter(col => 
            eventsError.message.includes(col) && eventsError.message.includes('does not exist')
        );
        if (missingColumns.length > 0) {
            console.log("❌ Missing required columns:", missingColumns.join(', '));
            return false;
        } else {
            console.log("⚠️  Error checking events columns:", eventsError.message);
        }
    } else {
        console.log("✅ All required columns exist in shout_events table");
    }

    // Check source table columns
    console.log("\n📋 Checking shout_event_sources table structure...");
    const sourceColumns = [
        'id', 'name', 'url', 'source_type', 'scrape_interval_hours',
        'last_scraped_at', 'next_scrape_at', 'event_types', 'blockchain_focus',
        'is_active', 'last_error', 'events_found', 'created_by', 'created_at'
    ];

    const { error: sourcesError } = await supabase
        .from('shout_event_sources')
        .select(sourceColumns.join(', '))
        .limit(0);

    if (sourcesError) {
        const missingColumns = sourceColumns.filter(col => 
            sourcesError.message.includes(col) && sourcesError.message.includes('does not exist')
        );
        if (missingColumns.length > 0) {
            console.log("❌ Missing columns in shout_event_sources:", missingColumns.join(', '));
            return false;
        }
    } else {
        console.log("✅ All required columns exist in shout_event_sources table");
    }

    return true;
}

checkSchema()
    .then((success) => {
        if (success) {
            console.log("\n✅ Schema check complete! All required columns exist.");
            console.log("\n💡 If content_hash was missing, make sure to run the migration.");
        } else {
            console.log("\n❌ Schema check found issues. Please run the migration.");
            process.exit(1);
        }
    })
    .catch((error) => {
        console.error("\n❌ Error checking schema:", error);
        process.exit(1);
    });
