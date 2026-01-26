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
    if (!eventUrl.includes("lu.ma") && !eventUrl.includes("luma.com")) {
        return NextResponse.json({ error: "Only Luma events are supported" }, { status: 400 });
    }

    // Create an HTML page that:
    // 1. Stores the registration data in sessionStorage
    // 2. Redirects to the Luma event page
    // 3. Includes a script that attempts to auto-fill the form
    
    const registrationData = dataParam ? JSON.parse(decodeURIComponent(dataParam)) : null;

    // Inject the auto-fill script into the HTML
    const autoFillScript = `
        // Luma Auto-Fill Script
        (function() {
            const isLumaPage = window.location.hostname.includes('lu.ma') || window.location.hostname.includes('luma.com');
            if (!isLumaPage) return;

            function getRegistrationData() {
                try {
                    const dataStr = sessionStorage.getItem('luma_registration_data');
                    return dataStr ? JSON.parse(dataStr) : null;
                } catch (e) {
                    return null;
                }
            }

            async function autoFillForm() {
                const data = getRegistrationData();
                if (!data) return false;

                // Wait for form elements
                function waitForElement(selector, timeout = 10000) {
                    return new Promise((resolve) => {
                        const element = document.querySelector(selector);
                        if (element) {
                            resolve(element);
                            return;
                        }
                        const observer = new MutationObserver(() => {
                            const el = document.querySelector(selector);
                            if (el) {
                                observer.disconnect();
                                resolve(el);
                            }
                        });
                        observer.observe(document.body, { childList: true, subtree: true });
                        setTimeout(() => observer.disconnect(), timeout);
                    });
                }

                try {
                    await waitForElement('input[type="email"], input[name="email"]', 5000);

                    // Fill fields
                    const fillField = (selector, value) => {
                        const field = document.querySelector(selector);
                        if (field && value) {
                            field.value = value;
                            field.dispatchEvent(new Event('input', { bubbles: true }));
                            field.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    };

                    fillField('input[name="name"], input[name="full_name"]', data.name);
                    fillField('input[type="email"], input[name="email"]', data.email);
                    fillField('input[type="tel"], input[name="phone"]', data.phone);
                    fillField('input[name="company"]', data.company);
                    fillField('input[name="job_title"], input[name="title"]', data.jobTitle);

                    // Click register button after a delay
                    setTimeout(() => {
                        const btn = document.querySelector('button[type="submit"], button:contains("Register"), button:contains("RSVP")') ||
                                   Array.from(document.querySelectorAll('button')).find(b => 
                                       /register|rsvp|sign up/i.test(b.textContent || '')
                                   );
                        if (btn) btn.click();
                    }, 1000);

                    return true;
                } catch (e) {
                    console.error('[Auto-Fill] Error:', e);
                    return false;
                }
            }

            // Run auto-fill
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => setTimeout(autoFillForm, 500));
            } else {
                setTimeout(autoFillForm, 500);
            }
            setTimeout(autoFillForm, 2000);
            setTimeout(autoFillForm, 5000);
        })();
    `;

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Redirecting to Event Registration...</title>
    <script>
        // Store registration data in sessionStorage
        ${registrationData ? `
        try {
            sessionStorage.setItem('luma_registration_data', JSON.stringify(${JSON.stringify(registrationData.userInfo)}));
            sessionStorage.setItem('luma_registration_timestamp', '${registrationData.timestamp}');
            console.log('[Event Registration] Stored registration data');
        } catch (e) {
            console.error('[Event Registration] Failed to store data:', e);
        }
        ` : ''}
        
        // Redirect to event page
        window.location.href = ${JSON.stringify(eventUrl)};
    </script>
    <script>
        ${autoFillScript}
    </script>
</head>
<body>
    <div style="font-family: system-ui; text-align: center; padding: 50px;">
        <p>Redirecting to event registration...</p>
        <p style="color: #666; font-size: 14px;">If you're not redirected, <a href="${eventUrl}">click here</a>.</p>
        <p style="color: #999; font-size: 12px; margin-top: 20px;">Your information will be auto-filled when the page loads.</p>
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
