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

export interface ScrapeAction {
    /** Action type */
    type: "wait" | "click" | "scroll" | "screenshot" | "write";
    /** Milliseconds to wait (for 'wait' type) */
    milliseconds?: number;
    /** CSS selector (for 'click', 'write' types) */
    selector?: string;
    /** Text to write (for 'write' type) */
    text?: string;
    /** Scroll direction: 'up' or 'down' (for 'scroll' type) */
    direction?: "up" | "down";
    /** Scroll amount in pixels (for 'scroll' type) */
    amount?: number;
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
    /** Actions to perform before scraping (scroll, click, wait, etc.) */
    actions?: ScrapeAction[];
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
    options: ScrapeOptions = {},
): Promise<ScrapeResult> {
    if (!FIRECRAWL_API_KEY) {
        throw new Error(
            "Firecrawl API key not configured. Set FIRECRAWL_API_KEY environment variable.",
        );
    }

    console.log("[Firecrawl] Scraping URL:", url);

    const requestBody: Record<string, unknown> = {
        url,
        formats: ["markdown"],
        onlyMainContent: options.onlyMainContent ?? true,
        timeout: options.timeout || 30000,
    };

    // Add optional parameters only if provided
    if (options.waitFor) requestBody.waitFor = options.waitFor;
    if (options.removeTags) requestBody.removeTags = options.removeTags;
    if (options.actions && options.actions.length > 0) {
        requestBody.actions = options.actions;
    }

    const response = await fetch(`${FIRECRAWL_BASE_URL}/scrape`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("[Firecrawl] Scrape error:", response.status, errorText);
        throw new Error(
            `Firecrawl scrape failed: ${response.status} - ${errorText}`,
        );
    }

    const data = await response.json();

    if (!data.success) {
        throw new Error(
            `Firecrawl scrape failed: ${data.error || "Unknown error"}`,
        );
    }

    console.log(
        "[Firecrawl] Scrape successful, markdown length:",
        data.data?.markdown?.length || 0,
    );

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
    options: CrawlOptions = {},
): Promise<string> {
    if (!FIRECRAWL_API_KEY) {
        throw new Error(
            "Firecrawl API key not configured. Set FIRECRAWL_API_KEY environment variable.",
        );
    }

    console.log(
        "[Firecrawl] Starting crawl for:",
        url,
        "with options:",
        options,
    );

    const response = await fetch(`${FIRECRAWL_BASE_URL}/crawl`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
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
        console.error(
            "[Firecrawl] Crawl start error:",
            response.status,
            errorText,
        );
        throw new Error(
            `Firecrawl crawl failed to start: ${response.status} - ${errorText}`,
        );
    }

    const data = await response.json();

    if (!data.success || !data.id) {
        throw new Error(
            `Firecrawl crawl failed: ${data.error || "No job ID returned"}`,
        );
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
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `Firecrawl status check failed: ${response.status} - ${errorText}`,
        );
    }

    const data = await response.json();

    return {
        status: data.status,
        total: data.total || 0,
        completed: data.completed || 0,
        data: (data.data || []).map(
            (page: { markdown?: string; metadata?: FirecrawlMetadata }) => ({
                markdown: page.markdown || "",
                metadata: page.metadata || { sourceURL: "" },
            }),
        ),
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
    } = {},
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
                        headers: {
                            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
                        },
                    });
                    const paginationData = await paginationResponse.json();
                    allPages = [...allPages, ...(paginationData.data || [])];
                    nextUrl = paginationData.next;
                }
            }

            console.log(
                "[Firecrawl] Crawl completed with",
                allPages.length,
                "pages",
            );
            return allPages;
        }

        if (result.status === "failed") {
            throw new Error("Firecrawl crawl job failed");
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Firecrawl crawl timed out after ${maxWait}ms`);
}

/**
 * Generate scroll actions for infinite scroll pages
 * Scrolls down multiple times with waits to trigger lazy loading
 */
export function generateScrollActions(
    scrollCount: number = 20,
    waitMs: number = 2500,
): ScrapeAction[] {
    const actions: ScrapeAction[] = [];

    // Firecrawl limits: max 50 actions, max 60s total wait time
    // Each scroll = 1 action, each wait = 1 action, plus 2 for scroll up = 2*scrollCount + 2
    // So max scrollCount = (50 - 2) / 2 = 24
    // Also need to respect wait time: max 60s = 60000ms
    // If waitMs = 2500, max scrolls = 60000 / 2500 = 24
    const MAX_SCROLLS = 24;
    const MAX_WAIT_MS = 60000;

    // Cap scrollCount to respect limits
    const actualScrollCount = Math.min(scrollCount, MAX_SCROLLS);
    const actualWaitMs = Math.min(
        waitMs,
        Math.floor(MAX_WAIT_MS / actualScrollCount),
    );

    if (scrollCount > MAX_SCROLLS) {
        console.warn(
            `[Firecrawl] Scroll count ${scrollCount} exceeds limit, capping at ${MAX_SCROLLS}`,
        );
    }

    for (let i = 0; i < actualScrollCount; i++) {
        // Scroll down - use larger scroll for efficiency
        actions.push({
            type: "scroll",
            direction: "down",
            amount: 3000, // Increased to 3000px to load more content per scroll
        });
        // Wait for content to load
        actions.push({
            type: "wait",
            milliseconds: actualWaitMs,
        });
    }

    // Scroll back to top to ensure DOM contains all loaded content
    actions.push({
        type: "scroll",
        direction: "up",
        amount: 99999,
    });
    actions.push({
        type: "wait",
        milliseconds: 500,
    });

    return actions;
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
        /** Enable infinite scroll handling - scrolls page multiple times before scraping */
        infiniteScroll?: boolean;
        /** Number of times to scroll (default 18, aligned with update-cryptonomads; avoids SCRAPE_TIMEOUT) */
        scrollCount?: number;
    } = {},
): Promise<{ content: string; pageCount: number; urls: string[] }> {
    const crawlDepth = options.crawlDepth || 1;

    if (crawlDepth <= 1) {
        // Single page scrape
        const scrapeOptions: ScrapeOptions = {};

        // Add scroll actions for infinite scroll pages (aligned with update-cryptonomads script)
        if (options.infiniteScroll) {
            const scrollCount = options.scrollCount ?? 18; // 18 scrolls @ 2s = ~36s actions; avoids SCRAPE_TIMEOUT
            const waitMs = 2000;
            scrapeOptions.actions = generateScrollActions(scrollCount, waitMs);
            // 4 min timeout for heavy infinite-scroll pages (e.g. cryptonomads main); script uses 240000–300000
            const timeoutMs = 240000;
            scrapeOptions.timeout = timeoutMs;
            console.log(
                "[Firecrawl] Infinite scroll enabled:",
                Math.min(scrollCount, 24),
                "scrolls (requested:",
                scrollCount,
                "), timeout:",
                Math.round(timeoutMs / 1000),
                "s",
            );
        }

        const result = await scrapeUrl(url, scrapeOptions);
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
        .map((page) => {
            const pageUrl = page.metadata?.sourceURL || "Unknown URL";
            const pageTitle = page.metadata?.title || "";
            return `# ${pageTitle}\n**Source:** ${pageUrl}\n\n${page.markdown}`;
        })
        .join("\n\n---\n\n");

    return {
        content: combinedContent,
        pageCount: pages.length,
        urls: pages.map((p) => p.metadata?.sourceURL || "").filter(Boolean),
    };
}
