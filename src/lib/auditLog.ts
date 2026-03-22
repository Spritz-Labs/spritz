import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function logAccess(
    request: NextRequest,
    action: string,
    details?: {
        userAddress?: string;
        resourceTable?: string;
        resourceId?: string;
        metadata?: Record<string, unknown>;
    },
) {
    try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const ip =
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            request.headers.get("x-real-ip") ||
            "unknown";
        const userAgent = request.headers.get("user-agent") || "unknown";

        await supabase.from("shout_access_audit").insert({
            user_address: details?.userAddress || null,
            action,
            resource_table: details?.resourceTable || null,
            resource_id: details?.resourceId || null,
            ip_address: ip,
            user_agent: userAgent,
            metadata: details?.metadata || null,
        });
    } catch {
        // Fire-and-forget — never block the API response on audit logging
    }
}
