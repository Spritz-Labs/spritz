import type {
  AddToStackRequest,
  AddToStackResponse,
  DelveErrorCode,
  EpisodeDetailsResponse,
  EpisodesResponse,
  KnowledgeGraphSearchResponse,
  RegisterAgentResponse,
  ProcessStackResponse,
  SearchOptions,
  StackMessage,
  DelveErrorResponse,
} from "./types.ts";
import { DelveClientError } from "./types.ts";

interface DelveEnv {
  DELVE_API_URL?: string;
  DELVE_API_KEY?: string;
}

interface DelveClientOptions {
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
}

function getDelveEnv(): DelveEnv {
  if (typeof globalThis === "undefined") {
    return {};
  }

  const globalWithProcess = globalThis as {
    process?: { env?: Partial<DelveEnv> | undefined };
  };

  const env = globalWithProcess.process?.env;
  if (!env) {
    return {};
  }

  return {
    DELVE_API_URL: env.DELVE_API_URL,
    DELVE_API_KEY: env.DELVE_API_KEY,
  };
}

export class DelveClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(options: DelveClientOptions = {}) {
    const env = getDelveEnv();
    const baseUrl = options.baseUrl ?? env.DELVE_API_URL;
    const apiKey = options.apiKey ?? env.DELVE_API_KEY;
    const timeout = options.timeout ?? 30000;

    if (!baseUrl) {
      throw new Error("DelveClient requires DELVE_API_URL to be set.");
    }

    if (!apiKey) {
      throw new Error("DelveClient requires DELVE_API_KEY to be set.");
    }

    if (!Number.isFinite(timeout) || timeout <= 0) {
      throw new Error("DelveClient timeout must be a positive number.");
    }

    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.timeout = timeout;
  }

  private buildUrl(endpoint: string): string {
    return new URL(endpoint, this.baseUrl).toString();
  }

  private async parseResponse(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        return await response.json();
      } catch (error) {
        if (error instanceof Error) {
          return { message: error.message };
        }
        return { message: "Failed to parse JSON response." };
      }
    }

    const text = await response.text();
    if (!text) {
      return null;
    }

    return { message: text };
  }

  private buildErrorMessage(
    response: Response,
    payload: unknown,
  ): string {
    if (payload && typeof payload === "object") {
      const errorPayload = payload as DelveErrorResponse;
      return (
        errorPayload.detail ??
        errorPayload.message ??
        errorPayload.error ??
        `Delve request failed with status ${response.status}.`
      );
    }

    return `Delve request failed with status ${response.status}.`;
  }

  private async request<T>(endpoint: string, options: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    const url = this.buildUrl(endpoint);
    const headers = new Headers(options.headers);
    const requestBody = typeof options.body === "string" ? options.body : undefined;

    headers.set("Authorization", `Bearer ${this.apiKey}`);
    headers.set("Content-Type", "application/json");

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      const responsePayload = await this.parseResponse(response);

      if (!response.ok) {
        let errorCode: DelveErrorCode;
        if (response.status === 401) {
          errorCode = "AUTH_ERROR";
        } else if (response.status === 404) {
          errorCode = "NOT_FOUND";
        } else if (response.status >= 500) {
          errorCode = "SERVER_ERROR";
        } else {
          errorCode = "CLIENT_ERROR";
        }

        throw new DelveClientError(
          this.buildErrorMessage(response, responsePayload),
          {
            statusCode: response.status,
            errorCode,
            details: {
              endpoint,
              method: options.method ?? "GET",
              statusText: response.statusText,
              requestBody,
              response: responsePayload,
            },
          },
        );
      }

      return responsePayload as T;
    } catch (error) {
      if (error instanceof DelveClientError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new DelveClientError("Delve request timed out.", {
            statusCode: 408,
            errorCode: "TIMEOUT",
            details: {
              endpoint,
              method: options.method ?? "GET",
              timeout: this.timeout,
              requestBody,
            },
          });
        }

        throw new DelveClientError("Delve request failed.", {
          statusCode: 503,
          errorCode: "NETWORK_ERROR",
          details: {
            endpoint,
            method: options.method ?? "GET",
            message: error.message,
            requestBody,
          },
        });
      }

      throw new DelveClientError("Unknown Delve request error.", {
        statusCode: 503,
        errorCode: "NETWORK_ERROR",
        details: {
          endpoint,
          method: options.method ?? "GET",
          requestBody,
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async registerAgent(
    agentId: string,
    bonfireId: string,
  ): Promise<RegisterAgentResponse> {
    return this.request<RegisterAgentResponse>("/agents/register", {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentId,
        bonfire_id: bonfireId,
      }),
    });
  }

  async addToStack(
    agentId: string,
    messages: StackMessage[],
  ): Promise<AddToStackResponse> {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error("addToStack requires at least one message.");
    }

    const payload: AddToStackRequest =
      messages.length === 1
        ? { message: messages[0] }
        : { messages, is_paired: true };

    return this.request<AddToStackResponse>(
      `/agents/${encodeURIComponent(agentId)}/stack/add`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  }

  async processStack(agentId: string): Promise<ProcessStackResponse> {
    return this.request<ProcessStackResponse>(
      `/agents/${encodeURIComponent(agentId)}/stack/process`,
      {
        method: "POST",
      },
    );
  }

  async getEpisodes(
    agentId: string,
    limit?: number,
  ): Promise<EpisodesResponse> {
    const resolvedLimit =
      typeof limit === "number" ? Math.min(limit, 100) : 10;
    const params = new URLSearchParams({
      limit: resolvedLimit.toString(),
    });

    return this.request<EpisodesResponse>(
      `/knowledge_graph/agents/${encodeURIComponent(agentId)}/episodes/latest?${params.toString()}`,
      {
        method: "GET",
      },
    );
  }

  async searchKnowledgeGraph(
    bonfireId: string,
    query: string,
    options?: SearchOptions,
  ): Promise<KnowledgeGraphSearchResponse> {
    return this.request<KnowledgeGraphSearchResponse>("/delve", {
      method: "POST",
      body: JSON.stringify({
        query,
        bonfire_id: bonfireId,
        num_results: options?.numResults,
        center_node_uuid: options?.centerNodeUuid,
        graph_id: options?.graphId,
        search_recipe: options?.searchRecipe,
        min_fact_rating: options?.minFactRating,
        mmr_lambda: options?.mmrLambda,
      }),
    });
  }

  async getEpisodeDetails(
    episodeUuid: string,
    agentId?: string,
    includeEdges?: boolean,
  ): Promise<EpisodeDetailsResponse> {
    const params = new URLSearchParams();
    if (agentId) {
      params.set("agent_id", agentId);
    }
    if (typeof includeEdges === "boolean") {
      params.set("include_edges", String(includeEdges));
    }

    const queryString = params.toString();
    const endpoint = `/knowledge_graph/episode/${encodeURIComponent(episodeUuid)}${
      queryString ? `?${queryString}` : ""
    }`;

    return this.request<EpisodeDetailsResponse>(endpoint, {
      method: "GET",
    });
  }
}

// Singleton instance for convenience
export const delveClient = new DelveClient();
