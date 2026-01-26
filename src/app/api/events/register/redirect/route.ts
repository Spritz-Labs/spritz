import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/events/register/redirect
 * Redirects to event registration page with user data for auto-fill
 * 
 * This page:
 * 1. Extracts user registration data from query params
 * 2. Stores it in sessionStorage
 * 3. Redirects to the Luma event page
 * 4. Client-side script can then auto-fill the form
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const eventUrl = searchParams.get("eventUrl");
    const dataParam = searchParams.get("data");

    if (!eventUrl) {
        return NextResponse.json({ error: "Event URL is required" }, { status: 400 });
    }

    // Validate it's a Luma URL
    if (!eventUrl.includes("lu.ma")) {
        return NextResponse.json({ error: "Only Luma events are supported" }, { status: 400 });
    }

    // Create an HTML page that:
    // 1. Stores the registration data in sessionStorage
    // 2. Redirects to the Luma event page
    // 3. Includes a script that attempts to auto-fill the form
    
    const registrationData = dataParam ? JSON.parse(decodeURIComponent(dataParam)) : null;

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Redirecting to Event Registration...</title>
    <meta http-equiv="refresh" content="0;url=${eventUrl}">
    <script>
        // Store registration data in sessionStorage for auto-fill
        ${registrationData ? `
        try {
            sessionStorage.setItem('luma_registration_data', JSON.stringify(${JSON.stringify(registrationData.userInfo)}));
            sessionStorage.setItem('luma_registration_timestamp', '${registrationData.timestamp}');
            console.log('[Event Registration] Stored registration data for auto-fill');
        } catch (e) {
            console.error('[Event Registration] Failed to store data:', e);
        }
        ` : ''}
        
        // Redirect to event page
        window.location.href = ${JSON.stringify(eventUrl)};
    </script>
</head>
<body>
    <div style="font-family: system-ui; text-align: center; padding: 50px;">
        <p>Redirecting to event registration...</p>
        <p style="color: #666; font-size: 14px;">If you're not redirected, <a href="${eventUrl}">click here</a>.</p>
    </div>
</body>
</html>
    `;

    return new NextResponse(html, {
        headers: {
            "Content-Type": "text/html",
        },
    });
}
