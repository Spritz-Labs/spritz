"use client";

import { useState, useCallback, useEffect } from "react";

type UserInvite = {
    id: string;
    code: string;
    used_by: string | null;
    used_at: string | null;
    is_active: boolean;
    created_at: string;
};

type InvitesState = {
    invites: UserInvite[];
    totalAllocation: number;
    used: number;
    available: number;
    isLoading: boolean;
    error: string | null;
};

export function useUserInvites(walletAddress: string | null) {
    const [state, setState] = useState<InvitesState>({
        invites: [],
        totalAllocation: 5,
        used: 0,
        available: 0,
        isLoading: true,
        error: null,
    });

    // Load invites
    const loadInvites = useCallback(async () => {
        if (!walletAddress) {
            setState(prev => ({ ...prev, isLoading: false }));
            return;
        }

        try {
            const response = await fetch(`/api/invites?address=${walletAddress}`);
            const data = await response.json();

            if (!response.ok) {
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    error: data.error || "Failed to load invites",
                }));
                return;
            }

            setState({
                invites: data.invites || [],
                totalAllocation: data.totalAllocation || 5,
                used: data.used || 0,
                available: data.available || 0,
                isLoading: false,
                error: null,
            });
        } catch (err) {
            console.error("[Invites] Load error:", err);
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: "Failed to load invites",
            }));
        }
    }, [walletAddress]);

    useEffect(() => {
        loadInvites();
    }, [loadInvites]);

    // Generate invite link
    const getInviteLink = useCallback((code: string) => {
        return `https://app.spritz.chat?invite=${code}`;
    }, []);

    // Generate invite message with blurb
    const getInviteMessage = useCallback((code: string) => {
        return `🚀 You're invited to Spritz - the censorship resistant chat app for Web3!\n\n${getInviteLink(code)}`;
    }, [getInviteLink]);

    // Copy invite to clipboard (with blurb)
    const copyInvite = useCallback(async (code: string): Promise<boolean> => {
        try {
            await navigator.clipboard.writeText(getInviteMessage(code));
            return true;
        } catch (err) {
            console.error("[Invites] Copy error:", err);
            return false;
        }
    }, [getInviteMessage]);

    // Share invite (mobile)
    const shareInvite = useCallback(async (code: string): Promise<boolean> => {
        const shareData = {
            title: "Join Spritz",
            text: "🚀 You're invited to Spritz - the censorship resistant chat app for Web3!",
            url: getInviteLink(code),
        };

        try {
            if (navigator.share) {
                await navigator.share(shareData);
                return true;
            } else {
                return copyInvite(code);
            }
        } catch (err) {
            // User cancelled or error
            return false;
        }
    }, [getInviteLink, copyInvite]);

    return {
        ...state,
        refresh: loadInvites,
        getInviteLink,
        copyInvite,
        shareInvite,
    };
}

