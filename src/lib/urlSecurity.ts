/**
 * URL Security Utilities
 * 
 * Prevents malicious URLs in user-generated content:
 * - Blocks javascript: and data: URLs (XSS prevention)
 * - Validates URLs against allowed domains for specific platforms
 * - Sanitizes image URLs to prevent tracking
 */

// Allowed protocols for links
const SAFE_PROTOCOLS = ['https:', 'http:'];

// Domain allowlists for specific platforms
const SOCIAL_DOMAINS: Record<string, string[]> = {
    twitter: ['twitter.com', 'x.com'],
    x: ['twitter.com', 'x.com'],
    github: ['github.com'],
    linkedin: ['linkedin.com', 'www.linkedin.com'],
    instagram: ['instagram.com', 'www.instagram.com'],
    youtube: ['youtube.com', 'www.youtube.com', 'youtu.be'],
    tiktok: ['tiktok.com', 'www.tiktok.com'],
    discord: ['discord.gg', 'discord.com'],
    telegram: ['t.me', 'telegram.me'],
    farcaster: ['warpcast.com'],
    website: [], // Allow any for generic website
};

const EMBED_DOMAINS: Record<string, string[]> = {
    spotify: ['open.spotify.com'],
    youtube: ['youtube.com', 'www.youtube.com', 'youtube-nocookie.com'],
    vimeo: ['player.vimeo.com', 'vimeo.com'],
    loom: ['loom.com', 'www.loom.com'],
    twitter: ['twitter.com', 'x.com', 'platform.twitter.com'],
    instagram: ['instagram.com', 'www.instagram.com'],
};

// Trusted image hosting domains (optional stricter mode)
const TRUSTED_IMAGE_DOMAINS = [
    // Major CDNs and image hosts
    'images.unsplash.com',
    'i.imgur.com',
    'imgur.com',
    'i.scdn.co', // Spotify
    'image.tmdb.org', // TMDB
    'images-na.ssl-images-amazon.com', // Amazon
    'm.media-amazon.com',
    // Social platforms
    'pbs.twimg.com',
    'abs.twimg.com',
    'avatars.githubusercontent.com',
    'raw.githubusercontent.com',
    // NFT/Web3
    'ipfs.io',
    'cloudflare-ipfs.com',
    'nft-cdn.alchemy.com',
    'openseauserdata.com',
    'i.seadn.io',
    // Generic CDNs
    'cdn.jsdelivr.net',
    'res.cloudinary.com',
    // Your own domain
    'app.spritz.chat',
    'spritz.chat',
];

/**
 * Check if a URL uses a safe protocol (http/https)
 */
export function isSafeProtocol(url: string): boolean {
    try {
        const parsed = new URL(url);
        return SAFE_PROTOCOLS.includes(parsed.protocol);
    } catch {
        return false;
    }
}

/**
 * Check if URL is a dangerous protocol (javascript:, data:, etc.)
 */
export function isDangerousUrl(url: string): boolean {
    if (!url) return true;
    
    const trimmed = url.trim().toLowerCase();
    
    // Block dangerous protocols
    if (trimmed.startsWith('javascript:')) return true;
    if (trimmed.startsWith('data:') && !trimmed.startsWith('data:image/')) return true;
    if (trimmed.startsWith('vbscript:')) return true;
    if (trimmed.startsWith('file:')) return true;
    
    // Block URLs with encoded dangerous characters
    const decoded = decodeURIComponent(trimmed);
    if (decoded.startsWith('javascript:')) return true;
    
    return false;
}

/**
 * Sanitize a URL - returns null if unsafe
 */
export function sanitizeUrl(url: string | undefined | null): string | null {
    if (!url) return null;
    
    const trimmed = url.trim();
    
    if (isDangerousUrl(trimmed)) {
        console.warn('[Security] Blocked dangerous URL:', trimmed.substring(0, 50));
        return null;
    }
    
    if (!isSafeProtocol(trimmed)) {
        console.warn('[Security] Blocked non-http(s) URL:', trimmed.substring(0, 50));
        return null;
    }
    
    return trimmed;
}

/**
 * Validate a social platform URL matches expected domain
 */
export function validateSocialUrl(platform: string, url: string): boolean {
    if (!url) return false;
    
    const allowedDomains = SOCIAL_DOMAINS[platform.toLowerCase()];
    
    // If no domain restriction (like generic 'website'), just check it's safe
    if (!allowedDomains || allowedDomains.length === 0) {
        return !isDangerousUrl(url) && isSafeProtocol(url);
    }
    
    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
        
        return allowedDomains.some(domain => 
            hostname === domain || hostname === `www.${domain}`
        );
    } catch {
        return false;
    }
}

/**
 * Validate an embed URL for a specific platform
 */
