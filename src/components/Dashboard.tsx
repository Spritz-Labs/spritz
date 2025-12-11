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
import { PhoneVerificationModal } from "./PhoneVerificationModal";
import { XMTPProvider, useXMTPContext } from "@/context/XMTPProvider";
import { useUsername } from "@/hooks/useUsername";
import { usePhoneVerification } from "@/hooks/usePhoneVerification";
import { useNotifications } from "@/hooks/useNotifications";
import { useUserSettings } from "@/hooks/useUserSettings";
import { isAgoraConfigured } from "@/config/agora";
import { StatusModal } from "./StatusModal";
import { SettingsModal } from "./SettingsModal";
import { QRCodeModal } from "./QRCodeModal";
import { SocialsModal } from "./SocialsModal";
import { useSocials } from "@/hooks/useSocials";
import { CreateGroupModal } from "./CreateGroupModal";
import { GroupChatModal } from "./GroupChatModal";
import { GroupsList } from "./GroupsList";
import { GroupCallUI } from "./GroupCallUI";
import { IncomingGroupCallModal } from "./IncomingGroupCallModal";
import { type XMTPGroup } from "@/context/XMTPProvider";
import { useGroupCallSignaling } from "@/hooks/useGroupCallSignaling";
import { useGroupInvitations } from "@/hooks/useGroupInvitations";
import { GroupInvitations } from "./GroupInvitations";

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
  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isQRCodeModalOpen, setIsQRCodeModalOpen] = useState(false);
  const [isSocialsModalOpen, setIsSocialsModalOpen] = useState(false);
  const [showXMTPSuccess, setShowXMTPSuccess] = useState(false);
  const [currentCallFriend, setCurrentCallFriend] = useState<FriendsListFriend | null>(null);
  const [chatFriend, setChatFriend] = useState<FriendsListFriend | null>(null);
  const [userENS, setUserENS] = useState<{ ensName: string | null; avatar: string | null }>({
    ensName: null,
    avatar: null,
  });
  const xmtpAutoInitAttempted = useRef(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  
  // Group chat state
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groups, setGroups] = useState<XMTPGroup[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<XMTPGroup | null>(null);
  
  // Group call state
  const [groupCallDuration, setGroupCallDuration] = useState(0);
  const groupCallDurationRef = useRef<NodeJS.Timeout | null>(null);
  
  // Group call signaling
  const {
    activeGroupCalls,
    currentGroupCall,
    participants: groupCallParticipants,
    incomingGroupCall,
    fetchActiveCalls,
    startGroupCall,
    joinGroupCall,
    leaveGroupCall,
    dismissIncomingCall,
  } = useGroupCallSignaling(userAddress);

  // Group invitations
  const {
    pendingInvitations,
    sendInvitations,
    acceptInvitation,
    declineInvitation,
  } = useGroupInvitations(userAddress);
  
  
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

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    
    if (isProfileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isProfileMenuOpen]);

  // Username hook
  const { username: shoutUsername, claimUsername } = useUsername(userAddress);
  
  // Phone verification hook
  const { phoneNumber: verifiedPhone, isVerified: isPhoneVerified } = usePhoneVerification(userAddress);
  
  // Socials hook
  const { socials, socialCount, saveSocials, fetchSocialsForAddress, isLoading: isSocialsLoading } = useSocials(userAddress);
  
  // Notifications hook
  const {
    permission: notificationPermission,
    requestPermission: requestNotificationPermission,
    notifyMessage,
    startRinging,
    stopRinging,
    notifyOutgoingCall,
    notifyCallConnected,
    notifyCallEnded,
  } = useNotifications();

  // User settings (status, DND, sound)
  const {
    settings: userSettings,
    setStatus,
    toggleDnd,
    toggleSound,
  } = useUserSettings(userAddress);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

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
    isScreenSharing,
    isRemoteVideoOff,
    duration,
    error: callError,
    joinCall,
    leaveCall,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    formatDuration,
    setLocalVideoContainer,
    setRemoteVideoContainer,
    setScreenShareContainer,
    isConfigured: isCallConfigured,
  } = useVoiceCall();

  const {
    incomingCall,
    remoteHangup,
    startCall,
    acceptCall,
    rejectCall,
    endCall: endCallSignaling,
    clearRemoteHangup,
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
    // Group methods
    createGroup,
    getGroups,
    markGroupAsRead,
    joinGroupById,
    addGroupMembers,
    leaveGroup,
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

  // Show XMTP success message briefly when initialized
  useEffect(() => {
    if (isXMTPInitialized && !isPasskeyUser) {
      setShowXMTPSuccess(true);
      const timer = setTimeout(() => {
        setShowXMTPSuccess(false);
      }, 4000); // Hide after 4 seconds
      return () => clearTimeout(timer);
    }
  }, [isXMTPInitialized, isPasskeyUser]);

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

  // Load groups when XMTP is initialized
  useEffect(() => {
    if (!isXMTPInitialized || isPasskeyUser) return;
    
    const loadGroups = async () => {
      setIsLoadingGroups(true);
      try {
        const fetchedGroups = await getGroups();
        setGroups(fetchedGroups);
      } catch (err) {
        console.error("[Dashboard] Failed to load groups:", err);
      } finally {
        setIsLoadingGroups(false);
      }
    };
    
    loadGroups();
  }, [isXMTPInitialized, isPasskeyUser, getGroups]);

  // Handler to create a new group
  const handleCreateGroup = async (memberAddresses: string[], groupName: string): Promise<boolean> => {
    setIsCreatingGroup(true);
    try {
      // Create the group WITH all members immediately
      // (XMTP requires creator to add members - members can't add themselves)
      const result = await createGroup(memberAddresses, groupName);
      if (!result.success || !result.groupId) {
        console.error("[Dashboard] Failed to create group:", result.error);
        return false;
      }

      // Send invitations as notifications (members are already in the group)
      // This lets them know they were added and they can leave if they want
      const invitesSent = await sendInvitations(result.groupId, groupName, memberAddresses);
      if (!invitesSent) {
        console.warn("[Dashboard] Failed to send some invitations");
      }

      // Refresh groups list
      const fetchedGroups = await getGroups();
      setGroups(fetchedGroups);
      
      return true;
    } catch (err) {
      console.error("[Dashboard] Create group error:", err);
      return false;
    } finally {
      setIsCreatingGroup(false);
    }
  };

  // Handler to join a group after accepting an invitation
  const handleJoinGroupFromInvite = async (groupId: string) => {
    try {
      // Join the XMTP group
      const result = await joinGroupById(groupId);
      if (result.success) {
        // Refresh groups list
        const fetchedGroups = await getGroups();
        setGroups(fetchedGroups);
      }
    } catch (err) {
      console.error("[Dashboard] Failed to join group:", err);
    }
  };

  // Handler to open a group chat
  const handleOpenGroup = (group: XMTPGroup) => {
    setSelectedGroup(group);
    markGroupAsRead(group.id);
  };

  // Fetch active group calls when groups change
  useEffect(() => {
    if (groups.length > 0) {
      const groupIds = groups.map((g) => g.id);
      fetchActiveCalls(groupIds);
    }
  }, [groups, fetchActiveCalls]);

  // Group call duration timer
  useEffect(() => {
    if (currentGroupCall) {
      setGroupCallDuration(0);
      groupCallDurationRef.current = setInterval(() => {
        setGroupCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (groupCallDurationRef.current) {
        clearInterval(groupCallDurationRef.current);
        groupCallDurationRef.current = null;
      }
      setGroupCallDuration(0);
    }

    return () => {
      if (groupCallDurationRef.current) {
        clearInterval(groupCallDurationRef.current);
      }
    };
  }, [currentGroupCall]);

  // Handler to start a group call
  const handleStartGroupCall = async (groupId: string, groupName: string, isVideo: boolean) => {
    if (!isCallConfigured) {
      alert("Calling not configured. Please set NEXT_PUBLIC_AGORA_APP_ID.");
      return;
    }

    // Start or join the group call signaling
    const call = await startGroupCall(groupId, groupName, isVideo);
    if (!call) {
      console.error("[Dashboard] Failed to start group call");
      return;
    }

    // Join the Agora channel
    const success = await joinCall(call.channelName, undefined, isVideo);
    if (success && userSettings.soundEnabled) {
      notifyCallConnected();
    }

    // Close the chat modal
    setSelectedGroup(null);
  };

  // Handler to leave a group call
  const handleLeaveGroupCall = async () => {
    if (userSettings.soundEnabled) {
      notifyCallEnded();
    }
    await leaveCall();
    await leaveGroupCall();
  };

  // Handler to join an existing group call
  const handleJoinGroupCall = async (groupId: string) => {
    if (!isCallConfigured) {
      alert("Calling not configured. Please set NEXT_PUBLIC_AGORA_APP_ID.");
      return;
    }

    const activeCall = activeGroupCalls[groupId];
    if (!activeCall) return;

    // Join the group call signaling
    const call = await joinGroupCall(activeCall.id);
    if (!call) {
      console.error("[Dashboard] Failed to join group call");
      return;
    }

    // Dismiss the incoming call modal if open
    dismissIncomingCall();

    // Join the Agora channel
    const success = await joinCall(call.channelName, undefined, call.isVideo);
    if (success && userSettings.soundEnabled) {
      notifyCallConnected();
    }
  };

  // Handler to join from incoming call notification
  const handleJoinIncomingGroupCall = async () => {
    if (!incomingGroupCall) return;
    
    // Dismiss the modal first
    dismissIncomingCall();
    
    // Join the call
    const call = await joinGroupCall(incomingGroupCall.id);
    if (!call) {
      console.error("[Dashboard] Failed to join incoming group call");
      return;
    }

    // Join the Agora channel
    const success = await joinCall(call.channelName, undefined, call.isVideo);
    if (success && userSettings.soundEnabled) {
      notifyCallConnected();
    }
  };

  // Play ring sound for incoming group calls
  useEffect(() => {
    if (incomingGroupCall && callState === "idle" && !currentGroupCall) {
      if (userSettings.soundEnabled && !userSettings.isDnd) {
        const callerName = incomingGroupCall.groupName;
        startRinging(callerName);
      }
    } else {
      // Only stop ringing if it was for a group call
      if (!incomingCall) {
        stopRinging();
      }
    }
  }, [incomingGroupCall, callState, currentGroupCall, startRinging, stopRinging, userSettings.soundEnabled, userSettings.isDnd, incomingCall]);

  // Find caller info from friends list
  const incomingCallFriend = incomingCall
    ? friendsListData.find(
        (f) => f.address.toLowerCase() === incomingCall.caller_address.toLowerCase()
      )
    : null;

  // Request notification permission on first interaction
  useEffect(() => {
    const handleInteraction = () => {
      if (notificationPermission === "default") {
        requestNotificationPermission();
      }
      // Remove listener after first interaction
      document.removeEventListener("click", handleInteraction);
    };
    document.addEventListener("click", handleInteraction);
    return () => document.removeEventListener("click", handleInteraction);
  }, [notificationPermission, requestNotificationPermission]);

  // Handle incoming calls - DND auto-rejects, otherwise ring if sound enabled
  useEffect(() => {
    if (incomingCall && callState === "idle") {
      // Auto-reject if DND is enabled
      if (userSettings.isDnd) {
        console.log("[Dashboard] DND enabled - auto-rejecting call");
        rejectCall();
        return;
      }
      
      // Play ring sound if enabled
      if (userSettings.soundEnabled) {
        const callerName = incomingCallFriend?.ensName || incomingCallFriend?.nickname || "Someone";
        startRinging(callerName);
      }
    } else {
      stopRinging();
    }
  }, [incomingCall, callState, incomingCallFriend, startRinging, stopRinging, userSettings.isDnd, userSettings.soundEnabled, rejectCall]);

  // Listen for new messages and show toast + notification
  useEffect(() => {
    if (!isXMTPInitialized) return;
    
    const unsubscribe = onNewMessage(({ senderAddress, content }) => {
      // Find friend info for the sender
      const friend = friendsListData.find(
        (f) => f.address.toLowerCase() === senderAddress.toLowerCase()
      );
      const senderName = friend?.ensName || friend?.nickname || formatAddress(senderAddress);
      
      // Play sound and show browser notification (if sound enabled)
      if (userSettings.soundEnabled) {
        notifyMessage(senderName, content);
      }
      
      // Show toast notification in-app
      setToast({
        sender: senderName,
        message: content.length > 50 ? content.slice(0, 50) + "..." : content,
      });
      
      // Auto-hide after 4 seconds
      setTimeout(() => setToast(null), 4000);
    });
    
    return unsubscribe;
  }, [isXMTPInitialized, onNewMessage, friendsListData, notifyMessage, userSettings.soundEnabled]);

  const handleSendFriendRequest = async (addressOrENS: string): Promise<boolean> => {
    return await sendFriendRequest(addressOrENS);
  };

  const handleCall = async (friend: FriendsListFriend, withVideo: boolean = false) => {
    if (!isCallConfigured) {
      alert("Calling not configured. Please set NEXT_PUBLIC_AGORA_APP_ID.");
      return;
    }

    setCurrentCallFriend(friend);
    if (userSettings.soundEnabled) {
      notifyOutgoingCall(); // Play outgoing call sound
    }
    
    // Generate a unique channel name based on both addresses (sorted for consistency)
    const addresses = [userAddress.toLowerCase(), friend.address.toLowerCase()].sort();
    const channelName = `shout_${addresses[0].slice(2, 10)}_${addresses[1].slice(2, 10)}`;
    
    // Create signaling record to notify the callee
    const callRecord = await startCall(friend.address, channelName);
    
    if (!callRecord) {
      console.error("[Dashboard] Failed to create call signaling record");
      setCurrentCallFriend(null);
      return;
    }
    
    // Wait briefly to see if call was immediately rejected (DND auto-reject)
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if the call was rejected during the wait
    if (remoteHangup) {
      console.log("[Dashboard] Call was rejected (likely DND) - not joining Agora");
      setCurrentCallFriend(null);
      clearRemoteHangup();
      // Show notification to caller
      setToast({
        sender: friend.ensName || friend.nickname || "Friend",
        message: "is not available right now (Do Not Disturb)",
      });
      setTimeout(() => setToast(null), 4000);
      return;
    }
    
    // Join the Agora channel (with or without video)
    const success = await joinCall(channelName, undefined, withVideo);
    if (success && userSettings.soundEnabled) {
      notifyCallConnected();
    }
  };

  const handleVideoCall = async (friend: FriendsListFriend) => {
    await handleCall(friend, true);
  };

  const handleAcceptCall = async () => {
    stopRinging(); // Stop the ring sound
    const channelName = await acceptCall();
    if (channelName) {
      // Find the caller friend to show in the call UI
      if (incomingCallFriend) {
        setCurrentCallFriend(incomingCallFriend);
      }
      // Join the Agora channel
      const success = await joinCall(channelName);
      if (success && userSettings.soundEnabled) {
        notifyCallConnected();
      }
    }
  };

  const handleRejectCall = async () => {
    stopRinging();
    await rejectCall();
  };

  // Handle when the other party hangs up
  useEffect(() => {
    if (remoteHangup) {
      console.log("[Dashboard] Remote party hung up - leaving call");
      if (userSettings.soundEnabled) {
        notifyCallEnded();
      }
      leaveCall();
      setCurrentCallFriend(null);
      clearRemoteHangup();
    }
  }, [remoteHangup, leaveCall, clearRemoteHangup, notifyCallEnded, userSettings.soundEnabled]);

  const handleEndCall = async () => {
    if (userSettings.soundEnabled) {
      notifyCallEnded();
    }
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
                {/* User Avatar or App Icon - Click for QR Code */}
                <button
                  onClick={() => setIsQRCodeModalOpen(true)}
                  className="relative group"
                  title="Show my QR code"
                >
                  {userENS.avatar ? (
                    <img
                      src={userENS.avatar}
                      alt="Avatar"
                      className="w-10 h-10 rounded-xl object-cover ring-2 ring-transparent group-hover:ring-violet-500/50 transition-all"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center ring-2 ring-transparent group-hover:ring-violet-500/50 transition-all">
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
                  {/* QR indicator */}
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-zinc-800 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg
                      className="w-2.5 h-2.5 text-zinc-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                      />
                    </svg>
                  </div>
                </button>
                <div className="relative" ref={profileMenuRef}>
                  <button
                    onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                    className="text-left hover:opacity-80 transition-opacity"
                  >
                    <h1 className="text-white font-bold flex items-center gap-1">
                      <span className="text-lg">{userSettings.statusEmoji}</span>
                      {userENS.ensName || (shoutUsername ? `@${shoutUsername}` : "Shout")}
                      {userSettings.isDnd && (
                        <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">DND</span>
                      )}
                      <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </h1>
                    <p className="text-zinc-500 text-sm">
                      {userSettings.statusText || formatAddress(userAddress)}
                    </p>
                  </button>

                  {/* Profile Dropdown Menu */}
                  <AnimatePresence>
                    {isProfileMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 top-full mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50"
                      >
                        {/* Status */}
                        <button
                          onClick={() => {
                            setIsProfileMenuOpen(false);
                            setIsStatusModalOpen(true);
                          }}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left"
                        >
                          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-lg">
                            {userSettings.statusEmoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium">Status</p>
                            <p className="text-zinc-500 text-xs truncate">
                              {userSettings.statusText || 'Set your status'}
                            </p>
                          </div>
                          {userSettings.isDnd && (
                            <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">DND</span>
                          )}
                        </button>

                        {/* Username */}
                        <button
                          onClick={() => {
                            setIsProfileMenuOpen(false);
                            setIsUsernameModalOpen(true);
                          }}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left border-t border-zinc-800"
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${shoutUsername ? 'bg-violet-500/20' : 'bg-zinc-800'}`}>
                            <svg className={`w-4 h-4 ${shoutUsername ? 'text-violet-400' : 'text-zinc-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium">Username</p>
                            <p className={`text-xs truncate ${shoutUsername ? 'text-violet-400' : 'text-zinc-500'}`}>
                              {shoutUsername ? `@${shoutUsername}` : 'Claim a username'}
                            </p>
                          </div>
                          {shoutUsername && (
                            <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>

                        {/* Phone */}
                        <button
                          onClick={() => {
                            setIsProfileMenuOpen(false);
                            setIsPhoneModalOpen(true);
                          }}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left border-t border-zinc-800"
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isPhoneVerified ? 'bg-emerald-500/20' : 'bg-zinc-800'}`}>
                            <svg className={`w-4 h-4 ${isPhoneVerified ? 'text-emerald-400' : 'text-zinc-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium">Phone</p>
                            <p className={`text-xs truncate ${isPhoneVerified ? 'text-emerald-400' : 'text-zinc-500'}`}>
                              {isPhoneVerified ? 'Verified' : 'Add phone number'}
                            </p>
                          </div>
                          {isPhoneVerified && (
                            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>

                        {/* QR Code */}
                        <button
                          onClick={() => {
                            setIsProfileMenuOpen(false);
                            setIsQRCodeModalOpen(true);
                          }}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left border-t border-zinc-800"
                        >
                          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                            <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium">My QR Code</p>
                            <p className="text-zinc-500 text-xs">Share to add friends</p>
                          </div>
                        </button>

                        {/* Socials */}
                        <button
                          onClick={() => {
                            setIsProfileMenuOpen(false);
                            setIsSocialsModalOpen(true);
                          }}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left border-t border-zinc-800"
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${socialCount > 0 ? 'bg-pink-500/20' : 'bg-zinc-800'}`}>
                            <svg className={`w-4 h-4 ${socialCount > 0 ? 'text-pink-400' : 'text-zinc-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium">Socials</p>
                            <p className={`text-xs ${socialCount > 0 ? 'text-pink-400' : 'text-zinc-500'}`}>
                              {socialCount > 0 ? `${socialCount} connected` : 'Add your socials'}
                            </p>
                          </div>
                          {socialCount > 0 && (
                            <svg className="w-4 h-4 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>

                        {/* ENS Name */}
                        {userENS.ensName ? (
                          <div className="px-4 py-3 flex items-center gap-3 border-t border-zinc-800">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                              <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm font-medium">ENS</p>
                              <p className="text-blue-400 text-xs truncate">{userENS.ensName}</p>
                            </div>
                          </div>
                        ) : (
                          <a
                            href="https://app.ens.domains/"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setIsProfileMenuOpen(false)}
                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left border-t border-zinc-800"
                          >
                            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                              <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm font-medium">ENS</p>
                              <p className="text-zinc-500 text-xs">Get an ENS →</p>
                            </div>
                          </a>
                        )}

                        {/* Settings */}
                        <button
                          onClick={() => {
                            setIsProfileMenuOpen(false);
                            setIsSettingsModalOpen(true);
                          }}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left border-t border-zinc-800"
                        >
                          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                            <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium">Settings</p>
                            <p className="text-zinc-500 text-xs">Sound & preferences</p>
                          </div>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <button
                onClick={onLogout}
                className="py-2 px-4 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
              >
                Disconnect
              </button>
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

          {/* XMTP Enabled Success - auto-dismisses after 4 seconds */}
          <AnimatePresence>
            {showXMTPSuccess && (
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
          </AnimatePresence>

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

          {/* Group Invitations Section */}
          {isXMTPInitialized && !isPasskeyUser && pendingInvitations.length > 0 && (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden mt-6 p-6">
              <GroupInvitations
                invitations={pendingInvitations}
                onAccept={acceptInvitation}
                onDecline={async (invitationId: string, groupId: string) => {
                  // First leave/hide the XMTP group
                  await leaveGroup(groupId);
                  // Then mark the invitation as declined
                  const result = await declineInvitation(invitationId);
                  // Refresh groups list
                  const fetchedGroups = await getGroups();
                  setGroups(fetchedGroups);
                  return result;
                }}
                onJoinGroup={handleJoinGroupFromInvite}
              />
            </div>
          )}

          {/* Groups Section - Only show if XMTP is enabled */}
          {isXMTPInitialized && !isPasskeyUser && (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden mt-6">
              <div className="p-6 border-b border-zinc-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">Group Chats</h2>
                    <p className="text-zinc-500 text-sm mt-1">
                      {groups.length} {groups.length === 1 ? "group" : "groups"}
                    </p>
                  </div>
                  <button
                    onClick={() => setIsCreateGroupOpen(true)}
                    disabled={friends.length === 0}
                    className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white font-medium transition-all hover:shadow-lg hover:shadow-fuchsia-500/25 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    New Group
                  </button>
                </div>
              </div>

              <div className="p-6">
                <GroupsList
                  groups={groups}
                  onOpenGroup={handleOpenGroup}
                  unreadCounts={unreadCounts}
                  isLoading={isLoadingGroups}
                  activeGroupCalls={Object.fromEntries(
                    Object.entries(activeGroupCalls).map(([groupId, call]) => [
                      groupId,
                      { participantCount: call.participantCount, isVideo: call.isVideo }
                    ])
                  )}
                  onJoinCall={handleJoinGroupCall}
                />
              </div>
            </div>
          )}

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
            isScreenSharing={isScreenSharing}
            isRemoteVideoOff={isRemoteVideoOff}
            duration={duration}
            error={callError}
            formatDuration={formatDuration}
            onToggleMute={toggleMute}
            onToggleVideo={toggleVideo}
            onToggleScreenShare={toggleScreenShare}
            onEndCall={handleEndCall}
            setLocalVideoContainer={setLocalVideoContainer}
            setRemoteVideoContainer={setRemoteVideoContainer}
            setScreenShareContainer={setScreenShareContainer}
          />
        )}
      </AnimatePresence>

      {/* Incoming Call Modal (1-on-1) */}
      {incomingCall && callState === "idle" && (
        <IncomingCallModal
          callerAddress={incomingCall.caller_address}
          callerName={incomingCallFriend?.ensName || incomingCallFriend?.nickname}
          callerAvatar={incomingCallFriend?.avatar}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
        />
      )}

      {/* Incoming Group Call Modal */}
      <AnimatePresence>
        {incomingGroupCall && callState === "idle" && !currentGroupCall && !userSettings.isDnd && (
          <IncomingGroupCallModal
            call={incomingGroupCall}
            onJoin={handleJoinIncomingGroupCall}
            onDismiss={dismissIncomingCall}
          />
        )}
      </AnimatePresence>

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

      {/* Phone Verification Modal */}
      <PhoneVerificationModal
        isOpen={isPhoneModalOpen}
        onClose={() => setIsPhoneModalOpen(false)}
        userAddress={userAddress}
        onSuccess={() => {}}
      />

      {/* Status Modal */}
      <StatusModal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        currentSettings={userSettings}
        onSave={setStatus}
        onToggleDnd={toggleDnd}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={userSettings}
        onToggleSound={toggleSound}
      />

      {/* QR Code Modal */}
      <QRCodeModal
        isOpen={isQRCodeModalOpen}
        onClose={() => setIsQRCodeModalOpen(false)}
        address={userAddress}
        ensName={userENS.ensName}
        shoutUsername={shoutUsername || null}
        avatar={userENS.avatar}
      />

      {/* Socials Modal */}
      <SocialsModal
        isOpen={isSocialsModalOpen}
        onClose={() => setIsSocialsModalOpen(false)}
        socials={socials}
        onSave={saveSocials}
        isLoading={isSocialsLoading}
      />

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        friends={friendsListData}
        onCreate={handleCreateGroup}
        isCreating={isCreatingGroup}
      />

      {/* Group Chat Modal */}
      <GroupChatModal
        isOpen={!!selectedGroup}
        onClose={() => setSelectedGroup(null)}
        userAddress={userAddress}
        group={selectedGroup}
        friends={friendsListData}
        onGroupDeleted={async () => {
          // Refresh groups list after leaving
          const fetchedGroups = await getGroups();
          setGroups(fetchedGroups);
        }}
        onStartCall={handleStartGroupCall}
        hasActiveCall={callState !== "idle" || !!currentGroupCall}
      />

      {/* Group Call UI */}
      <AnimatePresence>
        {currentGroupCall && (
          <GroupCallUI
            call={currentGroupCall}
            participants={groupCallParticipants}
            userAddress={userAddress}
            isMuted={isMuted}
            isVideoOff={isVideoOff}
            isScreenSharing={isScreenSharing}
            duration={groupCallDuration}
            onToggleMute={toggleMute}
            onToggleVideo={toggleVideo}
            onToggleScreenShare={toggleScreenShare}
            onLeave={handleLeaveGroupCall}
            setLocalVideoContainer={setLocalVideoContainer}
            setRemoteVideoContainer={setRemoteVideoContainer}
            setScreenShareContainer={setScreenShareContainer}
            formatDuration={formatDuration}
          />
        )}
      </AnimatePresence>

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
