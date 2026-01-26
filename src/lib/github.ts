/**
 * GitHub API Integration for RAG Knowledge Base
 * 
 * Fetches repository content directly from GitHub API for better RAG indexing.
 * Supports:
 * - Repository README.md
 * - Specific files/directories
 * - File tree browsing
 * - Raw file content
 * 
 * Rate Limits:
 * - Authenticated: 5,000 requests/hour
 * - Unauthenticated: 60 requests/hour
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Optional: for higher rate limits and private repos

export interface GitHubRepoInfo {
    owner: string;
    repo: string;
    path?: string; // Optional path within repo (file or directory)
    branch?: string; // Optional branch (default: main/master)
}

export interface GitHubFile {
    name: string;
    path: string;
    type: "file" | "dir";
    size?: number;
    content?: string; // Base64 encoded for files
    sha?: string;
}

/**
 * Parse GitHub URL into repo info
 * Supports:
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo/blob/branch/path/to/file
 * - https://github.com/owner/repo/tree/branch/path/to/dir
 * - https://raw.githubusercontent.com/owner/repo/branch/path
 */
export function parseGitHubUrl(url: string): GitHubRepoInfo | null {
    try {
        const urlObj = new URL(url);
        
        // Handle raw.githubusercontent.com
        if (urlObj.hostname === "raw.githubusercontent.com") {
            const parts = urlObj.pathname.split("/").filter(Boolean);
            if (parts.length >= 3) {
                return {
                    owner: parts[0],
                    repo: parts[1],
                    branch: parts[2],
                    path: parts.slice(3).join("/"),
                };
            }
        }
        
        // Handle github.com
        if (urlObj.hostname === "github.com") {
            const parts = urlObj.pathname.split("/").filter(Boolean);
            if (parts.length >= 2) {
                const owner = parts[0];
                const repo = parts[1];
                
                // Check for blob or tree paths
                if (parts.length >= 4 && (parts[2] === "blob" || parts[2] === "tree")) {
                    return {
                        owner,
                        repo,
                        branch: parts[3],
                        path: parts.slice(4).join("/"),
                    };
                }
                
                // Just repo root
                return { owner, repo };
            }
        }
        
        return null;
    } catch {
        return null;
    }
}

/**
 * Check if URL is a GitHub repository URL
 */
export function isGitHubUrl(url: string): boolean {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname === "github.com" || urlObj.hostname === "raw.githubusercontent.com";
    } catch {
        return false;
    }
}

/**
 * Get GitHub API headers with optional authentication
 */
function getGitHubHeaders(): HeadersInit {
    const headers: HeadersInit = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Spritz-AI-Agent/1.0",
    };
    
    if (GITHUB_TOKEN) {
        headers["Authorization"] = `token ${GITHUB_TOKEN}`;
    }
    
    return headers;
}

/**
 * Fetch repository README.md
 */
export async function fetchGitHubReadme(owner: string, repo: string, branch?: string): Promise<string | null> {
    try {
        // Try common README filenames
        const readmeNames = ["README.md", "README", "readme.md", "Readme.md"];
        
        for (const readmeName of readmeNames) {
            try {
                const path = branch 
                    ? `https://api.github.com/repos/${owner}/${repo}/contents/${readmeName}?ref=${branch}`
                    : `https://api.github.com/repos/${owner}/${repo}/contents/${readmeName}`;
                
                const response = await fetch(path, {
                    headers: getGitHubHeaders(),
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.content && data.encoding === "base64") {
                        // Decode base64 content
                        if (typeof Buffer !== "undefined") {
                            return Buffer.from(data.content, "base64").toString("utf-8");
                        } else {
                            // Fallback for environments without Buffer
                            return atob(data.content);
                        }
                    }
                }
            } catch {
                // Try next README name
                continue;
            }
        }
        
        return null;
    } catch (error) {
        console.error("[GitHub] Error fetching README:", error);
        return null;
    }
}

/**
 * Fetch a specific file from GitHub
 */
