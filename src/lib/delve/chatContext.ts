import type {
  KnowledgeGraphNode,
  KnowledgeGraphSearchResponse,
  StackMessage,
} from "./types.ts";

export type ChatKgEntity = {
  name: string;
  type: string;
  uuid: string;
};

export type ChatKgRelationship = {
  source: string;
  relation: string;
  target: string;
};

export interface ChatKgContext {
  entities: ChatKgEntity[];
  relationships: ChatKgRelationship[];
  episode_id?: string;
}

const buildNodeLookup = (
  entities: KnowledgeGraphNode[],
  nodes: KnowledgeGraphNode[],
): Map<string, ChatKgEntity> => {
  const lookup = new Map<string, ChatKgEntity>();
  const combined = [...entities, ...nodes];
  for (const node of combined) {
    if (!node.uuid || lookup.has(node.uuid)) {
      continue;
    }
    lookup.set(node.uuid, {
      name: node.label ?? node.uuid,
      type: node.type ?? "unknown",
      uuid: node.uuid,
    });
  }
  return lookup;
};

export const buildKgContext = (
  response?: KnowledgeGraphSearchResponse | null,
): ChatKgContext | undefined => {
  if (!response) {
    return undefined;
  }

  const entities = response.entities ?? [];
  const nodes = response.nodes ?? [];
  const nodeLookup = buildNodeLookup(entities, nodes);

  const mappedEntities = entities
    .filter((entity) => Boolean(entity.uuid))
    .map((entity) => {
      const mapped = nodeLookup.get(entity.uuid);
      return (
        mapped ?? {
          name: entity.label ?? entity.uuid,
          type: entity.type ?? "unknown",
          uuid: entity.uuid,
        }
      );
    });

  const relationships = (response.edges ?? []).flatMap((edge) => {
    const sourceUuid = edge.source_uuid;
    const targetUuid = edge.target_uuid;
    if (!sourceUuid || !targetUuid) {
      return [];
    }

    const source = nodeLookup.get(sourceUuid)?.name ?? sourceUuid;
    const target = nodeLookup.get(targetUuid)?.name ?? targetUuid;
    const relation = edge.relationship ?? "related_to";

    return [{ source, relation, target }];
  });

  if (mappedEntities.length === 0 && relationships.length === 0) {
    return undefined;
  }

  const episodeId = response.episodes?.[0]?.uuid;

  return {
    entities: mappedEntities,
    relationships,
    ...(episodeId ? { episode_id: episodeId } : {}),
  };
};

export interface BuildStackMessagesInput {
  userAddress: string;
  agentName: string;
  agentId: string;
  chatId: string;
  userText: string;
  agentText: string;
}

export const buildStackMessages = (
  input: BuildStackMessagesInput,
): StackMessage[] => {
  const userTimestamp = new Date().toISOString();
  const agentTimestamp = new Date().toISOString();

  const userMessage: StackMessage = {
    text: input.userText,
    userId: input.userAddress,
    username: input.userAddress,
    chatId: input.chatId,
    agentId: input.agentId,
    timestamp: userTimestamp,
  };

  const agentMessage: StackMessage = {
    text: input.agentText,
    userId: input.agentId,
    username: input.agentName,
    chatId: input.chatId,
    agentId: input.agentId,
    timestamp: agentTimestamp,
  };

  return [userMessage, agentMessage];
};
