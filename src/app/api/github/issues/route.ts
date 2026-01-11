import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";

const GITHUB_OWNER = process.env.GITHUB_OWNER || "";
const GITHUB_REPO = process.env.GITHUB_REPO || "";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

// POST /api/github/issues - Create a GitHub issue
export async function POST(request: NextRequest) {
    // Strict rate limit for GitHub issue creation
    const rateLimitResponse = await checkRateLimit(request, "strict");
    if (rateLimitResponse) return rateLimitResponse;

    // Require authentication
    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 }
        );
    }

    if (!GITHUB_OWNER || !GITHUB_REPO || !GITHUB_TOKEN) {
        return NextResponse.json(
            { error: "GitHub integration not configured" },
            { status: 500 }
        );
    }

    try {
        const body = await request.json();
        const { title, body: issueBody, labels } = body;

        if (!title || !issueBody) {
            return NextResponse.json(
                { error: "Title and body are required" },
                { status: 400 }
            );
        }

        const response = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`,
            {
                method: "POST",
                headers: {
                    Authorization: `token ${GITHUB_TOKEN}`,
                    Accept: "application/vnd.github.v3+json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    title,
                    body: issueBody,
                    labels: labels || ["bug"],
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[GitHub] Create issue error:", errorText);
            return NextResponse.json(
                { error: "Failed to create GitHub issue" },
                { status: response.status }
            );
        }

        const data = await response.json();

        return NextResponse.json({
            success: true,
            issue: {
                url: data.html_url,
                number: data.number,
                id: data.id,
            },
        });
    } catch (error) {
        console.error("[GitHub] Error:", error);
        return NextResponse.json(
            { error: "Failed to create GitHub issue" },
            { status: 500 }
        );
    }
}

