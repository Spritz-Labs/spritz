"use client";

import { useState, useCallback, useEffect } from "react";

type PointsHistory = {
    id: string;
    points: number;
    reason: string;
    created_at: string;
};

type PointsState = {
    points: number;
    claimed: Record<string, boolean>;
    history: PointsHistory[];
    isLoading: boolean;
};

// Point values
export const POINT_VALUES = {
    PHONE_VERIFIED: 100,
    EMAIL_VERIFIED: 100,
    INVITE_REDEEMED: 100,
    FIVE_FRIENDS: 50,
    ENS_PRIMARY: 50,
    USERNAME_CLAIMED: 10,
    SOCIAL_ADDED: 10,
} as const;

export type PointAction = 
    | "phone_verified"
    | "email_verified"
    | "five_friends"
    | "username_claimed"
    | "social_added"
    | "ens_primary";

export function usePoints(walletAddress: string | null) {
    const [state, setState] = useState<PointsState>({
        points: 0,
        claimed: {},
        history: [],
        isLoading: true,
    });

    // Load points
    const loadPoints = useCallback(async () => {
        if (!walletAddress) {
            setState(prev => ({ ...prev, isLoading: false }));
            return;
        }

        try {
            const response = await fetch(`/api/points?address=${walletAddress}`, {
                credentials: "include", // Important for session cookie
            });
            const data = await response.json();

            setState({
                points: data.points || 0,
                claimed: data.claimed || {},
                history: data.history || [],
                isLoading: false,
            });
        } catch (err) {
            console.error("[Points] Load error:", err);
            setState(prev => ({ ...prev, isLoading: false }));
        }
    }, [walletAddress]);

    useEffect(() => {
        loadPoints();
    }, [loadPoints]);

    // Award points for an action
    const awardPoints = useCallback(async (action: PointAction) => {
        if (!walletAddress) return false;

        try {
            const response = await fetch("/api/points", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ walletAddress, action }),
                credentials: "include", // Important for session cookie
            });

            const data = await response.json();

            if (data.success) {
                // Reload points
                loadPoints();
                return true;
            }

            return false;
        } catch (err) {
            console.error("[Points] Award error:", err);
            return false;
        }
    }, [walletAddress, loadPoints]);

    // Check if an action has been claimed
    const hasClaimed = useCallback((action: string): boolean => {
        return state.claimed[action] === true;
    }, [state.claimed]);

    // Check and award points for 5 friends milestone
    const checkFriendsMilestone = useCallback(async (friendsCount: number) => {
        if (friendsCount >= 5 && !hasClaimed("five_friends")) {
            return awardPoints("five_friends");
        }
        return false;
    }, [hasClaimed, awardPoints]);

    return {
        ...state,
        awardPoints,
        hasClaimed,
        checkFriendsMilestone,
        refresh: loadPoints,
    };
}

