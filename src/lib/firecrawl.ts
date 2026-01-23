/**
 * Firecrawl API Integration
 * 
 * Provides high-quality web scraping for Official Agent knowledge bases.
 * Features:
 * - Single page scraping with JS rendering
 * - Multi-page crawling for documentation sites
 * - Clean markdown output optimized for RAG
 * - Anti-bot bypass
 * 
 * @see https://docs.firecrawl.dev/introduction
 */

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v1";

export interface FirecrawlMetadata {
    title?: string;
    description?: string;
    language?: string;
    sourceURL: string;
    statusCode?: number;
}

export interface ScrapeResult {
    markdown: string;
    html?: string;
    metadata: FirecrawlMetadata;
}

export interface CrawlPage {
    markdown: string;
    metadata: FirecrawlMetadata;
}

export interface CrawlResult {
    status: "scraping" | "completed" | "failed";
    total: number;
    completed: number;
    data: CrawlPage[];
    next?: string; // Pagination URL for large crawls
}

export interface ScrapeOptions {
    /** Include only main content (recommended for RAG) */
    onlyMainContent?: boolean;
    /** Wait for JS to render (milliseconds) */
    waitFor?: number;
    /** Remove specific tags */
    removeTags?: string[];
    /** Timeout in milliseconds */
    timeout?: number;
}

export interface CrawlOptions {
    /** Maximum pages to crawl */
    limit?: number;
    /** Maximum depth from start URL */
    maxDepth?: number;
    /** URL patterns to exclude (glob patterns) */
    excludePaths?: string[];
    /** URL patterns to include (glob patterns) */
    includePaths?: string[];
    /** Scrape options applied to each page */
    scrapeOptions?: ScrapeOptions;
}

/**
 * Check if Firecrawl is configured
 */
export function isFirecrawlConfigured(): boolean {
    return !!FIRECRAWL_API_KEY;
}

/**
 * Scrape a single URL and return clean markdown
 */
