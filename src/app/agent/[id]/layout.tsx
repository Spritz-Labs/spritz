import { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<Metadata> {
    const { id } = await params;

    try {
        const { data: agent, error } = await supabase
            .from("shout_agents")
            .select("id, name, personality, avatar_emoji, visibility, x402_enabled, x402_price_cents")
            .eq("id", id)
            .single();

        if (error || !agent || agent.visibility !== "public") {
            return {
                title: "Agent Not Found | Spritz",
                description: "This AI agent is not available.",
                robots: {
                    index: false,
                    follow: false,
                },
            };
        }

        const description = agent.personality
            ? `${agent.personality} - Chat with ${agent.name} on Spritz`
            : `Chat with ${agent.name}, an AI agent on Spritz. ${agent.x402_enabled ? `$${(agent.x402_price_cents / 100).toFixed(2)} per message.` : "Free to use."}`;

        return {
            title: `${agent.name} | AI Agent on Spritz`,
            description,
            openGraph: {
                title: `${agent.name} | AI Agent on Spritz`,
                description,
                url: `https://app.spritz.chat/agent/${id}`,
                type: "website",
                images: [
                    {
                        url: "/og-image.png",
                        width: 1200,
                        height: 630,
                        alt: `${agent.name} - AI Agent`,
                    },
                ],
            },
            twitter: {
                card: "summary_large_image",
                title: `${agent.name} | AI Agent on Spritz`,
                description,
                images: ["/og-image.png"],
            },
            robots: {
                index: true,
                follow: true,
            },
            alternates: {
                canonical: `https://app.spritz.chat/agent/${id}`,
            },
        };
    } catch (error) {
        console.error("[Agent Metadata] Error:", error);
        return {
            title: "AI Agent | Spritz",
            description: "Chat with AI agents on Spritz",
        };
    }
}

export default function AgentLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}

