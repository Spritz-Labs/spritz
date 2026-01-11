import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";

export async function POST() {
    const response = NextResponse.json({ success: true, message: "Logged out" });
    return clearSessionCookie(response);
}

// Also support GET for easier testing/linking
export async function GET() {
    const response = NextResponse.json({ success: true, message: "Logged out" });
    return clearSessionCookie(response);
}
