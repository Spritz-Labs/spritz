import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export async function GET(request: NextRequest) {
    const address = request.nextUrl.searchParams.get("address");

    if (!address || !supabase) {
        return new NextResponse(unsubscribePage(false, "Invalid request"), {
            status: 400,
            headers: { "Content-Type": "text/html" },
        });
    }

    const { error } = await supabase
        .from("shout_users")
        .update({
            email_updates_opt_in: false,
            lifecycle_email_stage: "opted_out",
        })
        .eq("wallet_address", address.toLowerCase());

    if (error) {
        console.error("[Unsubscribe] Error:", error);
        return new NextResponse(unsubscribePage(false, "Something went wrong. Please try again."), {
            status: 500,
            headers: { "Content-Type": "text/html" },
        });
    }

    return new NextResponse(unsubscribePage(true, "You've been unsubscribed from Spritz emails."), {
        status: 200,
        headers: { "Content-Type": "text/html" },
    });
}

function unsubscribePage(success: boolean, message: string): string {
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Unsubscribe - Spritz</title></head>
<body style="margin: 0; padding: 0; background: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
  <div style="text-align: center; padding: 40px 20px;">
    <span style="font-size: 28px; font-weight: bold; color: #FF5500;">Spritz</span>
    <div style="margin-top: 24px; padding: 24px; background: #1a1a1a; border-radius: 16px; border: 1px solid #333; max-width: 400px;">
      <p style="color: ${success ? "#4ade80" : "#ef4444"}; font-size: 24px; margin: 0 0 8px;">${success ? "Done" : "Error"}</p>
      <p style="color: #ccc; font-size: 15px; margin: 0;">${message}</p>
      ${success ? '<p style="color: #888; font-size: 13px; margin-top: 16px;">You can re-enable email updates anytime in your Spritz settings.</p>' : ""}
    </div>
  </div>
</body>
</html>`;
}
