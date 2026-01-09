import { NextRequest, NextResponse } from "next/server";
import { verifyCloudProof, type IVerifyResponse } from "@worldcoin/idkit-core/backend";

export async function POST(request: NextRequest) {
    try {
        const proof = await request.json();
        
        const app_id = process.env.NEXT_PUBLIC_WORLD_ID_APP_ID;
        const action = process.env.NEXT_PUBLIC_WORLD_ID_ACTION;
        
        if (!app_id || !action) {
            console.error("[WorldId] Missing environment variables");
            return NextResponse.json(
                { success: false, error: "World ID not configured" },
                { status: 500 }
            );
        }
        
        console.log("[WorldId] Verifying proof for action:", action);
        
        const verifyRes = await verifyCloudProof(
            proof,
            app_id as `app_${string}`,
            action
        ) as IVerifyResponse;
        
        if (verifyRes.success) {
            console.log("[WorldId] ✓ Verification successful");
            return NextResponse.json({
                success: true,
                nullifier_hash: proof.nullifier_hash,
                verification_level: proof.verification_level,
            });
        } else {
            console.error("[WorldId] Verification failed:", verifyRes);
            return NextResponse.json(
                { 
                    success: false, 
                    error: "Verification failed",
                    code: (verifyRes as any).code,
                    detail: (verifyRes as any).detail,
                },
                { status: 400 }
            );
        }
    } catch (error) {
        console.error("[WorldId] Error verifying proof:", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
