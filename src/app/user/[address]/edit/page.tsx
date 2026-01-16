"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ProfileGridEditor } from "@/components/profile/ProfileGridEditor";
import { BaseWidget, ProfileTheme, DEFAULT_THEMES, WidgetSize } from "@/components/profile/ProfileWidgetTypes";

type ProfileData = {
    address: string;
    scheduling?: { slug: string; title?: string; bio?: string } | null;
    socials?: Array<{ platform: string; handle: string; url: string }>;
    agents?: Array<{ id: string; name: string; avatar_emoji?: string; avatar_url?: string }>;
};

// Generate default widgets from profile data (mirrors the public profile default view)
function generateDefaultWidgets(profileData: ProfileData): BaseWidget[] {
    const widgets: BaseWidget[] = [];
    let position = 0;

    // 1. Message Me widget (always show)
    widgets.push({
        id: `default-message-${Date.now()}`,
        widget_type: 'message_me',
        size: '2x1' as WidgetSize,
        position: position++,
        is_visible: true,
        config: {
            address: profileData.address,
            title: 'Message me',
            subtitle: 'Chat on Spritz',
        },
    });

    // 2. Wallet widget (always show)
    widgets.push({
        id: `default-wallet-${Date.now() + 1}`,
        widget_type: 'wallet',
        size: '2x1' as WidgetSize,
        position: position++,
        is_visible: true,
        config: {
            address: profileData.address,
            label: 'Wallet',
            copyEnabled: true,
        },
    });

    // 3. Schedule widget (if scheduling is enabled)
    if (profileData.scheduling?.slug) {
        widgets.push({
            id: `default-schedule-${Date.now() + 2}`,
            widget_type: 'schedule',
            size: '2x1' as WidgetSize,
            position: position++,
            is_visible: true,
            config: {
                slug: profileData.scheduling.slug,
                title: profileData.scheduling.title || 'Book a call',
                subtitle: profileData.scheduling.bio || 'Schedule a meeting',
            },
        });
    }

    // 4. Social Link widgets
    if (profileData.socials && profileData.socials.length > 0) {
        profileData.socials.forEach((social, index) => {
            widgets.push({
                id: `default-social-${Date.now() + 3 + index}`,
                widget_type: 'social_link',
                size: '1x1' as WidgetSize,
                position: position++,
                is_visible: true,
                config: {
                    platform: social.platform.toLowerCase(),
                    handle: social.handle,
                    url: social.url,
                },
            });
        });
    }

    // 5. Agent widgets
    if (profileData.agents && profileData.agents.length > 0) {
        profileData.agents.forEach((agent, index) => {
            widgets.push({
                id: `default-agent-${Date.now() + 100 + index}`,
                widget_type: 'agent',
                size: '1x1' as WidgetSize,
                position: position++,
                is_visible: true,
                config: {
                    agentId: agent.id,
                    name: agent.name,
                    avatarEmoji: agent.avatar_emoji || '🤖',
                    avatarUrl: agent.avatar_url || '',
                },
            });
        });
    }

    return widgets;
}

