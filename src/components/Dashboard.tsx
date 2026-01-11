"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
import { CallHistory } from "./CallHistory";
import { ScheduledCalls } from "./ScheduledCalls";
import { NewScheduledCallModal } from "./NewScheduledCallModal";
import { useCallHistory } from "@/hooks/useCallHistory";
import { BrowseChannelsModal } from "./BrowseChannelsModal";
import { ChannelChatModal } from "./ChannelChatModal";
import { useChannels } from "@/hooks/useChannels";
import type { PublicChannel } from "@/app/api/channels/route";
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
import { BugReportModal } from "./BugReportModal";
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
import { AlphaChatModal } from "./AlphaChatModal";
import { useAlphaChat } from "@/hooks/useAlphaChat";
import { Leaderboard } from "./Leaderboard";
import { SpritzLogo } from "./SpritzLogo";
import { AgentsSection } from "./AgentsSection";
import { useBetaAccess } from "@/hooks/useBetaAccess";
import Link from "next/link";
import { GoLiveModal } from "./GoLiveModal";
import { PasskeyManager } from "./PasskeyManager";
import { LiveBadge } from "./LiveStreamPlayer";
import { useStreams } from "@/hooks/useStreams";
import type { Stream } from "@/app/api/streams/route";

import { type WalletType } from "@/hooks/useWalletType";

type SiweUser = {
    id: string;
    walletAddress: string;
    username: string | null;
    ensName: string | null;
    email: string | null;
    emailVerified: boolean;
    points: number;
    inviteCount: number;
} | null;

