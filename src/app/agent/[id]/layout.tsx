import { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
            .select(
                "id, name, personality, avatar_emoji, avatar_url, visibility, public_access_enabled, x402_enabled, x402_price_cents",
            )
            .eq("id", id)
            .single();

        const isPublic = agent?.visibility === "public";
        const isOfficial =
            agent?.visibility === "official" &&
            agent?.public_access_enabled !== false;

        if (error || !agent || (!isPublic && !isOfficial)) {
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
            : `Chat with ${agent.name}, an AI agent on Spritz. ${agent.x402_enabled ? `$${((agent.x402_price_cents || 0) / 100).toFixed(2)} per message.` : "Free to use."}`;

        const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL || "https://app.spritz.chat";
        const ogImageUrl = agent.avatar_url?.startsWith("http")
            ? agent.avatar_url
            : `${baseUrl}/og-image.png`;

        return {
            title: `${agent.name} | AI Agent on Spritz`,
            description,
            openGraph: {
                title: `${agent.name} | AI Agent on Spritz`,
                description,
                url: `${baseUrl}/agent/${id}`,
                type: "website",
                siteName: "Spritz",
                images: [
                    {
                        url: ogImageUrl,
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
                images: [ogImageUrl],
            },
            robots: {
                index: true,
                follow: true,
            },
            alternates: {
                canonical: `${baseUrl}/agent/${id}`,
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
