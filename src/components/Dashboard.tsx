"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { type Address } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { mainnet } from "wagmi/chains";
import { useFriendRequests, type Friend } from "@/hooks/useFriendRequests";
import { useVoiceCall } from "@/hooks/useVoiceCall";
import { useHuddle01Call } from "@/hooks/useHuddle01Call";
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
import { XMTPProvider, useXMTPContext } from "@/context/WakuProvider";
import { useUsername } from "@/hooks/useUsername";
import { usePhoneVerification } from "@/hooks/usePhoneVerification";
import { useNotifications } from "@/hooks/useNotifications";
import { useUserSettings } from "@/hooks/useUserSettings";
import { isAgoraConfigured } from "@/config/agora";
import { isHuddle01Configured, createHuddle01Room } from "@/config/huddle01";
import { StatusModal } from "./StatusModal";
import { SettingsModal } from "./SettingsModal";
import { QRCodeModal } from "./QRCodeModal";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { SocialsModal } from "./SocialsModal";
import { useSocials } from "@/hooks/useSocials";
import { CreateGroupModal } from "./CreateGroupModal";
import { GroupChatModal } from "./GroupChatModal";
import { GroupsList } from "./GroupsList";
import { GroupCallUI } from "./GroupCallUI";
import { IncomingGroupCallModal } from "./IncomingGroupCallModal";
import { type XMTPGroup } from "@/context/WakuProvider";
import { useGroupCallSignaling } from "@/hooks/useGroupCallSignaling";
import { useGroupInvitations } from "@/hooks/useGroupInvitations";
import { GroupInvitations } from "./GroupInvitations";
import { usePresence } from "@/hooks/usePresence";
import { PushNotificationPrompt } from "./PushNotificationPrompt";
import { useLoginTracking } from "@/hooks/useLoginTracking";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { useEmailVerification } from "@/hooks/useEmailVerification";
import { usePoints } from "@/hooks/usePoints";
import { useUserInvites } from "@/hooks/useUserInvites";
import { EmailVerificationModal } from "./EmailVerificationModal";
import { InvitesModal } from "./InvitesModal";
import Link from "next/link";

import { type WalletType } from "@/hooks/useWalletType";

type DashboardProps = {
    userAddress: string; // Can be EVM (0x...) or Solana address
    onLogout: () => void;
    isPasskeyUser?: boolean;
    walletType: WalletType;
};

// Convert Friend from useFriendRequests to the format FriendsList expects
type FriendsListFriend = {
    id: string;
    address: Address;
    ensName: string | null;
    avatar: string | null;
    nickname: string | null;
    reachUsername: string | null;
    addedAt: string;
    isOnline?: boolean;
};

