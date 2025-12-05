"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { agoraAppId, isAgoraConfigured, getAgoraToken } from "@/config/agora";

// Dynamic import for Agora SDK to avoid SSR issues
let AgoraRTC: typeof import("agora-rtc-sdk-ng").default | null = null;

export type CallState = "idle" | "joining" | "connected" | "leaving" | "error";

export type VoiceCallState = {
  callState: CallState;
  isMuted: boolean;
  isRemoteMuted: boolean;
  error: string | null;
  duration: number;
};

export function useVoiceCall() {
  const [state, setState] = useState<VoiceCallState>({
    callState: "idle",
    isMuted: false,
    isRemoteMuted: false,
    error: null,
    duration: 0,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localAudioTrackRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const remoteAudioTrackRef = useRef<any>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Load Agora SDK dynamically on client side
  useEffect(() => {
    if (typeof window !== "undefined" && !AgoraRTC) {
      import("agora-rtc-sdk-ng").then((module) => {
        AgoraRTC = module.default;
      });
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, []);

  const startDurationTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    durationIntervalRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setState((prev) => ({
          ...prev,
          duration: Math.floor((Date.now() - startTimeRef.current!) / 1000),
        }));
      }
    }, 1000);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    startTimeRef.current = null;
  }, []);

  const joinCall = useCallback(
    async (channelName: string, uid?: number): Promise<boolean> => {
      if (!isAgoraConfigured) {
        setState((prev) => ({
          ...prev,
          callState: "error",
          error: "Agora is not configured. Set NEXT_PUBLIC_AGORA_APP_ID.",
        }));
        return false;
      }

      if (!AgoraRTC) {
        setState((prev) => ({
          ...prev,
          callState: "error",
          error: "Agora SDK not loaded yet. Please try again.",
        }));
        return false;
      }

      setState((prev) => ({ ...prev, callState: "joining", error: null }));

      try {
        // Check microphone permission first (better mobile support)
        try {
          const permissionResult = await navigator.mediaDevices.getUserMedia({ audio: true });
          // Stop the test stream immediately
          permissionResult.getTracks().forEach(track => track.stop());
        } catch (permError) {
          const permMessage = permError instanceof Error ? permError.message : String(permError);
          if (permMessage.includes("NotAllowed") || permMessage.includes("Permission denied")) {
            throw new Error("Microphone access denied. Please allow microphone permission in your browser/device settings and try again.");
          } else if (permMessage.includes("NotFound")) {
            throw new Error("No microphone found. Please connect a microphone and try again.");
          } else {
            throw new Error(`Microphone error: ${permMessage}`);
          }
        }

        // Create Agora client
        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        clientRef.current = client;

        // Set up event handlers
        client.on("user-published", async (user, mediaType) => {
          await client.subscribe(user, mediaType);
          
          if (mediaType === "audio") {
            const remoteAudioTrack = user.audioTrack;
            remoteAudioTrackRef.current = remoteAudioTrack || null;
            remoteAudioTrack?.play();
            setState((prev) => ({ ...prev, isRemoteMuted: false }));
          }
        });

        client.on("user-unpublished", (user, mediaType) => {
          if (mediaType === "audio") {
            remoteAudioTrackRef.current = null;
            setState((prev) => ({ ...prev, isRemoteMuted: true }));
          }
        });

        client.on("user-left", () => {
          remoteAudioTrackRef.current = null;
        });

        // Generate UID if not provided
        const finalUid = uid || Math.floor(Math.random() * 100000);

        // Get token (null for testing mode)
        const token = await getAgoraToken(channelName, finalUid);

        // Join channel
        await client.join(agoraAppId, channelName, token, finalUid);

        // Create and publish local audio track
        const localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localAudioTrackRef.current = localAudioTrack;
        await client.publish([localAudioTrack]);

        setState((prev) => ({ ...prev, callState: "connected" }));
        startDurationTimer();

        return true;
      } catch (error) {
        let message = error instanceof Error ? error.message : "Failed to join call";
        
        // Handle specific Agora errors
        if (message.includes("dynamic use static key")) {
          message = "Agora token required. Go to console.agora.io → Project → Configure → Disable 'App certificate' for testing mode, OR set up a token server.";
        }
        
        setState((prev) => ({
          ...prev,
          callState: "error",
          error: message,
        }));
        return false;
      }
    },
    [startDurationTimer]
  );

  const leaveCall = useCallback(async () => {
    setState((prev) => ({ ...prev, callState: "leaving" }));
    stopDurationTimer();

    try {
      // Stop and close local audio track
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
      }

      // Leave channel and destroy client
      if (clientRef.current) {
        await clientRef.current.leave();
        clientRef.current = null;
      }

      remoteAudioTrackRef.current = null;

      setState({
        callState: "idle",
        isMuted: false,
        isRemoteMuted: false,
        error: null,
        duration: 0,
      });
    } catch (error) {
      console.error("Error leaving call:", error);
      setState((prev) => ({
        ...prev,
        callState: "idle",
      }));
    }
  }, [stopDurationTimer]);

  const toggleMute = useCallback(() => {
    if (localAudioTrackRef.current) {
      const newMutedState = !state.isMuted;
      localAudioTrackRef.current.setEnabled(!newMutedState);
      setState((prev) => ({ ...prev, isMuted: newMutedState }));
    }
  }, [state.isMuted]);

  const formatDuration = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }, []);

  return {
    ...state,
    joinCall,
    leaveCall,
    toggleMute,
    formatDuration,
    isConfigured: isAgoraConfigured,
  };
}
