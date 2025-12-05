"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { type Address } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { mainnet } from "wagmi/chains";
import { useFriendRequests, type Friend } from "@/hooks/useFriendRequests";
import { useVoiceCall } from "@/hooks/useVoiceCall";
import { useCallSignaling } from "@/hooks/useCallSignaling";
import { useENS } from "@/hooks/useENS";
import { FriendsList } from "./FriendsList";
import { FriendRequests } from "./FriendRequests";
import { AddFriendModal } from "./AddFriendModal";
import { VoiceCallUI } from "./VoiceCallUI";
import { IncomingCallModal } from "./IncomingCallModal";
import { ChatModal } from "./ChatModal";
import { UsernameClaimModal } from "./UsernameClaimModal";
import { XMTPProvider, useXMTPContext } from "@/context/XMTPProvider";
import { useUsername } from "@/hooks/useUsername";
import { isAgoraConfigured } from "@/config/agora";

type DashboardProps = {
  userAddress: Address;
  onLogout: () => void;
};

// Convert Friend from useFriendRequests to the format FriendsList expects
type FriendsListFriend = {
  id: string;
  address: Address;
  ensName: string | null;
  avatar: string | null;
  nickname: string | null;
  shoutUsername: string | null;
  addedAt: string;
  isOnline?: boolean;
};