function DashboardContent({
    userAddress,
    onLogout,
    isPasskeyUser,
    walletType,
}: DashboardProps) {
    const isSolanaUser = walletType === "solana";
    // EVM address for hooks that require it
    // For Solana users, pass null to disable EVM-specific features
    const evmAddress = isSolanaUser ? null : (userAddress as `0x${string}`);
    const [isAddFriendOpen, setIsAddFriendOpen] = useState(false);
    const [isUsernameModalOpen, setIsUsernameModalOpen] = useState(false);
    const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isQRCodeModalOpen, setIsQRCodeModalOpen] = useState(false);
    const [isSocialsModalOpen, setIsSocialsModalOpen] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isInvitesModalOpen, setIsInvitesModalOpen] = useState(false);
    const [showWakuSuccess, setShowWakuSuccess] = useState(false);
    const [currentCallFriend, setCurrentCallFriend] =
        useState<FriendsListFriend | null>(null);
    const [chatFriend, setChatFriend] = useState<FriendsListFriend | null>(
        null
    );
    const [userENS, setUserENS] = useState<{
        ensName: string | null;
        avatar: string | null;
    }>({
        ensName: null,
        avatar: null,
    });
    const wakuAutoInitAttempted = useRef(false);
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
            const isIOS =
                /iPad|iPhone|iPod/.test(ua) ||
                (navigator.platform === "MacIntel" &&
                    navigator.maxTouchPoints > 1);
            const isChrome = /CriOS/.test(ua); // CriOS = Chrome on iOS
            setIsIOSChrome(isIOS && isChrome);
        }
    }, []);

    // Close profile menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                profileMenuRef.current &&
                !profileMenuRef.current.contains(event.target as Node)
            ) {
                setIsProfileMenuOpen(false);
            }
        };

        if (isProfileMenuOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            return () =>
                document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [isProfileMenuOpen]);

    // Username hook - works for both EVM and Solana addresses
    const { username: reachUsername, claimUsername } = useUsername(userAddress);

    // Phone verification hook - works for both EVM and Solana addresses
    const {
        phoneNumber: verifiedPhone,
        isVerified: isPhoneVerified,
        refresh: refreshPhone,
    } = usePhoneVerification(userAddress);

    // Socials hook
    const {
        socials,
        socialCount,
        saveSocials,
        fetchSocialsForAddress,
        isLoading: isSocialsLoading,
    } = useSocials(userAddress);

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
        toggleDecentralizedCalls,
    } = useUserSettings(userAddress);

    // Push notifications
    const {
        isSupported: pushSupported,
        permission: pushPermission,
        isSubscribed: pushSubscribed,
        isLoading: pushLoading,
        error: pushError,
        subscribe: subscribeToPush,
        unsubscribe: unsubscribeFromPush,
    } = usePushNotifications(userAddress);

    // Track user login for admin analytics
    useLoginTracking({
        walletAddress: userAddress,
        walletType,
        chain: isSolanaUser ? "solana" : "ethereum",
        ensName: userENS.ensName,
        username: reachUsername,
    });

    // Analytics tracking
    const {
        trackVoiceCall,
        trackVideoCall,
        syncFriendsCount,
        syncGroupsCount,
        trackFriendAdded,
        trackFriendRemoved,
    } = useAnalytics(userAddress);

    // Check if user is an admin
    const { isAdmin, isSuperAdmin } = useAdminCheck(userAddress);

    // Email verification
    const {
        isVerified: isEmailVerified,
        email: userEmail,
        refresh: refreshEmail,
    } = useEmailVerification(userAddress);

    // Points system
    const {
        points: userPoints,
        checkFriendsMilestone,
        awardPoints: awardUserPoints,
        hasClaimed,
        refresh: refreshPoints,
    } = usePoints(userAddress);

    // Retroactively award points for existing username/socials
    useEffect(() => {
        // Award points for existing username if not already claimed
        if (reachUsername && !hasClaimed("username_claimed")) {
            console.log(
                "[Points] Awarding retroactive points for existing username"
            );
            awardUserPoints("username_claimed");
        }
    }, [reachUsername, hasClaimed, awardUserPoints]);

    useEffect(() => {
        // Award points for existing socials if not already claimed
        if (socialCount > 0 && !hasClaimed("social_added")) {
            console.log(
                "[Points] Awarding retroactive points for existing socials"
            );
            awardUserPoints("social_added");
        }
    }, [socialCount, hasClaimed, awardUserPoints]);

    // User invites
    const {
        available: availableInvites,
        used: usedInvites,
        totalAllocation: totalInvites,
    } = useUserInvites(userAddress);
    const allInvitesUsed = usedInvites > 0 && usedInvites === totalInvites;

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
        cancelRequest,
        removeFriend,
        clearError: clearFriendsError,
        isConfigured: isSupabaseConfigured,
        refresh: refreshFriends,
    } = useFriendRequests(userAddress);

    // Presence heartbeat - updates last_seen every 30 seconds
    usePresence(userAddress);

    // Resolve user's ENS and award points if they have one
    useEffect(() => {
        async function resolveUserENS() {
            const resolved = await resolveAddressOrENS(userAddress);
            if (resolved) {
                setUserENS({
                    ensName: resolved.ensName,
                    avatar: resolved.avatar,
                });
                // Award points for having a primary ENS name (only once)
                if (resolved.ensName && !hasClaimed("ens_primary")) {
                    awardUserPoints("ens_primary");
                }
            }
        }
        resolveUserENS();
    }, [userAddress, resolveAddressOrENS, hasClaimed, awardUserPoints]);

    // Agora (centralized) call hook
    const agoraCall = useVoiceCall();

    // Huddle01 (decentralized) call hook
    const huddle01Call = useHuddle01Call(userAddress);

    // Track which provider is currently being used for the active call
    // null = no call, "agora" = centralized, "huddle01" = decentralized
    const [currentCallProvider, setCurrentCallProvider] = useState<
        "agora" | "huddle01" | null
    >(null);

    // Determine which provider to use for UI based on current call
    // When in a call, use the provider that was actually joined
    // When not in a call, default to user's preferred settings
    const useDecentralized =
        userSettings.decentralizedCalls && isHuddle01Configured;
    const activeCall =
        currentCallProvider === "agora"
            ? agoraCall
            : currentCallProvider === "huddle01"
            ? huddle01Call
            : useDecentralized
            ? huddle01Call
            : agoraCall;

    // Destructure from active provider
    const {
        callState,
        callType,
        isMuted,
        isVideoOff,
        isScreenSharing,
        isRemoteVideoOff,
        isRemoteScreenSharing,
        duration,
        error: callError,
        joinCall,
        leaveCall,
        toggleMute,
        toggleVideo,
        toggleScreenShare,
        takeScreenshot,
        formatDuration,
        setLocalVideoContainer,
        setRemoteVideoContainer,
        setScreenShareContainer,
        setLocalScreenShareContainer,
        isConfigured: isCallConfigured,
    } = activeCall;

    const {
        incomingCall,
        remoteHangup,
        startCall,
        acceptCall,
        rejectCall,
        endCall: endCallSignaling,
        clearRemoteHangup,
    } = useCallSignaling(userAddress);

    // Waku is only available for EVM users (not Solana)
    // Use a safe wrapper that returns defaults for Solana users
    const wakuContext = isSolanaUser ? null : useXMTPContext();

    const isWakuInitialized = wakuContext?.isInitialized ?? false;
    const isWakuInitializing = wakuContext?.isInitializing ?? false;
    const wakuError = wakuContext?.error ?? null;
    const unreadCounts = wakuContext?.unreadCounts ?? {};
    const initializeWaku = wakuContext?.initialize ?? (() => Promise.resolve());
    const markAsRead = wakuContext?.markAsRead ?? (() => {});
    const onNewMessage = wakuContext?.onNewMessage ?? (() => () => {});
    const canMessageBatch =
        wakuContext?.canMessageBatch ??
        (() => Promise.resolve({} as Record<string, boolean>));
    const revokeAllInstallations =
        wakuContext?.revokeAllInstallations ?? (() => Promise.resolve(false));
    // Group methods
    const createGroup =
        wakuContext?.createGroup ??
        (() =>
            Promise.resolve({
                success: false,
                error: "Waku not available for Solana wallets",
            }));
    const getGroups = wakuContext?.getGroups ?? (() => Promise.resolve([]));
    const markGroupAsRead = wakuContext?.markGroupAsRead ?? (() => {});
    const joinGroupById =
        wakuContext?.joinGroupById ??
        (() =>
            Promise.resolve({
                success: false,
                error: "Waku not available for Solana wallets",
            }));
    const addGroupMembers =
        wakuContext?.addGroupMembers ?? (() => Promise.resolve(false));
    const leaveGroup = wakuContext?.leaveGroup ?? (() => Promise.resolve());

    // State for reconnecting (kept for API compatibility)
    const [isRevokingInstallations, setIsRevokingInstallations] =
        useState(false);

    // Check if the error is a connection error
    const isInstallationLimitError =
        wakuError &&
        (wakuError.toLowerCase().includes("connection") ||
            wakuError.includes("peer") ||
            wakuError.toLowerCase().includes("timeout"));

    // Handler for revoking installations
    const handleRevokeInstallations = async () => {
        setIsRevokingInstallations(true);
        try {
            const success = await revokeAllInstallations();
            if (success) {
                // Auto-retry initialization after successful revoke
                await initializeWaku();
            }
        } finally {
            setIsRevokingInstallations(false);
        }
    };

    // Toast notification state
    const [toast, setToast] = useState<{
        message: string;
        sender: string;
    } | null>(null);

    // Track which friends can receive Waku messages
    const [friendsWakuStatus, setFriendsWakuStatus] = useState<
        Record<string, boolean>
    >({});

    // Auto-initialize Waku after a short delay (EVM users only)
    useEffect(() => {
        // Skip for Solana users - Waku not supported
        if (isSolanaUser) return;

        if (
            !isWakuInitialized &&
            !isWakuInitializing &&
            !wakuAutoInitAttempted.current
        ) {
            wakuAutoInitAttempted.current = true;
            // Small delay to let the UI settle, then initialize Waku
            const timer = setTimeout(() => {
                initializeWaku();
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [isSolanaUser, isWakuInitialized, isWakuInitializing, initializeWaku]);

    // Show Waku success message briefly when initialized (EVM users only)
    useEffect(() => {
        if (isWakuInitialized && !isPasskeyUser && !isSolanaUser) {
            setShowWakuSuccess(true);
            const timer = setTimeout(() => {
                setShowWakuSuccess(false);
            }, 4000); // Hide after 4 seconds
            return () => clearTimeout(timer);
        }
    }, [isWakuInitialized, isPasskeyUser, isSolanaUser]);

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

    // Convert friends to the format FriendsList expects - memoized to prevent unnecessary re-renders
    const friendsListData: FriendsListFriend[] = useMemo(
        () =>
            friends.map((f) => ({
                id: f.id,
                address: f.friend_address as Address,
                ensName: f.ensName || null,
                avatar: f.avatar || null,
                nickname: f.nickname,
                reachUsername: f.reachUsername || null,
                addedAt: f.created_at,
            })),
        [friends]
    );

    // Check which friends can receive Waku messages (EVM users only)
    useEffect(() => {
        if (isPasskeyUser || isSolanaUser || friends.length === 0) {
            return;
        }

        const checkFriendsWaku = async () => {
            const addresses = friends.map((f) => f.friend_address);
            const status = await canMessageBatch(addresses);
            setFriendsWakuStatus(status);
        };

        checkFriendsWaku();
    }, [friends, isPasskeyUser, isSolanaUser, canMessageBatch]);

    // Sync friends count for analytics
    useEffect(() => {
        if (friends.length > 0) {
            syncFriendsCount(friends.length);
        }
    }, [friends.length, syncFriendsCount]);

    // Load groups when Waku is initialized (EVM users only)
    useEffect(() => {
        if (!isWakuInitialized || isPasskeyUser || isSolanaUser) return;

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
    }, [isWakuInitialized, isPasskeyUser, isSolanaUser, getGroups]);

    // Sync groups count for analytics
    useEffect(() => {
        if (groups.length > 0) {
            syncGroupsCount(groups.length);
        }
    }, [groups.length, syncGroupsCount]);

    // Handler to create a new group
    const handleCreateGroup = async (
        memberAddresses: string[],
        groupName: string
    ): Promise<boolean> => {
        setIsCreatingGroup(true);
        try {
            // Create the group WITH all members immediately
            // (Waku requires creator to add members - members can't add themselves)
            const result = await createGroup(memberAddresses, groupName);
            if (!result.success || !result.groupId) {
                console.error(
                    "[Dashboard] Failed to create group:",
                    result.error
                );
                return false;
            }

            // Send invitations with group data so invited users can join
            // Include symmetric key and members so they can decrypt messages
            const invitesSent = await sendInvitations(
                result.groupId,
                groupName,
                memberAddresses,
                result.symmetricKey,
                result.members
            );
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
    const handleJoinGroupFromInvite = async (
        groupId: string,
        groupData?: { name: string; symmetricKey: string; members: string[] }
    ) => {
        try {
            // Join the Waku group with group data (needed for invited users)
            const result = await joinGroupById(groupId, groupData);
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
    const handleStartGroupCall = async (
        groupId: string,
        groupName: string,
        isVideo: boolean
    ) => {
        if (!isCallConfigured) {
            alert(
                "Calling not configured. Please set NEXT_PUBLIC_AGORA_APP_ID."
            );
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
        // Track call analytics before ending
        const callDurationMinutes = Math.ceil(groupCallDuration / 60);
        if (callDurationMinutes > 0) {
            // Group calls are typically video calls
            trackVideoCall(callDurationMinutes);
        }

        if (userSettings.soundEnabled) {
            notifyCallEnded();
        }
        await leaveCall();
        await leaveGroupCall();
    };

    // Handler to join an existing group call
    const handleJoinGroupCall = async (groupId: string) => {
        if (!isCallConfigured) {
            alert(
                "Calling not configured. Please set NEXT_PUBLIC_AGORA_APP_ID."
            );
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
        const success = await joinCall(
            call.channelName,
            undefined,
            call.isVideo
        );
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
        const success = await joinCall(
            call.channelName,
            undefined,
            call.isVideo
        );
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
    }, [
        incomingGroupCall,
        callState,
        currentGroupCall,
        startRinging,
        stopRinging,
        userSettings.soundEnabled,
        userSettings.isDnd,
        incomingCall,
    ]);

    // Find caller info from friends list
    const incomingCallFriend = incomingCall
        ? friendsListData.find(
              (f) =>
                  f.address.toLowerCase() ===
                  incomingCall.caller_address.toLowerCase()
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
                const callerName =
                    incomingCallFriend?.ensName ||
                    incomingCallFriend?.nickname ||
                    "Someone";
                startRinging(callerName);
            }
        } else {
            stopRinging();
        }
    }, [
        incomingCall,
        callState,
        incomingCallFriend,
        startRinging,
        stopRinging,
        userSettings.isDnd,
        userSettings.soundEnabled,
        rejectCall,
    ]);

    // Listen for new messages and show toast + notification (EVM users only)
    useEffect(() => {
        if (!isWakuInitialized || isSolanaUser) return;

        const unsubscribe = onNewMessage(({ senderAddress, content }) => {
            // Find friend info for the sender
            const friend = friendsListData.find(
                (f) => f.address.toLowerCase() === senderAddress.toLowerCase()
            );
            // Priority: nickname > Spritz username > ENS > shortened address
            const senderName =
                friend?.nickname ||
                friend?.reachUsername ||
                friend?.ensName ||
                formatAddress(senderAddress);

            // Play sound and show browser notification (if sound enabled)
            if (userSettings.soundEnabled) {
                notifyMessage(senderName, content);
            }

            // Show toast notification in-app
            setToast({
                sender: senderName,
                message:
                    content.length > 50
                        ? content.slice(0, 50) + "..."
                        : content,
            });

            // Auto-hide after 4 seconds
            setTimeout(() => setToast(null), 4000);
        });

        return unsubscribe;
    }, [
        isWakuInitialized,
        onNewMessage,
        friendsListData,
        notifyMessage,
        userSettings.soundEnabled,
    ]);

    const handleSendFriendRequest = async (
        addressOrENS: string
    ): Promise<boolean> => {
        return await sendFriendRequest(addressOrENS);
    };

    const handleCall = async (
        friend: FriendsListFriend,
        withVideo: boolean = false
    ) => {
        if (!isCallConfigured) {
            alert(
                "Calling not configured. Please set NEXT_PUBLIC_AGORA_APP_ID."
            );
            return;
        }

        setCurrentCallFriend(friend);
        if (userSettings.soundEnabled) {
            notifyOutgoingCall(); // Play outgoing call sound
        }

        // Determine the channel/room name based on call provider
        let channelName: string;
        const useDecentralizedForCall =
            userSettings.decentralizedCalls && isHuddle01Configured;

        // Set the provider BEFORE making the call so UI uses correct state
        const provider = useDecentralizedForCall ? "huddle01" : "agora";
        setCurrentCallProvider(provider);

        if (useDecentralizedForCall) {
            // Create a Huddle01 room and use its ID
            console.log("[Dashboard] Creating Huddle01 room for call...");
            const roomResult = await createHuddle01Room("Spritz Call");
            if (!roomResult) {
                console.error("[Dashboard] Failed to create Huddle01 room");
                setCurrentCallFriend(null);
                setCurrentCallProvider(null);
                alert(
                    "Failed to create decentralized call room. Please try again or disable decentralized calls."
                );
                return;
            }
            channelName = roomResult.roomId;
            console.log("[Dashboard] Huddle01 room created:", channelName);
        } else {
            // Generate a unique channel name for Agora based on both addresses (sorted for consistency)
            const addresses = [
                userAddress.toLowerCase(),
                friend.address.toLowerCase(),
            ].sort();
            channelName = `spritz_${addresses[0].slice(
                2,
                10
            )}_${addresses[1].slice(2, 10)}`;
        }

        // Create signaling record to notify the callee
        const callerDisplayName =
            userENS.ensName ||
            (reachUsername ? `@${reachUsername}` : undefined);
        const callRecord = await startCall(
            friend.address,
            channelName,
            callerDisplayName,
            withVideo ? "video" : "audio"
        );

        if (!callRecord) {
            console.error("[Dashboard] Failed to create call signaling record");
            setCurrentCallFriend(null);
            setCurrentCallProvider(null);
            return;
        }

        // Wait briefly to see if call was immediately rejected (DND auto-reject)
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Check if the call was rejected during the wait
        if (remoteHangup) {
            console.log(
                "[Dashboard] Call was rejected (likely DND) - not joining"
            );
            setCurrentCallFriend(null);
            setCurrentCallProvider(null);
            clearRemoteHangup();
            // Show notification to caller
            setToast({
                sender: friend.ensName || friend.nickname || "Friend",
                message: "is not available right now (Do Not Disturb)",
            });
            setTimeout(() => setToast(null), 4000);
            return;
        }

        // Join the call using the selected provider
        let success: boolean;
        if (provider === "huddle01") {
            success = await huddle01Call.joinCall(
                channelName,
                undefined,
                withVideo
            );

            // If Huddle01 fails, fall back to Agora
            if (!success && isAgoraConfigured) {
                console.log(
                    "[Dashboard] Huddle01 failed, falling back to Agora..."
                );
                setCurrentCallProvider("agora");

                // Generate Agora channel name
                const addresses = [
                    userAddress.toLowerCase(),
                    friend.address.toLowerCase(),
                ].sort();
                const agoraChannelName = `spritz_${addresses[0].slice(
                    2,
                    10
                )}_${addresses[1].slice(2, 10)}`;

                // Update the signaling record with the new channel name
                await endCallSignaling();
                const fallbackRecord = await startCall(
                    friend.address,
                    agoraChannelName,
                    callerDisplayName,
                    withVideo ? "video" : "audio"
                );

                if (fallbackRecord) {
                    success = await agoraCall.joinCall(
                        agoraChannelName,
                        undefined,
                        withVideo
                    );
                    if (success) {
                        setToast({
                            sender: "Spritz",
                            message:
                                "Using centralized call (Huddle01 unavailable)",
                        });
                        setTimeout(() => setToast(null), 4000);
                    }
                }
            }
        } else {
            success = await agoraCall.joinCall(
                channelName,
                undefined,
                withVideo
            );
        }

        if (success && userSettings.soundEnabled) {
            notifyCallConnected();
        }
    };

    const handleVideoCall = async (friend: FriendsListFriend) => {
        await handleCall(friend, true);
    };

    const handleAcceptCall = async () => {
        stopRinging(); // Stop the ring sound
        const result = await acceptCall();
        if (result) {
            const { channelName, callType } = result;
            // Find the caller friend to show in the call UI
            if (incomingCallFriend) {
                setCurrentCallFriend(incomingCallFriend);
            }
            // Join the call channel with video if it's a video call
            const withVideo = callType === "video";

            // Detect if this is a decentralized (Huddle01) or centralized (Agora) call
            // Agora channels start with "spritz_", Huddle01 uses room IDs
            const isDecentralizedCall = !channelName.startsWith("spritz_");

            console.log(
                "[Dashboard] Accepting call, type:",
                callType,
                "withVideo:",
                withVideo,
                "isDecentralized:",
                isDecentralizedCall
            );

            // Set the provider BEFORE joining so UI uses correct state
            let provider: "huddle01" | "agora" =
                isDecentralizedCall && isHuddle01Configured
                    ? "huddle01"
                    : "agora";
            setCurrentCallProvider(provider);

            // Use the appropriate call provider based on the channel type
            let success: boolean;
            if (provider === "huddle01") {
                success = await huddle01Call.joinCall(
                    channelName,
                    undefined,
                    withVideo
                );

                // If Huddle01 fails, fall back to Agora (caller will need to retry with Agora)
                if (!success && isAgoraConfigured) {
                    console.log(
                        "[Dashboard] Huddle01 failed to accept, falling back to Agora..."
                    );
                    setCurrentCallProvider("agora");
                    provider = "agora";
                    // For incoming calls, we can't change the channel - the caller needs to reinitiate
                    // Just show a message
                    setToast({
                        sender: "Spritz",
                        message:
                            "Decentralized call failed. Ask caller to try again.",
                    });
                    setTimeout(() => setToast(null), 4000);
                    setCurrentCallFriend(null);
                    setCurrentCallProvider(null);
                    return;
                }
            } else {
                success = await agoraCall.joinCall(
                    channelName,
                    undefined,
                    withVideo
                );
            }

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
            setCurrentCallProvider(null);
            clearRemoteHangup();
        }
    }, [
        remoteHangup,
        leaveCall,
        clearRemoteHangup,
        notifyCallEnded,
        userSettings.soundEnabled,
    ]);

    const handleEndCall = async () => {
        // Track call analytics before ending
        const callDurationMinutes = Math.ceil(duration / 60);
        if (callDurationMinutes > 0) {
            if (!isVideoOff) {
                trackVideoCall(callDurationMinutes);
            } else {
                trackVoiceCall(callDurationMinutes);
            }
        }

        if (userSettings.soundEnabled) {
            notifyCallEnded();
        }
        await leaveCall();
        await endCallSignaling();
        setCurrentCallFriend(null);
        setCurrentCallProvider(null);
    };

    const handleRemoveFriend = async (friendId: string) => {
        await removeFriend(friendId);
        trackFriendRemoved();
    };

    // Wrapped accept request that tracks analytics
    const handleAcceptRequest = async (requestId: string): Promise<boolean> => {
        const result = await acceptRequest(requestId);
        trackFriendAdded();
        return result;
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
                <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-lg sticky top-0 z-40 safe-area-pt">
                    <div className="max-w-4xl mx-auto px-4 py-4 safe-area-pl safe-area-pr">
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
                                            className="w-10 h-10 rounded-xl object-cover ring-2 ring-transparent group-hover:ring-[#FF5500]/50 transition-all"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FB8D22] to-[#FF5500] flex items-center justify-center ring-2 ring-transparent group-hover:ring-[#FF5500]/50 transition-all">
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
                                        onClick={() =>
                                            setIsProfileMenuOpen(
                                                !isProfileMenuOpen
                                            )
                                        }
                                        className="text-left hover:opacity-80 transition-opacity"
                                    >
                                        <h1 className="text-white font-bold flex items-center gap-1">
                                            <span className="text-lg">
                                                {userSettings.statusEmoji}
                                            </span>
                                            {userENS.ensName ||
                                                (reachUsername
                                                    ? `@${reachUsername}`
                                                    : "Spritz")}
                                            {userSettings.isDnd && (
                                                <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
                                                    DND
                                                </span>
                                            )}
                                            <svg
                                                className="w-4 h-4 text-zinc-500"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M19 9l-7 7-7-7"
                                                />
                                            </svg>
                                        </h1>
                                        <p className="text-zinc-500 text-sm">
                                            {userSettings.statusText ||
                                                formatAddress(userAddress)}
                                        </p>
                                    </button>

                                    {/* Profile Dropdown Menu */}
                                    <AnimatePresence>
                                        {isProfileMenuOpen && (
                                            <motion.div
                                                initial={{
                                                    opacity: 0,
                                                    y: -10,
                                                    scale: 0.95,
                                                }}
                                                animate={{
                                                    opacity: 1,
                                                    y: 0,
                                                    scale: 1,
                                                }}
                                                exit={{
                                                    opacity: 0,
                                                    y: -10,
                                                    scale: 0.95,
                                                }}
                                                transition={{ duration: 0.15 }}
                                                className="absolute left-0 top-full mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50"
                                            >
                                                {/* 1. Status */}
                                                <button
                                                    onClick={() => {
                                                        setIsProfileMenuOpen(
                                                            false
                                                        );
                                                        setIsStatusModalOpen(
                                                            true
                                                        );
                                                    }}
                                                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left"
                                                >
                                                    <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-lg">
                                                        {
                                                            userSettings.statusEmoji
                                                        }
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white text-sm font-medium">
                                                            Status
                                                        </p>
                                                        <p className="text-zinc-500 text-xs truncate">
                                                            {userSettings.statusText ||
                                                                "Set your status"}
                                                        </p>
                                                    </div>
                                                    {userSettings.isDnd && (
                                                        <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
                                                            DND
                                                        </span>
                                                    )}
                                                </button>

                                                {/* 2. My QR Code */}
                                                <button
                                                    onClick={() => {
                                                        setIsProfileMenuOpen(
                                                            false
                                                        );
                                                        setIsQRCodeModalOpen(
                                                            true
                                                        );
                                                    }}
                                                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left border-t border-zinc-800"
                                                >
                                                    <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                                                        <svg
                                                            className="w-4 h-4 text-zinc-400"
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
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white text-sm font-medium">
                                                            My QR Code
                                                        </p>
                                                        <p className="text-zinc-500 text-xs">
                                                            Share to add friends
                                                        </p>
                                                    </div>
                                                </button>

                                                {/* 3. Username */}
                                                <button
                                                    onClick={() => {
                                                        setIsProfileMenuOpen(
                                                            false
                                                        );
                                                        setIsUsernameModalOpen(
                                                            true
                                                        );
                                                    }}
                                                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left border-t border-zinc-800"
                                                >
                                                    <div
                                                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                                            reachUsername
                                                                ? "bg-emerald-500/20"
                                                                : "bg-zinc-800"
                                                        }`}
                                                    >
                                                        <svg
                                                            className={`w-4 h-4 ${
                                                                reachUsername
                                                                    ? "text-emerald-400"
                                                                    : "text-zinc-500"
                                                            }`}
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                                            />
                                                        </svg>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white text-sm font-medium">
                                                            Username
                                                        </p>
                                                        <p
                                                            className={`text-xs truncate ${
                                                                reachUsername
                                                                    ? "text-emerald-400"
                                                                    : "text-zinc-500"
                                                            }`}
                                                        >
                                                            {reachUsername
                                                                ? `@${reachUsername}`
                                                                : "Claim a username (+10 pts)"}
                                                        </p>
                                                    </div>
                                                    {reachUsername && (
                                                        <svg
                                                            className="w-4 h-4 text-emerald-400"
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
                                                    )}
                                                </button>

                                                {/* 4. Email */}
                                                <button
                                                    onClick={() => {
                                                        setIsProfileMenuOpen(
                                                            false
                                                        );
                                                        setIsEmailModalOpen(
                                                            true
                                                        );
                                                    }}
                                                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left border-t border-zinc-800"
                                                >
                                                    <div
                                                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                                            isEmailVerified
                                                                ? "bg-emerald-500/20"
                                                                : "bg-zinc-800"
                                                        }`}
                                                    >
                                                        <svg
                                                            className={`w-4 h-4 ${
                                                                isEmailVerified
                                                                    ? "text-emerald-400"
                                                                    : "text-zinc-500"
                                                            }`}
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                                            />
                                                        </svg>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white text-sm font-medium">
                                                            Email
                                                        </p>
                                                        <p
                                                            className={`text-xs ${
                                                                isEmailVerified
                                                                    ? "text-emerald-400"
                                                                    : "text-zinc-500"
                                                            }`}
                                                        >
                                                            {isEmailVerified
                                                                ? "Verified"
                                                                : "Add email (+100 pts)"}
                                                        </p>
                                                    </div>
                                                    {isEmailVerified && (
                                                        <svg
                                                            className="w-4 h-4 text-emerald-400"
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
                                                    )}
                                                </button>

                                                {/* 5. Phone */}
                                                <button
                                                    onClick={() => {
                                                        setIsProfileMenuOpen(
                                                            false
                                                        );
                                                        setIsPhoneModalOpen(
                                                            true
                                                        );
                                                    }}
                                                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left border-t border-zinc-800"
                                                >
                                                    <div
                                                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                                            isPhoneVerified
                                                                ? "bg-emerald-500/20"
                                                                : "bg-zinc-800"
                                                        }`}
                                                    >
                                                        <svg
                                                            className={`w-4 h-4 ${
                                                                isPhoneVerified
                                                                    ? "text-emerald-400"
                                                                    : "text-zinc-500"
                                                            }`}
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
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white text-sm font-medium">
                                                            Phone
                                                        </p>
                                                        <p
                                                            className={`text-xs truncate ${
                                                                isPhoneVerified
                                                                    ? "text-emerald-400"
                                                                    : "text-zinc-500"
                                                            }`}
                                                        >
                                                            {isPhoneVerified
                                                                ? "Verified"
                                                                : "Add phone (+100 pts)"}
                                                        </p>
                                                    </div>
                                                    {isPhoneVerified && (
                                                        <svg
                                                            className="w-4 h-4 text-emerald-400"
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
                                                    )}
                                                </button>

                                                {/* 6. Socials */}
                                                <button
                                                    onClick={() => {
                                                        setIsProfileMenuOpen(
                                                            false
                                                        );
                                                        setIsSocialsModalOpen(
                                                            true
                                                        );
                                                    }}
                                                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left border-t border-zinc-800"
                                                >
                                                    <div
                                                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                                            socialCount > 0
                                                                ? "bg-emerald-500/20"
                                                                : "bg-zinc-800"
                                                        }`}
                                                    >
                                                        <svg
                                                            className={`w-4 h-4 ${
                                                                socialCount > 0
                                                                    ? "text-emerald-400"
                                                                    : "text-zinc-500"
                                                            }`}
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                                                            />
                                                        </svg>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white text-sm font-medium">
                                                            Socials
                                                        </p>
                                                        <p
                                                            className={`text-xs ${
                                                                socialCount > 0
                                                                    ? "text-emerald-400"
                                                                    : "text-zinc-500"
                                                            }`}
                                                        >
                                                            {socialCount > 0
                                                                ? `${socialCount} connected`
                                                                : "Add your socials (+10 pts)"}
                                                        </p>
                                                    </div>
                                                    {socialCount > 0 && (
                                                        <svg
                                                            className="w-4 h-4 text-emerald-400"
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
                                                    )}
                                                </button>

                                                {/* 7. ENS/SNS Name Service */}
                                                {isSolanaUser ? (
                                                    // Solana users - show SNS link
                                                    <a
                                                        href="https://www.sns.id/"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={() =>
                                                            setIsProfileMenuOpen(
                                                                false
                                                            )
                                                        }
                                                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left border-t border-zinc-800"
                                                    >
                                                        <div className="w-8 h-8 rounded-lg bg-[#FB8D22]/20 flex items-center justify-center">
                                                            <svg
                                                                className="w-4 h-4 text-[#FFBBA7]"
                                                                fill="none"
                                                                viewBox="0 0 24 24"
                                                                stroke="currentColor"
                                                            >
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    strokeWidth={
                                                                        2
                                                                    }
                                                                    d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                                                                />
                                                            </svg>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-white text-sm font-medium">
                                                                SNS
                                                            </p>
                                                            <p className="text-[#FFBBA7] text-xs">
                                                                Get an SNS →
                                                            </p>
                                                        </div>
                                                    </a>
                                                ) : userENS.ensName ? (
                                                    // EVM users with ENS
                                                    <div className="px-4 py-3 flex items-center gap-3 border-t border-zinc-800">
                                                        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                                            <svg
                                                                className="w-4 h-4 text-emerald-400"
                                                                fill="none"
                                                                viewBox="0 0 24 24"
                                                                stroke="currentColor"
                                                            >
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    strokeWidth={
                                                                        2
                                                                    }
                                                                    d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                                                                />
                                                            </svg>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-white text-sm font-medium">
                                                                ENS
                                                            </p>
                                                            <p className="text-emerald-400 text-xs truncate">
                                                                {
                                                                    userENS.ensName
                                                                }
                                                            </p>
                                                        </div>
                                                        <svg
                                                            className="w-4 h-4 text-emerald-400"
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
                                                    </div>
                                                ) : (
                                                    // EVM users without ENS
                                                    <a
                                                        href="https://app.ens.domains/"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={() =>
                                                            setIsProfileMenuOpen(
                                                                false
                                                            )
                                                        }
                                                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left border-t border-zinc-800"
                                                    >
                                                        <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                                                            <svg
                                                                className="w-4 h-4 text-zinc-500"
                                                                fill="none"
                                                                viewBox="0 0 24 24"
                                                                stroke="currentColor"
                                                            >
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    strokeWidth={
                                                                        2
                                                                    }
                                                                    d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                                                                />
                                                            </svg>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-white text-sm font-medium">
                                                                ENS
                                                            </p>
                                                            <p className="text-zinc-500 text-xs">
                                                                Get an ENS →
                                                            </p>
                                                        </div>
                                                    </a>
                                                )}

                                                {/* 8. Points */}
                                                {(() => {
                                                    const hasNameService =
                                                        userENS.ensName ||
                                                        isSolanaUser; // Solana users can have SNS
                                                    const isPointsVerified =
                                                        userPoints > 0 &&
                                                        hasNameService;
                                                    return (
                                                        <div className="px-4 py-3 flex items-center gap-3 border-t border-zinc-800">
                                                            <div
                                                                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                                                    isPointsVerified
                                                                        ? "bg-emerald-500/20"
                                                                        : "bg-amber-500/20"
                                                                }`}
                                                            >
                                                                <svg
                                                                    className={`w-4 h-4 ${
                                                                        isPointsVerified
                                                                            ? "text-emerald-400"
                                                                            : "text-amber-400"
                                                                    }`}
                                                                    fill="none"
                                                                    viewBox="0 0 24 24"
                                                                    stroke="currentColor"
                                                                >
                                                                    <path
                                                                        strokeLinecap="round"
                                                                        strokeLinejoin="round"
                                                                        strokeWidth={
                                                                            2
                                                                        }
                                                                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                                                    />
                                                                </svg>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-white text-sm font-medium">
                                                                    Points
                                                                </p>
                                                                <p
                                                                    className={`text-xs ${
                                                                        isPointsVerified
                                                                            ? "text-emerald-400"
                                                                            : "text-amber-400"
                                                                    }`}
                                                                >
                                                                    {userPoints.toLocaleString()}{" "}
                                                                    pts
                                                                </p>
                                                            </div>
                                                            <div
                                                                className={`px-2 py-0.5 rounded-full ${
                                                                    isPointsVerified
                                                                        ? "bg-emerald-500/20"
                                                                        : "bg-amber-500/20"
                                                                }`}
                                                            >
                                                                <span
                                                                    className={`text-xs font-medium ${
                                                                        isPointsVerified
                                                                            ? "text-emerald-400"
                                                                            : "text-amber-400"
                                                                    }`}
                                                                >
                                                                    {userPoints.toLocaleString()}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                {/* 9. Invites */}
                                                <button
                                                    onClick={() => {
                                                        setIsProfileMenuOpen(
                                                            false
                                                        );
                                                        setIsInvitesModalOpen(
                                                            true
                                                        );
                                                    }}
                                                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left border-t border-zinc-800"
                                                >
                                                    <div
                                                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                                            allInvitesUsed
                                                                ? "bg-emerald-500/20"
                                                                : "bg-[#FB8D22]/20"
                                                        }`}
                                                    >
                                                        <svg
                                                            className={`w-4 h-4 ${
                                                                allInvitesUsed
                                                                    ? "text-emerald-400"
                                                                    : "text-[#FFBBA7]"
                                                            }`}
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                                                            />
                                                        </svg>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white text-sm font-medium">
                                                            Invites
                                                        </p>
                                                        <p
                                                            className={`text-xs ${
                                                                allInvitesUsed
                                                                    ? "text-emerald-400"
                                                                    : "text-[#FFBBA7]"
                                                            }`}
                                                        >
                                                            {allInvitesUsed
                                                                ? `All ${usedInvites} codes redeemed!`
                                                                : `${availableInvites} codes available`}
                                                        </p>
                                                    </div>
                                                    {allInvitesUsed ? (
                                                        <svg
                                                            className="w-4 h-4 text-emerald-400"
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
                                                    ) : (
                                                        <div className="bg-[#FB8D22]/20 px-2 py-0.5 rounded-full">
                                                            <span className="text-[#FFBBA7] text-xs font-medium">
                                                                {
                                                                    availableInvites
                                                                }
                                                            </span>
                                                        </div>
                                                    )}
                                                </button>

                                                {/* 10. Settings */}
                                                <button
                                                    onClick={() => {
                                                        setIsProfileMenuOpen(
                                                            false
                                                        );
                                                        setIsSettingsModalOpen(
                                                            true
                                                        );
                                                    }}
                                                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left border-t border-zinc-800"
                                                >
                                                    <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                                                        <svg
                                                            className="w-4 h-4 text-zinc-500"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                                                            />
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                                            />
                                                        </svg>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white text-sm font-medium">
                                                            Settings
                                                        </p>
                                                        <p className="text-zinc-500 text-xs">
                                                            Sound & preferences
                                                        </p>
                                                    </div>
                                                </button>

                                                {/* Admin Panel - Only shown to admins */}
                                                {isAdmin && (
                                                    <Link
                                                        href="/admin"
                                                        onClick={() =>
                                                            setIsProfileMenuOpen(
                                                                false
                                                            )
                                                        }
                                                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left border-t border-zinc-800"
                                                    >
                                                        <div
                                                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                                                isSuperAdmin
                                                                    ? "bg-amber-500/20"
                                                                    : "bg-[#FB8D22]/20"
                                                            }`}
                                                        >
                                                            <svg
                                                                className={`w-4 h-4 ${
                                                                    isSuperAdmin
                                                                        ? "text-amber-400"
                                                                        : "text-[#FFBBA7]"
                                                                }`}
                                                                fill="none"
                                                                viewBox="0 0 24 24"
                                                                stroke="currentColor"
                                                            >
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    strokeWidth={
                                                                        2
                                                                    }
                                                                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                                                                />
                                                            </svg>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-white text-sm font-medium">
                                                                Admin Panel
                                                            </p>
                                                            <p
                                                                className={`text-xs ${
                                                                    isSuperAdmin
                                                                        ? "text-amber-400"
                                                                        : "text-[#FFBBA7]"
                                                                }`}
                                                            >
                                                                {isSuperAdmin
                                                                    ? "Super Admin"
                                                                    : "Admin"}
                                                            </p>
                                                        </div>
                                                        <svg
                                                            className={`w-4 h-4 ${
                                                                isSuperAdmin
                                                                    ? "text-amber-400"
                                                                    : "text-[#FFBBA7]"
                                                            }`}
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M9 5l7 7-7 7"
                                                            />
                                                        </svg>
                                                    </Link>
                                                )}
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
                                    <svg
                                        className="w-5 h-5 text-amber-400 flex-shrink-0"
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
                                    <p className="text-amber-200 text-sm">
                                        <span className="font-medium">
                                            Voice calls require Safari on
                                            iPhone.
                                        </span>
                                        <span className="text-amber-300/70 ml-1 hidden sm:inline">
                                            Open this page in Safari for the
                                            best experience.
                                        </span>
                                    </p>
                                </div>
                                <button
                                    onClick={() => setDismissIOSWarning(true)}
                                    className="p-1 rounded hover:bg-amber-500/20 text-amber-400 transition-colors flex-shrink-0"
                                >
                                    <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M6 18L18 6M6 6l12 12"
                                        />
                                    </svg>
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Main Content */}
                <main className="max-w-4xl mx-auto px-4 py-8">
                    {/* Network Banner - Show if not on mainnet (disabled for now due to state sync issues) */}
                    {false &&
                        !isOnMainnet &&
                        chain &&
                        !dismissNetworkBanner && (
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
                                                If your wallet is already on
                                                Mainnet, try refreshing the page
                                                or dismiss this.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() =>
                                                window.location.reload()
                                            }
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
                                                    <svg
                                                        className="w-4 h-4 animate-spin"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                    >
                                                        <circle
                                                            className="opacity-25"
                                                            cx="12"
                                                            cy="12"
                                                            r="10"
                                                            stroke="currentColor"
                                                            strokeWidth="4"
                                                        />
                                                        <path
                                                            className="opacity-75"
                                                            fill="currentColor"
                                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                        />
                                                    </svg>
                                                    Switching...
                                                </>
                                            ) : (
                                                "Switch"
                                            )}
                                        </button>
                                        <button
                                            onClick={() =>
                                                setDismissNetworkBanner(true)
                                            }
                                            className="p-2 rounded-lg hover:bg-zinc-700 text-orange-400 hover:text-white transition-colors"
                                            title="Dismiss"
                                        >
                                            <svg
                                                className="w-4 h-4"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M6 18L18 6M6 6l12 12"
                                                />
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
                                    <p className="text-amber-200 font-medium">
                                        Database Not Connected
                                    </p>
                                    <p className="text-amber-200/70 text-sm mt-1">
                                        Set Supabase environment variables to
                                        enable friend requests.
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
                                    <p className="text-amber-200 font-medium">
                                        Voice Calling Not Configured
                                    </p>
                                    <p className="text-amber-200/70 text-sm mt-1">
                                        Set{" "}
                                        <code className="bg-amber-500/20 px-1 rounded">
                                            NEXT_PUBLIC_AGORA_APP_ID
                                        </code>{" "}
                                        to enable voice calls.
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Solana User Notice - Chat not available */}
                    {isSolanaUser && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mb-6"
                        >
                            <div className="bg-gradient-to-r from-[#FB8D22]/20 to-[#FB8D22]/20 border border-[#FB8D22]/30 rounded-xl p-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-full bg-[#FB8D22]/20 flex items-center justify-center flex-shrink-0">
                                        <svg
                                            className="w-5 h-5 text-[#FFBBA7]"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                            />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-[#FFF0E0] font-medium">
                                            Solana Wallet Connected
                                        </p>
                                        <p className="text-[#FFF0E0]/70 text-sm mt-1">
                                            Voice calls are available! Encrypted
                                            chat requires an Ethereum wallet
                                            (requires EVM wallet).
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Waku Status Banner - hidden for passkey users and Solana users */}
                    {!isWakuInitialized && !isPasskeyUser && !isSolanaUser && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mb-6 bg-[#FF5500]/10 border border-[#FF5500]/30 rounded-xl p-4"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-start gap-3">
                                    <svg
                                        className="w-5 h-5 text-[#FFBBA7] mt-0.5"
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
                                        <p className="text-[#FFF0E0] font-medium">
                                            Enable Encrypted Chat
                                        </p>
                                        <p className="text-[#FFF0E0]/70 text-sm mt-1">
                                            Connecting to a decentralized
                                            network for encrypted peer-to-peer
                                            messaging.
                                        </p>
                                        {wakuError && (
                                            <p className="text-red-400 text-sm mt-1">
                                                {wakuError}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isInstallationLimitError && (
                                        <button
                                            onClick={handleRevokeInstallations}
                                            disabled={
                                                isRevokingInstallations ||
                                                isWakuInitializing
                                            }
                                            className="py-2 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {isRevokingInstallations ? (
                                                <>
                                                    <svg
                                                        className="w-4 h-4 animate-spin"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                    >
                                                        <circle
                                                            className="opacity-25"
                                                            cx="12"
                                                            cy="12"
                                                            r="10"
                                                            stroke="currentColor"
                                                            strokeWidth="4"
                                                        />
                                                        <path
                                                            className="opacity-75"
                                                            fill="currentColor"
                                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                        />
                                                    </svg>
                                                    Revoking...
                                                </>
                                            ) : (
                                                "Revoke & Retry"
                                            )}
                                        </button>
                                    )}
                                    {!isInstallationLimitError && (
                                        <button
                                            onClick={initializeWaku}
                                            disabled={isWakuInitializing}
                                            className="py-2 px-4 rounded-lg bg-[#FF5500] hover:bg-[#E04D00] text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {isWakuInitializing ? (
                                                <>
                                                    <svg
                                                        className="w-4 h-4 animate-spin"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                    >
                                                        <circle
                                                            className="opacity-25"
                                                            cx="12"
                                                            cy="12"
                                                            r="10"
                                                            stroke="currentColor"
                                                            strokeWidth="4"
                                                        />
                                                        <path
                                                            className="opacity-75"
                                                            fill="currentColor"
                                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                        />
                                                    </svg>
                                                    Enabling...
                                                </>
                                            ) : (
                                                "Enable Chat"
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Waku Enabled Success - auto-dismisses after 4 seconds */}
                    <AnimatePresence>
                        {showWakuSuccess && (
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
                                        Encrypted Chat Enabled! You can now send
                                        and receive encrypted messages.
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Friend Requests Section */}
                    {(incomingRequests.length > 0 ||
                        outgoingRequests.length > 0) && (
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden mb-6">
                            <div className="p-6">
                                <FriendRequests
                                    incomingRequests={incomingRequests}
                                    outgoingRequests={outgoingRequests}
                                    onAccept={handleAcceptRequest}
                                    onReject={rejectRequest}
                                    onCancel={cancelRequest}
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
                                    <h2 className="text-xl font-bold text-white">
                                        Friends
                                    </h2>
                                    <p className="text-zinc-500 text-sm mt-1">
                                        {friends.length}{" "}
                                        {friends.length === 1
                                            ? "friend"
                                            : "friends"}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setIsAddFriendOpen(true)}
                                    disabled={!isSupabaseConfigured}
                                    className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FF5500] text-white font-medium transition-all hover:shadow-lg hover:shadow-[#FB8D22]/25 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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

                        {/* Censorship Resistance Toggle */}
                        <div className="px-6 py-4 border-b border-zinc-800">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 flex items-center justify-center">
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
                                                d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                                            />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-white font-medium">
                                            Censorship Resistance
                                        </p>
                                        <p className="text-zinc-500 text-xs">
                                            {userSettings.decentralizedCalls
                                                ? "Using Web3 Provider"
                                                : "Using Centralized Provider"}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={toggleDecentralizedCalls}
                                    disabled={
                                        !isHuddle01Configured &&
                                        !userSettings.decentralizedCalls
                                    }
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                        userSettings.decentralizedCalls
                                            ? "bg-emerald-500"
                                            : "bg-zinc-700"
                                    } ${
                                        !isHuddle01Configured &&
                                        !userSettings.decentralizedCalls
                                            ? "opacity-50 cursor-not-allowed"
                                            : ""
                                    }`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                            userSettings.decentralizedCalls
                                                ? "translate-x-6"
                                                : "translate-x-1"
                                        }`}
                                    />
                                </button>
                            </div>
                            {!isHuddle01Configured && (
                                <p className="text-amber-500/80 text-xs mt-2">
                                    Set NEXT_PUBLIC_HUDDLE01_PROJECT_ID and
                                    NEXT_PUBLIC_HUDDLE01_API_KEY to enable
                                </p>
                            )}
                        </div>

                        <div className="p-6">
                            <FriendsList
                                friends={friendsListData}
                                userAddress={userAddress}
                                onCall={handleCall}
                                onVideoCall={handleVideoCall}
                                onChat={isPasskeyUser ? undefined : handleChat}
                                onRemove={handleRemoveFriend}
                                isCallActive={callState !== "idle"}
                                unreadCounts={
                                    isPasskeyUser || isSolanaUser
                                        ? {}
                                        : unreadCounts
                                }
                                hideChat={isPasskeyUser || isSolanaUser}
                                friendsWakuStatus={friendsWakuStatus}
                            />
                        </div>
                    </div>

                    {/* Group Invitations Section */}
                    {isWakuInitialized &&
                        !isPasskeyUser &&
                        !isSolanaUser &&
                        pendingInvitations.length > 0 && (
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden mt-6 p-6">
                                <GroupInvitations
                                    invitations={pendingInvitations}
                                    onAccept={acceptInvitation}
                                    onDecline={async (
                                        invitationId: string,
                                        groupId: string
                                    ) => {
                                        // First leave/hide the Waku group
                                        await leaveGroup(groupId);
                                        // Then mark the invitation as declined
                                        const result = await declineInvitation(
                                            invitationId
                                        );
                                        // Refresh groups list
                                        const fetchedGroups = await getGroups();
                                        setGroups(fetchedGroups);
                                        return result;
                                    }}
                                    onJoinGroup={handleJoinGroupFromInvite}
                                />
                            </div>
                        )}

                    {/* Groups Section - Only show if Waku is enabled (EVM users only) */}
                    {isWakuInitialized && !isPasskeyUser && !isSolanaUser && (
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden mt-6">
                            <div className="p-6 border-b border-zinc-800">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-white">
                                            Group Chats
                                        </h2>
                                        <p className="text-zinc-500 text-sm mt-1">
                                            {groups.length}{" "}
                                            {groups.length === 1
                                                ? "group"
                                                : "groups"}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() =>
                                            setIsCreateGroupOpen(true)
                                        }
                                        disabled={friends.length === 0}
                                        className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FF5500] text-white font-medium transition-all hover:shadow-lg hover:shadow-[#FB8D22]/25 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                        Object.entries(activeGroupCalls).map(
                                            ([groupId, call]) => [
                                                groupId,
                                                {
                                                    participantCount:
                                                        call.participantCount,
                                                    isVideo: call.isVideo,
                                                },
                                            ]
                                        )
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
                            reachUsername: currentCallFriend.reachUsername,
                            addedAt: currentCallFriend.addedAt,
                        }}
                        callState={callState}
                        callType={callType}
                        isMuted={isMuted}
                        isVideoOff={isVideoOff}
                        isScreenSharing={isScreenSharing}
                        isRemoteVideoOff={isRemoteVideoOff}
                        isRemoteScreenSharing={isRemoteScreenSharing}
                        duration={duration}
                        error={callError}
                        formatDuration={formatDuration}
                        onToggleMute={toggleMute}
                        onToggleVideo={toggleVideo}
                        onToggleScreenShare={toggleScreenShare}
                        onTakeScreenshot={takeScreenshot}
                        onEndCall={handleEndCall}
                        setLocalVideoContainer={setLocalVideoContainer}
                        setRemoteVideoContainer={setRemoteVideoContainer}
                        setScreenShareContainer={setScreenShareContainer}
                        setLocalScreenShareContainer={
                            setLocalScreenShareContainer
                        }
                    />
                )}
            </AnimatePresence>

            {/* Incoming Call Modal (1-on-1) */}
            {incomingCall && callState === "idle" && (
                <IncomingCallModal
                    callerAddress={incomingCall.caller_address}
                    callerName={
                        incomingCallFriend?.ensName ||
                        incomingCallFriend?.nickname
                    }
                    callerAvatar={incomingCallFriend?.avatar}
                    callType={incomingCall.call_type || "audio"}
                    isDecentralized={
                        !incomingCall.channel_name.startsWith("spritz_")
                    }
                    onAccept={handleAcceptCall}
                    onReject={handleRejectCall}
                />
            )}

            {/* Incoming Group Call Modal */}
            <AnimatePresence>
                {incomingGroupCall &&
                    callState === "idle" &&
                    !currentGroupCall &&
                    !userSettings.isDnd && (
                        <IncomingGroupCallModal
                            call={incomingGroupCall}
                            onJoin={handleJoinIncomingGroupCall}
                            onDismiss={dismissIncomingCall}
                        />
                    )}
            </AnimatePresence>

            {/* Chat Modal - EVM users only */}
            {!isSolanaUser && evmAddress && (
                <ChatModal
                    isOpen={!!chatFriend}
                    onClose={() => setChatFriend(null)}
                    userAddress={evmAddress}
                    peerAddress={chatFriend?.address || ("0x" as Address)}
                    peerName={chatFriend?.ensName || chatFriend?.nickname}
                    peerAvatar={chatFriend?.avatar}
                />
            )}

            {/* Username Claim Modal */}
            <UsernameClaimModal
                isOpen={isUsernameModalOpen}
                onClose={() => setIsUsernameModalOpen(false)}
                userAddress={userAddress}
                currentUsername={reachUsername}
                onSuccess={() => {}}
            />

            {/* Phone Verification Modal */}
            <PhoneVerificationModal
                isOpen={isPhoneModalOpen}
                onClose={() => setIsPhoneModalOpen(false)}
                userAddress={userAddress}
                onSuccess={() => refreshPhone()}
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
                pushSupported={pushSupported}
                pushPermission={pushPermission}
                pushSubscribed={pushSubscribed}
                pushLoading={pushLoading}
                pushError={pushError}
                onEnablePush={subscribeToPush}
                onDisablePush={unsubscribeFromPush}
            />

            {/* First-time Push Notification Prompt */}
            <PushNotificationPrompt
                userAddress={userAddress}
                isSupported={pushSupported}
                isSubscribed={pushSubscribed}
                permission={pushPermission}
                onEnable={subscribeToPush}
                onSkip={() => {}}
            />

            {/* QR Code Modal */}
            <QRCodeModal
                isOpen={isQRCodeModalOpen}
                onClose={() => setIsQRCodeModalOpen(false)}
                address={userAddress as `0x${string}`}
                ensName={userENS.ensName}
                reachUsername={reachUsername || null}
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

            {/* Email Verification Modal */}
            <EmailVerificationModal
                isOpen={isEmailModalOpen}
                onClose={() => setIsEmailModalOpen(false)}
                walletAddress={userAddress}
                onVerified={() => {
                    refreshEmail();
                    refreshPoints();
                }}
            />

            {/* Invites Modal */}
            <InvitesModal
                isOpen={isInvitesModalOpen}
                onClose={() => setIsInvitesModalOpen(false)}
                walletAddress={userAddress}
            />

            {/* Create Group Modal */}
            <CreateGroupModal
                isOpen={isCreateGroupOpen}
                onClose={() => setIsCreateGroupOpen(false)}
                friends={friendsListData}
                onCreate={handleCreateGroup}
                isCreating={isCreatingGroup}
            />

            {/* Group Chat Modal - EVM users only */}
            {!isSolanaUser && evmAddress && (
                <GroupChatModal
                    isOpen={!!selectedGroup}
                    onClose={() => setSelectedGroup(null)}
                    userAddress={evmAddress}
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
            )}

            {/* Group Call UI */}
            <AnimatePresence>
                {currentGroupCall && (
                    <GroupCallUI
                        call={currentGroupCall}
                        participants={groupCallParticipants}
                        userAddress={userAddress as `0x${string}`}
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
                                        formatAddress(f.address) ===
                                            toast.sender
                                );
                                if (friend) {
                                    handleChat(friend);
                                }
                                setToast(null);
                            }}
                            className="bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4 shadow-2xl cursor-pointer hover:bg-zinc-750 transition-colors flex items-center gap-4 max-w-sm"
                        >
                            <div className="w-10 h-10 rounded-full bg-[#FF5500] flex items-center justify-center shrink-0">
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
                                <p className="text-white font-medium truncate">
                                    {toast.sender}
                                </p>
                                <p className="text-zinc-400 text-sm truncate">
                                    {toast.message}
                                </p>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setToast(null);
                                }}
                                className="shrink-0 text-zinc-500 hover:text-white transition-colors"
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
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

// Wrapper that provides Waku context
export function Dashboard({
    userAddress,
    onLogout,
    isPasskeyUser,
    walletType,
}: DashboardProps) {
    // Only wrap with WakuProvider for EVM users (Waku doesn't support Solana)
    if (walletType === "solana") {
        return (
            <DashboardContent
                userAddress={userAddress}
                onLogout={onLogout}
                isPasskeyUser={isPasskeyUser}
                walletType={walletType}
            />
        );
    }

    return (
        <XMTPProvider userAddress={userAddress as `0x${string}`}>
            <DashboardContent
                userAddress={userAddress}
                onLogout={onLogout}
                isPasskeyUser={isPasskeyUser}
                walletType={walletType}
            />
        </XMTPProvider>
    );
}
