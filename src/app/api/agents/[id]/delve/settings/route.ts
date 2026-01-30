import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

type DelveConfigRow = {
  knowledge_collection_enabled: boolean | null;
  registration_status: string | null;
  delve_agent_id: string | null;
  registration_error: string | null;
};

const buildSettingsResponse = (config: DelveConfigRow | null) => ({
  knowledge_collection_enabled: config?.knowledge_collection_enabled === true,
  registration_status: config?.registration_status ?? null,
  delve_agent_id: config?.delve_agent_id ?? null,
  registration_error: config?.registration_error ?? null,
});

const getUserAddressFromQuery = (request: NextRequest, sessionAddress?: string) => {
  const { searchParams } = new URL(request.url);
  const paramUserAddress = searchParams.get("userAddress");
  return sessionAddress || paramUserAddress;
};

const assertOwnership = async (
  agentId: string,
  normalizedAddress: string,
): Promise<NextResponse | null> => {
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  const { data: agent, error } = await supabase
    .from("shout_agents")
    .select("owner_address")
    .eq("id", agentId)
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (agent.owner_address !== normalizedAddress) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  return null;
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
    const ownershipError = await assertOwnership(id, normalizedAddress);
    if (ownershipError) return ownershipError;

    const { data: config, error: configError } = await supabase
      .from("delve_agent_config")
      .select(
        "knowledge_collection_enabled, registration_status, delve_agent_id, registration_error",
      )
      .eq("agent_id", id)
      .maybeSingle();

    if (configError) {
      console.error("[Delve Settings] Failed to fetch config:", configError);
      return NextResponse.json(
        { error: "Failed to fetch Delve settings" },
        { status: 500 },
      );
    }

    return NextResponse.json(buildSettingsResponse(config as DelveConfigRow | null));
  } catch (error) {
    console.error("[Delve Settings] Error:", error);
    return NextResponse.json({ error: "Failed to fetch Delve settings" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  try {
    const { id } = await params;
    const session = await getAuthenticatedUser(request);
    const body = await request.json();
    const { userAddress: bodyUserAddress, knowledge_collection_enabled } = body;
    const userAddress = session?.userAddress || bodyUserAddress;

    if (!userAddress) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (typeof knowledge_collection_enabled !== "boolean") {
      return NextResponse.json(
        { error: "knowledge_collection_enabled must be a boolean" },
        { status: 400 },
      );
    }

    const normalizedAddress = userAddress.toLowerCase();
    const ownershipError = await assertOwnership(id, normalizedAddress);
    if (ownershipError) return ownershipError;

    const { data: config, error: configError } = await supabase
      .from("delve_agent_config")
      .update({
        knowledge_collection_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("agent_id", id)
      .select(
        "knowledge_collection_enabled, registration_status, delve_agent_id, registration_error",
      )
      .maybeSingle();

    if (configError) {
      console.error("[Delve Settings] Failed to update config:", configError);
      return NextResponse.json(
        { error: "Failed to update Delve settings" },
        { status: 500 },
      );
    }

    if (!config) {
      return NextResponse.json({ error: "Delve config not found" }, { status: 404 });
    }

    return NextResponse.json(buildSettingsResponse(config as DelveConfigRow));
  } catch (error) {
    console.error("[Delve Settings] Error:", error);
    return NextResponse.json({ error: "Failed to update Delve settings" }, { status: 500 });
  }
}
