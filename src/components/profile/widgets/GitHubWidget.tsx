"use client";

import { useState, useEffect } from "react";
import { GitHubWidgetConfig, WidgetSize } from "../ProfileWidgetTypes";

interface GitHubWidgetProps {
    config: GitHubWidgetConfig;
    size: WidgetSize;
}

type GitHubProfile = {
    name: string;
    login: string;
    avatar_url: string;
    bio: string | null;
    public_repos: number;
    followers: number;
    following: number;
};

export function GitHubWidget({ config, size }: GitHubWidgetProps) {
    const { username, type = 'contributions', showStats = false } = config;
    const [profile, setProfile] = useState<GitHubProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const isCompact = size === '2x1' || size === '1x1';
    const isWide = size === '4x1' || size === '4x2';
    
    useEffect(() => {
        const fetchProfile = async () => {
            if (!username) {
                setLoading(false);
                setError("No username configured");
                return;
            }
            
            try {
                const response = await fetch(`https://api.github.com/users/${username}`);
                if (!response.ok) throw new Error('User not found');
                
                const data = await response.json();
                setProfile(data);
                setError(null);
            } catch (err) {
                console.error('[GitHub Widget] Error:', err);
                setError('Failed to load profile');
            } finally {
                setLoading(false);
            }
        };
        
        fetchProfile();
    }, [username]);
    
    const githubUrl = `https://github.com/${username}`;
    
    // Contribution graph using GitHub's unofficial chart API
    const contributionImageUrl = `https://ghchart.rshah.org/${username}`;
    
    if (loading) {
        return (
            <div className="w-full h-full flex items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-800">
                <div className="w-6 h-6 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }
    
    if (error || !profile) {
        return (
            <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-full flex flex-col items-center justify-center p-4 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors"
            >
                <span className="text-3xl mb-2">⌘</span>
                <p className="text-white font-medium">{username || 'GitHub'}</p>
                <p className="text-zinc-500 text-xs">{error || 'View profile'}</p>
            </a>
        );
    }
    
    // Contributions view (default)
    if (type === 'contributions') {
        return (
            <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full h-full p-4 sm:p-5 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all group overflow-hidden"
            >
                <div className="flex items-center gap-3 mb-3">
                    <img
                        src={profile.avatar_url}
                        alt={profile.name || username}
                        className="w-10 h-10 rounded-full"
                    />
                    <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate">{profile.name || username}</p>
                        <p className="text-zinc-500 text-sm">@{profile.login}</p>
                    </div>
                    <svg className="w-5 h-5 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                    </svg>
                </div>
                
                {/* Contribution graph */}
                {!isCompact && (
                    <div className="overflow-hidden rounded-lg">
                        <img
                            src={contributionImageUrl}
                            alt="GitHub Contributions"
                            className="w-full h-auto opacity-80 group-hover:opacity-100 transition-opacity"
                            style={{ imageRendering: 'pixelated' }}
                        />
                    </div>
                )}
                
                {/* Stats */}
                {showStats && !isCompact && (
                    <div className="flex justify-around mt-3 pt-3 border-t border-zinc-800">
                        <div className="text-center">
                            <p className="text-white font-bold">{profile.public_repos}</p>
                            <p className="text-zinc-500 text-xs">Repos</p>
                        </div>
                        <div className="text-center">
                            <p className="text-white font-bold">{profile.followers}</p>
                            <p className="text-zinc-500 text-xs">Followers</p>
                        </div>
                        <div className="text-center">
                            <p className="text-white font-bold">{profile.following}</p>
                            <p className="text-zinc-500 text-xs">Following</p>
                        </div>
                    </div>
                )}
            </a>
        );
    }
    
    // Profile view
    return (
        <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center justify-center w-full h-full p-4 sm:p-5 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all group"
        >
            <img
                src={profile.avatar_url}
                alt={profile.name || username}
                className="w-16 h-16 rounded-full mb-3 group-hover:scale-110 transition-transform"
            />
            <p className="text-white font-semibold">{profile.name || username}</p>
            <p className="text-zinc-500 text-sm">@{profile.login}</p>
            
            {profile.bio && !isCompact && (
                <p className="text-zinc-400 text-sm text-center mt-2 line-clamp-2">{profile.bio}</p>
            )}
            
            {showStats && (
                <div className="flex gap-4 mt-3 text-center">
                    <div>
                        <p className="text-white font-bold text-sm">{profile.public_repos}</p>
                        <p className="text-zinc-500 text-xs">repos</p>
                    </div>
                    <div>
                        <p className="text-white font-bold text-sm">{profile.followers}</p>
                        <p className="text-zinc-500 text-xs">followers</p>
                    </div>
                </div>
            )}
        </a>
    );
}
