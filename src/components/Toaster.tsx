"use client";

/**
 * Toast Notification System
 * 
 * P1 UX Fix: Global toast notifications for user feedback
 * Uses sonner library for minimal footprint and great DX
 * 
 * Usage throughout the app:
 * ```tsx
 * import { toast } from 'sonner';
 * 
 * // Success
 * toast.success('Friend request sent!');
 * 
 * // Error with action
 * toast.error('Failed to send transaction', {
 *   action: { label: 'Retry', onClick: () => retry() }
 * });
 * 
 * // Loading with promise
 * toast.promise(sendTransaction(), {
 *   loading: 'Sending...',
 *   success: 'Transaction sent!',
 *   error: 'Failed to send'
 * });
 * 
 * // Info
 * toast.info('New message from @kevin');
 * 
 * // Custom with description
 * toast('Transaction confirmed', {
 *   description: 'View on Basescan',
 *   action: { label: 'View', onClick: () => window.open(url) }
 * });
 * ```
 */

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
    return (
        <SonnerToaster
            position="bottom-right"
            toastOptions={{
                // Styling to match Spritz design system
                style: {
                    background: "#18181b", // zinc-900
                    border: "1px solid #3f3f46", // zinc-700
                    color: "#fff",
                    borderRadius: "12px",
                    padding: "16px",
                    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
                },
                // Success toast styling
                classNames: {
                    success: "!border-emerald-500/30 !bg-emerald-500/10",
                    error: "!border-red-500/30 !bg-red-500/10",
                    warning: "!border-amber-500/30 !bg-amber-500/10",
                    info: "!border-blue-500/30 !bg-blue-500/10",
                },
            }}
            // Close button for all toasts
            closeButton
            // Rich colors for different toast types
            richColors
            // Expand toasts on hover
            expand
            // Duration in ms (5 seconds default)
            duration={5000}
            // Gap between toasts
            gap={8}
            // Offset from viewport edge
            offset={16}
            // Visible toasts
            visibleToasts={4}
        />
    );
}

// Re-export toast function for convenience
export { toast } from "sonner";

export default Toaster;
