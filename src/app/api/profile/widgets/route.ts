import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

// URL validation patterns
const SAFE_PROTOCOLS = ['https:', 'http:'];
const DANGEROUS_PATTERNS = [/^javascript:/i, /^vbscript:/i, /^data:(?!image\/)/i, /^file:/i];

// Social platform domain validation
const SOCIAL_DOMAINS: Record<string, string[]> = {
    twitter: ['twitter.com', 'x.com'],
    x: ['twitter.com', 'x.com'],
    github: ['github.com'],
    linkedin: ['linkedin.com'],
    instagram: ['instagram.com'],
    youtube: ['youtube.com', 'youtu.be'],
    tiktok: ['tiktok.com'],
    discord: ['discord.gg', 'discord.com'],
    telegram: ['t.me', 'telegram.me'],
    farcaster: ['warpcast.com'],
};

/**
 * Check if URL uses dangerous protocol
 */
function isDangerousUrl(url: string): boolean {
    if (!url || typeof url !== 'string') return true;
    const trimmed = url.trim().toLowerCase();
    return DANGEROUS_PATTERNS.some(pattern => pattern.test(trimmed));
}

/**
 * Check if URL uses safe protocol
 */
function isSafeUrl(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    if (isDangerousUrl(url)) return false;
    try {
        const parsed = new URL(url.trim());
        return SAFE_PROTOCOLS.includes(parsed.protocol);
    } catch {
        return false;
    }
}

/**
 * Validate social platform URL matches expected domain
 */
function validateSocialUrl(platform: string, url: string): boolean {
    if (!isSafeUrl(url)) return false;
    const allowedDomains = SOCIAL_DOMAINS[platform?.toLowerCase()];
    if (!allowedDomains || allowedDomains.length === 0) return true; // No restriction
    try {
        const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
        return allowedDomains.some(d => hostname === d || hostname === `www.${d}`);
    } catch {
        return false;
    }
}

/**
 * Validate contract address format
 */
function isValidContractAddress(address: string): boolean {
    return typeof address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Sanitize widget config by validating/removing unsafe URLs
 */
function sanitizeWidgetConfig(widgetType: string, config: Record<string, unknown>): Record<string, unknown> {
    if (!config || typeof config !== 'object') return {};
    
    const sanitized = { ...config };
    
    // URL fields that need validation
    const urlFields = ['url', 'link', 'imageUrl', 'coverUrl', 'posterUrl', 'avatarUrl', 'spotifyUrl', 'albumArt'];
    
    for (const field of urlFields) {
        if (sanitized[field] && typeof sanitized[field] === 'string') {
            if (!isSafeUrl(sanitized[field] as string)) {
                console.warn(`[Widget Security] Blocked unsafe URL in ${widgetType}.${field}`);
                delete sanitized[field];
            }
        }
    }
    
    // Special validation for social_link widget
    if (widgetType === 'social_link' && sanitized.platform && sanitized.url) {
        if (!validateSocialUrl(sanitized.platform as string, sanitized.url as string)) {
            console.warn(`[Widget Security] Social URL doesn't match platform: ${sanitized.platform}`);
            delete sanitized.url;
        }
    }
    
    // Validate NFT contract address
    if (widgetType === 'nft' && sanitized.contractAddress) {
        if (!isValidContractAddress(sanitized.contractAddress as string)) {
            console.warn(`[Widget Security] Invalid contract address`);
            delete sanitized.contractAddress;
        }
    }
    
    // Validate Spotify URI
    if (widgetType === 'spotify' && sanitized.spotifyUri) {
        const uri = sanitized.spotifyUri as string;
        const validSpotify = uri.startsWith('spotify:') || 
            (isSafeUrl(uri) && new URL(uri).hostname.includes('spotify.com'));
        if (!validSpotify) {
            console.warn(`[Widget Security] Invalid Spotify URI`);
            delete sanitized.spotifyUri;
        }
    }
    
    // Validate video IDs (no special chars that could break embed)
    if (widgetType === 'video' && sanitized.videoId) {
        const videoId = sanitized.videoId as string;
        // Video IDs should be alphanumeric with limited special chars
        if (!/^[a-zA-Z0-9_-]+$/.test(videoId)) {
            console.warn(`[Widget Security] Invalid video ID format`);
            delete sanitized.videoId;
        }
    }
    
    // Sanitize arrays with URLs (images, photos, etc.)
    const arrayFields = ['images', 'photos', 'books', 'items', 'podcasts'];
    for (const field of arrayFields) {
        if (Array.isArray(sanitized[field])) {
            sanitized[field] = (sanitized[field] as Record<string, unknown>[]).map(item => {
                if (typeof item !== 'object' || !item) return item;
                const sanitizedItem = { ...item };
                for (const urlField of ['url', 'coverUrl', 'posterUrl', 'imageUrl']) {
                    if (sanitizedItem[urlField] && typeof sanitizedItem[urlField] === 'string') {
                        if (!isSafeUrl(sanitizedItem[urlField] as string)) {
                            delete sanitizedItem[urlField];
                        }
                    }
                }
                return sanitizedItem;
            });
        }
    }
    
    return sanitized;
}

function getSupabaseClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!url || !key) {
        throw new Error("Supabase not configured");
    }
    
    return createClient(url, key);
}

