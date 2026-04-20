import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { logAccess } from "@/lib/auditLog";
import { supabaseService } from "@/lib/supabaseServer";
import {
    readPhoneStatusCache,
    writePhoneStatusCache,
} from "@/lib/phoneStatusCache";

export async function GET(request: NextRequest) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    const userAddress = session.userAddress.toLowerCase();

    logAccess(request, "phone.status.read", {
        userAddress,
        resourceTable: "shout_phone_numbers",
    });

    const cached = readPhoneStatusCache(userAddress);
    if (cached) {
        return NextResponse.json(
            { phoneNumber: cached.phoneNumber, verified: cached.verified },
            {
                headers: {
                    "Cache-Control": "private, max-age=30",
                    "X-Cache": "HIT",
                },
            }
        );
    }

    if (!supabaseService) {
        return NextResponse.json({ phoneNumber: null, verified: false });
    }

    const { data, error } = await supabaseService
        .from("shout_phone_numbers")
        .select("phone_number, verified")
        .eq("wallet_address", userAddress)
        .maybeSingle();

    if (error) {
        return NextResponse.json(
            { error: "Failed to fetch phone status" },
            { status: 500 }
        );
    }

    const phoneNumber = data?.phone_number ?? null;
    const verified = data?.verified ?? false;
    writePhoneStatusCache(userAddress, phoneNumber, verified);

    return NextResponse.json(
        { phoneNumber, verified },
        {
            headers: {
                "Cache-Control": "private, max-age=30",
                "X-Cache": "MISS",
            },
        }
    );
}