export async function scrapeUrl(
    url: string, 
    options: ScrapeOptions = {}
): Promise<ScrapeResult> {
    if (!FIRECRAWL_API_KEY) {
        throw new Error("Firecrawl API key not configured. Set FIRECRAWL_API_KEY environment variable.");
    }

    console.log("[Firecrawl] Scraping URL:", url);

    const response = await fetch(`${FIRECRAWL_BASE_URL}/scrape`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            url,
            formats: ["markdown"],
            onlyMainContent: options.onlyMainContent ?? true,
            waitFor: options.waitFor,
            removeTags: options.removeTags,
            timeout: options.timeout || 30000,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("[Firecrawl] Scrape error:", response.status, errorText);
        throw new Error(`Firecrawl scrape failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.success) {
        throw new Error(`Firecrawl scrape failed: ${data.error || "Unknown error"}`);
    }

    console.log("[Firecrawl] Scrape successful, markdown length:", data.data?.markdown?.length || 0);

    return {
        markdown: data.data?.markdown || "",
        html: data.data?.html,
        metadata: data.data?.metadata || { sourceURL: url },
    };
}

/**
 * Start a crawl job for a website (async operation)
 * Returns a job ID that can be polled for results
 */
export async function startCrawl(
    url: string,
    options: CrawlOptions = {}
): Promise<string> {
    if (!FIRECRAWL_API_KEY) {
        throw new Error("Firecrawl API key not configured. Set FIRECRAWL_API_KEY environment variable.");
    }

    console.log("[Firecrawl] Starting crawl for:", url, "with options:", options);

    const response = await fetch(`${FIRECRAWL_BASE_URL}/crawl`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            url,
            limit: options.limit || 50,
            maxDepth: options.maxDepth || 2,
            excludePaths: options.excludePaths,
            includePaths: options.includePaths,
            scrapeOptions: {
                formats: ["markdown"],
                onlyMainContent: options.scrapeOptions?.onlyMainContent ?? true,
                ...options.scrapeOptions,
            },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("[Firecrawl] Crawl start error:", response.status, errorText);
        throw new Error(`Firecrawl crawl failed to start: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.success || !data.id) {
        throw new Error(`Firecrawl crawl failed: ${data.error || "No job ID returned"}`);
    }

    console.log("[Firecrawl] Crawl started with job ID:", data.id);
    return data.id;
}

/**
 * Get the status and results of a crawl job
 */
export async function getCrawlStatus(jobId: string): Promise<CrawlResult> {
    if (!FIRECRAWL_API_KEY) {
        throw new Error("Firecrawl API key not configured.");
    }

    const response = await fetch(`${FIRECRAWL_BASE_URL}/crawl/${jobId}`, {
        headers: {
            "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Firecrawl status check failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    return {
        status: data.status,
        total: data.total || 0,
        completed: data.completed || 0,
        data: (data.data || []).map((page: { markdown?: string; metadata?: FirecrawlMetadata }) => ({
            markdown: page.markdown || "",
            metadata: page.metadata || { sourceURL: "" },
        })),
        next: data.next,
    };
}

/**
 * Wait for a crawl job to complete and return all results
 * Handles pagination automatically
 */
export async function waitForCrawl(
    jobId: string,
    options: { 
        pollIntervalMs?: number;
        maxWaitMs?: number;
        onProgress?: (completed: number, total: number) => void;
    } = {}
): Promise<CrawlPage[]> {
    const pollInterval = options.pollIntervalMs || 5000;
    const maxWait = options.maxWaitMs || 300000; // 5 minutes default
    const startTime = Date.now();
    
    let allPages: CrawlPage[] = [];
    let lastCompleted = 0;

    while (Date.now() - startTime < maxWait) {
        const result = await getCrawlStatus(jobId);

        // Report progress
        if (options.onProgress && result.completed !== lastCompleted) {
            options.onProgress(result.completed, result.total);
            lastCompleted = result.completed;
        }

        if (result.status === "completed") {
            allPages = [...allPages, ...result.data];

            // Handle pagination if there's more data
            if (result.next) {
                // Fetch additional pages (Firecrawl returns max 10MB per response)
                let nextUrl: string | undefined = result.next;
                while (nextUrl) {
                    const paginationResponse: Response = await fetch(nextUrl, {
                        headers: { "Authorization": `Bearer ${FIRECRAWL_API_KEY}` },
                    });
                    const paginationData = await paginationResponse.json();
                    allPages = [...allPages, ...(paginationData.data || [])];
                    nextUrl = paginationData.next;
                }
            }

            console.log("[Firecrawl] Crawl completed with", allPages.length, "pages");
            return allPages;
        }

        if (result.status === "failed") {
            throw new Error("Firecrawl crawl job failed");
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Firecrawl crawl timed out after ${maxWait}ms`);
}

/**
 * Scrape and crawl convenience function
 * - For single pages: scrapes immediately
 * - For multi-page (depth > 1): starts crawl and waits for completion
 */
export async function fetchContent(
    url: string,
    options: {
        crawlDepth?: number;
        excludePatterns?: string[];
        maxPages?: number;
        onProgress?: (completed: number, total: number) => void;
    } = {}
): Promise<{ content: string; pageCount: number; urls: string[] }> {
    const crawlDepth = options.crawlDepth || 1;

    if (crawlDepth <= 1) {
        // Single page scrape
        const result = await scrapeUrl(url);
        return {
            content: result.markdown,
            pageCount: 1,
            urls: [url],
        };
    }

    // Multi-page crawl
    const jobId = await startCrawl(url, {
        maxDepth: crawlDepth,
        limit: options.maxPages || 50,
        excludePaths: options.excludePatterns,
    });

    const pages = await waitForCrawl(jobId, {
        onProgress: options.onProgress,
    });

    // Combine all pages into single content with URL headers
    const combinedContent = pages
        .map(page => {
            const pageUrl = page.metadata?.sourceURL || "Unknown URL";
            const pageTitle = page.metadata?.title || "";
            return `# ${pageTitle}\n**Source:** ${pageUrl}\n\n${page.markdown}`;
        })
        .join("\n\n---\n\n");

    return {
        content: combinedContent,
        pageCount: pages.length,
        urls: pages.map(p => p.metadata?.sourceURL || "").filter(Boolean),
    };
}