// GET - Fetch user's widgets
export async function GET(request: NextRequest) {
    try {
        const supabase = getSupabaseClient();
        
        // Check if fetching for a specific user (public view)
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("address");
        
        if (userAddress) {
            // Public view - fetch visible widgets for a user
            const { data: widgets, error } = await supabase
                .from("profile_widgets")
                .select("*")
                .eq("user_address", userAddress.toLowerCase())
                .eq("is_visible", true)
                .order("position", { ascending: true });
            
            if (error) throw error;
            
            // Also fetch theme (use maybeSingle to avoid error when no theme exists)
            const { data: theme } = await supabase
                .from("profile_themes")
                .select("*")
                .eq("user_address", userAddress.toLowerCase())
                .maybeSingle();
            
            return NextResponse.json({ widgets: widgets || [], theme: theme || null });
        }
        
        // Private view - fetch current user's widgets
        const session = await getAuthenticatedUser(request);
        
        if (!session?.userAddress) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        
        const { data: widgets, error } = await supabase
            .from("profile_widgets")
            .select("*")
            .eq("user_address", session.userAddress.toLowerCase())
            .order("position", { ascending: true });
        
        if (error) throw error;
        
        // Also fetch theme (use maybeSingle to avoid error when no theme exists)
        const { data: theme } = await supabase
            .from("profile_themes")
            .select("*")
            .eq("user_address", session.userAddress.toLowerCase())
            .maybeSingle();
        
        return NextResponse.json({ widgets: widgets || [], theme: theme || null });
    } catch (error) {
        console.error("[Profile Widgets GET] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch widgets" },
            { status: 500 }
        );
    }
}

// POST - Create a new widget
export async function POST(request: NextRequest) {
    try {
        const session = await getAuthenticatedUser(request);
        
        if (!session?.userAddress) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        
        const supabase = getSupabaseClient();
        const body = await request.json();
        const { widget_type, size, position, config } = body;
        
        if (!widget_type) {
            return NextResponse.json(
                { error: "widget_type is required" },
                { status: 400 }
            );
        }
        
        // Sanitize config to prevent malicious URLs
        const sanitizedConfig = sanitizeWidgetConfig(widget_type, config || {});
        
        // Get current max position
        const { data: existing } = await supabase
            .from("profile_widgets")
            .select("position")
            .eq("user_address", session.userAddress.toLowerCase())
            .order("position", { ascending: false })
            .limit(1);
        
        const newPosition = position ?? ((existing?.[0]?.position ?? -1) + 1);
        
        const { data: widget, error } = await supabase
            .from("profile_widgets")
            .insert({
                user_address: session.userAddress.toLowerCase(),
                widget_type,
                size: size || '1x1',
                position: newPosition,
                config: sanitizedConfig,
            })
            .select()
            .single();
        
        if (error) throw error;
        
        return NextResponse.json({ widget });
    } catch (error) {
        console.error("[Profile Widgets POST] Error:", error);
        return NextResponse.json(
            { error: "Failed to create widget" },
            { status: 500 }
        );
    }
}

// PUT - Update widgets (bulk update for reordering)
export async function PUT(request: NextRequest) {
    try {
        const session = await getAuthenticatedUser(request);
        
        if (!session?.userAddress) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        
        const supabase = getSupabaseClient();
        const body = await request.json();
        const { widgets } = body;
        
        if (!Array.isArray(widgets)) {
            return NextResponse.json(
                { error: "widgets array is required" },
                { status: 400 }
            );
        }
        
        // Update each widget with sanitized config
        const updates = widgets.map((w: { id: string; widget_type?: string; position?: number; size?: string; config?: Record<string, unknown>; is_visible?: boolean }) => {
            // Sanitize config if provided
            const sanitizedConfig = w.config && w.widget_type 
                ? sanitizeWidgetConfig(w.widget_type, w.config)
                : w.config;
            
            return supabase
                .from("profile_widgets")
                .update({
                    ...(w.position !== undefined && { position: w.position }),
                    ...(w.size && { size: w.size }),
                    ...(sanitizedConfig && { config: sanitizedConfig }),
                    ...(w.is_visible !== undefined && { is_visible: w.is_visible }),
                })
                .eq("id", w.id)
                .eq("user_address", session.userAddress.toLowerCase());
        });
        
        await Promise.all(updates);
        
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Profile Widgets PUT] Error:", error);
        return NextResponse.json(
            { error: "Failed to update widgets" },
            { status: 500 }
        );
    }
}

// DELETE - Delete a widget
export async function DELETE(request: NextRequest) {
    try {
        const session = await getAuthenticatedUser(request);
        
        if (!session?.userAddress) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        
        const supabase = getSupabaseClient();
        const { searchParams } = new URL(request.url);
        const widgetId = searchParams.get("id");
        
        if (!widgetId) {
            return NextResponse.json(
                { error: "Widget ID is required" },
                { status: 400 }
            );
        }
        
        const { error } = await supabase
            .from("profile_widgets")
            .delete()
            .eq("id", widgetId)
            .eq("user_address", session.userAddress.toLowerCase());
        
        if (error) throw error;
        
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Profile Widgets DELETE] Error:", error);
        return NextResponse.json(
            { error: "Failed to delete widget" },
            { status: 500 }
        );
    }
}
