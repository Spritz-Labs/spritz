/**
 * Agent capabilities architecture: platform-wide vs per-agent tools.
 *
 * - Platform tools: available to ALL agents (e.g. The Grid API).
 * - Per-agent tools: MCP servers, API tools, knowledge base, scheduling, events (configured per agent).
 *
 * We use The Grid GraphQL API (https://docs.thegrid.id/p/Q6EWCrHLq98qF5/Using-the-API) so agents
 * get Web3 data without running an MCP server. MCP is still supported for optional custom tools.
 */

import type { APITool, MCPServer } from "@/hooks/useAgents";

/** The Grid GraphQL API – base URL from docs. Override with GRID_GRAPHQL_URL if needed. */
const GRID_GRAPHQL_BASE = "https://beta.node.thegrid.id/graphql";

/** Schema hint for the AI: data coverage from The Grid API docs. */
const GRID_SCHEMA_HINT = `
The Grid GraphQL API provides Web3 data. Data coverage:
- Profiles: companies, DAOs, governments, investors, NFT collections, projects
- Products: DEXs, wallets, bridges, oracles, L1/L2 blockchains, DeFi protocols
- Assets: tokens, NFTs, stablecoins, governance tokens
- Socials: Twitter/X, Github, Discord, Telegram, Instagram, LinkedIn, Youtube
- Entities: corporations, foundations, startups

Use introspection or plural query names (e.g. profiles, products, assets) to list collections.
For "what's available", "list", "show me", "find" use appropriate queries with pagination (first: 50).

When presenting results to the user, use markdown: lists for multiple items, tables for structured data (| col | col |), and **bold** for key names.
`;

/**
 * Returns API tools that are available to every agent (platform-wide).
 * The Grid GraphQL API is always included so all agents can query Web3 data.
 * Set GRID_API_KEY in env if the endpoint requires auth.
 */
export function getPlatformApiTools(): APITool[] {
    const url = process.env.GRID_GRAPHQL_URL?.trim() || GRID_GRAPHQL_BASE;
    const apiKey = process.env.GRID_API_KEY?.trim();
    const tool: APITool = {
        id: "the-grid-platform",
        name: "The Grid",
        method: "POST",
        url,
        apiType: "graphql",
        description:
            "Structured Web3 data: profiles, products, assets, socials, entities. Use for data queries, lists, and lookups.",
        instructions:
            "Use The Grid when the user asks about Web3 data, profiles, products, assets, companies, DAOs, protocols, or structured data. Prefer for 'what data is available', 'list', 'find', 'show me'.",
        schema: GRID_SCHEMA_HINT.trim(),
    };
    if (apiKey) {
        tool.apiKey = apiKey;
    }
    return [tool];
}

/** The Grid MCP – optional; use when you want MCP-based tool discovery. */
const GRID_MCP_ID = "the-grid-platform-mcp";
const GRID_MCP_NAME = "The Grid (MCP)";
const GRID_MCP_DESCRIPTION =
    "The Grid MCP provides access to data and query tools. Use when users ask about datasets, APIs, subgraphs.";
const GRID_MCP_INSTRUCTIONS =
    "Use The Grid when the user asks about data, datasets, APIs, subgraphs, or querying structured information.";

/**
 * Returns MCP servers that are available to every agent (platform-wide).
 * Only when GRID_MCP_SERVER_URL is set (optional; prefer The Grid API via getPlatformApiTools).
 */
export function getPlatformMcpServers(): MCPServer[] {
    const servers: MCPServer[] = [];
    const gridUrl = process.env.GRID_MCP_SERVER_URL?.trim();
    if (gridUrl) {
        servers.push({
            id: GRID_MCP_ID,
            name: GRID_MCP_NAME,
            url: gridUrl,
            description: GRID_MCP_DESCRIPTION,
            instructions: GRID_MCP_INSTRUCTIONS,
        });
    }
    return servers;
}

/** Display name for use in UI (e.g. "Platform tools") */
export const PLATFORM_TOOLS_LABEL = "Platform tools";

/** Capability section order and labels for consistent UX */
export const CAPABILITY_SECTIONS = {
    searchAndKnowledge: {
        label: "Search & knowledge",
        description: "Web search and your custom knowledge base",
    },
    calendarAndEvents: {
        label: "Calendar & events",
        description: "Scheduling and events database",
    },
    externalTools: {
        label: "External tools",
        description: "MCP servers and API tools",
    },
    platformTools: {
        label: "Platform tools",
        description: "The Grid and other platform-wide tools",
    },
    accessAndMonetization: {
        label: "Access & monetization",
        description: "Public access, channels, x402",
    },
} as const;
