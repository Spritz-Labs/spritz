import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// GitHub config
const GITHUB_OWNER = process.env.GITHUB_OWNER || "";
const GITHUB_REPO = process.env.GITHUB_REPO || "";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

// Verify admin signature from headers
async function verifyAdmin(request: NextRequest): Promise<{ isAdmin: boolean; address: string | null; isSuperAdmin: boolean }> {
    const address = request.headers.get("x-admin-address");
    const signature = request.headers.get("x-admin-signature");
    const encodedMessage = request.headers.get("x-admin-message");

    if (!address || !signature || !encodedMessage || !supabase) {
        return { isAdmin: false, address: null, isSuperAdmin: false };
    }

    try {
        // Decode the base64 encoded message
        const message = decodeURIComponent(atob(encodedMessage));
        
        const isValidSignature = await verifyMessage({
            address: address as `0x${string}`,
            message,
            signature: signature as `0x${string}`,
        });

        if (!isValidSignature) {
            return { isAdmin: false, address: null, isSuperAdmin: false };
        }

        const { data: admin } = await supabase
            .from("shout_admins")
            .select("*")
            .eq("wallet_address", address.toLowerCase())
            .single();

        return { 
            isAdmin: !!admin, 
            address: address.toLowerCase(),
            isSuperAdmin: admin?.is_super_admin || false 
        };
    } catch {
        return { isAdmin: false, address: null, isSuperAdmin: false };
    }
}

// POST /api/admin/bug-reports/[id]/github - Create GitHub issue from bug report
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { isAdmin } = await verifyAdmin(request);

    if (!isAdmin || !supabase) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;

        // Get bug report
        const { data: bugReport, error: fetchError } = await supabase
            .from("shout_bug_reports")
            .select("*")
            .eq("id", id)
            .single();

        if (fetchError || !bugReport) {
            return NextResponse.json(
                { error: "Bug report not found" },
                { status: 404 }
            );
        }

        // Check if GitHub issue already exists
        if (bugReport.github_issue_url) {
            return NextResponse.json(
                { error: "GitHub issue already exists" },
                { status: 400 }
            );
        }

        // Check GitHub config
        if (!GITHUB_OWNER || !GITHUB_REPO || !GITHUB_TOKEN) {
            return NextResponse.json(
                { error: "GitHub integration not configured" },
                { status: 500 }
            );
        }

        // Create GitHub issue
        const issueTitle = `[${bugReport.category}] ${bugReport.description.slice(0, 100)}${bugReport.description.length > 100 ? "..." : ""}`;
        
        let issueBody = `**Category:** ${bugReport.category}\n`;
        issueBody += `**Reported by:** ${bugReport.user_address}\n`;
        issueBody += `**Reported at:** ${new Date(bugReport.created_at).toISOString()}\n\n`;
        issueBody += `**Description:**\n${bugReport.description}\n\n`;
        
        if (bugReport.replication_steps) {
            issueBody += `**Replication Steps:**\n${bugReport.replication_steps}\n\n`;
        }
        
        issueBody += `---\n`;
        issueBody += `*Bug Report ID: ${bugReport.id}*`;

        // Call GitHub API directly (admin is already verified)
        const githubResponse = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`,
            {
                method: "POST",
                headers: {
                    Authorization: `token ${GITHUB_TOKEN}`,
                    Accept: "application/vnd.github.v3+json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    title: issueTitle,
                    body: issueBody,
                    labels: ["bug", bugReport.category.toLowerCase()],
                }),
            }
        );

        if (!githubResponse.ok) {
            const errorText = await githubResponse.text();
            console.error("[GitHub] Create issue error:", errorText);
            return NextResponse.json(
                { error: "Failed to create GitHub issue" },
                { status: githubResponse.status }
            );
        }

        const githubData = await githubResponse.json();

        // Update bug report with GitHub issue info
        const { data: updatedReport, error: updateError } = await supabase
            .from("shout_bug_reports")
            .update({
                github_issue_url: githubData.html_url,
                github_issue_number: githubData.number,
            })
            .eq("id", id)
            .select()
            .single();

        if (updateError) {
            console.error("[Bug Reports] Update error:", updateError);
            return NextResponse.json(
                { error: "Failed to update bug report with GitHub issue" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            bugReport: updatedReport,
            githubIssue: {
                url: githubData.html_url,
                number: githubData.number,
                id: githubData.id,
            },
        });
    } catch (error) {
        console.error("[Bug Reports] Error:", error);
        return NextResponse.json(
            { error: "Failed to create GitHub issue" },
            { status: 500 }
        );
    }
}

