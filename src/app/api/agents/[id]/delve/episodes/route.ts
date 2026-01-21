import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DelveClient } from "@/lib/delve";
import { getAuthenticatedUser } from "@/lib/session";
import { mapDelveError, parseEpisodeLimit } from "../shared";

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

const getUserAddressFromQuery = (request: NextRequest, sessionAddress?: string) => {
  const { searchParams } = new URL(request.url);
  const paramUserAddress = searchParams.get("userAddress");
  return sessionAddress || paramUserAddress;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  try {
    const { id } = await params;
    const session = await getAuthenticatedUser(request);
    const userAddress = getUserAddressFromQuery(request, session?.userAddress);

    if (!userAddress) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
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
      console.error("[Delve Episodes] Failed to fetch config:", configError);
      return NextResponse.json(
        { error: "Failed to fetch Delve config" },
        { status: 500 },
      );
    }

    const resolvedConfig = (config as DelveConfigRow | null) ?? null;
    const delveAgentId = resolvedConfig?.delve_agent_id ?? null;
    const isRegistered =
      resolvedConfig?.registration_status === "registered" && Boolean(delveAgentId);

    if (!isRegistered || !delveAgentId) {
      return NextResponse.json({
        episodes: [],
        message: "Agent not registered",
      });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseEpisodeLimit(searchParams);

    let delveClient: DelveClient;
    try {
      delveClient = new DelveClient();
    } catch (error) {
      console.error("[Delve Episodes] Client not configured:", error);
      return NextResponse.json(
        { error: "Delve service unavailable" },
        { status: 503 },
      );
    }

    const episodesResponse = await delveClient.getEpisodes(delveAgentId, limit);
    return NextResponse.json(episodesResponse);
  } catch (error) {
    const mapped = mapDelveError(error);
    if (mapped) {
      return NextResponse.json(mapped.body, { status: mapped.status });
    }

    console.error("[Delve Episodes] Error:", error);
    return NextResponse.json({ error: "Failed to fetch episodes" }, { status: 500 });
  }
}