type DashboardProps = {
    userAddress: string; // Can be EVM (0x...) or Solana address
    onLogout: () => void;
    isPasskeyUser?: boolean;
    walletType: WalletType;
    isBetaTester?: boolean;
    siweUser?: SiweUser;
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
    isBetaTester,
    siweUser,
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
    const [isPasskeyManagerOpen, setIsPasskeyManagerOpen] = useState(false);
    const [isSocialsModalOpen, setIsSocialsModalOpen] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isInvitesModalOpen, setIsInvitesModalOpen] = useState(false);
    const [showWakuSuccess, setShowWakuSuccess] = useState(false);
    const [showSolanaBanner, setShowSolanaBanner] = useState(true);

    // Live streaming state
    const [isGoLiveModalOpen, setIsGoLiveModalOpen] = useState(false);
    // watchingStream state removed - now using /live/[id] page instead

    // Bottom navigation tab state - default to chats
    type NavTab = "agents" | "friends" | "chats" | "calls" | "leaderboard";
    const [activeNavTab, setActiveNavTab] = useState<NavTab>("chats");
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
        updateSettings,
        setStatus,
        toggleDnd,
        toggleSound,
        toggleDecentralizedCalls,
        togglePublicLanding,
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
    const { dailyBonusAvailable, claimDailyBonus, isClaimingBonus } =
        useLoginTracking({
            walletAddress: userAddress,
            walletType,
            chain: isSolanaUser ? "solana" : "ethereum",
            ensName: userENS.ensName,
            username: reachUsername,
        });

    // State for daily bonus modal
    const [showDailyBonusModal, setShowDailyBonusModal] = useState(false);
    const [dailyBonusClaimed, setDailyBonusClaimed] = useState(false);

    // Show notification when daily bonus is available
    useEffect(() => {
        if (dailyBonusAvailable && !dailyBonusClaimed) {
            setShowDailyBonusModal(true);
        }
    }, [dailyBonusAvailable, dailyBonusClaimed]);

    // Handle claiming daily bonus
    const handleClaimDailyBonus = async () => {
        const success = await claimDailyBonus();
        if (success) {
            setDailyBonusClaimed(true);
            setShowDailyBonusModal(false);
            // Refresh points
            refreshPoints();
        }
    };

    // Analytics tracking
    const {
        trackVoiceCall,
        trackVideoCall,
        syncFriendsCount,
        syncGroupsCount,
        trackFriendAdded,
        trackFriendRemoved,
        trackRoomCreated,
        trackScheduleCreated,
    } = useAnalytics(userAddress);

    // Check if user is an admin
    const { isAdmin, isSuperAdmin } = useAdminCheck(userAddress);

    // Beta access is passed from SIWE auth (or fall back to hook for non-EVM users)
    // Use || so if EITHER source says true, access is granted (more forgiving for cache issues)
    const { hasBetaAccess: hookBetaAccess, refresh: refreshBetaAccess } = useBetaAccess(userAddress);
    const hasBetaAccess = isBetaTester || hookBetaAccess;

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
        invites,
        available: availableInvites,
        used: usedInvites,
        totalAllocation: totalInvites,
        isLoading: isInvitesLoading,
        shareInvite,
    } = useUserInvites(userAddress);
    const allInvitesUsed = usedInvites > 0 && usedInvites === totalInvites;

    // Contacts sync state
    const [contacts, setContacts] = useState<
        Array<{ name: string; phone?: string; email?: string }>
    >([]);
    const [isSyncingContacts, setIsSyncingContacts] = useState(false);
    const [showContactsList, setShowContactsList] = useState(false);

    // Check if running as PWA
    const isPWA =
        typeof window !== "undefined" &&
        (window.matchMedia("(display-mode: standalone)").matches ||
            // @ts-expect-error - iOS Safari specific
            window.navigator.standalone === true);

    // Sync contacts function
    const handleSyncContacts = async () => {
        if (!isPWA) {
            alert(
                "Contacts sync is only available in the PWA app. Please install the app first."
            );
            return;
        }

        setIsSyncingContacts(true);
        try {
            // Check if Contacts API is available (limited browser support)
            if ("contacts" in navigator && "ContactsManager" in window) {
                // @ts-expect-error - Contacts API is experimental
                const contactsManager = new navigator.ContactsManager();
                const contacts: Array<{
                    name: string;
                    phone?: string;
                    email?: string;
                }> = await contactsManager.select(["name", "tel", "email"], {
                    multiple: true,
                });
                setContacts(contacts);
                setShowContactsList(true);
            } else {
                // Fallback: Use Web Share API to share invite link
                // Get first available invite code
                const firstInvite = invites.find((inv) => !inv.used_by);
                if (firstInvite) {
                    await shareInvite(firstInvite.code);
                } else {
                    alert(
                        "No available invite codes. Please generate more invites first."
                    );
                }
            }
        } catch (error) {
            console.error("Error syncing contacts:", error);
            // Fallback: Use Web Share API
            const firstInvite = invites.find((inv) => !inv.used_by);
            if (firstInvite) {
                await shareInvite(firstInvite.code);
            } else {
                alert(
                    "Failed to sync contacts. Please try sharing an invite manually."
                );
            }
        } finally {
            setIsSyncingContacts(false);
        }
    };

    // Alpha Channel
    const alphaChat = useAlphaChat(userAddress);
    const {
        unreadCount: alphaUnreadCount,
        isMember: isAlphaMember,
        membership: alphaMembership,
    } = alphaChat;
    const [isAlphaChatOpen, setIsAlphaChatOpen] = useState(false);

    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isBugReportModalOpen, setIsBugReportModalOpen] = useState(false);

    // Cache for user info fetched from API
    const [userInfoCache, setUserInfoCache] = useState<
        Map<string, { name: string | null; avatar: string | null }>
    >(new Map());

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
        updateNickname,
        clearError: clearFriendsError,
        isConfigured: isSupabaseConfigured,
        refresh: refreshFriends,
    } = useFriendRequests(userAddress);

    // Fetch user info for all unique senders in alpha chat messages
    useEffect(() => {
        if (!alphaChat.messages || alphaChat.messages.length === 0) return;

        const uniqueSenders = new Set<string>();
        alphaChat.messages.forEach((msg) => {
            const sender = msg.sender_address.toLowerCase();
            // Skip current user and friends (already handled)
            if (
                sender !== userAddress.toLowerCase() &&
                !friends.some((f) => f.friend_address.toLowerCase() === sender)
            ) {
                uniqueSenders.add(sender);
            }
        });

        // Only fetch for senders not in cache
        const sendersToFetch = Array.from(uniqueSenders).filter(
            (address) => !userInfoCache.has(address)
        );

        // Fetch user info for all unique senders not in cache
        sendersToFetch.forEach((address) => {
            fetch(`/api/public/user?address=${encodeURIComponent(address)}`)
                .then((res) => res.json())
                .then((data) => {
                    if (data.user) {
                        const name = data.user.username
                            ? `@${data.user.username}`
                            : data.user.display_name ||
                              data.user.ens_name ||
                              null;
                        const userInfo = {
                            name,
                            avatar: data.user.avatar_url || null,
                        };
                        setUserInfoCache((prev) => {
                            // Check again to avoid race conditions
                            if (prev.has(address.toLowerCase())) {
                                return prev;
                            }
                            return new Map(prev).set(
                                address.toLowerCase(),
                                userInfo
                            );
                        });
                    }
                })
                .catch((err) => {
                    console.error(
                        "[Dashboard] Error fetching user info for",
                        address,
                        err
                    );
                });
        });
    }, [alphaChat.messages, userAddress, friends]); // Removed userInfoCache from deps to avoid infinite loops

    // Presence heartbeat - updates last_seen every 30 seconds
    usePresence(userAddress);

    // Track if we've attempted ENS points award
    const ensPointsAttemptedRef = useRef(false);

    // Resolve user's ENS - only depends on userAddress
    useEffect(() => {
        let isMounted = true;
        ensPointsAttemptedRef.current = false; // Reset on address change

        async function resolveUserENS() {
            const resolved = await resolveAddressOrENS(userAddress);
            if (resolved && isMounted) {
                // Only update state if values actually changed
                setUserENS((prev) => {
                    if (
                        prev.ensName === resolved.ensName &&
                        prev.avatar === resolved.avatar
                    ) {
                        return prev; // No change, don't trigger re-render
                    }
                    return {
                        ensName: resolved.ensName,
                        avatar: resolved.avatar,
                    };
                });
            }
        }
        resolveUserENS();

        return () => {
            isMounted = false;
        };
    }, [userAddress, resolveAddressOrENS]);

    // Separate effect to award ENS points - only runs when hasClaimed state is ready
    useEffect(() => {
        if (
            userENS.ensName &&
            !ensPointsAttemptedRef.current &&
            !hasClaimed("ens_primary")
        ) {
            ensPointsAttemptedRef.current = true;
            awardUserPoints("ens_primary");
        }
    }, [userENS.ensName, hasClaimed, awardUserPoints]);

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
        outgoingCall,
        remoteHangup,
        startCall,
        acceptCall,
        rejectCall,
        endCall: endCallSignaling,
        cancelCall,
        clearRemoteHangup,
    } = useCallSignaling(userAddress);

    // Call history tracking
    const {
        calls: callHistory,
        isLoading: isCallHistoryLoading,
        error: callHistoryError,
        fetchCallHistory,
        logCall,
        updateCall,
    } = useCallHistory(userAddress);
    const [currentCallId, setCurrentCallId] = useState<string | null>(null);
    const [callStartTime, setCallStartTime] = useState<Date | null>(null);
    const [showNewCallDropdown, setShowNewCallDropdown] = useState(false);
    const [showNewScheduledModal, setShowNewScheduledModal] = useState(false);
    const [showNewCallModal, setShowNewCallModal] = useState(false);
    const [isRejectingCall, setIsRejectingCall] = useState(false);

    // Live streaming
    const {
        liveStreams,
        currentStream,
        createStream,
        goLive,
        endStream,
        fetchLiveStreams,
    } = useStreams(userAddress);

    // Public channels
    const { joinedChannels, leaveChannel, fetchJoinedChannels } =
        useChannels(userAddress);
    const [isBrowseChannelsOpen, setIsBrowseChannelsOpen] = useState(false);
    const [selectedChannel, setSelectedChannel] =
        useState<PublicChannel | null>(null);

    // Waku works with both EVM and Solana addresses
    const wakuContext = useXMTPContext();

    const isWakuInitialized = wakuContext?.isInitialized ?? false;
    const isWakuInitializing = wakuContext?.isInitializing ?? false;
    const wakuError = wakuContext?.error ?? null;
    const unreadCounts = wakuContext?.unreadCounts ?? {};
    const initializeWaku = wakuContext?.initialize ?? (() => Promise.resolve());
    const markAsRead = wakuContext?.markAsRead ?? (() => {});
    const onNewMessage = wakuContext?.onNewMessage ?? (() => () => {});
    const prefetchMessages = wakuContext?.prefetchMessages ?? (() => {});
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

    // Auto-initialize Waku after a short delay
    useEffect(() => {
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
    }, [isWakuInitialized, isWakuInitializing, initializeWaku]);

    // Show Waku success message briefly when initialized
    useEffect(() => {
        if (isWakuInitialized) {
            setShowWakuSuccess(true);
            const timer = setTimeout(() => {
                setShowWakuSuccess(false);
            }, 4000); // Hide after 4 seconds
            return () => clearTimeout(timer);
        }
    }, [isWakuInitialized]);

    // Auto-hide Solana banner after 5 seconds
    useEffect(() => {
        if (isSolanaUser && showSolanaBanner) {
            const timer = setTimeout(() => {
                setShowSolanaBanner(false);
            }, 5000); // Hide after 5 seconds
            return () => clearTimeout(timer);
        }
    }, [isSolanaUser, showSolanaBanner]);

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

    // Get user info for Alpha chat - checks friends list and returns name/avatar
    const getAlphaUserInfo = useCallback(
        (address: string) => {
            const normalizedAddress = address.toLowerCase();

            // Check if it's the current user
            if (normalizedAddress === userAddress.toLowerCase()) {
                return {
                    name: reachUsername || userENS?.ensName || null,
                    avatar: userENS?.avatar || null,
                };
            }

            // Check friends list
            const friend = friends.find(
                (f) => f.friend_address.toLowerCase() === normalizedAddress
            );

            if (friend) {
                return {
                    name:
                        friend.nickname ||
                        friend.reachUsername ||
                        friend.ensName ||
                        null,
                    avatar: friend.avatar || null,
                };
            }

            // Check cache
            const cached = userInfoCache.get(normalizedAddress);
            if (cached) {
                return cached;
            }

            // Return null if not found (will be fetched by useEffect)
            return null;
        },
        [userAddress, friends, reachUsername, userENS, userInfoCache]
    );

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

    // Open chat from URL parameter (e.g., ?chat=0x123...)
    // This is used when clicking a push notification
    useEffect(() => {
        if (typeof window === "undefined") return;

        const urlParams = new URLSearchParams(window.location.search);
        const chatAddress = urlParams.get("chat");

        if (chatAddress && friendsListData.length > 0) {
            // Find the friend with this address
            const friend = friendsListData.find(
                (f) => f.address.toLowerCase() === chatAddress.toLowerCase()
            );

            if (friend) {
                console.log(
                    "[Dashboard] Opening chat from URL param:",
                    chatAddress
                );
                setChatFriend(friend);

                // Clean up the URL without reloading
                const newUrl = window.location.pathname;
                window.history.replaceState({}, "", newUrl);
            }
        }
    }, [friendsListData]);

    // Handle ?add= parameter to open Add Friend modal
    useEffect(() => {
        if (typeof window === "undefined" || !userAddress) return;

        const urlParams = new URLSearchParams(window.location.search);
        const addParam = urlParams.get("add");

        if (addParam) {
            console.log(
                "[Dashboard] Opening Add Friend modal from URL param:",
                addParam
            );
            setIsAddFriendOpen(true);

            // Clean up the URL without reloading
            const newUrl = window.location.pathname;
            window.history.replaceState({}, "", newUrl);
        }
    }, [userAddress]);

    // Listen for service worker messages to open chat
    useEffect(() => {
        if (typeof window === "undefined") return;

        const handleServiceWorkerMessage = (event: MessageEvent) => {
            if (event.data?.type === "OPEN_CHAT" && event.data.senderAddress) {
                console.log(
                    "[Dashboard] Received OPEN_CHAT from SW:",
                    event.data.senderAddress
                );

                // Find the friend with this address
                const friend = friendsListData.find(
                    (f) =>
                        f.address.toLowerCase() ===
                        event.data.senderAddress.toLowerCase()
                );

                if (friend) {
                    setChatFriend(friend);
                }
            }
        };

        navigator.serviceWorker?.addEventListener(
            "message",
            handleServiceWorkerMessage
        );

        return () => {
            navigator.serviceWorker?.removeEventListener(
                "message",
                handleServiceWorkerMessage
            );
        };
    }, [friendsListData]);

    // Check which friends can receive Waku messages
    useEffect(() => {
        if (friends.length === 0) {
            return;
        }

        const checkFriendsWaku = async () => {
            const addresses = friends.map((f) => f.friend_address);
            const status = await canMessageBatch(addresses);
            setFriendsWakuStatus(status);
        };

        checkFriendsWaku();
    }, [friends, canMessageBatch]);

    // Sync friends count for analytics
    useEffect(() => {
        if (friends.length > 0) {
            syncFriendsCount(friends.length);
        }
    }, [friends.length, syncFriendsCount]);

    // Load groups when Waku is initialized
    useEffect(() => {
        if (!isWakuInitialized) return;

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
    }, [isWakuInitialized, getGroups]);

    // Sync groups count for analytics
    useEffect(() => {
        if (groups.length > 0) {
            syncGroupsCount(groups.length);
        }
    }, [groups.length, syncGroupsCount]);

    // Handler to create a new group
    const handleCreateGroup = async (
        memberAddresses: string[],
        groupName: string,
        emoji?: string
    ): Promise<boolean> => {
        setIsCreatingGroup(true);
        try {
            // Create the group WITH all members immediately
            // (Waku requires creator to add members - members can't add themselves)
            const result = await createGroup(memberAddresses, groupName, emoji);
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

    // Listen for new messages and show toast + notification
    useEffect(() => {
        if (!isWakuInitialized) return;

        const unsubscribe = onNewMessage(({ senderAddress, content }) => {
            // Pre-fetch all messages for this conversation in background
            // This way when user clicks the toast, messages are already loaded
            prefetchMessages(senderAddress);

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
        prefetchMessages,
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
            // Log as missed call - they didn't answer
            await logCall({
                calleeAddress: friend.address,
                callType: withVideo ? "video" : "audio",
                status: "missed",
            });
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

        if (success) {
            if (userSettings.soundEnabled) {
                notifyCallConnected();
            }
            // Log call to history
            const startTime = new Date();
            setCallStartTime(startTime);
            const call = await logCall({
                calleeAddress: friend.address,
                callType: withVideo ? "video" : "audio",
                status: "completed", // Will be updated when call ends
                channelName,
                startedAt: startTime.toISOString(),
            });
            if (call) {
                setCurrentCallId(call.id);
            }
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
        // Prevent multiple rejections from spam clicking
        if (isRejectingCall) return;
        setIsRejectingCall(true);

        stopRinging();
        // Log declined call - we are the callee declining a call from the caller
        if (incomingCall?.caller_address && userAddress) {
            await logCall({
                callerAddress: incomingCall.caller_address, // They called us
                calleeAddress: userAddress, // We are the callee
                callType:
                    (incomingCall.call_type as "audio" | "video") || "audio",
                status: "declined",
            });
        }
        await rejectCall();
        setIsRejectingCall(false);
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

    // Timeout for outgoing calls - mark as missed if no answer within 45 seconds
    useEffect(() => {
        if (!outgoingCall || !currentCallFriend) return;

        const timeout = setTimeout(async () => {
            console.log(
                "[Dashboard] Outgoing call timed out - marking as missed"
            );
            // Log as missed call
            await logCall({
                calleeAddress: currentCallFriend.address,
                callType:
                    (outgoingCall.call_type as "audio" | "video") || "audio",
                status: "missed",
            });
            // Cancel the outgoing call
            await cancelCall();
            await leaveCall();
            setCurrentCallFriend(null);
            setCurrentCallProvider(null);
            // Show notification
            setToast({
                sender:
                    currentCallFriend.ensName ||
                    currentCallFriend.nickname ||
                    "Friend",
                message: "didn't answer",
            });
            setTimeout(() => setToast(null), 4000);
        }, 45000); // 45 second timeout

        return () => clearTimeout(timeout);
    }, [outgoingCall, currentCallFriend, logCall, cancelCall, leaveCall]);

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

        // Update call history with end time and duration
        if (currentCallId) {
            const endTime = new Date();
            const durationSeconds = callStartTime
                ? Math.round(
                      (endTime.getTime() - callStartTime.getTime()) / 1000
                  )
                : duration;
            await updateCall(currentCallId, {
                endedAt: endTime.toISOString(),
                durationSeconds,
                status: "completed",
            });
            setCurrentCallId(null);
            setCallStartTime(null);
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
            <div className="min-h-screen bg-zinc-950 flex flex-col">
                {/* Header */}
                <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-lg sticky top-0 z-40 safe-area-pt px-2">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 safe-area-pl safe-area-pr">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {/* User Avatar - Click for Go Live */}
                                <button
                                    onClick={() => setIsGoLiveModalOpen(true)}
                                    className="relative group"
                                    title={
                                        currentStream?.status === "live"
                                            ? "You're live!"
                                            : "Go Live"
                                    }
                                >
                                    {userENS.avatar ? (
                                        <img
                                            src={userENS.avatar}
                                            alt="Avatar"
                                            className={`w-10 h-10 rounded-xl object-cover ring-2 transition-all ${
                                                currentStream?.status === "live"
                                                    ? "ring-red-500 animate-pulse"
                                                    : "ring-transparent group-hover:ring-[#FF5500]/50"
                                            }`}
                                        />
                                    ) : (
                                        <SpritzLogo
                                            size="md"
                                            rounded="xl"
                                            className={`ring-2 transition-all ${
                                                currentStream?.status === "live"
                                                    ? "ring-red-500 animate-pulse"
                                                    : "ring-transparent group-hover:ring-[#FF5500]/50"
                                            }`}
                                        />
                                    )}
                                    {/* Live badge when streaming */}
                                    {currentStream?.status === "live" && (
                                        <LiveBadge />
                                    )}
                                    {/* Camera icon when not live */}
                                    {currentStream?.status !== "live" && (
                                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-red-500 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <svg
                                                className="w-2.5 h-2.5 text-white"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                                />
                                            </svg>
                                        </div>
                                    )}
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
                                                className="absolute left-0 top-full mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-y-auto overscroll-contain scrollbar-thin"
                                                style={{
                                                    // Ensure menu doesn't get cut off on small screens
                                                    // Use dvh for iOS Safari dynamic viewport height
                                                    maxHeight:
                                                        "min(calc(100dvh - 140px), 700px)",
                                                }}
                                            >
                                                {/* 1. My QR Code */}
                                                <button
                                                    onClick={() => {
                                                        setIsProfileMenuOpen(
                                                            false
                                                        );
                                                        setIsQRCodeModalOpen(
                                                            true
                                                        );
                                                    }}
                                                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left"
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

                                                {/* 2. Username */}
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

                                                {/* 3. Email */}
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

                                                {/* 4. Phone */}
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

                                                {/* Passkeys */}
                                                <button
                                                    onClick={() => {
                                                        setIsProfileMenuOpen(
                                                            false
                                                        );
                                                        setIsPasskeyManagerOpen(
                                                            true
                                                        );
                                                    }}
                                                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left border-t border-zinc-800"
                                                >
                                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#FF5500]/20">
                                                        <svg
                                                            className="w-4 h-4 text-[#FF5500]"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
                                                            />
                                                        </svg>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white text-sm font-medium">
                                                            Passkeys
                                                        </p>
                                                        <p className="text-xs text-zinc-500">
                                                            Manage biometric login
                                                        </p>
                                                    </div>
                                                </button>

                                                {/* 5. Socials */}
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

                                                {/* 6. ENS/SNS Name Service */}
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

                                                {/* 7. Points */}
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

                                                {/* 8. Ranks */}
                                                <button
                                                    onClick={() => {
                                                        setIsProfileMenuOpen(
                                                            false
                                                        );
                                                        setActiveNavTab(
                                                            "leaderboard"
                                                        );
                                                    }}
                                                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800 transition-colors text-left border-t border-zinc-800"
                                                >
                                                    <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                                                        <span className="text-lg">
                                                            🏆
                                                        </span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white text-sm font-medium">
                                                            Ranks
                                                        </p>
                                                        <p className="text-zinc-500 text-xs">
                                                            View leaderboard
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
                <main className="flex-1 max-w-4xl mx-auto px-4 py-8 w-full">
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

                    {/* Solana User Notice - auto-dismisses after 5 seconds */}
                    <AnimatePresence>
                        {isSolanaUser && showSolanaBanner && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="mb-6"
                            >
                                <div className="bg-gradient-to-r from-[#9945FF]/20 to-[#14F195]/20 border border-[#9945FF]/30 rounded-xl p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-full bg-[#9945FF]/20 flex items-center justify-center flex-shrink-0">
                                            <span className="text-xl">🟣</span>
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[#FFF0E0] font-medium">
                                                Solana Wallet Connected
                                            </p>
                                            <p className="text-[#FFF0E0]/70 text-sm mt-1">
                                                Voice calls and encrypted chat
                                                are available! Some features may
                                                vary from EVM wallets.
                                            </p>
                                        </div>
                                        <button
                                            onClick={() =>
                                                setShowSolanaBanner(false)
                                            }
                                            className="text-[#FFF0E0]/50 hover:text-[#FFF0E0] transition-colors"
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
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Waku Status Banner */}
                    {!isWakuInitialized && (
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

                    {/* AI Agents Section - shown when Agents tab selected */}
                    {activeNavTab === "agents" && (
                        <div
                            id="agents-section"
                            className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden mb-6"
                        >
                            <div className="p-6">
                                <AgentsSection
                                    userAddress={userAddress}
                                    hasBetaAccess={hasBetaAccess}
                                />
                            </div>
                        </div>
                    )}

                    {/* Friends Section - shown when Friends tab selected */}
                    {activeNavTab === "friends" && (
                        <>
                        {/* Friend Requests Section - only on Friends tab */}
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
                        <div
                            id="friends-section"
                            className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden"
                        >
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
                                    <div className="flex items-center gap-2">
                                        {isPWA && (
                                            <button
                                                onClick={handleSyncContacts}
                                                disabled={
                                                    isSyncingContacts ||
                                                    isInvitesLoading ||
                                                    availableInvites === 0
                                                }
                                                className="py-2 px-3 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-medium transition-all hover:shadow-lg hover:shadow-blue-500/25 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                                title="Share invite with friends"
                                            >
                                                {isSyncingContacts ? (
                                                    <>
                                                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                        Sharing...
                                                    </>
                                                ) : (
                                                    <>
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
                                                                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                                                            />
                                                        </svg>
                                                        Share
                                                    </>
                                                )}
                                            </button>
                                        )}
                                        <button
                                            onClick={() =>
                                                setIsAddFriendOpen(true)
                                            }
                                            disabled={!isSupabaseConfigured}
                                            className="py-2 px-3 rounded-lg bg-gradient-to-r from-[#FF5500] to-[#FF5500] text-white text-sm font-medium transition-all hover:shadow-lg hover:shadow-[#FB8D22]/25 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                                    d="M12 4v16m8-8H4"
                                                />
                                            </svg>
                                            Add Friend
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Contacts List - shown after syncing */}
                            {showContactsList && contacts.length > 0 && (
                                <div className="px-6 pt-4 pb-2 border-b border-zinc-800">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-semibold text-white">
                                            Contacts ({contacts.length})
                                        </h3>
                                        <button
                                            onClick={() =>
                                                setShowContactsList(false)
                                            }
                                            className="text-zinc-500 hover:text-white text-sm"
                                        >
                                            Hide
                                        </button>
                                    </div>
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {contacts.map((contact, idx) => {
                                            const firstInvite = invites.find(
                                                (inv) => !inv.used_by
                                            );

                                            return (
                                                <div
                                                    key={idx}
                                                    className="flex items-center justify-between p-2 bg-zinc-800/50 rounded-lg"
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white text-sm font-medium truncate">
                                                            {contact.name ||
                                                                "Unknown"}
                                                        </p>
                                                        {contact.phone && (
                                                            <p className="text-zinc-400 text-xs truncate">
                                                                {contact.phone}
                                                            </p>
                                                        )}
                                                        {contact.email && (
                                                            <p className="text-zinc-400 text-xs truncate">
                                                                {contact.email}
                                                            </p>
                                                        )}
                                                    </div>
                                                    {firstInvite && (
                                                        <button
                                                            onClick={async () => {
                                                                await shareInvite(
                                                                    firstInvite.code
                                                                );
                                                            }}
                                                            className="ml-2 px-3 py-1.5 bg-[#FF5500] hover:bg-[#E04D00] text-white text-xs rounded-lg transition-colors whitespace-nowrap"
                                                        >
                                                            Send Invite
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Daily Bonus Claim Card */}
                            {dailyBonusAvailable && !dailyBonusClaimed && (
                                <div className="mx-6 mt-4 mb-2">
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-xl p-4"
                                    >
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                                                    <span className="text-xl">
                                                        🎁
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className="text-white font-medium text-sm">
                                                        Daily Bonus Available!
                                                    </p>
                                                    <p className="text-amber-400/70 text-xs">
                                                        +3 points for logging in
                                                        today
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={handleClaimDailyBonus}
                                                disabled={isClaimingBonus}
                                                className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold hover:shadow-lg hover:shadow-orange-500/25 transition-all disabled:opacity-50 flex items-center gap-2"
                                            >
                                                {isClaimingBonus ? (
                                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <>
                                                        <span>✨</span>
                                                        Claim
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </motion.div>
                                </div>
                            )}

                            <div className="p-6">
                                <FriendsList
                                    friends={friendsListData}
                                    userAddress={userAddress}
                                    onCall={handleCall}
                                    onVideoCall={handleVideoCall}
                                    onChat={handleChat}
                                    onRemove={handleRemoveFriend}
                                    onUpdateNote={updateNickname}
                                    isCallActive={callState !== "idle"}
                                    unreadCounts={unreadCounts}
                                    hideChat={false}
                                    friendsWakuStatus={friendsWakuStatus}
                                />
                            </div>
                        </div>
                        </>
                    )}

                    {/* Chats Section - Shows FriendsList in chat mode plus Group Chats */}
                    {activeNavTab === "chats" && (
                        <>
                            {/* Live Now Section */}
                            {liveStreams.length > 0 && (
                                <div className="bg-gradient-to-r from-red-900/20 to-orange-900/20 border border-red-500/30 rounded-2xl overflow-hidden mb-6">
                                    <div className="p-4 border-b border-red-500/20">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                                            <h2 className="text-lg font-bold text-white">
                                                Live Now
                                            </h2>
                                            <span className="text-zinc-400 text-sm">
                                                {liveStreams.length} streaming
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        <div className="flex gap-3 overflow-x-auto pb-2">
                                            {liveStreams.map((stream) => {
                                                const streamerInfo =
                                                    getAlphaUserInfo(
                                                        stream.user_address
                                                    );
                                                return (
                                                    <a
                                                        key={stream.id}
                                                        href={`/live/${stream.id}`}
                                                        className="flex-shrink-0 group"
                                                    >
                                                        <div className="relative">
                                                            {streamerInfo?.avatar ? (
                                                                <img
                                                                    src={
                                                                        streamerInfo.avatar
                                                                    }
                                                                    alt=""
                                                                    className="w-14 h-14 rounded-full object-cover ring-2 ring-red-500 group-hover:ring-4 transition-all"
                                                                />
                                                            ) : (
                                                                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white font-bold text-lg ring-2 ring-red-500 group-hover:ring-4 transition-all">
                                                                    {(
                                                                        streamerInfo?.name ||
                                                                        stream.user_address
                                                                    )
                                                                        .slice(
                                                                            0,
                                                                            2
                                                                        )
                                                                        .toUpperCase()}
                                                                </div>
                                                            )}
                                                            <LiveBadge />
                                                        </div>
                                                        <p className="text-xs text-zinc-300 mt-1 text-center truncate w-14">
                                                            {streamerInfo?.name ||
                                                                `${stream.user_address.slice(
                                                                    0,
                                                                    6
                                                                )}...`}
                                                        </p>
                                                    </a>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Direct Messages (Chats) - Show first */}
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden mb-6">
                                <div className="p-6 border-b border-zinc-800">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className="text-xl font-bold text-white">
                                                Chats
                                            </h2>
                                            <p className="text-zinc-500 text-sm mt-1">
                                                {friendsListData.length}{" "}
                                                conversations
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-6">
                                    <FriendsList
                                        friends={friendsListData}
                                        userAddress={userAddress}
                                        onCall={handleCall}
                                        onVideoCall={handleVideoCall}
                                        onChat={handleChat}
                                        onRemove={handleRemoveFriend}
                                        onUpdateNote={updateNickname}
                                        isCallActive={callState !== "idle"}
                                        unreadCounts={unreadCounts}
                                        hideChat={false}
                                        friendsWakuStatus={friendsWakuStatus}
                                    />
                                </div>
                            </div>

                            {/* Group Chats Section */}
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden mb-6">
                                <div className="p-6 border-b border-zinc-800">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className="text-xl font-bold text-white">
                                                Group Chats
                                            </h2>
                                            <p className="text-zinc-500 text-sm mt-1">
                                                {groups.length +
                                                    joinedChannels.length +
                                                    1}{" "}
                                                total
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() =>
                                                    setIsBrowseChannelsOpen(
                                                        true
                                                    )
                                                }
                                                className="py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition-all flex items-center gap-2"
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
                                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                                    />
                                                </svg>
                                                <span className="hidden sm:inline">
                                                    Browse
                                                </span>
                                            </button>
                                            {isWakuInitialized && (
                                                    <button
                                                        onClick={() =>
                                                            setIsCreateGroupOpen(
                                                                true
                                                            )
                                                        }
                                                        disabled={
                                                            friends.length === 0
                                                        }
                                                        className="py-2 px-3 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FF7700] text-white font-medium transition-all hover:shadow-lg hover:shadow-orange-500/25 flex items-center gap-2 disabled:opacity-50"
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
                                                                d="M12 4v16m8-8H4"
                                                            />
                                                        </svg>
                                                        <span className="hidden sm:inline">
                                                            New
                                                        </span>
                                                    </button>
                                                )}
                                        </div>
                                    </div>
                                </div>
                                <div className="p-4 space-y-2">
                                    {/* Spritz Global Chat - always show first */}
                                    <motion.button
                                        onClick={() => setIsAlphaChatOpen(true)}
                                        className={`w-full rounded-xl p-3 transition-all text-left ${
                                            isAlphaMember
                                                ? "bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50"
                                                : "bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-500/30 hover:border-orange-500/50"
                                        }`}
                                        whileTap={{ scale: 0.99 }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="relative flex-shrink-0">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
                                                    <span className="text-lg">
                                                        🍊
                                                    </span>
                                                </div>
                                                {isAlphaMember &&
                                                    alphaUnreadCount > 0 && (
                                                        <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full flex items-center justify-center">
                                                            <span className="text-white text-[10px] font-bold">
                                                                {alphaUnreadCount >
                                                                9
                                                                    ? "9+"
                                                                    : alphaUnreadCount}
                                                            </span>
                                                        </div>
                                                    )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-white font-medium truncate">
                                                        Spritz Global
                                                    </p>
                                                    <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 text-[10px] rounded">
                                                        Official
                                                    </span>
                                                </div>
                                                <p className="text-zinc-500 text-sm">
                                                    {isAlphaMember
                                                        ? "Community chat"
                                                        : "Tap to join"}
                                                </p>
                                            </div>
                                            <svg
                                                className="w-5 h-5 text-zinc-600"
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
                                        </div>
                                    </motion.button>

                                    {/* Public Channels */}
                                    {joinedChannels.map((channel) => (
                                        <button
                                            key={channel.id}
                                            onClick={() =>
                                                setSelectedChannel(channel)
                                            }
                                            className="w-full flex items-center gap-3 p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors text-left"
                                        >
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center text-xl">
                                                {channel.emoji}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-white font-medium truncate">
                                                        {channel.name}
                                                    </p>
                                                    {channel.is_official && (
                                                        <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 text-[10px] rounded">
                                                            Official
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-zinc-500 text-sm truncate">
                                                    {channel.member_count}{" "}
                                                    members
                                                </p>
                                            </div>
                                            <svg
                                                className="w-5 h-5 text-zinc-600"
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
                                        </button>
                                    ))}

                                    {/* Private Group Chats */}
                                    {isWakuInitialized &&
                                        groups.map((group) => (
                                            <button
                                                key={group.id}
                                                onClick={() =>
                                                    setSelectedGroup(group)
                                                }
                                                className="w-full flex items-center gap-3 p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors text-left"
                                            >
                                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30 flex items-center justify-center text-xl">
                                                    {group.emoji || "👥"}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-white font-medium truncate">
                                                            {group.name}
                                                        </p>
                                                        <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] rounded">
                                                            Private
                                                        </span>
                                                    </div>
                                                    <p className="text-zinc-500 text-sm truncate">
                                                        {group.memberCount || 0}{" "}
                                                        members
                                                    </p>
                                                </div>
                                                <svg
                                                    className="w-5 h-5 text-zinc-600"
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
                                            </button>
                                        ))}

                                    {/* Empty state for channels */}
                                    {joinedChannels.length === 0 &&
                                        groups.length === 0 && (
                                            <div className="text-center py-4">
                                                <p className="text-zinc-500 text-sm">
                                                    <button
                                                        onClick={() =>
                                                            setIsBrowseChannelsOpen(
                                                                true
                                                            )
                                                        }
                                                        className="text-[#FF5500] hover:underline"
                                                    >
                                                        Browse channels
                                                    </button>{" "}
                                                    to find communities to join
                                                </p>
                                            </div>
                                        )}
                                </div>
                            </div>

                            {/* Group Invitations Section */}
                            {isWakuInitialized &&
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
                                                const result =
                                                    await declineInvitation(
                                                        invitationId
                                                    );
                                                // Refresh groups list
                                                const fetchedGroups =
                                                    await getGroups();
                                                setGroups(fetchedGroups);
                                                return result;
                                            }}
                                            onJoinGroup={
                                                handleJoinGroupFromInvite
                                            }
                                        />
                                    </div>
                                )}
                        </>
                    )}

                    {/* Calls Section */}
                    {activeNavTab === "calls" && (
                        <div className="space-y-4">
                            {/* Rooms Section - New Instant and New Scheduled */}
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
                                <div className="p-6">
                                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                        <span>🚪</span>
                                        Rooms
                                    </h2>
                                    <div className="flex flex-wrap gap-3">
                                        {/* New Instant Room */}
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const res = await fetch(
                                                        "/api/rooms",
                                                        {
                                                            method: "POST",
                                                            headers: {
                                                                "Content-Type":
                                                                    "application/json",
                                                            },
                                                            body: JSON.stringify(
                                                                {
                                                                    hostWalletAddress:
                                                                        userAddress,
                                                                    title: "Quick Meeting",
                                                                }
                                                            ),
                                                        }
                                                    );
                                                    const data =
                                                        await res.json();
                                                    if (res.ok && data.room) {
                                                        // Track room creation
                                                        trackRoomCreated();
                                                        // Copy link to clipboard
                                                        navigator.clipboard.writeText(
                                                            data.room.joinUrl
                                                        );
                                                        // Check if running as PWA
                                                        const isStandalone =
                                                            window.matchMedia(
                                                                "(display-mode: standalone)"
                                                            ).matches ||
                                                            (
                                                                window.navigator as any
                                                            ).standalone ===
                                                                true;
                                                        // Open the room - same page for PWA, new tab for desktop
                                                        if (isStandalone) {
                                                            window.location.href =
                                                                data.room.joinUrl;
                                                        } else {
                                                            window.open(
                                                                data.room
                                                                    .joinUrl,
                                                                "_blank"
                                                            );
                                                        }
                                                    } else {
                                                        alert(
                                                            data.error ||
                                                                "Failed to create room"
                                                        );
                                                    }
                                                } catch {
                                                    alert(
                                                        "Failed to create room"
                                                    );
                                                }
                                            }}
                                            className="flex-1 min-w-[140px] py-3 px-5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-medium hover:shadow-lg hover:shadow-purple-500/25 transition-all flex items-center justify-center gap-2"
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
                                            New Instant
                                        </button>

                                        {/* New Scheduled */}
                                        <button
                                            onClick={() =>
                                                setShowNewScheduledModal(true)
                                            }
                                            className="flex-1 min-w-[140px] py-3 px-5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium hover:shadow-lg hover:shadow-orange-500/25 transition-all flex items-center justify-center gap-2"
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
                                            New Scheduled
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* New Call Actions - Top Section */}
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
                                <div className="p-6">
                                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                        <span>📞</span>
                                        Start a Call
                                    </h2>
                                    <div className="flex flex-wrap gap-3">
                                        {/* New Call */}
                                        <button
                                            onClick={() =>
                                                setShowNewCallModal(true)
                                            }
                                            disabled={
                                                callState !== "idle" ||
                                                friendsListData.length === 0
                                            }
                                            className="flex-1 min-w-[140px] py-3 px-5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium hover:shadow-lg hover:shadow-green-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                                            New Call
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Permanent Room Card */}
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
                                <div className="p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                                <span>🔗</span>
                                                Your Permanent Meeting Room
                                            </h2>
                                            <p className="text-zinc-500 text-sm mt-1">
                                                Share this link for instant
                                                meetings - it never expires
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                        <input
                                            type="text"
                                            value={`https://app.spritz.chat/room/${userAddress}`}
                                            readOnly
                                            className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm font-mono"
                                        />
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!userAddress) return;
                                                    const link = `${
                                                        window.location.origin
                                                    }/room/${userAddress.toLowerCase()}`;
                                                    navigator.clipboard.writeText(
                                                        link
                                                    );
                                                    const btn =
                                                        document.querySelector(
                                                            "[data-room-copy-btn]"
                                                        ) as HTMLElement;
                                                    if (btn) {
                                                        const original =
                                                            btn.textContent;
                                                        btn.textContent =
                                                            "Copied!";
                                                        setTimeout(() => {
                                                            btn.textContent =
                                                                original ||
                                                                "Copy Link";
                                                        }, 2000);
                                                    }
                                                }}
                                                data-room-copy-btn
                                                className="flex-1 sm:flex-none px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded-lg transition-colors whitespace-nowrap"
                                            >
                                                Copy Link
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        // Ensure permanent room exists
                                                        const res = await fetch(
                                                            `/api/rooms/permanent?wallet_address=${userAddress}`
                                                        );
                                                        if (res.ok) {
                                                            // Use window.location.origin instead of hardcoded URL
                                                            const roomUrl = `${window.location.origin}/room/${userAddress}`;
                                                            window.location.href =
                                                                roomUrl; // Use same-page navigation instead of new tab
                                                        } else {
                                                            alert(
                                                                "Failed to open room"
                                                            );
                                                        }
                                                    } catch (err) {
                                                        console.error(
                                                            "Failed to open room:",
                                                            err
                                                        );
                                                        alert(
                                                            "Failed to open room"
                                                        );
                                                    }
                                                }}
                                                className="flex-1 sm:flex-none px-4 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white text-sm rounded-lg transition-all whitespace-nowrap"
                                            >
                                                Open Room
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Scheduled Calls Card */}
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
                                <div className="p-6 border-b border-zinc-800">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                                📅 Scheduled Calls
                                            </h2>
                                            <p className="text-zinc-500 text-sm mt-1">
                                                Your upcoming and past scheduled
                                                meetings
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-6">
                                    <ScheduledCalls userAddress={userAddress} />
                                </div>
                            </div>

                            {/* Call History Card */}
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
                                <div className="p-6 border-b border-zinc-800">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                                📞 Call History
                                            </h2>
                                            <p className="text-zinc-500 text-sm mt-1">
                                                Voice and video calls with
                                                friends
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-6">
                                    <CallHistory
                                        userAddress={userAddress}
                                        friends={friendsListData}
                                        calls={callHistory}
                                        isLoading={isCallHistoryLoading}
                                        error={callHistoryError}
                                        onRefresh={fetchCallHistory}
                                        onCall={handleCall}
                                        isCallActive={callState !== "idle"}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Leaderboard Section */}
                    {activeNavTab === "leaderboard" && (
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
                            <Leaderboard userAddress={userAddress} limit={50} />
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

                {/* Bottom Navigation Bar - Floating Pill Style */}
                <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 safe-area-pb">
                    <div className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-700/50 rounded-2xl shadow-2xl shadow-black/50 px-2">
                        <div className="flex items-center gap-1 py-2">
                            {/* Agents Tab */}
                            <button
                                onClick={() => setActiveNavTab("agents")}
                                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${
                                    activeNavTab === "agents"
                                        ? "text-purple-400 bg-purple-500/20"
                                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                                }`}
                            >
                                <span className="text-lg">✨</span>
                                <span className="text-[10px] font-medium">
                                    Agents
                                </span>
                            </button>

                            {/* Friends Tab */}
                            <button
                                onClick={() => setActiveNavTab("friends")}
                                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${
                                    activeNavTab === "friends"
                                        ? "text-orange-400 bg-orange-500/20"
                                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                                }`}
                            >
                                <span className="text-lg">👥</span>
                                <span className="text-[10px] font-medium">
                                    Friends
                                </span>
                            </button>

                            {/* Chats Tab */}
                            <button
                                onClick={() => setActiveNavTab("chats")}
                                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all relative ${
                                    activeNavTab === "chats"
                                        ? "text-blue-400 bg-blue-500/20"
                                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                                }`}
                            >
                                <span className="text-lg">💬</span>
                                <span className="text-[10px] font-medium">
                                    Chats
                                </span>
                                {/* Unread indicator */}
                                {unreadCounts &&
                                    Object.values(unreadCounts).some(
                                        (c) => c > 0
                                    ) && (
                                        <span className="absolute top-0.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                                    )}
                            </button>

                            {/* Calls Tab */}
                            <button
                                onClick={() => setActiveNavTab("calls")}
                                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${
                                    activeNavTab === "calls"
                                        ? "text-green-400 bg-green-500/20"
                                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                                }`}
                            >
                                <span className="text-lg">📞</span>
                                <span className="text-[10px] font-medium">
                                    Calls
                                </span>
                            </button>

                            {/* Bug Report Tab */}
                            <button
                                onClick={() => {
                                    setIsBugReportModalOpen(true);
                                }}
                                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${
                                    isBugReportModalOpen
                                        ? "text-orange-400 bg-orange-500/20"
                                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                                }`}
                            >
                                <span className="text-lg">🐛</span>
                                <span className="text-[10px] font-medium">
                                    Report
                                </span>
                            </button>

                            {/* Settings Tab - just opens modal, doesn't change active tab */}
                            <button
                                onClick={() => setIsSettingsModalOpen(true)}
                                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${
                                    isSettingsModalOpen
                                        ? "text-zinc-200 bg-zinc-700/50"
                                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                                }`}
                            >
                                <span className="text-lg">⚙️</span>
                                <span className="text-[10px] font-medium">
                                    Settings
                                </span>
                            </button>
                        </div>
                    </div>
                </nav>

                {/* Spacer for floating bottom nav */}
                <div className="h-24" />

                {/* Footer - Sticky to bottom */}
                <footer className="border-t border-zinc-800 bg-zinc-900/50 py-4 px-4 mt-auto">
                    <div className="max-w-4xl mx-auto">
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-zinc-500">
                            <p>
                                © {new Date().getFullYear()} Spritz. All rights
                                reserved.
                            </p>
                            <div className="flex items-center gap-4">
                                <Link
                                    href="/privacy"
                                    className="hover:text-orange-500 transition-colors"
                                >
                                    Privacy Policy
                                </Link>
                                <span className="text-zinc-600">•</span>
                                <Link
                                    href="/tos"
                                    className="hover:text-orange-500 transition-colors"
                                >
                                    Terms of Service
                                </Link>
                            </div>
                        </div>
                    </div>
                </footer>
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
                initialValue={
                    typeof window !== "undefined"
                        ? new URLSearchParams(window.location.search).get(
                              "add"
                          ) || undefined
                        : undefined
                }
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

            {/* Chat Modal */}
            {userAddress && (
                <ChatModal
                    isOpen={!!chatFriend}
                    onClose={() => setChatFriend(null)}
                    userAddress={userAddress}
                    peerAddress={chatFriend?.address || ""}
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
                onSuccess={(username) => {
                    // If username is empty string, it was removed
                    // Otherwise, it was updated/claimed
                    // Refresh to update UI
                    window.location.reload();
                }}
            />

            {/* Phone Verification Modal */}
            <PhoneVerificationModal
                isOpen={isPhoneModalOpen}
                onClose={() => setIsPhoneModalOpen(false)}
                userAddress={userAddress}
                onSuccess={() => refreshPhone()}
            />

            {/* Passkey Manager Modal */}
            <AnimatePresence>
                {isPasskeyManagerOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                        onClick={() => setIsPasskeyManagerOpen(false)}
                    >
                        <div onClick={(e) => e.stopPropagation()}>
                            <PasskeyManager
                                userAddress={userAddress}
                                onClose={() => setIsPasskeyManagerOpen(false)}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Status Modal */}
            <StatusModal
                isOpen={isStatusModalOpen}
                onClose={() => setIsStatusModalOpen(false)}
                currentSettings={userSettings}
                onSave={setStatus}
                onToggleDnd={toggleDnd}
                onBack={() => {
                    setIsStatusModalOpen(false);
                    setIsSettingsModalOpen(true);
                }}
            />

            {/* Settings Modal */}
            <SettingsModal
                isOpen={isSettingsModalOpen}
                onClose={() => setIsSettingsModalOpen(false)}
                settings={userSettings}
                onToggleSound={toggleSound}
                onToggleDecentralizedCalls={toggleDecentralizedCalls}
                isHuddle01Configured={isHuddle01Configured}
                onTogglePublicLanding={togglePublicLanding}
                onUpdateBio={(bio) => updateSettings({ publicBio: bio })}
                pushSupported={pushSupported}
                pushPermission={pushPermission}
                pushSubscribed={pushSubscribed}
                pushLoading={pushLoading}
                pushError={pushError}
                onEnablePush={subscribeToPush}
                onDisablePush={unsubscribeFromPush}
                userAddress={userAddress}
                onOpenStatusModal={() => setIsStatusModalOpen(true)}
                availableInvites={availableInvites}
                usedInvites={usedInvites}
                onOpenInvitesModal={() => setIsInvitesModalOpen(true)}
                userEmail={userEmail}
                isEmailVerified={isEmailVerified}
                onOpenEmailModal={() => setIsEmailModalOpen(true)}
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

            {/* New Scheduled Call Modal */}
            <NewScheduledCallModal
                isOpen={showNewScheduledModal}
                onClose={() => setShowNewScheduledModal(false)}
                userAddress={userAddress}
            />

            {/* New Call Modal - Friend Selection */}
            <AnimatePresence>
                {showNewCallModal && (
                    <>
                        <div
                            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                            onClick={() => setShowNewCallModal(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-4"
                            onClick={() => setShowNewCallModal(false)}
                        >
                            <div
                                className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="p-6 border-b border-zinc-800">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-xl font-bold text-white">
                                            Call a Friend
                                        </h2>
                                        <button
                                            onClick={() =>
                                                setShowNewCallModal(false)
                                            }
                                            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                                        >
                                            <svg
                                                className="w-5 h-5 text-zinc-400"
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
                                <div className="p-4 max-h-96 overflow-y-auto">
                                    {friendsListData.length === 0 ? (
                                        <div className="text-center py-8">
                                            <p className="text-zinc-400">
                                                No friends to call
                                            </p>
                                            <p className="text-zinc-500 text-sm mt-2">
                                                Add friends to start calling
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {friendsListData.map((friend) => (
                                                <button
                                                    key={friend.id}
                                                    onClick={() => {
                                                        setShowNewCallModal(
                                                            false
                                                        );
                                                        handleCall(
                                                            friend,
                                                            false
                                                        );
                                                    }}
                                                    disabled={
                                                        callState !== "idle"
                                                    }
                                                    className="w-full flex items-center gap-3 p-3 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
                                                >
                                                    {friend.avatar ? (
                                                        <img
                                                            src={friend.avatar}
                                                            alt=""
                                                            className="w-10 h-10 rounded-full"
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-sm text-white">
                                                            {(friend.nickname ||
                                                                friend.reachUsername ||
                                                                friend.ensName ||
                                                                friend.address)?.[0]?.toUpperCase() ||
                                                                "?"}
                                                        </div>
                                                    )}
                                                    <div className="flex-1 text-left">
                                                        <p className="text-sm font-medium text-white">
                                                            {friend.nickname ||
                                                                friend.reachUsername ||
                                                                friend.ensName ||
                                                                `${friend.address.slice(
                                                                    0,
                                                                    6
                                                                )}...${friend.address.slice(
                                                                    -4
                                                                )}`}
                                                        </p>
                                                        {(friend.reachUsername ||
                                                            friend.ensName) && (
                                                            <p className="text-xs text-zinc-500">
                                                                {friend.address.slice(
                                                                    0,
                                                                    6
                                                                )}
                                                                ...
                                                                {friend.address.slice(
                                                                    -4
                                                                )}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <svg
                                                        className="w-5 h-5 text-zinc-400"
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
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

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
                onBack={() => {
                    setIsInvitesModalOpen(false);
                    setIsSettingsModalOpen(true);
                }}
            />

            {/* Alpha Chat Modal */}
            <AlphaChatModal
                isOpen={isAlphaChatOpen}
                onClose={() => setIsAlphaChatOpen(false)}
                userAddress={userAddress}
                alphaChat={alphaChat}
                getUserInfo={getAlphaUserInfo}
                onAddFriend={async (address) => {
                    const result = await sendFriendRequest(address);
                    if (result) {
                        // Optionally show toast
                    }
                    return result;
                }}
                isFriend={(address) =>
                    friends.some(
                        (f) =>
                            f.friend_address.toLowerCase() ===
                            address.toLowerCase()
                    )
                }
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
            {userAddress && (
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
                    getUserInfo={getAlphaUserInfo}
                />
            )}

            {/* Browse Channels Modal */}
            <BrowseChannelsModal
                isOpen={isBrowseChannelsOpen}
                onClose={() => {
                    setIsBrowseChannelsOpen(false);
                    fetchJoinedChannels();
                }}
                userAddress={userAddress}
                onJoinChannel={async (channel) => {
                    setIsBrowseChannelsOpen(false);
                    await fetchJoinedChannels(); // Refresh the list immediately
                    setSelectedChannel(channel);
                }}
            />

            {/* Channel Chat Modal */}
            {selectedChannel && (
                <ChannelChatModal
                    isOpen={!!selectedChannel}
                    onClose={() => setSelectedChannel(null)}
                    channel={selectedChannel}
                    userAddress={userAddress}
                    onLeave={async () => {
                        await leaveChannel(selectedChannel.id);
                        await fetchJoinedChannels(); // Refresh the list
                        setSelectedChannel(null);
                    }}
                    getUserInfo={getAlphaUserInfo}
                    onAddFriend={async (address) => {
                        const result = await sendFriendRequest(address);
                        return result;
                    }}
                    isFriend={(address) =>
                        friends.some(
                            (f) =>
                                f.friend_address.toLowerCase() ===
                                address.toLowerCase()
                        )
                    }
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

            {/* Daily Bonus Modal */}
            <AnimatePresence>
                {showDailyBonusModal && dailyBonusAvailable && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                        onClick={() => setShowDailyBonusModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm text-center"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Animated Gift Icon */}
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{
                                    type: "spring",
                                    delay: 0.1,
                                    stiffness: 200,
                                }}
                                className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center"
                            >
                                <motion.span
                                    animate={{
                                        rotate: [0, -10, 10, -10, 0],
                                        scale: [1, 1.1, 1],
                                    }}
                                    transition={{
                                        duration: 0.5,
                                        repeat: Infinity,
                                        repeatDelay: 2,
                                    }}
                                    className="text-4xl"
                                >
                                    🎁
                                </motion.span>
                            </motion.div>

                            <h2 className="text-xl font-bold text-white mb-2">
                                Daily Bonus Available!
                            </h2>
                            <p className="text-zinc-400 mb-6">
                                Claim your{" "}
                                <span className="text-amber-400 font-semibold">
                                    +3 points
                                </span>{" "}
                                for logging in today
                            </p>

                            <button
                                onClick={handleClaimDailyBonus}
                                disabled={isClaimingBonus}
                                className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold transition-all hover:shadow-lg hover:shadow-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isClaimingBonus ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Claiming...
                                    </>
                                ) : (
                                    <>
                                        <span>✨</span>
                                        Claim +3 Points
                                    </>
                                )}
                            </button>

                            <button
                                onClick={() => setShowDailyBonusModal(false)}
                                className="mt-3 text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                            >
                                Maybe later
                            </button>
                        </motion.div>
                    </motion.div>
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

            {/* Go Live Modal */}
            <GoLiveModal
                isOpen={isGoLiveModalOpen}
                onClose={() => setIsGoLiveModalOpen(false)}
                userAddress={userAddress}
                currentStream={currentStream}
                onCreateStream={createStream}
                onGoLive={goLive}
                onEndStream={endStream}
            />

            {/* Bug Report Modal */}
            <BugReportModal
                isOpen={isBugReportModalOpen}
                onClose={() => setIsBugReportModalOpen(false)}
                userAddress={userAddress}
            />

            {/* Live Stream Player removed - now using /live/[id] page */}
        </>
    );
}

// Wrapper that provides Waku context
export function Dashboard({
    userAddress,
    onLogout,
    isPasskeyUser,
    walletType,
    isBetaTester,
    siweUser,
}: DashboardProps) {
    // Waku works with both EVM and Solana addresses
    return (
        <XMTPProvider userAddress={userAddress}>
            <DashboardContent
                userAddress={userAddress}
                onLogout={onLogout}
                isPasskeyUser={isPasskeyUser}
                walletType={walletType}
                isBetaTester={isBetaTester}
                siweUser={siweUser}
            />
        </XMTPProvider>
    );
}
