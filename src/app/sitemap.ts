import { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const appBaseUrl = "https://app.spritz.chat";
    const mainBaseUrl = "https://spritz.chat";

    const staticPages: MetadataRoute.Sitemap = [
        // Main domain (spritz.chat) - landing page
        {
            url: mainBaseUrl,
            lastModified: new Date(),
            changeFrequency: "daily",
            priority: 1,
        },
        // App domain (app.spritz.chat) - main app
        {
            url: appBaseUrl,
            lastModified: new Date(),
            changeFrequency: "daily",
            priority: 1,
        },
        // Landing page (accessible from both domains)
        {
            url: `${appBaseUrl}/landing`,
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 0.9,
        },
        // Legal pages (accessible from app domain)
        {
            url: `${appBaseUrl}/privacy`,
            lastModified: new Date(),
            changeFrequency: "monthly",
            priority: 0.5,
        },
        {
            url: `${appBaseUrl}/tos`,
            lastModified: new Date(),
            changeFrequency: "monthly",
            priority: 0.5,
        },
    ];

    // Add public user profiles
    try {
        const { data: publicUsers } = await supabase
            .from("shout_user_settings")
            .select("wallet_address, updated_at")
            .eq("public_landing_enabled", true)
            .limit(1000); // Limit to prevent sitemap from being too large

        if (publicUsers) {
            // Get usernames and ENS names for prettier URLs
            const addresses = publicUsers.map((u) => u.wallet_address);
            const { data: usernames } = await supabase
                .from("shout_usernames")
                .select("wallet_address, username")
                .in("wallet_address", addresses);

            const { data: users } = await supabase
                .from("shout_users")
                .select("wallet_address, ens_name")
                .in("wallet_address", addresses);

            const usernameMap = new Map(
                usernames?.map((u) => [u.wallet_address, u.username]) || []
            );
            const ensMap = new Map(
                users?.map((u) => [u.wallet_address, u.ens_name]) || []
            );

            publicUsers.forEach((user) => {
                const username = usernameMap.get(user.wallet_address);
                const ensName = ensMap.get(user.wallet_address);
                const identifier = username || ensName || user.wallet_address;

                staticPages.push({
                    url: `${appBaseUrl}/user/${identifier}`,
                    lastModified: user.updated_at
                        ? new Date(user.updated_at)
                        : new Date(),
                    changeFrequency: "weekly",
                    priority: 0.7,
                });
            });
        }
    } catch (error) {
        console.error("[Sitemap] Error fetching public users:", error);
    }

    // Add public agents
    try {
        const { data: publicAgents } = await supabase
            .from("shout_agents")
            .select("id, updated_at")
            .eq("visibility", "public")
            .limit(1000);

        if (publicAgents) {
            publicAgents.forEach((agent) => {
                staticPages.push({
                    url: `${appBaseUrl}/agent/${agent.id}`,
                    lastModified: agent.updated_at
                        ? new Date(agent.updated_at)
                        : new Date(),
                    changeFrequency: "weekly",
                    priority: 0.6,
                });
            });
        }
    } catch (error) {
        console.error("[Sitemap] Error fetching public agents:", error);
    }

    return staticPages;
}

