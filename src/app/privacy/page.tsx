import type { Metadata } from "next";
import Link from "next/link";

// SEO: static content, re-render at most once a day.
export const revalidate = 86400;
// Stable build-time date avoids hydration mismatch from new Date() at render.
const LAST_UPDATED = "January 2026";

export const metadata: Metadata = {
    title: "Privacy Policy",
    description: "Privacy Policy for Spritz - Learn how we collect, use, and protect your data in our Web3 communication platform",
    robots: {
        index: true,
        follow: true,
    },
    openGraph: {
        title: "Privacy Policy | Spritz",
        description: "Privacy Policy for Spritz - Learn how we collect, use, and protect your data",
        url: "https://app.spritz.chat/privacy",
    },
    alternates: {
        canonical: "https://app.spritz.chat/privacy",
    },
};

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
            <div className="max-w-4xl mx-auto px-4 py-12">
                {/* Header */}
                <div className="mb-8">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-orange-500 hover:text-orange-400 mb-6"
                    >
                        <svg
                            className="w-5 h-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10 19l-7-7m0 0l7-7m-7 7h18"
                            />
                        </svg>
                        Back to Spritz
                    </Link>
                    <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
                    <p className="text-zinc-400">Last updated: {LAST_UPDATED}</p>
                </div>

                {/* Content */}
                <div className="prose prose-invert max-w-none space-y-8">
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            Welcome to Spritz ("we," "our," or "us"). Spritz is a decentralized communication platform
                            that enables real-time messaging, video calls, livestreaming, and AI agents for Web3 users.
                            This Privacy Policy explains how we collect, use, disclose, and safeguard your information
                            when you use our application available at{" "}
                            <a href="https://app.spritz.chat" className="text-orange-500 hover:text-orange-400">
                                app.spritz.chat
                            </a>
                            .
                        </p>
                        <p className="text-zinc-300 leading-relaxed mt-4">
                            By using Spritz, you agree to the collection and use of information in accordance with this
                            policy. If you do not agree with our policies and practices, do not use our service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>

                        <h3 className="text-xl font-semibold mb-3 mt-6">2.1 Wallet and Blockchain Data</h3>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                            <li>
                                <strong>Wallet Addresses:</strong> We collect and store your wallet address (Ethereum,
                                Base, Solana, or other supported chains) when you connect your wallet or use passkey
                                authentication.
                            </li>
                            <li>
                                <strong>ENS/SNS Names:</strong> We may resolve and display your Ethereum Name Service
                                (ENS) or Solana Name Service (SNS) names if you have one associated with your wallet.
                            </li>
                            <li>
                                <strong>Transaction Data:</strong> We do not collect on-chain transaction data, but
                                blockchain transactions are publicly visible on their respective networks.
                            </li>
                        </ul>

                        <h3 className="text-xl font-semibold mb-3 mt-6">2.2 Account Information</h3>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                            <li>
                                <strong>Username:</strong> If you choose to claim a Spritz username, we store it
                                associated with your wallet address.
                            </li>
                            <li>
                                <strong>Display Name:</strong> Optional display name you provide.
                            </li>
                            <li>
                                <strong>Avatar:</strong> Pixel art avatars you create or upload.
                            </li>
                            <li>
                                <strong>Status:</strong> Your status updates and presence information.
                            </li>
                        </ul>

                        <h3 className="text-xl font-semibold mb-3 mt-6">2.3 Communication Data</h3>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                            <li>
                                <strong>Messages:</strong> End-to-end encrypted messages sent through our decentralized
                                messaging system (Waku protocol). We do not have access to message content.
                            </li>
                            <li>
                                <strong>Call Data:</strong> Metadata about video and voice calls (duration, participants,
                                timestamps). Call content is not recorded or stored by us.
                            </li>
                            <li>
                                <strong>Livestream Data:</strong> Metadata about livestreams (title, duration, viewer
                                counts). Video content is processed by Livepeer and not stored by us.
                            </li>
                        </ul>

                        <h3 className="text-xl font-semibold mb-3 mt-6">2.4 Optional Information</h3>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                            <li>
                                <strong>Email Address:</strong> Only if you choose to verify your email address.
                            </li>
                            <li>
                                <strong>Phone Number:</strong> Only if you choose to verify your phone number via Twilio.
                            </li>
                            <li>
                                <strong>Social Links:</strong> Twitter, Farcaster, Lens, or other social media links you
                                choose to add.
                            </li>
                            <li>
                                <strong>Google Calendar:</strong> If you connect your Google Calendar for scheduling,
                                we store OAuth tokens to check your availability (busy/free times only). We never access
                                or store your event titles, descriptions, attendees, or other private calendar data.
                                See Section 4.5 for full details.
                            </li>
                        </ul>

                        <h3 className="text-xl font-semibold mb-3 mt-6">2.5 Technical Data</h3>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                            <li>
                                <strong>Device Information:</strong> Browser type, device type, operating system.
                            </li>
                            <li>
                                <strong>Usage Analytics:</strong> Aggregated usage statistics (messages sent, call
                                duration, etc.) for analytics purposes.
                            </li>
                            <li>
                                <strong>IP Address:</strong> Collected for security and fraud prevention purposes.
                            </li>
                            <li>
                                <strong>Cookies and Local Storage:</strong> We use localStorage to store authentication
                                credentials and preferences. We do not use tracking cookies.
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                            <li>To provide and maintain our service</li>
                            <li>To authenticate and identify you</li>
                            <li>To enable communication between users</li>
                            <li>To facilitate video calls and livestreaming</li>
                            <li>To provide AI agent functionality</li>
                            <li>To sync calendar availability (if connected)</li>
                            <li>To send push notifications (with your consent)</li>
                            <li>To improve and optimize our service</li>
                            <li>To detect and prevent fraud or abuse</li>
                            <li>To comply with legal obligations</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4">4. Third-Party Services</h2>
                        <p className="text-zinc-300 leading-relaxed mb-4">
                            Spritz uses the following third-party services that may collect or process your data:
                        </p>

                        <h3 className="text-xl font-semibold mb-3 mt-6">4.1 Supabase</h3>
                        <p className="text-zinc-300 leading-relaxed">
                            We use Supabase for database storage and real-time features. Your account data, messages
                            metadata, and preferences are stored on Supabase servers. See{" "}
                            <a
                                href="https://supabase.com/privacy"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-orange-500 hover:text-orange-400"
                            >
                                Supabase Privacy Policy
                            </a>
                            .
                        </p>

                        <h3 className="text-xl font-semibold mb-3 mt-6">4.2 Waku Protocol</h3>
                        <p className="text-zinc-300 leading-relaxed">
                            Messages are sent through the decentralized Waku network. Messages are end-to-end encrypted
                            and not stored by Waku nodes. See{" "}
                            <a
                                href="https://waku.org"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-orange-500 hover:text-orange-400"
                            >
                                Waku Protocol
                            </a>
                            .
                        </p>

                        <h3 className="text-xl font-semibold mb-3 mt-6">4.3 Huddle01</h3>
                        <p className="text-zinc-300 leading-relaxed">
                            Video and voice calls are powered by Huddle01. Call metadata may be processed by Huddle01.
                            See{" "}
                            <a
                                href="https://huddle01.com/privacy"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-orange-500 hover:text-orange-400"
                            >
                                Huddle01 Privacy Policy
                            </a>
                            .
                        </p>

                        <h3 className="text-xl font-semibold mb-3 mt-6">4.4 Livepeer</h3>
                        <p className="text-zinc-300 leading-relaxed">
                            Livestreaming is powered by Livepeer. Stream content is processed and delivered by Livepeer.
                            See{" "}
                            <a
                                href="https://livepeer.org/privacy"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-orange-500 hover:text-orange-400"
                            >
                                Livepeer Privacy Policy
                            </a>
                            .
                        </p>

                        <h3 className="text-xl font-semibold mb-3 mt-6">4.5 Google Calendar Integration</h3>
                        <p className="text-zinc-300 leading-relaxed">
                            <strong>Purpose:</strong> If you choose to connect your Google Calendar, Spritz uses this integration
                            to enable the scheduling feature, allowing other users to book calls with you based on your availability.
                        </p>
                        <p className="text-zinc-300 leading-relaxed mt-3">
                            <strong>Data We Access:</strong>
                        </p>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4 mt-2">
                            <li>
                                <strong>FreeBusy Information:</strong> We check when you are busy or free to display available time slots.
                                We do NOT access event titles, descriptions, attendees, or other event details.
                            </li>
                            <li>
                                <strong>OAuth Tokens:</strong> We securely store refresh tokens to maintain the connection. These tokens
                                can only access calendar availability, not your emails, files, or other Google data.
                            </li>
                        </ul>
                        <p className="text-zinc-300 leading-relaxed mt-3">
                            <strong>Data We Do NOT Access:</strong> Event names, event descriptions, attendee lists, event locations,
                            attachments, or any other Google account data.
                        </p>
                        <p className="text-zinc-300 leading-relaxed mt-3 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                            <strong className="text-orange-400">Data Sharing & AI Disclosure:</strong> Google Calendar data obtained via the Google Calendar API 
                            is <strong>NEVER</strong> shared with, transferred to, or disclosed to any third parties. Specifically, Google Calendar data 
                            is <strong>NEVER</strong> sent to any AI/LLM services, including our AI agents feature. The calendar integration 
                            operates completely independently from our AI features. Google Calendar data is used solely within Spritz 
                            to display your availability to other Spritz users for scheduling purposes.
                        </p>
                        <p className="text-zinc-300 leading-relaxed mt-3">
                            <strong>Disconnecting:</strong> You can disconnect your Google Calendar at any time from your Spritz settings.
                            When disconnected, we immediately delete your stored OAuth tokens.
                        </p>
                        <p className="text-zinc-300 leading-relaxed mt-3">
                            For more information, see{" "}
                            <a
                                href="https://policies.google.com/privacy"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-orange-500 hover:text-orange-400"
                            >
                                Google Privacy Policy
                            </a>
                            .
                        </p>

                        <h3 className="text-xl font-semibold mb-3 mt-6">4.6 Other Services</h3>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                            <li>
                                <strong>Twilio:</strong> For phone verification (if used). See{" "}
                                <a
                                    href="https://www.twilio.com/legal/privacy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-orange-500 hover:text-orange-400"
                                >
                                    Twilio Privacy Policy
                                </a>
                                .
                            </li>
                            <li>
                                <strong>Resend:</strong> For email verification (if used). See{" "}
                                <a
                                    href="https://resend.com/legal/privacy-policy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-orange-500 hover:text-orange-400"
                                >
                                    Resend Privacy Policy
                                </a>
                                .
                            </li>
                            <li>
                                <strong>Google Gemini:</strong> For AI agent functionality. See{" "}
                                <a
                                    href="https://policies.google.com/privacy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-orange-500 hover:text-orange-400"
                                >
                                    Google Privacy Policy
                                </a>
                                .
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4">5. Data Sharing, Transfer, and Disclosure</h2>
                        <p className="text-zinc-300 leading-relaxed mb-4">
                            Spritz is committed to protecting your data. Here is exactly how we handle data sharing:
                        </p>
                        
                        <h3 className="text-xl font-semibold mb-3 mt-6">5.1 Google User Data</h3>
                        <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700 mb-4">
                            <p className="text-zinc-300 leading-relaxed">
                                <strong className="text-orange-400">We do NOT share, transfer, or disclose Google user data to any third parties.</strong>
                            </p>
                            <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4 mt-3">
                                <li>Google Calendar data is <strong>NEVER</strong> sent to AI/LLM services (including Google Gemini)</li>
                                <li>Google Calendar data is <strong>NEVER</strong> used to train AI models</li>
                                <li>Google Calendar data is <strong>NEVER</strong> sold or shared with advertisers</li>
                                <li>Google Calendar data is used <strong>ONLY</strong> within Spritz to display availability for scheduling</li>
                            </ul>
                        </div>
                        
                        <h3 className="text-xl font-semibold mb-3 mt-6">5.2 Data Segregation</h3>
                        <p className="text-zinc-300 leading-relaxed">
                            Spritz maintains complete data segregation between our features:
                        </p>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4 mt-2">
                            <li>
                                <strong>Calendar Feature:</strong> Operates independently using only Google Calendar API data. 
                                This data never leaves the calendar feature context.
                            </li>
                            <li>
                                <strong>AI Agents Feature:</strong> Uses only user-provided messages and knowledge base URLs. 
                                AI agents have no access to Google Calendar data.
                            </li>
                        </ul>
                        
                        <h3 className="text-xl font-semibold mb-3 mt-6">5.3 Third-Party Service Providers</h3>
                        <p className="text-zinc-300 leading-relaxed">
                            We use the following service providers to operate Spritz. These providers process data only as necessary 
                            to provide their services and are contractually obligated to protect your data:
                        </p>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4 mt-2">
                            <li><strong>Supabase:</strong> Database hosting (account data, preferences)</li>
                            <li><strong>Huddle01:</strong> Video call infrastructure (call metadata only)</li>
                            <li><strong>Livepeer:</strong> Livestream processing (stream content)</li>
                            <li><strong>Google Gemini:</strong> AI responses (user-provided messages only, NOT Google Calendar data)</li>
                        </ul>
                        <p className="text-zinc-300 leading-relaxed mt-3">
                            <strong>Important:</strong> Google Calendar data is NOT shared with any of these providers.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4">6. Data Security</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            We implement appropriate technical and organizational measures to protect your personal
                            information. However, no method of transmission over the Internet or electronic storage is
                            100% secure. While we strive to use commercially acceptable means to protect your data, we
                            cannot guarantee absolute security.
                        </p>
                        <p className="text-zinc-300 leading-relaxed mt-4">
                            Messages sent through Spritz are end-to-end encrypted using the Waku protocol, meaning we
                            cannot read your message content. Your wallet private keys are never transmitted to our
                            servers and remain in your control.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4">7. Your Rights</h2>
                        <p className="text-zinc-300 leading-relaxed mb-4">You have the right to:</p>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                            <li>
                                <strong>Access:</strong> Request a copy of the personal data we hold about you
                            </li>
                            <li>
                                <strong>Correction:</strong> Request correction of inaccurate or incomplete data
                            </li>
                            <li>
                                <strong>Deletion:</strong> Request deletion of your personal data (subject to legal
                                obligations)
                            </li>
                            <li>
                                <strong>Portability:</strong> Request transfer of your data to another service
                            </li>
                            <li>
                                <strong>Objection:</strong> Object to processing of your data for certain purposes
                            </li>
                            <li>
                                <strong>Withdraw Consent:</strong> Withdraw consent for optional data processing (e.g.,
                                push notifications, calendar sync)
                            </li>
                        </ul>
                        <p className="text-zinc-300 leading-relaxed mt-4">
                            To exercise these rights, please contact us at the email address provided below.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4">8. Data Retention</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            We retain your personal data for as long as necessary to provide our services and comply
                            with legal obligations. If you delete your account or request data deletion, we will delete
                            or anonymize your data within 30 days, except where we are required to retain it for legal
                            purposes.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4">9. Children's Privacy</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            Spritz is not intended for users under the age of 18. We do not knowingly collect personal
                            information from children. If you believe we have collected information from a child, please
                            contact us immediately.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4">10. International Data Transfers</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            Your information may be transferred to and processed in countries other than your country
                            of residence. These countries may have data protection laws that differ from those in your
                            country. By using Spritz, you consent to the transfer of your information to these countries.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4">11. Changes to This Privacy Policy</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            We may update this Privacy Policy from time to time. We will notify you of any changes by
                            posting the new Privacy Policy on this page and updating the "Last updated" date. You are
                            advised to review this Privacy Policy periodically for any changes.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4">12. Contact Us</h2>
                        <p className="text-zinc-300 leading-relaxed mb-4">
                            If you have any questions about this Privacy Policy or wish to exercise your rights, please
                            contact us:
                        </p>
                        <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                            <p className="text-zinc-300">
                                <strong>Email:</strong>{" "}
                                <a
                                    href="mailto:privacy@spritz.chat"
                                    className="text-orange-500 hover:text-orange-400"
                                >
                                    privacy@spritz.chat
                                </a>
                            </p>
                            <p className="text-zinc-300 mt-2">
                                <strong>Website:</strong>{" "}
                                <a
                                    href="https://app.spritz.chat"
                                    className="text-orange-500 hover:text-orange-400"
                                >
                                    app.spritz.chat
                                </a>
                            </p>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-4">13. Blockchain and Decentralization</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            Spritz leverages blockchain technology and decentralized protocols. Please note that:
                        </p>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4 mt-4">
                            <li>
                                Wallet addresses and on-chain transactions are publicly visible on their respective
                                blockchains
                            </li>
                            <li>
                                Messages are sent through decentralized networks and may be routed through multiple nodes
                            </li>
                            <li>
                                We cannot delete data that has been permanently recorded on a blockchain
                            </li>
                            <li>
                                Your wallet private keys are your responsibility and should never be shared
                            </li>
                        </ul>
                    </section>
                </div>

                {/* Footer */}
                <div className="mt-12 pt-8 border-t border-zinc-800 text-center text-zinc-500 text-sm">
                    <p>© {new Date().getFullYear()} Spritz. All rights reserved.</p>
                    <p className="mt-2">
                        <Link href="/privacy" className="text-orange-500 hover:text-orange-400">
                            Privacy Policy
                        </Link>
                        {" • "}
                        <Link href="/tos" className="text-orange-500 hover:text-orange-400">
                            Terms of Service
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

