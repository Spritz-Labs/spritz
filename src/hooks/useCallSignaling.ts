"use client";

import { useState, useCallback, useEffect } from "react";
import { type Address } from "viem";
import { supabase, isSupabaseConfigured } from "@/config/supabase";

export type CallSignal = {
  id: string;
  caller_address: string;
  callee_address: string;
  channel_name: string;
  status: "ringing" | "accepted" | "rejected" | "ended" | "missed";
  created_at: string;
};

export function useCallSignaling(userAddress: Address | null) {
  const [incomingCall, setIncomingCall] = useState<CallSignal | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<CallSignal | null>(null);

  // Listen for incoming calls
  useEffect(() => {
    if (!userAddress || !isSupabaseConfigured || !supabase) return;

    const normalizedAddress = userAddress.toLowerCase();

    // Check for existing ringing calls on mount
    const checkExistingCalls = async () => {
      if (!supabase) return;
      const { data } = await supabase
        .from("shout_calls")
        .select("*")
        .eq("callee_address", normalizedAddress)
        .eq("status", "ringing")
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        setIncomingCall(data[0]);
      }
    };

    checkExistingCalls();

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
          console.log("[CallSignaling] New incoming call:", payload.new);
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
          console.log("[CallSignaling] Call updated:", updated);
          if (updated.status !== "ringing") {
            setIncomingCall(null);
          }
        }
      )
      // Also listen for updates to outgoing calls (when callee accepts/rejects)
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
          console.log("[CallSignaling] Outgoing call updated:", updated);
          if (updated.status === "accepted") {
            // Callee accepted - we're already in the call
            setOutgoingCall(null);
          } else if (updated.status === "rejected" || updated.status === "ended") {
            setOutgoingCall(null);
          }
        }
      )
      .subscribe();

    return () => {
      if (supabase) supabase.removeChannel(channel);
    };
  }, [userAddress]);

  // Start a call (create signaling record)
  const startCall = useCallback(
    async (calleeAddress: string, channelName: string): Promise<CallSignal | null> => {
      if (!userAddress || !isSupabaseConfigured || !supabase) {
        console.error("[CallSignaling] Not configured");
        return null;
      }

      const normalizedCaller = userAddress.toLowerCase();
      const normalizedCallee = calleeAddress.toLowerCase();

      console.log("[CallSignaling] Starting call:", { normalizedCaller, normalizedCallee, channelName });

      // Clean up any existing calls first
      await supabase
        .from("shout_calls")
        .delete()
        .or(`caller_address.eq.${normalizedCaller},callee_address.eq.${normalizedCaller}`)
        .in("status", ["ringing", "accepted"]);

      // Create new call record
      const { data, error } = await supabase
        .from("shout_calls")
        .insert({
          caller_address: normalizedCaller,
          callee_address: normalizedCallee,
          channel_name: channelName,
          status: "ringing",
        })
        .select()
        .single();

      if (error) {
        console.error("[CallSignaling] Failed to start call:", error);
        return null;
      }

      console.log("[CallSignaling] Call created:", data);
      setOutgoingCall(data);
      return data;
    },
    [userAddress]
  );

  // Accept incoming call
  const acceptCall = useCallback(async (): Promise<string | null> => {
    if (!incomingCall || !supabase) return null;

    console.log("[CallSignaling] Accepting call:", incomingCall.id);

    const { error } = await supabase
      .from("shout_calls")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", incomingCall.id);

    if (error) {
      console.error("[CallSignaling] Failed to accept call:", error);
      return null;
    }

    const channelName = incomingCall.channel_name;
    setIncomingCall(null);
    return channelName;
  }, [incomingCall]);

  // Reject incoming call
  const rejectCall = useCallback(async () => {
    if (!incomingCall || !supabase) return;

    console.log("[CallSignaling] Rejecting call:", incomingCall.id);

    await supabase
      .from("shout_calls")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
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
      .or(`caller_address.eq.${normalizedAddress},callee_address.eq.${normalizedAddress}`)
      .in("status", ["ringing", "accepted"]);

    setIncomingCall(null);
    setOutgoingCall(null);
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

  return {
    incomingCall,
    outgoingCall,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    cancelCall,
    isConfigured: isSupabaseConfigured,
  };
}