export async function fetchGitHubFile(owner: string, repo: string, path: string, branch?: string): Promise<string | null> {
    try {
        const apiPath = branch
            ? `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
            : `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        
        const response = await fetch(apiPath, {
            headers: getGitHubHeaders(),
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }
            throw new Error(`GitHub API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Handle file content
        if (data.content && data.encoding === "base64") {
            // Decode base64 content
            if (typeof Buffer !== "undefined") {
                return Buffer.from(data.content, "base64").toString("utf-8");
            } else {
                // Fallback for environments without Buffer
                return atob(data.content);
            }
        }
        
        // Handle symlinks
        if (data.type === "symlink" && data.target) {
            return fetchGitHubFile(owner, repo, data.target, branch);
        }
        
        return null;
    } catch (error) {
        console.error("[GitHub] Error fetching file:", error);
        return null;
    }
}

/**
 * List directory contents
 */
export async function listGitHubDirectory(owner: string, repo: string, path: string, branch?: string): Promise<GitHubFile[]> {
    try {
        const apiPath = branch
            ? `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
            : `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        
        const response = await fetch(apiPath, {
            headers: getGitHubHeaders(),
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                return [];
            }
            throw new Error(`GitHub API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // API returns array for directories
        if (Array.isArray(data)) {
            return data.map((item: any) => ({
                name: item.name,
                path: item.path,
                type: item.type,
                size: item.size,
                sha: item.sha,
            }));
        }
        
        return [];
    } catch (error) {
        console.error("[GitHub] Error listing directory:", error);
        return [];
    }
}

/**
 * Get default branch for a repository
 */
export async function getDefaultBranch(owner: string, repo: string): Promise<string> {
    try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
            headers: getGitHubHeaders(),
        });
        
        if (!response.ok) {
            return "main"; // Default fallback
        }
        
        const data = await response.json();
        return data.default_branch || "main";
    } catch {
        return "main";
    }
}

/**
 * Fetch repository content for RAG indexing
 * Prioritizes README.md, but can fetch specific files or directories
 */
export async function fetchGitHubRepoContent(repoInfo: GitHubRepoInfo): Promise<{
    content: string;
    source: string;
    filesFetched: number;
}> {
    const { owner, repo, path, branch } = repoInfo;
    
    // If specific file path provided, fetch that
    if (path && !path.endsWith("/")) {
        const fileContent = await fetchGitHubFile(owner, repo, path, branch);
        if (fileContent) {
            return {
                content: fileContent,
                source: `https://github.com/${owner}/${repo}/blob/${branch || "main"}/${path}`,
                filesFetched: 1,
            };
        }
    }
    
    // If directory path provided, fetch all files in directory (limited)
    if (path && path.endsWith("/")) {
        const files = await listGitHubDirectory(owner, repo, path, branch);
        const textFiles = files.filter(f => 
            f.type === "file" && 
            (f.name.endsWith(".md") || f.name.endsWith(".txt") || f.name.endsWith(".js") || f.name.endsWith(".ts") || f.name.endsWith(".py"))
        ).slice(0, 10); // Limit to 10 files
        
        const contents: string[] = [];
        for (const file of textFiles) {
            const content = await fetchGitHubFile(owner, repo, file.path, branch);
            if (content) {
                contents.push(`# ${file.name}\n\n${content}`);
            }
        }
        
        if (contents.length > 0) {
            return {
                content: contents.join("\n\n---\n\n"),
                source: `https://github.com/${owner}/${repo}/tree/${branch || "main"}/${path}`,
                filesFetched: contents.length,
            };
        }
    }
    
    // Default: fetch README.md
    const defaultBranch = branch || await getDefaultBranch(owner, repo);
    const readme = await fetchGitHubReadme(owner, repo, defaultBranch);
    
    if (readme) {
        return {
            content: readme,
            source: `https://github.com/${owner}/${repo}/blob/${defaultBranch}/README.md`,
            filesFetched: 1,
        };
    }
    
    // Fallback: try to get repo description
    try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
            headers: getGitHubHeaders(),
        });
        
        if (response.ok) {
            const data = await response.json();
            const description = data.description || "";
            const topics = data.topics?.length ? `\n\nTopics: ${data.topics.join(", ")}` : "";
            
            return {
                content: `# ${repo}\n\n${description}${topics}`,
                source: `https://github.com/${owner}/${repo}`,
                filesFetched: 0,
            };
        }
    } catch {
        // Ignore errors
    }
    
    throw new Error("Could not fetch any content from GitHub repository");
}

/**
 * Check if GitHub API is configured (has token)
 */
export function isGitHubConfigured(): boolean {
    return !!GITHUB_TOKEN;
}
