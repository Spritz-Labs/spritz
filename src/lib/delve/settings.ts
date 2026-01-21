import type { DelveSettingsResponse, RegistrationStatus } from "./types";

export type RegistrationStatusTone = "neutral" | "warning" | "success" | "error";

export type RegistrationStatusInfo = {
  status: RegistrationStatus | "unknown";
  label: string;
  description: string;
  tone: RegistrationStatusTone;
  retryHint?: string;
};

type FetchOptions = {
  signal?: AbortSignal;
};

const STATUS_INFO: Record<
  RegistrationStatus,
  Omit<RegistrationStatusInfo, "status">
> = {
  pending: {
    label: "Pending",
    description: "Registration in progress.",
    tone: "warning",
  },
  registered: {
    label: "Registered",
    description: "Delve is learning from your conversations.",
    tone: "success",
  },
  failed: {
    label: "Failed",
    description: "Registration failed.",
    tone: "error",
    retryHint: "Retrying automatically in the background.",
  },
};

const UNKNOWN_STATUS: RegistrationStatusInfo = {
  status: "unknown",
  label: "Not registered",
  description: "Registration has not started yet.",
  tone: "neutral",
};

const readErrorMessage = (data: unknown, fallback: string): string => {
  if (typeof data === "object" && data !== null && "error" in data) {
    const errorValue = (data as { error?: unknown }).error;
    if (typeof errorValue === "string" && errorValue.trim().length > 0) {
      return errorValue;
    }
  }

  return fallback;
};

export const getRegistrationStatusInfo = (
  status: RegistrationStatus | null,
  errorMessage: string | null,
): RegistrationStatusInfo => {
  if (!status) {
    return UNKNOWN_STATUS;
  }

  const info = STATUS_INFO[status];
  if (!info) {
    return UNKNOWN_STATUS;
  }

  if (status === "failed") {
    const description =
      errorMessage && errorMessage.trim().length > 0
        ? errorMessage
        : info.description;
    return {
      status,
      ...info,
      description,
    };
  }

  return {
    status,
    ...info,
  };
};

export const fetchDelveSettings = async (
  agentId: string,
  userAddress: string,
  options: FetchOptions = {},
): Promise<DelveSettingsResponse> => {
  const response = await fetch(
    `/api/agents/${agentId}/delve/settings?userAddress=${encodeURIComponent(
      userAddress,
    )}`,
    { signal: options.signal },
  );
  const data: unknown = await response.json();

  if (!response.ok) {
    const message = readErrorMessage(data, "Failed to fetch Delve settings");
    throw new Error(message);
  }

  return data as DelveSettingsResponse;
};

export const updateDelveSettings = async (
  agentId: string,
  userAddress: string,
  knowledgeCollectionEnabled: boolean,
  options: FetchOptions = {},
): Promise<DelveSettingsResponse> => {
  const response = await fetch(`/api/agents/${agentId}/delve/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userAddress,
      knowledge_collection_enabled: knowledgeCollectionEnabled,
    }),
    signal: options.signal,
  });
  const data: unknown = await response.json();

  if (!response.ok) {
    const message = readErrorMessage(data, "Failed to update Delve settings");
    throw new Error(message);
  }

  return data as DelveSettingsResponse;
};
