"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ProfileWidgetEditor } from "@/components/profile/ProfileWidgetEditor";
import { BaseWidget, ProfileTheme } from "@/components/profile/ProfileWidgetTypes";

export default function EditProfilePage() {
    const params = useParams();
    const router = useRouter();
    const address = params.address as string;
    
    const [widgets, setWidgets] = useState<BaseWidget[]>([]);
    const [theme, setTheme] = useState<ProfileTheme | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState(false);

    // Check authorization and fetch data
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            setError(null);

            try {
                // First check if user is authorized (fetch their own widgets)
                const res = await fetch('/api/profile/widgets', {
                    credentials: 'include',
                });

                if (!res.ok) {
                    if (res.status === 401) {
                        setError("Please sign in to edit your profile");
                        return;
                    }
                    throw new Error("Failed to load profile");
                }

                const data = await res.json();
                
                // Check if the logged-in user matches the profile being edited
                // The API returns widgets for the authenticated user
                setWidgets(data.widgets || []);
                setTheme(data.theme || null);
                setIsAuthorized(true);
            } catch (err) {
                console.error("[Edit Profile] Error:", err);
                setError("Failed to load profile data");
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [address]);

    // Save all changes
    const handleSave = useCallback(async () => {
        setIsSaving(true);
        setError(null);

        try {
            // Save widgets (bulk update)
            if (widgets.length > 0) {
                const widgetsToSave = widgets.map((w, i) => ({
                    id: w.id,
                    position: i,
                    size: w.size,
                    config: w.config,
                    is_visible: w.is_visible,
                }));

                // For new widgets (temp IDs), create them
                const newWidgets = widgets.filter(w => w.id.startsWith('widget-') || w.id.startsWith('temp-'));
                const existingWidgets = widgets.filter(w => !w.id.startsWith('widget-') && !w.id.startsWith('temp-'));

                // Create new widgets
                for (const widget of newWidgets) {
                    await fetch('/api/profile/widgets', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                            widget_type: widget.widget_type,
                            size: widget.size,
                            position: widget.position,
                            config: widget.config,
                        }),
                    });
                }

                // Update existing widgets
                if (existingWidgets.length > 0) {
                    await fetch('/api/profile/widgets', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                            widgets: existingWidgets.map((w, i) => ({
                                id: w.id,
                                position: i,
                                size: w.size,
                                config: w.config,
                                is_visible: w.is_visible,
                            })),
                        }),
                    });
                }
            }

            // Save theme
            if (theme) {
                await fetch('/api/profile/theme', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(theme),
                });
            }

            // Redirect back to profile
            router.push(`/user/${address}`);
        } catch (err) {
            console.error("[Edit Profile] Save error:", err);
            setError("Failed to save changes");
        } finally {
            setIsSaving(false);
        }
    }, [widgets, theme, address, router]);

    // Handle widget deletion
    const handleWidgetsChange = useCallback(async (newWidgets: BaseWidget[]) => {
        // Check if any widgets were removed
        const removedWidgets = widgets.filter(
            w => !newWidgets.find(nw => nw.id === w.id) && !w.id.startsWith('temp-') && !w.id.startsWith('widget-')
        );

        // Delete removed widgets from server
        for (const widget of removedWidgets) {
            try {
                await fetch(`/api/profile/widgets?id=${widget.id}`, {
                    method: 'DELETE',
                    credentials: 'include',
                });
            } catch (err) {
                console.error("[Edit Profile] Failed to delete widget:", err);
            }
        }

        setWidgets(newWidgets);
    }, [widgets]);

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
                <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/20 flex items-center justify-center">
                        <span className="text-3xl">🔒</span>
                    </div>
                    <h1 className="text-xl font-bold text-white mb-2">Access Denied</h1>
                    <p className="text-zinc-400 mb-6">{error || "You can only edit your own profile"}</p>
                    <button
                        onClick={() => router.back()}
                        className="px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    return (
        <ProfileWidgetEditor
            widgets={widgets}
            theme={theme}
            onWidgetsChange={handleWidgetsChange}
            onThemeChange={(updates) => setTheme(prev => prev ? { ...prev, ...updates } : updates as ProfileTheme)}
            onSave={handleSave}
            isSaving={isSaving}
        />
    );
}
