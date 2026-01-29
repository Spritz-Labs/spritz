#!/usr/bin/env node
/**
 * Directly call the scrape API to update cryptonomads.org events
 * This uses the existing optimized scrape endpoint
 */

const https = require('https');
const http = require('http');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vitcsvjssnxtncvtkmqq.supabase.co';
const ADMIN_ADDRESS = '0x3f22f740d41518f5017b76eed3a63eb14d2e1b07'; // Default admin

async function callScrapeAPI() {
    console.log('🚀 Calling scrape API for cryptonomads.org...\n');
    
    const url = 'https://cryptonomads.org/';
    const apiUrl = process.env.API_URL || 'http://localhost:3000';
    
    const payload = JSON.stringify({
        url: url,
        infinite_scroll: true,
        scroll_count: 50,
        crawl_depth: 1,
        max_pages: 1,
        preview_only: false,
        skip_past_events: false,
        save_source: true,
        scrape_interval_hours: 24,
        source_type: 'event_calendar',
    });

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'x-admin-address': ADMIN_ADDRESS,
            'x-admin-signature': 'direct-script', // Admin endpoint may need this
            'x-admin-message': 'direct-script',
        },
    };

    return new Promise((resolve, reject) => {
        const protocol = apiUrl.startsWith('https') ? https : http;
        const urlObj = new URL(`${apiUrl}/api/admin/events/scrape`);
        
        const req = protocol.request(urlObj, options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (res.statusCode === 200) {
                        resolve(result);
                    } else {
                        reject(new Error(`API returned ${res.statusCode}: ${result.error || data}`));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${data}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(payload);
        req.end();
    });
}

// Alternative: Use Supabase MCP or direct database access
async function directDatabaseUpdate() {
    console.log('📝 Note: To update the database directly, you can:');
    console.log('1. Use the admin UI at /admin/events and click "Scrape & Save"');
    console.log('2. Or use Supabase MCP tools to execute SQL');
    console.log('3. Or run the Next.js dev server and call the API endpoint\n');
    
    console.log('💡 Quick solution:');
    console.log('   - Start your dev server: npm run dev');
    console.log('   - Go to http://localhost:3000/admin/events');
    console.log('   - Enter: https://cryptonomads.org/');
    console.log('   - Enable "Infinite Scroll" (should auto-enable)');
    console.log('   - Set scroll count to 50');
    console.log('   - Click "Scrape & Save"\n');
}

if (require.main === module) {
    const useAPI = process.argv.includes('--api') && process.env.API_URL;
    
    if (useAPI) {
        callScrapeAPI()
            .then((result) => {
                console.log('✅ Success!');
                console.log('📊 Results:', JSON.stringify(result, null, 2));
            })
            .catch((error) => {
                console.error('❌ Error:', error.message);
                directDatabaseUpdate();
            });
    } else {
        directDatabaseUpdate();
    }
}

module.exports = { callScrapeAPI, directDatabaseUpdate };
