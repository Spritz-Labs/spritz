import { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http } from "viem";
import { normalize } from "viem/ens";
import { mainnet } from "viem/chains";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

import { getRpcUrl } from "@/lib/rpc";

const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(getRpcUrl(1)),
});

export async function generateMetadata({
    params,
}: {
    params: Promise<{ address: string }>;
}): Promise<Metadata> {
    const { address } = await params;
    let normalizedAddress: string | null = null;
    let displayName: string | null = null;

    // Resolve address from username/ENS
    if (address.toLowerCase().startsWith("0x")) {
        normalizedAddress = address.toLowerCase();
    } else {
        const { data: usernameData } = await supabase
            .from("shout_usernames")
            .select("wallet_address")
            .eq("username", address.toLowerCase())
            .maybeSingle();

        if (usernameData) {
            normalizedAddress = usernameData.wallet_address.toLowerCase();
            displayName = address;
        } else {
            const normalizedEns = address.toLowerCase().endsWith(".eth")
                ? address.toLowerCase()
                : `${address.toLowerCase()}.eth`;

            const { data: userData } = await supabase
                .from("shout_users")
                .select("wallet_address")
                .or(`ens_name.eq.${address.toLowerCase()},ens_name.eq.${normalizedEns}`)
                .maybeSingle();

            if (userData) {
                normalizedAddress = userData.wallet_address.toLowerCase();
                displayName = address;
            } else {
                try {
                    const resolvedAddress = await publicClient.getEnsAddress({
                        name: normalize(normalizedEns),
                    });
                    if (resolvedAddress) {
                        normalizedAddress = resolvedAddress.toLowerCase();
                        displayName = address;
                    }
                } catch {
                    // Will return default metadata
                }
            }
        }
    }

    if (!normalizedAddress) {
        return {
            title: "Profile Not Found | Spritz",
            description: "This user profile is not available.",
            robots: {
                index: false,
                follow: false,
            },
        };
    }

    // Check if public profile is enabled
    const { data: settings } = await supabase
        .from("shout_user_settings")
        .select("public_landing_enabled")
        .eq("wallet_address", normalizedAddress)
        .single();

    if (!settings?.public_landing_enabled) {
        return {
            title: "Profile Not Available | Spritz",
            description: "This user has not enabled a public profile.",
            robots: {
                index: false,
                follow: false,
            },
        };
    }

    // Fetch user data
    const { data: user } = await supabase
        .from("shout_users")
        .select("display_name, ens_name, avatar_url")
        .eq("wallet_address", normalizedAddress)
        .single();

    const { data: usernameData } = await supabase
        .from("shout_usernames")
        .select("username")
        .eq("wallet_address", normalizedAddress)
        .maybeSingle();

    const name = user?.display_name || usernameData?.username || user?.ens_name || displayName || "User";
    const description = `View ${name}'s public profile on Spritz. Connect, schedule calls, and explore their AI agents.`;

    return {
        title: `${name} | Spritz Profile`,
        description,
        openGraph: {
            title: `${name} | Spritz Profile`,
            description,
            url: `https://app.spritz.chat/user/${address}`,
            type: "profile",
            images: user?.avatar_url
                ? [
                      {
                          url: user.avatar_url,
                          width: 1200,
                          height: 630,
                          alt: `${name}'s profile`,
                      },
                  ]
                : [
                      {
                          url: "/og-image.png",
                          width: 1200,
                          height: 630,
                          alt: `${name} on Spritz`,
                      },
                  ],
        },
        twitter: {
            card: "summary_large_image",
            title: `${name} | Spritz Profile`,
            description,
            images: user?.avatar_url ? [user.avatar_url] : ["/og-image.png"],
        },
        robots: {
            index: true,
            follow: true,
        },
        alternates: {
            canonical: `https://app.spritz.chat/user/${address}`,
        },
    };
}

export default function UserProfileLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}

