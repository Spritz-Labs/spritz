import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Terms of Service",
    description: "Terms of Service for Spritz Chat - Decentralized communication platform on Ethereum and Solana",
    robots: {
        index: true,
        follow: true,
    },
    openGraph: {
        title: "Terms of Service | Spritz Chat",
        description: "Terms of Service for Spritz Chat - Read our terms and conditions",
        url: "https://app.spritz.chat/tos",
    },
    alternates: {
        canonical: "https://app.spritz.chat/tos",
    },
};

export default function TermsOfServicePage() {
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
                    <h1 className="text-4xl font-bold mb-2">Spritz Chat Terms of Service</h1>
                    <p className="text-zinc-400">Last updated: January 2026</p>
                </div>

                {/* Table of Contents */}
                <nav className="mb-12 p-6 bg-zinc-900/50 rounded-xl border border-zinc-800">
                    <h2 className="text-xl font-semibold mb-4">Table of Contents</h2>
                    <ol className="list-decimal list-inside space-y-2 text-zinc-300">
                        <li><a href="#about" className="text-orange-500 hover:text-orange-400">About Spritz Chat</a></li>
                        <li><a href="#decentralization" className="text-orange-500 hover:text-orange-400">Decentralization and Architecture</a></li>
                        <li><a href="#privacy" className="text-orange-500 hover:text-orange-400">Privacy, Data, and Encryption</a></li>
                        <li><a href="#acceptable-use" className="text-orange-500 hover:text-orange-400">Acceptable Use</a></li>
                        <li><a href="#blockchain" className="text-orange-500 hover:text-orange-400">Blockchain, Ethereum, and IPFS</a></li>
                        <li><a href="#third-party" className="text-orange-500 hover:text-orange-400">Third-Party Technologies</a></li>
                        <li><a href="#licenses" className="text-orange-500 hover:text-orange-400">Licenses</a></li>
                        <li><a href="#disclaimers" className="text-orange-500 hover:text-orange-400">Disclaimers</a></li>
                        <li><a href="#financial-risk" className="text-orange-500 hover:text-orange-400">Financial Risk and Loss Disclaimer</a></li>
                        <li><a href="#liability" className="text-orange-500 hover:text-orange-400">Limitation of Liability</a></li>
                        <li><a href="#indemnification" className="text-orange-500 hover:text-orange-400">Indemnification</a></li>
                        <li><a href="#disputes" className="text-orange-500 hover:text-orange-400">Dispute Resolution</a></li>
                        <li><a href="#availability" className="text-orange-500 hover:text-orange-400">Availability and Termination</a></li>
                        <li><a href="#other" className="text-orange-500 hover:text-orange-400">Other</a></li>
                    </ol>
                </nav>

                {/* Content */}
                <div className="prose prose-invert max-w-none space-y-10">
                    
                    {/* 1. About Spritz Chat */}
                    <section id="about">
                        <h2 className="text-2xl font-semibold mb-4">1. About Spritz Chat</h2>
                        <p className="text-zinc-300 leading-relaxed">
                            Spritz Chat (&quot;Spritz Chat,&quot; &quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) provides a decentralized, browser-based 
                            communication protocol that allows users (&quot;you&quot; or &quot;users&quot;) to communicate directly with one another 
                            using supported web browsers.
                        </p>
                        <p className="text-zinc-300 leading-relaxed mt-4">
                            Spritz Chat does not require downloading an application. Access to Spritz Chat is provided through 
                            a link and operates entirely within compatible browsers.
                        </p>
                        <div className="mt-4 p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                            <p className="text-orange-300 font-medium">
                                By accessing or using Spritz Chat, you agree to these Terms of Service (&quot;Terms&quot;). If you do not 
                                agree to these Terms, you must not use Spritz Chat.
                            </p>
                        </div>
                    </section>

                    {/* 2. Decentralization and Architecture */}
                    <section id="decentralization">
                        <h2 className="text-2xl font-semibold mb-4">2. Decentralization and Architecture</h2>
                        
                        <h3 className="text-xl font-semibold mb-3 mt-6">No Central Operator</h3>
                        <p className="text-zinc-300 leading-relaxed">
                            Spritz Chat is a decentralized application (dApp). We do not operate centralized servers for 
                            storing user messages, metadata, or content.
                        </p>

                        <h3 className="text-xl font-semibold mb-3 mt-6">No Custody of User Data</h3>
                        <p className="text-zinc-300 leading-relaxed mb-4">Spritz Chat:</p>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                            <li>Does not collect, store, or retain user messages</li>
                            <li>Does not maintain user accounts in a traditional sense</li>
                            <li>Does not require personal information</li>
                            <li>Does not control or moderate content</li>
                        </ul>
                        <p className="text-zinc-300 leading-relaxed mt-4">
                            Messages are transmitted peer-to-peer or through decentralized infrastructure (Logos Messaging), 
                            depending on availability.
                        </p>

                        <h3 className="text-xl font-semibold mb-3 mt-6">No Download Required</h3>
                        <p className="text-zinc-300 leading-relaxed">
                            Spritz Chat operates directly in supported web browsers. You are responsible for ensuring your 
                            browser and device meet technical requirements.
                        </p>
                    </section>

                    {/* 3. Privacy, Data, and Encryption */}
                    <section id="privacy">
                        <h2 className="text-2xl font-semibold mb-4">3. Privacy, Data, and Encryption</h2>
                        
                        <h3 className="text-xl font-semibold mb-3 mt-6">End-to-End Encryption</h3>
                        <p className="text-zinc-300 leading-relaxed">
                            All communications are encrypted using cryptographic methods designed to prevent third-party access, 
                            including access by Spritz Chat developers.
                        </p>

                        <h3 className="text-xl font-semibold mb-3 mt-6">No Data Retention</h3>
                        <p className="text-zinc-300 leading-relaxed mb-4">We do not log, store, index, analyze, or monetize:</p>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                            <li>Messages</li>
                            <li>Media</li>
                            <li>Wallet addresses</li>
                            <li>IP addresses</li>
                            <li>Usage metadata</li>
                        </ul>
                        <p className="text-zinc-300 leading-relaxed mt-4">
                            Once a message is transmitted, it is not retained by Spritz Chat.
                        </p>

                        <h3 className="text-xl font-semibold mb-3 mt-6">User Responsibility</h3>
                        <p className="text-zinc-300 leading-relaxed mb-4">Because Spritz Chat does not control data:</p>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                            <li>Lost messages cannot be recovered</li>
                            <li>Compromised keys cannot be reset</li>
                            <li>You are solely responsible for securing your device, browser, and cryptographic keys</li>
                        </ul>
                    </section>

                    {/* 4. Acceptable Use */}
                    <section id="acceptable-use">
                        <h2 className="text-2xl font-semibold mb-4">4. Acceptable Use</h2>
                        <p className="text-zinc-300 leading-relaxed mb-4">
                            You agree to use Spritz Chat only for lawful purposes and in compliance with applicable laws.
                        </p>
                        <p className="text-zinc-300 leading-relaxed mb-4">You will not use Spritz Chat to:</p>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                            <li>Violate any law or regulation</li>
                            <li>Engage in fraud, deception, or impersonation</li>
                            <li>Distribute malware or harmful code</li>
                            <li>Coordinate violence, exploitation, or abuse</li>
                            <li>Infringe intellectual property rights</li>
                            <li>Attempt to disrupt the protocol, smart contracts, or underlying blockchain</li>
                        </ul>
                        <p className="text-zinc-300 leading-relaxed mt-4">
                            Because Spritz Chat is decentralized, we may not be able to prevent or reverse misuse, but we 
                            reserve the right to restrict access to interfaces we control.
                        </p>
                    </section>

                    {/* 5. Blockchain, Ethereum, and IPFS */}
                    <section id="blockchain">
                        <h2 className="text-2xl font-semibold mb-4">5. Blockchain, Ethereum, and IPFS</h2>
                        
                        <h3 className="text-xl font-semibold mb-3 mt-6">Ethereum and Base Networks</h3>
                        <p className="text-zinc-300 leading-relaxed mb-4">
                            Spritz Chat is built on Ethereum and Base blockchains, with support for Solana. By using Spritz Chat, you acknowledge:
                        </p>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                            <li>Transactions are irreversible</li>
                            <li>Smart contracts execute autonomously</li>
                            <li>Network fees (&quot;gas&quot;) may apply</li>
                            <li>Network outages or congestion may occur</li>
                        </ul>
                        <p className="text-zinc-300 leading-relaxed mt-4">
                            Spritz Chat does not control Ethereum, Base, Solana, validators, nodes, or protocol upgrades.
                        </p>

                        <h3 className="text-xl font-semibold mb-3 mt-6">IPFS Storage</h3>
                        <p className="text-zinc-300 leading-relaxed mb-4">
                            Pixel art and other non-message assets may be stored on the InterPlanetary File System (IPFS):
                        </p>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                            <li>Content stored on IPFS is public and immutable</li>
                            <li>Content may persist indefinitely</li>
                            <li>We do not control availability or removal of IPFS content</li>
                        </ul>
                        <p className="text-zinc-300 leading-relaxed mt-4 font-medium text-orange-300">
                            You should not upload content to IPFS unless you understand its permanence.
                        </p>
                    </section>

                    {/* 6. Third-Party Technologies */}
                    <section id="third-party">
                        <h2 className="text-2xl font-semibold mb-4">6. Third-Party Technologies</h2>
                        <p className="text-zinc-300 leading-relaxed mb-4">
                            Spritz Chat relies on third-party open-source technologies, including but not limited to:
                        </p>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                            <li>Web browsers</li>
                            <li>Ethereum, Base, and Solana clients</li>
                            <li>Wallet providers (MetaMask, WalletConnect, Phantom, etc.)</li>
                            <li>IPFS nodes</li>
                            <li>Logos Messaging protocol</li>
                        </ul>
                        <p className="text-zinc-300 leading-relaxed mt-4">
                            Your use of those technologies is governed by their respective terms and policies. 
                            <strong className="text-white"> We are not responsible for third-party services.</strong>
                        </p>
                    </section>

                    {/* 7. Licenses */}
                    <section id="licenses">
                        <h2 className="text-2xl font-semibold mb-4">7. Licenses</h2>
                        
                        <h3 className="text-xl font-semibold mb-3 mt-6">Your Content</h3>
                        <p className="text-zinc-300 leading-relaxed">
                            You retain all rights to any content you create or transmit. Spritz Chat does not claim ownership 
                            of user content.
                        </p>

                        <h3 className="text-xl font-semibold mb-3 mt-6">Protocol License</h3>
                        <p className="text-zinc-300 leading-relaxed mb-4">
                            Spritz Chat grants you a limited, non-exclusive, non-transferable license to use the Spritz Chat 
                            interface for its intended purpose.
                        </p>
                        <p className="text-zinc-300 leading-relaxed mb-4">You may not:</p>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                            <li>Misrepresent Spritz Chat as centralized</li>
                            <li>Offer custodial or data-retentive versions under the Spritz Chat name</li>
                            <li>Use Spritz Chat branding without permission</li>
                        </ul>
                    </section>

                    {/* 8. Disclaimers */}
                    <section id="disclaimers">
                        <h2 className="text-2xl font-semibold mb-4">8. Disclaimers</h2>
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
                            <p className="text-red-300 font-bold text-lg mb-4">
                                SPRITZ CHAT IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE.&quot;
                            </p>
                            <p className="text-red-300 font-semibold mb-4">
                                WE MAKE NO WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:
                            </p>
                            <ul className="list-disc list-inside text-red-300 space-y-2 ml-4">
                                <li>SECURITY</li>
                                <li>AVAILABILITY</li>
                                <li>FITNESS FOR A PARTICULAR PURPOSE</li>
                                <li>NON-INFRINGEMENT</li>
                            </ul>
                            <p className="text-red-300 font-semibold mt-4">
                                WE DO NOT GUARANTEE THAT SPRITZ CHAT WILL BE UNINTERRUPTED, ERROR-FREE, OR IMMUNE FROM ATTACKS.
                            </p>
                            <p className="text-red-400 font-bold mt-4 text-lg">
                                YOU USE SPRITZ CHAT AT YOUR OWN RISK.
                            </p>
                        </div>
                    </section>

                    {/* 9. Financial Risk and Loss Disclaimer - NEW DETAILED SECTION */}
                    <section id="financial-risk">
                        <h2 className="text-2xl font-semibold mb-4">9. Financial Risk and Loss Disclaimer</h2>
                        
                        <div className="bg-red-500/20 border-2 border-red-500/50 rounded-lg p-6 mb-6">
                            <h3 className="text-xl font-bold text-red-400 mb-4">⚠️ IMPORTANT: READ CAREFULLY</h3>
                            <p className="text-red-300 font-semibold leading-relaxed">
                                SPRITZ CHAT IS NOT RESPONSIBLE FOR ANY FINANCIAL LOSS, INCLUDING BUT NOT LIMITED TO LOSS OF 
                                CRYPTOCURRENCY, DIGITAL ASSETS, TOKENS, OR ANY OTHER FORM OF VALUE THAT MAY OCCUR WHILE USING 
                                OUR SERVICE.
                            </p>
                        </div>

                        <h3 className="text-xl font-semibold mb-3 mt-6">Cryptocurrency and Digital Asset Risks</h3>
                        <p className="text-zinc-300 leading-relaxed mb-4">
                            By using Spritz Chat, you acknowledge and accept that:
                        </p>
                        <ul className="list-disc list-inside text-zinc-300 space-y-3 ml-4">
                            <li>
                                <strong className="text-white">Volatility:</strong> Cryptocurrency and digital asset values are highly volatile 
                                and can decrease significantly in value at any time
                            </li>
                            <li>
                                <strong className="text-white">Irreversible Transactions:</strong> Blockchain transactions cannot be reversed, 
                                cancelled, or refunded once confirmed
                            </li>
                            <li>
                                <strong className="text-white">Wallet Security:</strong> You are solely responsible for the security of your 
                                wallet, private keys, seed phrases, and passkeys
                            </li>
                            <li>
                                <strong className="text-white">Lost Access:</strong> If you lose access to your wallet or private keys, your 
                                funds may be permanently lost and cannot be recovered by Spritz Chat
                            </li>
                            <li>
                                <strong className="text-white">Smart Contract Risks:</strong> Smart contracts may contain bugs or vulnerabilities 
                                that could result in loss of funds
                            </li>
                            <li>
                                <strong className="text-white">Network Failures:</strong> Blockchain network congestion, outages, or failures 
                                may result in failed transactions or lost funds
                            </li>
                            <li>
                                <strong className="text-white">Hacking and Exploits:</strong> Despite security measures, hacking, phishing, 
                                and other malicious attacks may result in loss of funds
                            </li>
                        </ul>

                        <h3 className="text-xl font-semibold mb-3 mt-6">No Financial Advice</h3>
                        <p className="text-zinc-300 leading-relaxed">
                            Nothing on Spritz Chat constitutes financial, investment, legal, or tax advice. You should consult 
                            with qualified professionals before making any financial decisions. We do not recommend any particular 
                            cryptocurrency, token, or investment strategy.
                        </p>

                        <h3 className="text-xl font-semibold mb-3 mt-6">No Custody of Funds</h3>
                        <p className="text-zinc-300 leading-relaxed">
                            Spritz Chat does not hold, control, or have access to your cryptocurrency or digital assets. 
                            All funds remain in your personal wallet under your sole control. We cannot:
                        </p>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4 mt-4">
                            <li>Recover lost or stolen funds</li>
                            <li>Reverse or cancel transactions</li>
                            <li>Access your wallet or private keys</li>
                            <li>Freeze or seize your assets</li>
                            <li>Guarantee the value or liquidity of any asset</li>
                        </ul>

                        <h3 className="text-xl font-semibold mb-3 mt-6">Assumption of Risk</h3>
                        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 mt-4">
                            <p className="text-zinc-300 leading-relaxed">
                                BY USING SPRITZ CHAT, YOU EXPRESSLY ACKNOWLEDGE AND ASSUME ALL RISKS ASSOCIATED WITH 
                                CRYPTOCURRENCY, BLOCKCHAIN TECHNOLOGY, AND DECENTRALIZED APPLICATIONS. YOU AGREE THAT 
                                SPRITZ CHAT, ITS DEVELOPERS, CONTRIBUTORS, AND AFFILIATES SHALL NOT BE HELD LIABLE FOR 
                                ANY FINANCIAL LOSSES YOU MAY INCUR, REGARDLESS OF THE CAUSE, INCLUDING BUT NOT LIMITED TO:
                            </p>
                            <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4 mt-4">
                                <li>Market volatility or price fluctuations</li>
                                <li>Failed or pending transactions</li>
                                <li>Gas fees or transaction costs</li>
                                <li>Wallet compromise or unauthorized access</li>
                                <li>Smart contract failures or exploits</li>
                                <li>Regulatory actions or legal restrictions</li>
                                <li>Third-party service failures</li>
                                <li>User error or negligence</li>
                                <li>Any other cause whatsoever</li>
                            </ul>
                        </div>
                    </section>

                    {/* 10. Limitation of Liability */}
                    <section id="liability">
                        <h2 className="text-2xl font-semibold mb-4">10. Limitation of Liability</h2>
                        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6">
                            <p className="text-zinc-300 font-semibold mb-4">
                                TO THE MAXIMUM EXTENT PERMITTED BY LAW:
                            </p>
                            <ul className="list-disc list-inside text-zinc-300 space-y-3 ml-4">
                                <li>
                                    SPRITZ CHAT SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, 
                                    OR PUNITIVE DAMAGES
                                </li>
                                <li>
                                    <strong className="text-white">WE ARE NOT LIABLE FOR LOST DATA, LOST KEYS, LOST FUNDS, 
                                    OR BLOCKCHAIN FAILURES</strong>
                                </li>
                                <li>
                                    OUR TOTAL LIABILITY SHALL NOT EXCEED ONE HUNDRED U.S. DOLLARS (USD $100)
                                </li>
                            </ul>
                            <p className="text-zinc-400 mt-4 text-sm">
                                Some jurisdictions do not allow certain limitations; in such cases, liability is limited to 
                                the maximum extent permitted by law.
                            </p>
                        </div>
                    </section>

                    {/* 11. Indemnification */}
                    <section id="indemnification">
                        <h2 className="text-2xl font-semibold mb-4">11. Indemnification</h2>
                        <p className="text-zinc-300 leading-relaxed mb-4">
                            You agree to indemnify and hold harmless Spritz Chat, its contributors, and developers from any 
                            claims arising from:
                        </p>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                            <li>Your use of Spritz Chat</li>
                            <li>Your violation of these Terms</li>
                            <li>Your interaction with blockchain or IPFS content</li>
                            <li>Any financial losses you incur</li>
                            <li>Your violation of any third-party rights</li>
                            <li>Any content you submit, post, or transmit through the Service</li>
                        </ul>
                    </section>

                    {/* 12. Dispute Resolution */}
                    <section id="disputes">
                        <h2 className="text-2xl font-semibold mb-4">12. Dispute Resolution</h2>
                        <p className="text-zinc-300 leading-relaxed mb-4">
                            Because Spritz Chat is decentralized and non-custodial, disputes are limited.
                        </p>
                        <p className="text-zinc-300 leading-relaxed mb-4">Unless prohibited by law:</p>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                            <li>Any dispute shall be resolved individually</li>
                            <li>Class actions are waived</li>
                            <li>Governing law shall be determined by applicable conflict-of-law rules</li>
                        </ul>
                    </section>

                    {/* 13. Availability and Termination */}
                    <section id="availability">
                        <h2 className="text-2xl font-semibold mb-4">13. Availability and Termination</h2>
                        <p className="text-zinc-300 leading-relaxed mb-4">Spritz Chat may:</p>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                            <li>Change interfaces</li>
                            <li>Modify supported browsers</li>
                            <li>Discontinue front-end access at any time</li>
                        </ul>
                        <p className="text-zinc-300 leading-relaxed mt-4">
                            Because the protocol is decentralized, smart contracts and content may continue to exist 
                            independently of us.
                        </p>
                    </section>

                    {/* 14. Other */}
                    <section id="other">
                        <h2 className="text-2xl font-semibold mb-4">14. Other</h2>
                        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
                            <li>These Terms constitute the entire agreement</li>
                            <li>If any provision is unenforceable, the remainder remains effective</li>
                            <li>We reserve all rights not expressly granted</li>
                            <li>Your continued use constitutes acceptance of updated Terms</li>
                        </ul>
                    </section>

                    {/* Contact */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4">Contact Information</h2>
                        <p className="text-zinc-300 leading-relaxed mb-4">
                            If you have any questions about these Terms, please contact us:
                        </p>
                        <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                            <p className="text-zinc-300">
                                <strong>Email:</strong>{" "}
                                <a
                                    href="mailto:legal@spritz.chat"
                                    className="text-orange-500 hover:text-orange-400"
                                >
                                    legal@spritz.chat
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
                            <p className="text-zinc-300 mt-2">
                                <strong>Documentation:</strong>{" "}
                                <a
                                    href="https://docs.spritz.chat"
                                    className="text-orange-500 hover:text-orange-400"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    docs.spritz.chat
                                </a>
                            </p>
                        </div>
                    </section>
                </div>

                {/* Footer */}
                <div className="mt-12 pt-8 border-t border-zinc-800 text-center text-zinc-500 text-sm">
                    <p>© {new Date().getFullYear()} Spritz Labs. All rights reserved.</p>
                    <p className="mt-2">
                        <Link href="/privacy" className="text-orange-500 hover:text-orange-400">
                            Privacy Policy
                        </Link>
                        {" • "}
                        <Link href="/tos" className="text-orange-500 hover:text-orange-400">
                            Terms of Service
                        </Link>
                        {" • "}
                        <a 
                            href="https://docs.spritz.chat" 
                            className="text-orange-500 hover:text-orange-400"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Docs
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}
