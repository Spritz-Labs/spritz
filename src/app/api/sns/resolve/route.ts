import { NextRequest, NextResponse } from "next/server";
import { snsForwardResolve, snsReverseResolve } from "@/lib/snsResolveServer";
import { isSolanaAddress } from "@/utils/address";
import { stripLeadingAt } from "@/utils/socialInput";

/**
 * GET /api/sns/resolve?name=alice.sol  — forward resolve to owner address
 * GET /api/sns/resolve?wallet=<base58> — primary .sol for that wallet (if any)
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name")
        ? stripLeadingAt(searchParams.get("name") || "")
        : undefined;
    const wallet = searchParams.get("wallet")?.trim();

    if (!name && !wallet) {
        return NextResponse.json(
            { error: "Provide name=alice.sol or wallet=<solana address>" },
            { status: 400 }
        );
    }

    if (name && wallet) {
        return NextResponse.json(
            { error: "Provide only one of name or wallet" },
            { status: 400 }
        );
    }

    try {
        if (name) {
            const lower = name.toLowerCase();
            if (!lower.endsWith(".sol")) {
                return NextResponse.json(
                    { error: "SNS name must end with .sol" },
                    { status: 400 }
                );
            }
            const result = await snsForwardResolve(lower);
            if (!result) {
                return NextResponse.json({ error: "Could not resolve name" }, { status: 404 });
            }
            return NextResponse.json({
                kind: "forward" as const,
                name: result.name,
                address: result.address,
            });
        }

        if (wallet && !isSolanaAddress(wallet)) {
            return NextResponse.json(
                { error: "Invalid Solana address" },
                { status: 400 }
            );
        }

        const snsName = await snsReverseResolve(wallet!);
        return NextResponse.json({
            kind: "reverse" as const,
            address: wallet,
            name: snsName,
        });
    } catch (e) {
        console.error("[SNS] resolve error:", e);
        const message = e instanceof Error ? e.message : "SNS resolution failed";
        return NextResponse.json({ error: message }, { status: 502 });
    }
}