export default function EditProfilePage() {
    const params = useParams();
    const address = params.address as string;
    
    const [widgets, setWidgets] = useState<BaseWidget[]>([]);
    const [theme, setTheme] = useState<ProfileTheme | null>(null);
    const [profileData, setProfileData] = useState<ProfileData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Fetch profile data and verify authorization
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            setError(null);

            try {
                // First check if user is authorized
                const sessionRes = await fetch('/api/auth/session', { credentials: 'include' });
                if (!sessionRes.ok) {
                    setError("Please sign in to edit your profile");
                    setIsAuthorized(false);
                    setIsLoading(false);
                    return;
                }
                
                const sessionData = await sessionRes.json();
                const sessionAddress = sessionData?.session?.userAddress || sessionData?.user?.wallet_address;
                
                if (!sessionAddress || sessionAddress.toLowerCase() !== address.toLowerCase()) {
                    setError("You can only edit your own profile");
                    setIsAuthorized(false);
                    setIsLoading(false);
                    return;
                }
                
                setIsAuthorized(true);

                // Fetch profile data, widgets, and theme in parallel
                const [profileRes, widgetsRes] = await Promise.all([
                    fetch(`/api/public/user/${address}`),
                    fetch(`/api/profile/widgets`, { credentials: 'include' }),
                ]);

                // Profile data for pre-filling configs
                let fetchedProfileData: ProfileData = { address };
                if (profileRes.ok) {
                    const profile = await profileRes.json();
                    fetchedProfileData = {
                        address: profile.user.address,
                        scheduling: profile.scheduling,
                        socials: profile.socials,
                        agents: profile.agents,
                    };
                    setProfileData(fetchedProfileData);
                } else {
                    // User may not have a public profile yet, but that's ok
                    setProfileData(fetchedProfileData);
                }

                // Widgets and theme
                if (widgetsRes.ok) {
                    const data = await widgetsRes.json();
                    const savedWidgets = data.widgets || [];
                    
                    // If no saved widgets, generate default widgets from profile data
                    if (savedWidgets.length === 0) {
                        const defaultWidgets = generateDefaultWidgets(fetchedProfileData);
                        setWidgets(defaultWidgets);
                    } else {
                        setWidgets(savedWidgets);
                    }
                    
                    setTheme(data.theme || null);
                } else {
                    // Even if widgets API fails, show defaults
                    const defaultWidgets = generateDefaultWidgets(fetchedProfileData);
                    setWidgets(defaultWidgets);
                }
            } catch (err) {
                console.error("[Edit Profile] Error:", err);
                setError("Failed to load profile data");
            } finally {
                setIsLoading(false);
            }
        };

        if (address) {
            fetchData();
        }
    }, [address]);

    // Track unsaved changes
    const handleWidgetsChange = useCallback((newWidgets: BaseWidget[]) => {
        setWidgets(newWidgets);
        setHasUnsavedChanges(true);
    }, []);

    const handleThemeChange = useCallback((themeUpdate: Partial<ProfileTheme>) => {
        setTheme(prev => ({
            ...(prev || DEFAULT_THEMES.dark as ProfileTheme),
            ...themeUpdate,
        } as ProfileTheme));
        setHasUnsavedChanges(true);
    }, []);

    // Helper to check if widget ID is a temporary/local ID (not saved to DB yet)
    const isLocalWidgetId = (id: string) => {
        return id.startsWith('temp-') || id.startsWith('widget-') || id.startsWith('default-');
    };

    // Save all changes
    const handleSave = async () => {
        setIsSaving(true);

        try {
            // First, get current saved widgets to know which to delete
            const currentRes = await fetch('/api/profile/widgets', { credentials: 'include' });
            const currentData = currentRes.ok ? await currentRes.json() : { widgets: [] };
            const savedWidgetIds = new Set<string>((currentData.widgets || []).map((w: BaseWidget) => w.id));
            
            // Find widgets to delete (saved ones that are no longer in our list)
            const currentWidgetIds = new Set<string>(widgets.filter(w => !isLocalWidgetId(w.id)).map(w => w.id));
            const widgetsToDelete = [...savedWidgetIds].filter(id => !currentWidgetIds.has(id));
            
            // Delete removed widgets
            await Promise.all(widgetsToDelete.map(id => 
                fetch(`/api/profile/widgets?id=${id}`, {
                    method: 'DELETE',
                    credentials: 'include',
                })
            ));

            // Save widgets - determine which are new vs existing
            const widgetsToSave = widgets.map((w, index) => ({
                id: isLocalWidgetId(w.id) ? undefined : w.id,
                widget_type: w.widget_type,
                size: w.size,
                position: index,
                config: w.config,
                is_visible: w.is_visible !== false, // Default to true
            }));

            // Batch upsert widgets
            const widgetPromises = widgetsToSave.map(async (w, index) => {
                if (w.id) {
                    // Update existing
                    return fetch('/api/profile/widgets', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                            widgets: [{
                                id: w.id,
                                position: index,
                                size: w.size,
                                config: w.config,
                                is_visible: w.is_visible,
                            }],
                        }),
                    });
                } else {
                    // Create new
                    return fetch('/api/profile/widgets', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                            widget_type: w.widget_type,
                            size: w.size,
                            position: index,
                            config: w.config,
                        }),
                    });
                }
            });

            await Promise.all(widgetPromises);

            // Save theme
            if (theme) {
                await fetch('/api/profile/theme', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(theme),
                });
            }

            setHasUnsavedChanges(false);
            
            // Refetch to get server-generated IDs
            const widgetsRes = await fetch('/api/profile/widgets', { credentials: 'include' });
            if (widgetsRes.ok) {
                const data = await widgetsRes.json();
                setWidgets(data.widgets || []);
            }
        } catch (err) {
            console.error("[Edit Profile] Save error:", err);
            alert("Failed to save changes. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    // Warn about unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedChanges]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !isAuthorized) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <div className="text-center max-w-md">
                    <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center mx-auto mb-6">
                        <span className="text-4xl">🔒</span>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-4">
                        {error || "Not Authorized"}
                    </h1>
                    <div className="flex gap-3 justify-center">
                        <Link
                            href={`/user/${address}`}
                            className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors"
                        >
                            View Profile
                        </Link>
                        <Link
                            href="/"
                            className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-colors"
                        >
                            Go Home
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <ProfileGridEditor
            widgets={widgets}
            theme={theme}
            onWidgetsChange={handleWidgetsChange}
            onThemeChange={handleThemeChange}
            onSave={handleSave}
            isSaving={isSaving}
            profileData={profileData || undefined}
            backUrl={`/user/${address}`}
        />
    );
}
