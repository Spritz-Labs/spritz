import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
    encodeFunctionResult,
    decodeFunctionData,
    type Hex,
    pad,
    toBytes,
} from "viem";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ADDR_ABI = [
    {
        name: "addr",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "node", type: "bytes32" }],
        outputs: [{ name: "", type: "address" }],
    },
] as const;

const ADDR_MULTICHAIN_ABI = [
    {
        name: "addr",
        type: "function",
        stateMutability: "view",
        inputs: [
            { name: "node", type: "bytes32" },
            { name: "coinType", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bytes" }],
    },
] as const;

const TEXT_ABI = [
    {
        name: "text",
        type: "function",
        stateMutability: "view",
        inputs: [
            { name: "node", type: "bytes32" },
            { name: "key", type: "string" },
        ],
        outputs: [{ name: "", type: "string" }],
    },
] as const;

const RESOLVE_ABI = [
    {
        name: "resolve",
        type: "function",
        stateMutability: "view",
        inputs: [
            { name: "name", type: "bytes" },
            { name: "data", type: "bytes" },
        ],
        outputs: [{ name: "", type: "bytes" }],
    },
] as const;

function dnsDecodeName(data: Hex): string {
    const bytes = toBytes(data);
    const labels: string[] = [];
    let offset = 0;
    while (offset < bytes.length) {
        const len = bytes[offset];
        if (len === 0) break;
        offset++;
        const label = new TextDecoder().decode(bytes.slice(offset, offset + len));
        labels.push(label);
        offset += len;
    }
    return labels.join(".");
}

function extractSubname(fullName: string, parentName: string): string | null {
    const lower = fullName.toLowerCase();
    const parentLower = parentName.toLowerCase();
    if (!lower.endsWith(`.${parentLower}`)) return null;
    const sub = lower.slice(0, lower.length - parentLower.length - 1);
    if (sub.includes(".")) return null;
    return sub;
}

async function lookupUser(username: string) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data } = await supabase
        .from("shout_users")
        .select("wallet_address, smart_wallet_address, username, display_name, avatar_url, wallet_type, ens_subname_claimed_at, ens_resolve_address")
        .eq("username", username.toLowerCase())
        .not("ens_subname_claimed_at", "is", null)
        .maybeSingle();
    return data;
}

async function getConfig() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data } = await supabase
        .from("shout_ens_config")
        .select("*")
        .limit(1)
        .maybeSingle();
    return data;
}

function handleResolve(calldata: Hex, user: NonNullable<Awaited<ReturnType<typeof lookupUser>>>) {
    const resolveAddr = (user.ens_resolve_address || user.smart_wallet_address || user.wallet_address) as `0x${string}`;

    const selector = calldata.slice(0, 10) as Hex;

    // addr(bytes32) — 0x3b3b57de
    if (selector === "0x3b3b57de") {
        return encodeFunctionResult({
            abi: ADDR_ABI,
            functionName: "addr",
            result: resolveAddr,
        });
    }

    // addr(bytes32, uint256) — 0xf1cb7e06
    if (selector === "0xf1cb7e06") {
        const { args } = decodeFunctionData({ abi: ADDR_MULTICHAIN_ABI, data: calldata });
        const coinType = args[1];
        if (coinType === BigInt(60)) {
            return encodeFunctionResult({
                abi: ADDR_MULTICHAIN_ABI,
                functionName: "addr",
                result: pad(resolveAddr as Hex, { size: 20 }),
            });
        }
        return encodeFunctionResult({
            abi: ADDR_MULTICHAIN_ABI,
            functionName: "addr",
            result: "0x",
        });
    }

    // text(bytes32, string) — 0x59d1d43c
    if (selector === "0x59d1d43c") {
        const { args } = decodeFunctionData({ abi: TEXT_ABI, data: calldata });
        const key = args[1];
        let value = "";
        switch (key) {
            case "avatar":
                value = user.avatar_url || "";
                break;
            case "display":
                value = user.display_name || user.username || "";
                break;
            case "description":
                value = `${user.username}.spritz.eth — Spritz Chat`;
                break;
            case "url":
                value = `https://app.spritz.chat/user/${user.wallet_address}`;
                break;
        }
        return encodeFunctionResult({
            abi: TEXT_ABI,
            functionName: "text",
            result: value,
        });
    }

    return null;
}

async function processRequest(sender: string, data: Hex): Promise<NextResponse> {
    const config = await getConfig();
    if (!config?.enabled) {
        return NextResponse.json({ message: "ENS subnames not enabled" }, { status: 503 });
    }

    try {
        const { args } = decodeFunctionData({ abi: RESOLVE_ABI, data });
        const [dnsName, innerCalldata] = args;
        const fullName = dnsDecodeName(dnsName as Hex);
        const username = extractSubname(fullName, config.parent_name);

        if (!username) {
            return NextResponse.json({ data: "0x" });
        }

        const user = await lookupUser(username);
        if (!user) {
            return NextResponse.json({ data: "0x" });
        }

        const result = handleResolve(innerCalldata as Hex, user);
        if (!result) {
            return NextResponse.json({ data: "0x" });
        }

        return NextResponse.json({ data: result });
    } catch (err) {
        console.error("[ENS Gateway] Error:", err);
        return NextResponse.json({ data: "0x" });
    }
}

// POST /{sender}/{data}.json — EIP-3668 CCIP Read
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { sender, data } = body as { sender: string; data: Hex };

        const response = await processRequest(sender, data);
        response.headers.set("Access-Control-Allow-Origin", "*");
        return response;
    } catch {
        return NextResponse.json({ data: "0x" }, { status: 400 });
    }
}

// GET /{sender}/{data}.json — EIP-3668 CCIP Read (alternative)
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const sender = searchParams.get("sender") || "";
        const data = (searchParams.get("data") || "0x") as Hex;

        const response = await processRequest(sender, data);
        response.headers.set("Access-Control-Allow-Origin", "*");
        return response;
    } catch {
        return NextResponse.json({ data: "0x" }, { status: 400 });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    });
}