function DashboardContent({ userAddress, onLogout, isPasskeyUser }: DashboardProps & { isPasskeyUser?: boolean }) {
  const [isAddFriendOpen, setIsAddFriendOpen] = useState(false);
  const [isUsernameModalOpen, setIsUsernameModalOpen] = useState(false);
  const [currentCallFriend, setCurrentCallFriend] = useState<FriendsListFriend | null>(null);
  const [chatFriend, setChatFriend] = useState<FriendsListFriend | null>(null);
  const [userENS, setUserENS] = useState<{ ensName: string | null; avatar: string | null }>({
    ensName: null,
    avatar: null,
  });
  const xmtpAutoInitAttempted = useRef(false);
  
  // iOS Chrome detection (Chrome on iOS doesn't support WebRTC properly)
  const [isIOSChrome, setIsIOSChrome] = useState(false);
  const [dismissIOSWarning, setDismissIOSWarning] = useState(false);
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      const ua = navigator.userAgent;
      const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const isChrome = /CriOS/.test(ua); // CriOS = Chrome on iOS
      setIsIOSChrome(isIOS && isChrome);
    }
  }, []);

  // Username hook
  const { username: shoutUsername, claimUsername } = useUsername(userAddress);

  const { resolveAddressOrENS } = useENS();
  
  // Network check
  const { chain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);
  const [dismissNetworkBanner, setDismissNetworkBanner] = useState(false);
  const isOnMainnet = chain?.id === mainnet.id;
  
  // Reset switching state when chain changes
  useEffect(() => {
    setIsSwitchingNetwork(false);
  }, [chain?.id]);

  const {
    incomingRequests,
    outgoingRequests,
    friends,
    isLoading: isFriendsLoading,
    error: friendsError,
    sendFriendRequest,
    acceptRequest,
    rejectRequest,
    removeFriend,
    clearError: clearFriendsError,
    isConfigured: isSupabaseConfigured,
    refresh: refreshFriends,
  } = useFriendRequests(userAddress);

  // Resolve user's ENS
  useEffect(() => {
    async function resolveUserENS() {
      const resolved = await resolveAddressOrENS(userAddress);
      if (resolved) {
        setUserENS({
          ensName: resolved.ensName,
          avatar: resolved.avatar,
        });
      }
    }
    resolveUserENS();
  }, [userAddress, resolveAddressOrENS]);

  const {
    callState,
    callType,
    isMuted,
    isVideoOff,
    isRemoteVideoOff,
    duration,
    error: callError,
    joinCall,
    leaveCall,
    toggleMute,
    toggleVideo,
    formatDuration,
    setLocalVideoContainer,
    setRemoteVideoContainer,
    isConfigured: isCallConfigured,
  } = useVoiceCall();

  const {
    incomingCall,
    startCall,
    acceptCall,
    rejectCall,
    endCall: endCallSignaling,
  } = useCallSignaling(userAddress);

  const {
    isInitialized: isXMTPInitialized,
    isInitializing: isXMTPInitializing,
    error: xmtpError,
    unreadCounts,
    initialize: initializeXMTP,
    markAsRead,
    onNewMessage,
    canMessageBatch,
  } = useXMTPContext();
  
  // Toast notification state
  const [toast, setToast] = useState<{ message: string; sender: string } | null>(null);
  
  // Track which friends can receive XMTP messages
  const [friendsXMTPStatus, setFriendsXMTPStatus] = useState<Record<string, boolean>>({});

  // Auto-initialize XMTP after a short delay
  useEffect(() => {
    if (
      !isXMTPInitialized &&
      !isXMTPInitializing &&
      !xmtpAutoInitAttempted.current
    ) {
      xmtpAutoInitAttempted.current = true;
      // Small delay to let the UI settle, then prompt for XMTP signature
      const timer = setTimeout(() => {
        initializeXMTP();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isXMTPInitialized, isXMTPInitializing, initializeXMTP]);

  // Handler to switch to mainnet
  const handleSwitchToMainnet = async () => {
    console.log("[Network] Requesting switch to mainnet...");
    setIsSwitchingNetwork(true);
    
    // Set a timeout to reset button if wallet doesn't respond
    const timeout = setTimeout(() => {
      console.log("[Network] Timeout - resetting button");
      setIsSwitchingNetwork(false);
    }, 5000);
    
    try {
      if (switchChainAsync) {
        await switchChainAsync({ chainId: mainnet.id });
        console.log("[Network] Successfully switched to mainnet");
      }
    } catch (error) {
      console.log("[Network] Failed to switch:", error);
    } finally {
      clearTimeout(timeout);
      setIsSwitchingNetwork(false);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Convert friends to the format FriendsList expects
  const friendsListData: FriendsListFriend[] = friends.map((f) => ({
    id: f.id,
    address: f.friend_address as Address,
    ensName: f.ensName || null,
    avatar: f.avatar || null,
    nickname: f.nickname,
    shoutUsername: f.shoutUsername || null,
    addedAt: f.created_at,
  }));

  // Check which friends can receive XMTP messages
  useEffect(() => {
    if (isPasskeyUser || friends.length === 0) {
      return;
    }
    
    const checkFriendsXMTP = async () => {
      const addresses = friends.map(f => f.friend_address);
      const status = await canMessageBatch(addresses);
      setFriendsXMTPStatus(status);
    };
    
    checkFriendsXMTP();
  }, [friends, isPasskeyUser, canMessageBatch]);

  // Find caller info from friends list
  const incomingCallFriend = incomingCall
    ? friendsListData.find(
        (f) => f.address.toLowerCase() === incomingCall.caller_address.toLowerCase()
      )
    : null;

  // Listen for new messages and show toast
  useEffect(() => {
    if (!isXMTPInitialized) return;
    
    const unsubscribe = onNewMessage(({ senderAddress, content }) => {
      // Find friend info for the sender
      const friend = friendsListData.find(
        (f) => f.address.toLowerCase() === senderAddress.toLowerCase()
      );
      const senderName = friend?.ensName || friend?.nickname || formatAddress(senderAddress);
      
      // Show toast notification
      setToast({
        sender: senderName,
        message: content.length > 50 ? content.slice(0, 50) + "..." : content,
      });
      
      // Auto-hide after 4 seconds
      setTimeout(() => setToast(null), 4000);
    });
    
    return unsubscribe;
  }, [isXMTPInitialized, onNewMessage, friendsListData]);

  const handleSendFriendRequest = async (addressOrENS: string): Promise<boolean> => {
    return await sendFriendRequest(addressOrENS);
  };

  const handleCall = async (friend: FriendsListFriend, withVideo: boolean = false) => {
    if (!isCallConfigured) {
      alert("Calling not configured. Please set NEXT_PUBLIC_AGORA_APP_ID.");
      return;
    }

    setCurrentCallFriend(friend);
    
    // Generate a unique channel name based on both addresses (sorted for consistency)
    const addresses = [userAddress.toLowerCase(), friend.address.toLowerCase()].sort();
    const channelName = `shout_${addresses[0].slice(2, 10)}_${addresses[1].slice(2, 10)}`;
    
    // Create signaling record to notify the callee
    await startCall(friend.address, channelName);
    
    // Join the Agora channel (with or without video)
    await joinCall(channelName, undefined, withVideo);
  };

  const handleVideoCall = async (friend: FriendsListFriend) => {
    await handleCall(friend, true);
  };

  const handleAcceptCall = async () => {
    const channelName = await acceptCall();
    if (channelName) {
      // Find the caller friend to show in the call UI
      if (incomingCallFriend) {
        setCurrentCallFriend(incomingCallFriend);
      }
      // Join the Agora channel
      await joinCall(channelName);
    }
  };

  const handleRejectCall = async () => {
    await rejectCall();
  };

  const handleEndCall = async () => {
    await leaveCall();
    await endCallSignaling();
    setCurrentCallFriend(null);
  };

  const handleRemoveFriend = async (friendId: string) => {
    await removeFriend(friendId);
  };

  const handleChat = (friend: FriendsListFriend) => {
    setChatFriend(friend);
    // Mark messages from this friend as read
    markAsRead(friend.address);
  };

  return (
    <>
      <div className="min-h-screen bg-zinc-950">
        {/* Header */}
        <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-lg sticky top-0 z-40">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* User Avatar or App Icon */}
                {userENS.avatar ? (
                  <img
                    src={userENS.avatar}
                    alt="Avatar"
                    className="w-10 h-10 rounded-xl object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                      />
                    </svg>
                  </div>
                )}
                <div>
                  <h1 className="text-white font-bold">
                    {userENS.ensName || "Shout"}
                  </h1>
                  <div className="flex items-center gap-2">
                    <p className="text-zinc-500 text-sm font-mono">
                      {formatAddress(userAddress)}
                    </p>
                    {shoutUsername ? (
                      <button
                        onClick={() => setIsUsernameModalOpen(true)}
                        className="text-violet-400 text-sm hover:text-violet-300 transition-colors"
                      >
                        @{shoutUsername}
                      </button>
                    ) : (
                      <button
                        onClick={() => setIsUsernameModalOpen(true)}
                        className="text-zinc-500 text-xs hover:text-violet-400 transition-colors"
                      >
                        + claim name
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={refreshFriends}
                  disabled={isFriendsLoading}
                  className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors disabled:opacity-50"
                  title="Refresh"
                >
                  <svg
                    className={`w-5 h-5 ${isFriendsLoading ? "animate-spin" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
                <button
                  onClick={onLogout}
                  className="py-2 px-4 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
                >
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* iOS Chrome Warning */}
        <AnimatePresence>
          {isIOSChrome && !dismissIOSWarning && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-amber-500/10 border-b border-amber-500/20"
            >
              <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-amber-200 text-sm">
                    <span className="font-medium">Voice calls require Safari on iPhone.</span>
                    <span className="text-amber-300/70 ml-1 hidden sm:inline">Open this page in Safari for the best experience.</span>
                  </p>
                </div>
                <button
                  onClick={() => setDismissIOSWarning(true)}
                  className="p-1 rounded hover:bg-amber-500/20 text-amber-400 transition-colors flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-4 py-8">
          {/* Network Banner - Show if not on mainnet (disabled for now due to state sync issues) */}
          {false && !isOnMainnet && chain && !dismissNetworkBanner && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 bg-orange-500/10 border border-orange-500/30 rounded-xl p-4"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <svg
                    className="w-5 h-5 text-orange-400 mt-0.5 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <div>
                    <p className="text-orange-200 font-medium">
                      App shows: {chain?.name}
                    </p>
                    <p className="text-orange-200/70 text-sm mt-1">
                      If your wallet is already on Mainnet, try refreshing the page or dismiss this.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.location.reload()}
                    className="py-2 px-3 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium transition-colors"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={handleSwitchToMainnet}
                    disabled={isSwitchingNetwork}
                    className="py-2 px-3 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                  >
                    {isSwitchingNetwork ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Switching...
                      </>
                    ) : (
                      "Switch"
                    )}
                  </button>
                  <button
                    onClick={() => setDismissNetworkBanner(true)}
                    className="p-2 rounded-lg hover:bg-zinc-700 text-orange-400 hover:text-white transition-colors"
                    title="Dismiss"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Status Banners */}
          {!isSupabaseConfigured && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4"
            >
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-amber-400 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div>
                  <p className="text-amber-200 font-medium">Database Not Connected</p>
                  <p className="text-amber-200/70 text-sm mt-1">
                    Set Supabase environment variables to enable friend requests.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {!isAgoraConfigured && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4"
            >
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-amber-400 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div>
                  <p className="text-amber-200 font-medium">Voice Calling Not Configured</p>
                  <p className="text-amber-200/70 text-sm mt-1">
                    Set <code className="bg-amber-500/20 px-1 rounded">NEXT_PUBLIC_AGORA_APP_ID</code> to enable voice calls.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* XMTP Status Banner - hidden for passkey users */}
          {!isXMTPInitialized && !isPasskeyUser && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-blue-400 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                  <div>
                    <p className="text-blue-200 font-medium">Enable XMTP Chat</p>
                    <p className="text-blue-200/70 text-sm mt-1">
                      Sign a message to enable encrypted messaging. Your friends also need to enable XMTP to chat.
                    </p>
                    {xmtpError && (
                      <p className="text-red-400 text-sm mt-1">{xmtpError}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={initializeXMTP}
                  disabled={isXMTPInitializing}
                  className="py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isXMTPInitializing ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Enabling...
                    </>
                  ) : (
                    "Enable Chat"
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* XMTP Enabled Success - hidden for passkey users */}
          {isXMTPInitialized && !isPasskeyUser && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4"
            >
              <div className="flex items-center gap-3">
                <svg
                  className="w-5 h-5 text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <p className="text-emerald-200 font-medium">
                  XMTP Chat Enabled! You can now send and receive encrypted messages.
                </p>
              </div>
            </motion.div>
          )}

          {/* Friend Requests Section */}
          {(incomingRequests.length > 0 || outgoingRequests.length > 0) && (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden mb-6">
              <div className="p-6">
                <FriendRequests
                  incomingRequests={incomingRequests}
                  outgoingRequests={outgoingRequests}
                  onAccept={acceptRequest}
                  onReject={rejectRequest}
                  isLoading={isFriendsLoading}
                />
              </div>
            </div>
          )}

          {/* Friends Section */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-800">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Friends</h2>
                  <p className="text-zinc-500 text-sm mt-1">
                    {friends.length} {friends.length === 1 ? "friend" : "friends"}
                  </p>
                </div>
                <button
                  onClick={() => setIsAddFriendOpen(true)}
                  disabled={!isSupabaseConfigured}
                  className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-medium transition-all hover:shadow-lg hover:shadow-violet-500/25 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Add Friend
                </button>
              </div>
            </div>

            <div className="p-6">
              <FriendsList
                friends={friendsListData}
                onCall={handleCall}
                onVideoCall={handleVideoCall}
                onChat={isPasskeyUser ? undefined : handleChat}
                onRemove={handleRemoveFriend}
                isCallActive={callState !== "idle"}
                unreadCounts={isPasskeyUser ? {} : unreadCounts}
                hideChat={isPasskeyUser}
                friendsXMTPStatus={friendsXMTPStatus}
              />
            </div>
          </div>

          {/* Call Error */}
          <AnimatePresence>
            {callError && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mt-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4"
              >
                <p className="text-red-400">{callError}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Friends Error */}
          <AnimatePresence>
            {friendsError && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mt-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4"
              >
                <p className="text-red-400">{friendsError}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Add Friend Modal */}
      <AddFriendModal
        isOpen={isAddFriendOpen}
        onClose={() => {
          setIsAddFriendOpen(false);
          clearFriendsError();
        }}
        onAdd={handleSendFriendRequest}
        isLoading={isFriendsLoading}
        error={friendsError}
      />

      {/* Voice Call UI */}
      <AnimatePresence>
        {callState !== "idle" && currentCallFriend && (
          <VoiceCallUI
            friend={{
              id: currentCallFriend.id,
              address: currentCallFriend.address,
              ensName: currentCallFriend.ensName,
              avatar: currentCallFriend.avatar,
              nickname: currentCallFriend.nickname,
              shoutUsername: currentCallFriend.shoutUsername,
              addedAt: currentCallFriend.addedAt,
            }}
            callState={callState}
            callType={callType}
            isMuted={isMuted}
            isVideoOff={isVideoOff}
            isRemoteVideoOff={isRemoteVideoOff}
            duration={duration}
            formatDuration={formatDuration}
            onToggleMute={toggleMute}
            onToggleVideo={toggleVideo}
            onEndCall={handleEndCall}
            setLocalVideoContainer={setLocalVideoContainer}
            setRemoteVideoContainer={setRemoteVideoContainer}
          />
        )}
      </AnimatePresence>

      {/* Incoming Call Modal */}
      {incomingCall && callState === "idle" && (
        <IncomingCallModal
          callerAddress={incomingCall.caller_address}
          callerName={incomingCallFriend?.ensName || incomingCallFriend?.nickname}
          callerAvatar={incomingCallFriend?.avatar}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
        />
      )}

      {/* Chat Modal */}
      <ChatModal
        isOpen={!!chatFriend}
        onClose={() => setChatFriend(null)}
        userAddress={userAddress}
        peerAddress={chatFriend?.address || ("0x" as Address)}
        peerName={chatFriend?.ensName || chatFriend?.nickname}
        peerAvatar={chatFriend?.avatar}
      />

      {/* Username Claim Modal */}
      <UsernameClaimModal
        isOpen={isUsernameModalOpen}
        onClose={() => setIsUsernameModalOpen(false)}
        userAddress={userAddress}
        currentUsername={shoutUsername}
        onSuccess={() => {}}
      />

      {/* Toast Notification for New Messages */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 50, x: "-50%" }}
            className="fixed bottom-6 left-1/2 z-50"
          >
            <div
              onClick={() => {
                // Find the friend and open chat
                const friend = friendsListData.find(
                  (f) =>
                    f.ensName === toast.sender ||
                    f.nickname === toast.sender ||
                    formatAddress(f.address) === toast.sender
                );
                if (friend) {
                  handleChat(friend);
                }
                setToast(null);
              }}
              className="bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4 shadow-2xl cursor-pointer hover:bg-zinc-750 transition-colors flex items-center gap-4 max-w-sm"
            >
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-white font-medium truncate">{toast.sender}</p>
                <p className="text-zinc-400 text-sm truncate">{toast.message}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setToast(null);
                }}
                className="shrink-0 text-zinc-500 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// Wrapper that provides XMTP context
export function Dashboard({ userAddress, onLogout, isPasskeyUser }: DashboardProps & { isPasskeyUser?: boolean }) {
  return (
    <XMTPProvider userAddress={userAddress}>
      <DashboardContent userAddress={userAddress} onLogout={onLogout} isPasskeyUser={isPasskeyUser} />
    </XMTPProvider>
  );
}
