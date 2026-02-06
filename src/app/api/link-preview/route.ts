import { NextRequest, NextResponse } from "next/server";

// API route to fetch link preview metadata
// This runs server-side to avoid CORS issues when fetching external pages

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
        return NextResponse.json({ error: "URL parameter required" }, { status: 400 });
    }

    try {
        // Validate URL
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.replace("www.", "");

        // Fetch the page HTML with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; SpritzBot/1.0; +https://spritz.chat)",
                "Accept": "text/html,application/xhtml+xml",
            },
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();

        // Parse metadata from HTML
        const metadata = parseMetadata(html, hostname, url);

        // Cache for 1 hour
        return NextResponse.json(metadata, {
            headers: {
                "Cache-Control": "public, max-age=3600, s-maxage=3600",
            },
        });
    } catch (error) {
        console.error("[LinkPreview] Error fetching:", url, error);
        
        // Return basic fallback data
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.replace("www.", "");
            return NextResponse.json({
                title: null,
                description: null,
                image: null,
                siteName: hostname,
                favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`,
            });
        } catch {
            return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
        }
    }
}

function parseMetadata(html: string, hostname: string, url: string) {
    // Helper to extract content from meta tags
    const getMetaContent = (name: string, property?: string): string | null => {
        // Try property first (for Open Graph)
        if (property) {
            const propMatch = html.match(
                new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`, "i")
            ) || html.match(
                new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${property}["']`, "i")
            );
            if (propMatch) return decodeHtmlEntities(propMatch[1]);
        }
        
        // Try name attribute
        const nameMatch = html.match(
            new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["']`, "i")
        ) || html.match(
            new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${name}["']`, "i")
        );
        if (nameMatch) return decodeHtmlEntities(nameMatch[1]);
        
        return null;
    };

    // Get title
    let title = getMetaContent("title", "og:title") 
        || getMetaContent("twitter:title");
    
    if (!title) {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) title = decodeHtmlEntities(titleMatch[1].trim());
    }

    // Get description
    const description = getMetaContent("description", "og:description")
        || getMetaContent("twitter:description");

    // Get image
    let image = getMetaContent("image", "og:image")
        || getMetaContent("twitter:image")
        || getMetaContent("twitter:image:src");
    
    // Make relative URLs absolute
    if (image && !image.startsWith("http")) {
        const urlObj = new URL(url);
        image = image.startsWith("/") 
            ? `${urlObj.protocol}//${urlObj.host}${image}`
            : `${urlObj.protocol}//${urlObj.host}/${image}`;
    }

    // Get site name
    let siteName = getMetaContent("site_name", "og:site_name")
        || getMetaContent("application-name");
    
    if (!siteName) {
        // Format hostname nicely
        siteName = hostname
            .split(".")
            .slice(0, -1)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ") || hostname;
    }

    // Get favicon
    let favicon: string | null = null;
    const iconMatch = html.match(/<link[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*href=["']([^"']+)["']/i)
        || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["']/i);
    
    if (iconMatch) {
        favicon = iconMatch[1];
        if (!favicon.startsWith("http")) {
            const urlObj = new URL(url);
            favicon = favicon.startsWith("/")
                ? `${urlObj.protocol}//${urlObj.host}${favicon}`
                : `${urlObj.protocol}//${urlObj.host}/${favicon}`;
        }
    } else {
        favicon = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
    }

    // Special handling for known sites
    if (hostname.includes("twitter.com") || hostname.includes("x.com")) {
        siteName = "X (Twitter)";
    } else if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
        siteName = "YouTube";
        // Use higher quality thumbnail if we have a video ID
        const videoId = extractYouTubeId(url);
        if (videoId && !image) {
            image = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        }
    } else if (hostname.includes("github.com")) {
        siteName = "GitHub";
    } else if (hostname.includes("linkedin.com")) {
        siteName = "LinkedIn";
    } else if (hostname.includes("instagram.com")) {
        siteName = "Instagram";
    }

    return {
        title: title?.slice(0, 200) || null,
        description: description?.slice(0, 300) || null,
        image,
        siteName,
        favicon,
    };
}

function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, "/")
        .replace(/&nbsp;/g, " ");
}

function extractYouTubeId(url: string): string | null {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /youtube\.com\/shorts\/([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }

    return null;
}
