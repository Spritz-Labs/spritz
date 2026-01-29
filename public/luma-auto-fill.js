/**
 * Luma Auto-Fill Script
 * This script runs on Luma event pages to auto-fill registration forms
 * 
 * Usage: Include this script on the redirect page or as a bookmarklet
 */

(function() {
    'use strict';

    // Check if we're on a Luma page
    const isLumaPage = window.location.hostname.includes('lu.ma') || window.location.hostname.includes('luma.com');
    
    if (!isLumaPage) {
        console.log('[Luma Auto-Fill] Not on a Luma page, skipping auto-fill');
        return;
    }

    // Get registration data from sessionStorage
    function getRegistrationData() {
        try {
            const dataStr = sessionStorage.getItem('luma_registration_data');
            if (!dataStr) return null;
            return JSON.parse(dataStr);
        } catch (e) {
            console.error('[Luma Auto-Fill] Error reading registration data:', e);
            return null;
        }
    }

    // Wait for page to load
    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }

            const observer = new MutationObserver(() => {
                const element = document.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Element ${selector} not found within ${timeout}ms`));
            }, timeout);
        });
    }

    // Auto-fill form fields
    async function autoFillForm() {
        const data = getRegistrationData();
        if (!data) {
            console.log('[Luma Auto-Fill] No registration data found');
            return false;
        }

        console.log('[Luma Auto-Fill] Starting auto-fill with data:', data);

        try {
            // Wait for the form to appear
            await waitForElement('form, [data-testid="registration-form"], input[name="email"], input[type="email"]', 10000);

            // Fill name field
            const nameInput = document.querySelector('input[name="name"], input[name="full_name"], input[placeholder*="name" i], input[placeholder*="Name" i]');
            if (nameInput && data.name) {
                nameInput.value = data.name;
                nameInput.dispatchEvent(new Event('input', { bubbles: true }));
                nameInput.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('[Luma Auto-Fill] Filled name:', data.name);
            }

            // Fill email field
            const emailInput = document.querySelector('input[name="email"], input[type="email"]');
            if (emailInput && data.email) {
                emailInput.value = data.email;
                emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                emailInput.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('[Luma Auto-Fill] Filled email:', data.email);
            }

            // Fill phone field
            const phoneInput = document.querySelector('input[name="phone"], input[type="tel"], input[placeholder*="phone" i]');
            if (phoneInput && data.phone) {
                phoneInput.value = data.phone;
                phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
                phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('[Luma Auto-Fill] Filled phone:', data.phone);
            }

            // Fill company field
            const companyInput = document.querySelector('input[name="company"], input[placeholder*="company" i]');
            if (companyInput && data.company) {
                companyInput.value = data.company;
                companyInput.dispatchEvent(new Event('input', { bubbles: true }));
                companyInput.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('[Luma Auto-Fill] Filled company:', data.company);
            }

            // Fill job title field
            const jobTitleInput = document.querySelector('input[name="job_title"], input[name="title"], input[placeholder*="title" i]');
            if (jobTitleInput && data.jobTitle) {
                jobTitleInput.value = data.jobTitle;
                jobTitleInput.dispatchEvent(new Event('input', { bubbles: true }));
                jobTitleInput.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('[Luma Auto-Fill] Filled job title:', data.jobTitle);
            }

            // Try to find and click the register/RSVP button
            setTimeout(() => {
                const registerButton = document.querySelector(
                    'button[type="submit"], ' +
                    'button:contains("Register"), ' +
                    'button:contains("RSVP"), ' +
                    'button:contains("Sign up"), ' +
                    '[data-testid="register-button"], ' +
                    'a[href*="register"], ' +
                    '.register-button, ' +
                    'button.btn-primary'
                );

                if (registerButton) {
                    console.log('[Luma Auto-Fill] Found register button, clicking...');
                    registerButton.click();
                } else {
                    // Try to find by text content
                    const buttons = Array.from(document.querySelectorAll('button, a'));
                    const registerBtn = buttons.find(btn => {
                        const text = btn.textContent?.toLowerCase() || '';
                        return text.includes('register') || text.includes('rsvp') || text.includes('sign up');
                    });
                    
                    if (registerBtn) {
                        console.log('[Luma Auto-Fill] Found register button by text, clicking...');
                        registerBtn.click();
                    } else {
                        console.log('[Luma Auto-Fill] Register button not found');
                    }
                }
            }, 1000);

            return true;
        } catch (error) {
            console.error('[Luma Auto-Fill] Error during auto-fill:', error);
            return false;
        }
    }

    // Run auto-fill when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(autoFillForm, 500);
        });
    } else {
        setTimeout(autoFillForm, 500);
    }

    // Also try after a delay in case the form loads dynamically
    setTimeout(autoFillForm, 2000);
    setTimeout(autoFillForm, 5000);
})();