export function validateEmbedUrl(platform: string, url: string): boolean {
    if (!url) return false;
    if (isDangerousUrl(url)) return false;
    
    const allowedDomains = EMBED_DOMAINS[platform.toLowerCase()];
    if (!allowedDomains) return false;
    
    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();
        
        return allowedDomains.some(domain => 
            hostname === domain || hostname.endsWith(`.${domain}`)
        );
    } catch {
        return false;
    }
}

/**
 * Sanitize an image URL
 * In strict mode, only allows trusted domains
 * In permissive mode, allows any https URL
 */
export function sanitizeImageUrl(
    url: string | undefined | null, 
    strict: boolean = false
): string | null {
    if (!url) return null;
    
    const trimmed = url.trim();
    
    // Allow data:image URLs (for base64 encoded images)
    if (trimmed.startsWith('data:image/')) {
        // Limit size to prevent abuse
        if (trimmed.length > 100000) {
            console.warn('[Security] Blocked oversized data URL');
            return null;
        }
        return trimmed;
    }
    
    if (isDangerousUrl(trimmed)) return null;
    if (!isSafeProtocol(trimmed)) return null;
    
    // In strict mode, validate against trusted domains
    if (strict) {
        try {
            const parsed = new URL(trimmed);
            const hostname = parsed.hostname.toLowerCase();
            
            const isTrusted = TRUSTED_IMAGE_DOMAINS.some(domain =>
                hostname === domain || hostname.endsWith(`.${domain}`)
            );
            
            if (!isTrusted) {
                console.warn('[Security] Blocked untrusted image domain:', hostname);
                return null;
            }
        } catch {
            return null;
        }
    }
    
    return trimmed;
}

/**
 * Extract and validate Spotify URI/URL
 * Returns a safe embed URL or null
 */
export function sanitizeSpotifyUrl(input: string | undefined | null): string | null {
    if (!input) return null;
    
    const trimmed = input.trim();
    
    // Handle Spotify URI format: spotify:track:123abc
    if (trimmed.startsWith('spotify:')) {
        const parts = trimmed.split(':');
        if (parts.length === 3) {
            const [, type, id] = parts;
            // Validate type and ID format
            if (['track', 'album', 'playlist', 'artist', 'episode', 'show'].includes(type) && 
                /^[a-zA-Z0-9]+$/.test(id)) {
                return `https://open.spotify.com/embed/${type}/${id}`;
            }
        }
        return null;
    }
    
    // Handle Spotify URL
    if (!validateEmbedUrl('spotify', trimmed)) {
        return null;
    }
    
    // Convert to embed URL if needed
    if (trimmed.includes('/embed/')) {
        return trimmed;
    }
    
    return trimmed.replace('open.spotify.com/', 'open.spotify.com/embed/');
}

/**
 * Extract and validate video platform URL
 * Returns a safe embed URL or null
 */
export function sanitizeVideoUrl(
    platform: 'youtube' | 'vimeo' | 'loom', 
    input: string | undefined | null
): { embedUrl: string; videoId: string } | null {
    if (!input) return null;
    
    const trimmed = input.trim();
    
    if (isDangerousUrl(trimmed)) return null;
    
    try {
        const parsed = new URL(trimmed);
        
        switch (platform) {
            case 'youtube': {
                // Extract video ID from various YouTube URL formats
                let videoId: string | null = null;
                
                if (parsed.hostname.includes('youtube.com')) {
                    videoId = parsed.searchParams.get('v');
                } else if (parsed.hostname === 'youtu.be') {
                    videoId = parsed.pathname.slice(1);
                }
                
                if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
                    return {
                        embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
                        videoId,
                    };
                }
                return null;
            }
            
            case 'vimeo': {
                // Extract video ID from Vimeo URL
                const match = parsed.pathname.match(/\/(\d+)/);
                if (match) {
                    return {
                        embedUrl: `https://player.vimeo.com/video/${match[1]}`,
                        videoId: match[1],
                    };
                }
                return null;
            }
            
            case 'loom': {
                // Extract video ID from Loom URL
                const match = parsed.pathname.match(/\/share\/([a-f0-9]+)/);
                if (match) {
                    return {
                        embedUrl: `https://www.loom.com/embed/${match[1]}`,
                        videoId: match[1],
                    };
                }
                return null;
            }
        }
    } catch {
        return null;
    }
    
    return null;
}

/**
 * Create a safe external link props object
 */
export function getSafeExternalLinkProps(url: string | null): {
    href: string;
    target: '_blank';
    rel: 'noopener noreferrer nofollow';
} | { href: '#'; onClick: (e: React.MouseEvent) => void } {
    if (!url || isDangerousUrl(url)) {
        return {
            href: '#',
            onClick: (e: React.MouseEvent) => e.preventDefault(),
        };
    }
    
    return {
        href: url,
        target: '_blank',
        rel: 'noopener noreferrer nofollow',
    };
}

/**
 * Validate contract address format (for NFT widgets)
 */
export function isValidContractAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}
