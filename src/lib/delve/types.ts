export interface DelveAgentConfig {
  agentId: string;
  bonfireId: string;
}

export interface StackMessage {
  text: string;
  userId: string;
  username: string;
  chatId: string;
  agentId: string;
  timestamp: string;
  labelIds?: string[];
}

export interface RegisterAgentRequest {
  agent_id: string;
  bonfire_id: string;
}

export interface AddToStackRequest {
  message?: StackMessage;
  messages?: StackMessage[];
  is_paired?: boolean;
}

export type ProcessStackRequest = Record<string, never>;

export interface GetEpisodesRequest {
  limit?: number;
}

export interface SearchKnowledgeGraphRequest {
  query: string;
  bonfire_id: string;
  num_results?: number;
  center_node_uuid?: string;
  graph_id?: string;
  search_recipe?: string;
  min_fact_rating?: number;
  mmr_lambda?: number;
}

export interface SearchOptions {
  numResults?: number;
  centerNodeUuid?: string;
  graphId?: string;
  searchRecipe?: string;
  minFactRating?: number;
  mmrLambda?: number;
}

export interface GetEpisodeDetailsRequest {
  agent_id?: string;
  include_edges?: boolean;
}

export interface RegisterAgentResponse {
  success: boolean;
  agent_id: string;
  bonfire_id: string;
  message: string;
}

export interface AddToStackResponse {
  success: boolean;
  message_ids: string[];
  message_count: number;
  stack_count: number;
  is_paired?: boolean;
}

export interface ProcessStackResponse {
  success: boolean;
  message_count: number;
  initiated_at: string;
  warning?: boolean;
  warning_message?: string;
  time_remaining_seconds?: number;
}

export interface Episode {
  uuid: string;
  summary?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface KnowledgeGraphNode {
  uuid: string;
  type?: string;
  label?: string;
  [key: string]: unknown;
}

export interface KnowledgeGraphEdge {
  uuid: string;
  source_uuid?: string;
  target_uuid?: string;
  relationship?: string;
  [key: string]: unknown;
}

export interface EpisodesResponse {
  success: boolean;
  query: string;
  episodes: Episode[];
  nodes: KnowledgeGraphNode[];
  entities: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  num_results: number;
}

export interface KnowledgeGraphSearchResponse {
  success: boolean;
  query: string;
  num_results: number;
  episodes: Episode[];
  entities: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  nodes: KnowledgeGraphNode[];
  chunks?: Array<Record<string, unknown>>;
  metrics?: Record<string, unknown>;
  graph_id?: string;
}

export interface EpisodeDetailsResponse {
  success: boolean;
  episode: Episode;
  edges?: KnowledgeGraphEdge[];
}

export interface DelveErrorResponse {
  detail?: string;
  error?: string;
  message?: string;
  code?: string;
  status_code?: number;
}

export type DelveErrorCode =
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "CLIENT_ERROR"
  | "SERVER_ERROR"
  | "AUTH_ERROR"
  | "NOT_FOUND";

export class DelveClientError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: DelveErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      statusCode: number;
      errorCode: DelveErrorCode;
      details?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = "DelveClientError";
    this.statusCode = options.statusCode;
    this.errorCode = options.errorCode;
    this.details = options.details;
  }
}

/**
 * Registration status for Delve agent configuration
 * - 'pending': Registration initiated but not yet completed
 * - 'registered': Successfully registered with Delve
 * - 'failed': Registration attempt failed
 */
export type RegistrationStatus = "pending" | "registered" | "failed";

/**
 * Database record structure for delve_agent_config table
 * Stores Delve agent configuration and registration status
 */
export interface DelveAgentConfigRecord {
  /** Primary key (UUID) */
  id?: string;
  /** Reference to shout_agents.id */
  agent_id: string;
  /** Delve-assigned agent identifier */
  delve_agent_id: string | null;
  /** Bonfire ID for knowledge graph association */
  bonfire_id: string | null;
  /** Current registration status */
  registration_status: RegistrationStatus;
  /** Error message if registration failed */
  registration_error: string | null;
  /** Timestamp when successfully registered */
  registered_at: string | null;
  /** Whether knowledge collection is enabled */
  knowledge_collection_enabled?: boolean;
  /** Record creation timestamp */
  created_at: string;
  /** Record last update timestamp */
  updated_at: string;
  /** Number of registration attempts (optional column) */
  attempt_count?: number | null;
}

/**
 * Response shape for Delve settings endpoints.
 */
export interface DelveSettingsResponse {
  knowledge_collection_enabled: boolean;
  registration_status: RegistrationStatus | null;
  delve_agent_id: string | null;
  registration_error?: string | null;
}

/**
 * Result returned from agent registration attempt
 */
export interface RegistrationResult {
  /** Whether registration succeeded */
  success: boolean;
  /** Delve-assigned agent ID if successful */
  delveAgentId?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Result returned when querying registration status
 */
export interface RegistrationStatusResult {
  /** Current status or 'not_found' if no record exists */
  status: RegistrationStatus | "not_found";
  /** Delve-assigned agent ID if registered */
  delveAgentId?: string;
  /** Error message if failed */
  error?: string;
  /** Timestamp when registered */
  registeredAt?: string;
}

/**
 * Configuration for retry logic with exponential backoff
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 10) */
  maxAttempts?: number;
  /** Base delay in milliseconds for exponential backoff (default: 60000 = 1 minute) */
  baseDelayMs?: number;
  /** Maximum delay cap in milliseconds (optional) */
  maxDelayMs?: number;
}
