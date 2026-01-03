"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/config/supabase";

export type GroupInvitation = {
    id: string;
    groupId: string;
    groupName: string;
    inviterAddress: string;
    inviteeAddress: string;
    status: "pending" | "accepted" | "declined";
    createdAt: Date;
    // Group data needed for joining
    symmetricKey?: string;
    members?: string[];
};

export function useGroupInvitations(userAddress: string | null) {
    const [pendingInvitations, setPendingInvitations] = useState<
        GroupInvitation[]
    >([]);
    const [isLoading, setIsLoading] = useState(false);

    // Fetch pending invitations for the user
    const fetchInvitations = useCallback(async () => {
        if (!isSupabaseConfigured || !supabase || !userAddress) return;

        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from("shout_group_invitations")
                .select("*")
                .eq("invitee_address", userAddress.toLowerCase())
                .eq("status", "pending")
                .order("created_at", { ascending: false });

            if (error) {
                console.error("[GroupInvitations] Fetch error:", error);
                return;
            }

            if (data) {
                setPendingInvitations(
                    data.map((inv) => ({
                        id: inv.id,
                        groupId: inv.group_id,
                        groupName: inv.group_name,
                        inviterAddress: inv.inviter_address,
                        inviteeAddress: inv.invitee_address,
                        status: inv.status,
                        createdAt: new Date(inv.created_at),
                        // Include group data for joining
                        symmetricKey: inv.symmetric_key,
                        members: inv.members,
                    }))
                );
            }
        } catch (err) {
            console.error("[GroupInvitations] Error:", err);
        } finally {
            setIsLoading(false);
        }
    }, [userAddress]);

    // Send invitations when creating a group
    const sendInvitations = useCallback(
        async (
            groupId: string,
            groupName: string,
            inviteeAddresses: string[],
            symmetricKey?: string,
            members?: string[]
        ): Promise<boolean> => {
            if (!isSupabaseConfigured || !supabase || !userAddress)
                return false;

            try {
                const invitations = inviteeAddresses.map((address) => ({
                    group_id: groupId,
                    group_name: groupName,
                    inviter_address: userAddress.toLowerCase(),
                    invitee_address: address.toLowerCase(),
                    status: "pending",
                    // Include group data needed for joining
                    symmetric_key: symmetricKey,
                    members: members,
                }));

                const { error } = await supabase
                    .from("shout_group_invitations")
                    .upsert(invitations, {
                        onConflict: "group_id,invitee_address",
                    });

                if (error) {
                    console.error("[GroupInvitations] Send error:", error);
                    return false;
                }

                return true;
            } catch (err) {
                console.error("[GroupInvitations] Error:", err);
                return false;
            }
        },
        [userAddress]
    );

    // Accept an invitation
    const acceptInvitation = useCallback(
        async (
            invitationId: string
        ): Promise<{
            success: boolean;
            groupId?: string;
            groupName?: string;
            symmetricKey?: string;
            members?: string[];
            error?: string;
        }> => {
            if (!isSupabaseConfigured || !supabase || !userAddress) {
                return { success: false, error: "Not configured" };
            }

            try {
                // Get the invitation details
                const { data: invitation, error: fetchError } = await supabase
                    .from("shout_group_invitations")
                    .select("*")
                    .eq("id", invitationId)
                    .single();

                if (fetchError || !invitation) {
                    return { success: false, error: "Invitation not found" };
                }

                // Update the invitation status
                const { error: updateError } = await supabase
                    .from("shout_group_invitations")
                    .update({
                        status: "accepted",
                        responded_at: new Date().toISOString(),
                    })
                    .eq("id", invitationId);

                if (updateError) {
                    return {
                        success: false,
                        error: "Failed to accept invitation",
                    };
                }

                // Remove from pending list
                setPendingInvitations((prev) =>
                    prev.filter((inv) => inv.id !== invitationId)
                );

                return {
                    success: true,
                    groupId: invitation.group_id,
                    groupName: invitation.group_name,
                    symmetricKey: invitation.symmetric_key,
                    members: invitation.members,
                };
            } catch (err) {
                console.error("[GroupInvitations] Accept error:", err);
                return { success: false, error: "Failed to accept invitation" };
            }
        },
        [userAddress]
    );

    // Decline an invitation
    const declineInvitation = useCallback(
        async (invitationId: string): Promise<boolean> => {
            if (!isSupabaseConfigured || !supabase) return false;

            try {
                const { error } = await supabase
                    .from("shout_group_invitations")
                    .update({
                        status: "declined",
                        responded_at: new Date().toISOString(),
                    })
                    .eq("id", invitationId);

                if (error) {
                    console.error("[GroupInvitations] Decline error:", error);
                    return false;
                }

                // Remove from pending list
                setPendingInvitations((prev) =>
                    prev.filter((inv) => inv.id !== invitationId)
                );

                return true;
            } catch (err) {
                console.error("[GroupInvitations] Error:", err);
                return false;
            }
        },
        []
    );

    // Fetch invitations on mount and poll periodically
    useEffect(() => {
        if (!userAddress) return;

        fetchInvitations();

        // Poll every 10 seconds for new invitations
        const interval = setInterval(fetchInvitations, 10000);

        return () => clearInterval(interval);
    }, [userAddress, fetchInvitations]);

    return {
        pendingInvitations,
        isLoading,
        fetchInvitations,
        sendInvitations,
        acceptInvitation,
        declineInvitation,
    };
}





