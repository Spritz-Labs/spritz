import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

// Lightweight RUM sink. This route is intentionally cheap: parse, validate
// shape, log. No DB writes — pino will forward to Vercel logs where we can
// ship them to our SIEM later.
const log = createLogger("WebVitals");

type VitalsPayload = {
    id?: string;
    name?: string;
    label?: string;
    value?: number;
    rating?: string | null;
    path?: string;
    ts?: number;
};

export const runtime = "edge";

export async function POST(request: NextRequest) {
    try {
        const data = (await request.json().catch(() => null)) as
            | VitalsPayload
            | null;
        if (!data || typeof data !== "object" || !data.name) {
            return NextResponse.json({ ok: false }, { status: 204 });
        }

        const ua = request.headers.get("user-agent") ?? "";
        const country = request.headers.get("x-vercel-ip-country") ?? null;

        log.info("vital", {
            name: data.name,
            label: data.label,
            value: Number.isFinite(data.value) ? data.value : null,
            rating: data.rating ?? null,
            path: data.path ?? null,
            country,
            ua: ua.slice(0, 120),
        });

        return new NextResponse(null, { status: 204 });
    } catch {
        return new NextResponse(null, { status: 204 });
    }
}
