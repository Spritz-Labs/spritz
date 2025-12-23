"use client";

import { useState, useCallback, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "@/config/supabase";

export type CallSignal = {
    id: string;
    caller_address: string;
    callee_address: string;
    channel_name: string;
    call_type: "audio" | "video";
    status: "ringing" | "accepted" | "rejected" | "ended" | "missed";
    created_at: string;
};

export function useCallSignaling(userAddress: string | null) {
    const [incomingCall, setIncomingCall] = useState<CallSignal | null>(null);
    const [outgoingCall, setOutgoingCall] = useState<CallSignal | null>(null);
    const [activeCallId, setActiveCallId] = useState<string | null>(null);
    const [remoteHangup, setRemoteHangup] = useState(false); // True when other party ended the call

    // Listen for incoming calls
    useEffect(() => {
        if (!userAddress || !isSupabaseConfigured || !supabase) return;

        const normalizedAddress = userAddress.toLowerCase();

        // Check for existing ringing calls
        const checkExistingCalls = async () => {
            if (!supabase) return;
            console.log("[CallSignaling] Checking for existing calls...");
            const { data } = await supabase
                .from("shout_calls")
                .select("*")
                .eq("callee_address", normalizedAddress)
                .eq("status", "ringing")
                .order("created_at", { ascending: false })
                .limit(1);

            if (data && data.length > 0) {
                console.log("[CallSignaling] Found ringing call:", data[0]);
                setIncomingCall(data[0]);
            }
        };

        // Check on mount
        checkExistingCalls();

        // Also check when app comes to foreground (e.g., from push notification)
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                console.log(
                    "[CallSignaling] App became visible, checking for calls..."
                );
                checkExistingCalls();
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);

        // Also check on focus (backup for iOS PWA)
        const handleFocus = () => {
            console.log("[CallSignaling] App focused, checking for calls...");
            checkExistingCalls();
        };

        window.addEventListener("focus", handleFocus);

        // Subscribe to new incoming calls
        const channel = supabase
            .channel("incoming_calls")
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "shout_calls",
                    filter: `callee_address=eq.${normalizedAddress}`,
                },
                (payload) => {
                    console.log(
                        "[CallSignaling] New incoming call:",
                        payload.new
                    );
                    setIncomingCall(payload.new as CallSignal);
                }
            )
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "shout_calls",
                    filter: `callee_address=eq.${normalizedAddress}`,
                },
                (payload) => {
                    const updated = payload.new as CallSignal;
                    console.log(
                        "[CallSignaling] Call updated (as callee):",
                        updated
                    );
                    if (updated.status !== "ringing") {
                        setIncomingCall(null);
                    }
                    // If the call we're in was ended by the caller
                    if (updated.status === "ended") {
                        console.log("[CallSignaling] Call ended by caller!");
                        setActiveCallId(null);
                        setRemoteHangup(true);
                    }
                }
            )
            // Also listen for updates to outgoing calls (when callee accepts/rejects/ends)
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "shout_calls",
                    filter: `caller_address=eq.${normalizedAddress}`,
                },
                (payload) => {
                    const updated = payload.new as CallSignal;
                    console.log(
                        "[CallSignaling] Outgoing call updated:",
                        updated
                    );
                    if (updated.status === "accepted") {
                        // Callee accepted - track the active call
                        setOutgoingCall(null);
                        setActiveCallId(updated.id);
                    } else if (
                        updated.status === "rejected" ||
                        updated.status === "ended"
                    ) {
                        // Call ended/rejected by the other party
                        console.log(
                            "[CallSignaling] Call ended/rejected by callee!"
                        );
                        setOutgoingCall(null);
                        setActiveCallId(null);
                        setRemoteHangup(true);
                    }
                }
            )
            .subscribe();

        return () => {
            if (supabase) supabase.removeChannel(channel);
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange
            );
            window.removeEventListener("focus", handleFocus);
        };
    }, [userAddress]);

    // Start a call (create signaling record)
    const startCall = useCallback(
        async (
            calleeAddress: string,
            channelName: string,
            callerName?: string,
            callType: "audio" | "video" = "audio"
        ): Promise<CallSignal | null> => {
            if (!userAddress || !isSupabaseConfigured || !supabase) {
                console.error("[CallSignaling] Not configured");
                return null;
            }

            const normalizedCaller = userAddress.toLowerCase();
            const normalizedCallee = calleeAddress.toLowerCase();

            console.log("[CallSignaling] Starting call:", {
                normalizedCaller,
                normalizedCallee,
                channelName,
                callType,
            });

            // Clean up any existing calls first
            await supabase
                .from("shout_calls")
                .delete()
                .or(
                    `caller_address.eq.${normalizedCaller},callee_address.eq.${normalizedCaller}`
                )
                .in("status", ["ringing", "accepted"]);

            // Create new call record
            const { data, error } = await supabase
                .from("shout_calls")
                .insert({
                    caller_address: normalizedCaller,
                    callee_address: normalizedCallee,
                    channel_name: channelName,
                    call_type: callType,
                    status: "ringing",
                })
                .select()
                .single();

            if (error) {
                console.error("[CallSignaling] Failed to start call:", {
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                    code: error.code,
                });
                return null;
            }

            console.log("[CallSignaling] Call created:", data);
            setOutgoingCall(data);

            // Send push notification to callee (fire and forget)
            try {
                fetch("/api/push/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        targetAddress: normalizedCallee,
                        title: "Incoming Call",
                        body: `${callerName || "Someone"} is calling you`,
                        type: "incoming_call",
                        callerId: normalizedCaller,
                        callerName: callerName || normalizedCaller,
                        url: "/",
                    }),
                }).catch((err) => {
                    console.log(
                        "[CallSignaling] Push notification failed (user may not be subscribed):",
                        err
                    );
                });
            } catch {
                // Ignore push errors - user may not be subscribed
            }

            return data;
        },
        [userAddress]
    );

    // Accept incoming call - returns { channelName, callType } or null
    const acceptCall = useCallback(async (): Promise<{
        channelName: string;
        callType: "audio" | "video";
    } | null> => {
        if (!incomingCall || !supabase) return null;

        console.log(
            "[CallSignaling] Accepting call:",
            incomingCall.id,
            "type:",
            incomingCall.call_type
        );

        const { error } = await supabase
            .from("shout_calls")
            .update({
                status: "accepted",
                updated_at: new Date().toISOString(),
            })
            .eq("id", incomingCall.id);

        if (error) {
            console.error("[CallSignaling] Failed to accept call:", error);
            return null;
        }

        const channelName = incomingCall.channel_name;
        const callType = incomingCall.call_type || "audio";
        const callId = incomingCall.id;
        setIncomingCall(null);
        setActiveCallId(callId); // Track the active call
        return { channelName, callType };
    }, [incomingCall]);

    // Reject incoming call
    const rejectCall = useCallback(async () => {
        if (!incomingCall || !supabase) return;

        console.log("[CallSignaling] Rejecting call:", incomingCall.id);

        await supabase
            .from("shout_calls")
            .update({
                status: "rejected",
                updated_at: new Date().toISOString(),
            })
            .eq("id", incomingCall.id);

        setIncomingCall(null);
    }, [incomingCall]);

    // End call (for both caller and callee)
    const endCall = useCallback(async () => {
        if (!supabase || !userAddress) return;

        const normalizedAddress = userAddress.toLowerCase();

        console.log("[CallSignaling] Ending call for:", normalizedAddress);

        // Update any active calls involving this user
        await supabase
            .from("shout_calls")
            .update({ status: "ended", updated_at: new Date().toISOString() })
            .or(
                `caller_address.eq.${normalizedAddress},callee_address.eq.${normalizedAddress}`
            )
            .in("status", ["ringing", "accepted"]);

        setIncomingCall(null);
        setOutgoingCall(null);
        setActiveCallId(null);
    }, [userAddress]);

    // Cancel outgoing call
    const cancelCall = useCallback(async () => {
        if (!outgoingCall || !supabase) return;

        console.log("[CallSignaling] Cancelling call:", outgoingCall.id);

        await supabase
            .from("shout_calls")
            .update({ status: "ended", updated_at: new Date().toISOString() })
            .eq("id", outgoingCall.id);

        setOutgoingCall(null);
    }, [outgoingCall]);

    // Clear the remote hangup flag (call this after handling it)
    const clearRemoteHangup = useCallback(() => {
        setRemoteHangup(false);
    }, []);

    return {
        incomingCall,
        outgoingCall,
        activeCallId,
        remoteHangup,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        cancelCall,
        clearRemoteHangup,
        isConfigured: isSupabaseConfigured,
    };
}
