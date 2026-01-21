import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DelveClient } from "@/lib/delve";
import { getAuthenticatedUser } from "@/lib/session";
import { buildKgSearchResponse, mapDelveError } from "../shared";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

type DelveConfigRow = {
  delve_agent_id: string | null;
  registration_status: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getUserAddressFromRequest = (
  request: NextRequest,
  sessionAddress?: string,
  bodyAddress?: string,
): string | null => {
  if (sessionAddress) {
    return sessionAddress;
  }
  if (bodyAddress) {
    return bodyAddress;
  }
  const { searchParams } = new URL(request.url);
  return searchParams.get("userAddress");
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  try {
    const { id } = await params;
    const session = await getAuthenticatedUser(request);

    let body: unknown = null;
    try {
      body = await request.json();
    } catch (error) {
      console.error("[Delve Search] Invalid JSON body:", error);
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const bodyRecord = isRecord(body) ? body : null;
    const query = bodyRecord?.query;
    const bodyUserAddress = bodyRecord?.userAddress;

    const userAddress = getUserAddressFromRequest(
      request,
      session?.userAddress,
      typeof bodyUserAddress === "string" ? bodyUserAddress : undefined,
    );

    if (!userAddress) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (typeof query !== "string") {
      return NextResponse.json(
        { error: "query must be a string" },
        { status: 400 },
      );
    }

    const normalizedAddress = userAddress.toLowerCase();

    const { data: agent, error: agentError } = await supabase
      .from("shout_agents")
      .select("owner_address")
      .eq("id", id)
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (agent.owner_address !== normalizedAddress) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { data: config, error: configError } = await supabase
      .from("delve_agent_config")
      .select("delve_agent_id, registration_status")
      .eq("agent_id", id)
      .maybeSingle();

    if (configError) {
      console.error("[Delve Search] Failed to fetch config:", configError);
      return NextResponse.json(
        { error: "Failed to fetch Delve config" },
        { status: 500 },
      );
    }

    const resolvedConfig = (config as DelveConfigRow | null) ?? null;
    const isRegistered =
      resolvedConfig?.registration_status === "registered" &&
      Boolean(resolvedConfig?.delve_agent_id);

    if (!isRegistered) {
      return NextResponse.json({
        ...buildKgSearchResponse(null),
        message: "Agent not registered",
      });
    }

    const bonfireId = process.env.DELVE_BONFIRE_ID;
    if (!bonfireId) {
      console.error("[Delve Search] DELVE_BONFIRE_ID not configured.");
      return NextResponse.json(
        { error: "Delve service unavailable" },
        { status: 503 },
      );
    }

    let delveClient: DelveClient;
    try {
      delveClient = new DelveClient();
    } catch (error) {
      console.error("[Delve Search] Client not configured:", error);
      return NextResponse.json(
        { error: "Delve service unavailable" },
        { status: 503 },
      );
    }

    const searchResponse = await delveClient.searchKnowledgeGraph(bonfireId, query);
    return NextResponse.json(buildKgSearchResponse(searchResponse));
  } catch (error) {
    const mapped = mapDelveError(error);
    if (mapped) {
      return NextResponse.json(mapped.body, { status: mapped.status });
    }

    console.error("[Delve Search] Error:", error);
    return NextResponse.json(
      { error: "Failed to search knowledge graph" },
      { status: 500 },
    );
  }
}
