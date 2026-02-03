"use client";

import {
    useState,
    useEffect,
    useRef,
    useMemo,
    useCallback,
    startTransition,
} from "react";
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
import { useSmartWallet } from "@/hooks/useSmartWallet";
import type { PublicChannel } from "@/app/api/channels/route";
import { UsernameClaimModal } from "./UsernameClaimModal";
import { PasskeyPromptModal } from "./PasskeyPromptModal";
import { PhoneVerificationModal } from "./PhoneVerificationModal";
import { XMTPProvider, useXMTPContext } from "@/context/WakuProvider";
import { useUsername } from "@/hooks/useUsername";
import { usePhoneVerification } from "@/hooks/usePhoneVerification";
import { useNotifications } from "@/hooks/useNotifications";
import { useUserSettings } from "@/hooks/useUserSettings";
import { isAgoraConfigured } from "@/config/agora";
import { isHuddle01Configured, createHuddle01Room } from "@/config/huddle01";
import { supabase, isSupabaseConfigured } from "@/config/supabase";
import { StatusModal } from "./StatusModal";
import { SettingsModal } from "./SettingsModal";
import { BugReportModal } from "./BugReportModal";
import { RegistrationPreferencesModal } from "./RegistrationPreferencesModal";
import { GlobalSearchModal } from "./GlobalSearchModal";
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
// Session lock removed - all wallet/vault operations require signatures anyway
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
import { LiveBadge } from "./LiveStreamPlayer";
import { useStreams } from "@/hooks/useStreams";
import type { Stream } from "@/app/api/streams/route";
import { WalletModal } from "./WalletModal";
import { UnifiedChatList, type UnifiedChatItem } from "./UnifiedChatList";
import { useChatPinned } from "@/hooks/useChatPinned";
import { MessagingKeyUpgradeBanner } from "./MessagingKeyUpgradeBanner";
import { MessagingKeyRestoreBanner } from "./MessagingKeyRestoreBanner";
import { useWakeLock } from "@/hooks/useWakeLock";

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
    isEmailUser?: boolean;
    isWorldIdUser?: boolean;
    isAlienIdUser?: boolean;
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
    isEmailUser,
    isWorldIdUser,
    isAlienIdUser,
    walletType,
    isBetaTester,
    siweUser,
}: DashboardProps) {
    const isSolanaUser = walletType === "solana";
    // Users who need a passkey to access Smart Wallet (non-wallet auth methods)
    const needsPasskeyForWallet =
        isEmailUser || isSolanaUser || isWorldIdUser || isAlienIdUser;
    // EVM address for hooks that require it
    // For Solana users, pass null to disable EVM-specific features
    const evmAddress = isSolanaUser ? null : (userAddress as `0x${string}`);
    const [isAddFriendOpen, setIsAddFriendOpen] = useState(false);
    const [isUsernameModalOpen, setIsUsernameModalOpen] = useState(false);
    const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);
    const [showPasskeyPrompt, setShowPasskeyPrompt] = useState(false);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isQRCodeModalOpen, setIsQRCodeModalOpen] = useState(false);
    const [isSocialsModalOpen, setIsSocialsModalOpen] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isInvitesModalOpen, setIsInvitesModalOpen] = useState(false);
    const [isRegistrationPrefsOpen, setIsRegistrationPrefsOpen] =
        useState(false);
    const [showWakuSuccess, setShowWakuSuccess] = useState(false);
    const [showSolanaBanner, setShowSolanaBanner] = useState(true);
    const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

    // Live streaming state
    const [isGoLiveModalOpen, setIsGoLiveModalOpen] = useState(false);
    // watchingStream state removed - now using /live/[id] page instead

    // Bottom navigation tab state - default to chats
    type NavTab =
        | "wallet"
        | "agents"
        | "friends"
        | "chats"
        | "calls"
        | "leaderboard";
    const [activeNavTab, setActiveNavTab] = useState<NavTab>("chats");
    const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
    const [showWalletBetaPrompt, setShowWalletBetaPrompt] = useState(false);
    const [isApplyingWalletBeta, setIsApplyingWalletBeta] = useState(false);
    const [walletBetaApplied, setWalletBetaApplied] = useState(false);
    const [betaAppliedAt, setBetaAppliedAt] = useState<string | null>(null);
    const [isCheckingBetaStatus, setIsCheckingBetaStatus] = useState(false);
    const walletBetaCheckInitiated = useRef(false); // Prevent multiple checks
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

    // Passkey credential ID for messaging key derivation
    const [passkeyCredentialId, setPasskeyCredentialId] = useState<
        string | null
    >(null);

    // Fetch passkey credential ID for passkey users
    useEffect(() => {
        if (!isPasskeyUser || !userAddress) {
            setPasskeyCredentialId(null);
            return;
        }

        const sb = supabase;
        if (!sb) {
            console.warn(
                "[Dashboard] Supabase not configured, cannot fetch passkey credential"
            );
            return;
        }

        const fetchCredential = async () => {
            try {
                const { data } = await sb
                    .from("passkey_credentials")
                    .select("credential_id")
                    .eq("user_address", userAddress.toLowerCase())
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .single();

                if (data?.credential_id) {
                    setPasskeyCredentialId(data.credential_id);
                }
            } catch (err) {
                console.warn(
                    "[Dashboard] Could not fetch passkey credential:",
                    err
                );
            }
        };

        fetchCredential();
    }, [isPasskeyUser, userAddress]);

    // Group chat state
    const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [groups, setGroups] = useState<XMTPGroup[]>([]);
    const [isLoadingGroups, setIsLoadingGroups] = useState(false);

    // Folder modal state
    const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
    const [isChatSearchOpen, setIsChatSearchOpen] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<XMTPGroup | null>(null);

    // Custom avatar cache for friends
    const [friendCustomAvatars, setFriendCustomAvatars] = useState<
        Record<string, string | null>
    >({});

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

    // Pinned chats (pin to top of list)
    const { pinnedIds, setChatPinned } = useChatPinned(userAddress);

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
    const {
        username: reachUsername,
        claimUsername,
        isFetching: isUsernameFetching,
    } = useUsername(userAddress);

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
        toggleUseCustomAvatar,
        setCustomAvatar,
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
    // IMPORTANT: Use the actual auth method, not the chain type
    // walletType prop is about chain (evm/solana), but track-login expects auth method
    const actualAuthMethod = isPasskeyUser
        ? "passkey"
        : isEmailUser
        ? "email"
        : isWorldIdUser
        ? "world_id"
        : isAlienIdUser
        ? "alien_id"
        : walletType; // Traditional wallet: evm or solana

    const {
        dailyBonusAvailable,
        claimDailyBonus,
        isClaimingBonus,
        dismissDailyBonus,
    } = useLoginTracking({
        walletAddress: userAddress,
        walletType: actualAuthMethod,
        chain: isSolanaUser ? "solana" : "ethereum",
        ensName: userENS.ensName,
        username: reachUsername,
    });

    // State for daily bonus modal
    const [showDailyBonusModal, setShowDailyBonusModal] = useState(false);
    const [dailyBonusClaimed, setDailyBonusClaimed] = useState(false);
    const hasShownBonusModal = useRef(false); // Prevent showing modal multiple times

    // Show notification when daily bonus is available (only once per session)
    useEffect(() => {
        if (
            dailyBonusAvailable &&
            !dailyBonusClaimed &&
            !hasShownBonusModal.current
        ) {
            hasShownBonusModal.current = true;
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

    // Handle dismissing daily bonus modal (user clicks "Maybe later")
    const handleDismissDailyBonus = () => {
        setShowDailyBonusModal(false);
        dismissDailyBonus(); // Remember dismissal for today
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
    const {
        hasBetaAccess: hookBetaAccess,
        isLoading: isBetaAccessLoading,
        refresh: refreshBetaAccess,
    } = useBetaAccess(userAddress);
    const hasBetaAccess = isBetaTester || hookBetaAccess;

    // Check beta status when wallet beta prompt opens (ONCE per prompt open)
    useEffect(() => {
        // Only check when prompt opens and we haven't already checked
        if (!showWalletBetaPrompt) {
            // Reset the check flag when prompt closes so we can check again next time
            walletBetaCheckInitiated.current = false;
            return;
        }

        if (walletBetaApplied || walletBetaCheckInitiated.current) {
            return;
        }

        walletBetaCheckInitiated.current = true;
        setIsCheckingBetaStatus(true);

        fetch("/api/beta-access/apply", {
            method: "GET",
            credentials: "include",
        })
            .then((res) => res.json())
            .then((data) => {
                if (data.hasApplied) {
                    setWalletBetaApplied(true);
                    setBetaAppliedAt(data.appliedAt);
                }
                // If user already has beta access, close prompt and open wallet
                if (data.hasBetaAccess) {
                    refreshBetaAccess();
                    setShowWalletBetaPrompt(false);
                    setIsWalletModalOpen(true);
                }
            })
            .catch((err) => {
                console.error("[Dashboard] Error checking beta status:", err);
            })
            .finally(() => {
                setIsCheckingBetaStatus(false);
            });
    }, [showWalletBetaPrompt, walletBetaApplied, refreshBetaAccess]);

    // Email verification
    const {
        isVerified: isEmailVerified,
        email: userEmail,
        emailUpdatesOptIn,
        updateEmailUpdatesOptIn,
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
    const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);

    // Global keyboard shortcut for search (Cmd+K / Ctrl+K)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setIsGlobalSearchOpen((prev) => !prev);
            }
            if (e.key === "Escape" && isGlobalSearchOpen) {
                setIsGlobalSearchOpen(false);
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isGlobalSearchOpen]);

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

    // Fetch custom avatars for friends
    useEffect(() => {
        if (friends.length === 0 || !isSupabaseConfigured || !supabase) return;

        const client = supabase; // Capture for closure (after null check)
        const addresses = friends.map((f) => f.friend_address.toLowerCase());

        const fetchCustomAvatars = async () => {
            try {
                const { data } = await client
                    .from("shout_user_settings")
                    .select(
                        "wallet_address, custom_avatar_url, use_custom_avatar"
                    )
                    .in("wallet_address", addresses);

                if (data) {
                    const avatars: Record<string, string | null> = {};
                    data.forEach(
                        (row: {
                            wallet_address: string;
                            custom_avatar_url: string | null;
                            use_custom_avatar: boolean;
                        }) => {
                            if (
                                row.use_custom_avatar &&
                                row.custom_avatar_url
                            ) {
                                avatars[row.wallet_address] =
                                    row.custom_avatar_url;
                            }
                        }
                    );
                    setFriendCustomAvatars(avatars);
                }
            } catch (err) {
                console.error(
                    "[Dashboard] Error fetching custom avatars:",
                    err
                );
            }
        };

        fetchCustomAvatars();
    }, [friends]);

    // Helper to get effective avatar (custom if enabled, otherwise ENS/default)
    const getEffectiveAvatar = useCallback(
        (address: string, ensAvatar: string | null): string | null => {
            const customAvatar = friendCustomAvatars[address.toLowerCase()];
            return customAvatar || ensAvatar;
        },
        [friendCustomAvatars]
    );

    // Fetch user info for all unique senders in alpha chat messages (including friends for effective avatar)
    useEffect(() => {
        if (!alphaChat.messages || alphaChat.messages.length === 0) return;

        const uniqueSenders = new Set<string>();
        alphaChat.messages.forEach((msg) => {
            const sender = msg.sender_address.toLowerCase();
            // Skip only current user - include friends to get their effective avatar
            if (sender !== userAddress.toLowerCase()) {
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
                        // Display name priority: ENS > username > display_name
                        const name = data.user.ens_name
                            ? data.user.ens_name
                            : data.user.username
                            ? `@${data.user.username}`
                            : data.user.display_name || null;
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

    // Effective avatar - uses custom avatar when selected, otherwise ENS avatar
    const effectiveAvatar = useMemo(() => {
        if (userSettings.useCustomAvatar && userSettings.customAvatarUrl) {
            return userSettings.customAvatarUrl;
        }
        return userENS.avatar;
    }, [
        userSettings.useCustomAvatar,
        userSettings.customAvatarUrl,
        userENS.avatar,
    ]);

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
    const {
        channels,
        joinedChannels,
        joinChannel,
        leaveChannel,
        fetchChannels,
        fetchJoinedChannels,
        toggleChannelNotifications,
        isNotificationsEnabled,
        onNewChannelMessage,
        setActiveChannel,
    } = useChannels(userAddress);
    const { smartWallet } = useSmartWallet(
        isSolanaUser ? null : (userAddress as string)
    );
    // For POAP scan: use Smart Wallet (passkey) + identity so we check both
    const poapAddresses = useMemo(() => {
        if (!userAddress || isSolanaUser) return [userAddress].filter(Boolean);
        const set = new Set<string>();
        const smart = smartWallet?.smartWalletAddress;
        if (smart) set.add(smart.toLowerCase());
        set.add(userAddress.toLowerCase());
        return Array.from(set);
    }, [userAddress, isSolanaUser, smartWallet?.smartWalletAddress]);
    const [isBrowseChannelsOpen, setIsBrowseChannelsOpen] = useState(false);
    const [browseChannelsInitialCreate, setBrowseChannelsInitialCreate] =
        useState(false);
    const [showNewChatMenu, setShowNewChatMenu] = useState(false);
    const [selectedChannel, setSelectedChannel] =
        useState<PublicChannel | null>(null);

    // Global chat icon from app settings
    const [globalChatIconUrl, setGlobalChatIconUrl] = useState<string | null>(
        null
    );

    // Fetch global chat icon
    useEffect(() => {
        async function fetchGlobalChatIcon() {
            try {
                const res = await fetch(
                    "/api/admin/settings?key=global_chat_icon"
                );
                if (res.ok) {
                    const data = await res.json();
                    if (data.settings?.value?.icon_url) {
                        setGlobalChatIconUrl(data.settings.value.icon_url);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch global chat icon:", err);
            }
        }
        fetchGlobalChatIcon();
    }, []);

    // Handle pending channel joins from invite links
    const hasPendingJoinHandled = useRef(false);
    useEffect(() => {
        if (!userAddress || hasPendingJoinHandled.current) return;

        const handlePendingJoins = async () => {
            hasPendingJoinHandled.current = true;

            // Check for pending channel join (from invite link when not logged in)
            const pendingChannelId = localStorage.getItem(
                "spritz_pending_channel_join"
            );
            if (pendingChannelId) {
                localStorage.removeItem("spritz_pending_channel_join");
                try {
                    await joinChannel(pendingChannelId);
                    await fetchJoinedChannels();
                    // Find the channel and open it
                    const allChannels = await fetch(
                        `/api/public/channels/${pendingChannelId}`
                    ).then((r) => r.json());
                    if (allChannels.channel) {
                        setSelectedChannel(allChannels.channel);
                    }
                } catch (err) {
                    console.error(
                        "[Dashboard] Error joining pending channel:",
                        err
                    );
                }
            }

            // Check for channel to open (from invite link when already logged in)
            const openChannelId = localStorage.getItem("spritz_open_channel");
            if (openChannelId) {
                localStorage.removeItem("spritz_open_channel");
                // Find the channel in joinedChannels or fetch it
                const channel = joinedChannels.find(
                    (c) => c.id === openChannelId
                );
                if (channel) {
                    setSelectedChannel(channel);
                } else {
                    // Fetch and set it
                    try {
                        const res = await fetch(
                            `/api/public/channels/${openChannelId}`
                        );
                        const data = await res.json();
                        if (data.channel) {
                            setSelectedChannel(data.channel);
                        }
                    } catch (err) {
                        console.error(
                            "[Dashboard] Error opening channel:",
                            err
                        );
                    }
                }
            }
        };

        handlePendingJoins();
    }, [userAddress, joinChannel, fetchJoinedChannels, joinedChannels]);

    // Screen Wake Lock - prevents screen from dimming during calls and active chats
    // This helps maintain WebSocket connections and improves PWA experience
    const isInActiveCall =
        callState === "joining" ||
        callState === "connected" ||
        !!currentGroupCall;
    const isInActiveChat = !!chatFriend || !!selectedGroup || !!selectedChannel;
    const { isActive: isWakeLockActive, isSupported: isWakeLockSupported } =
        useWakeLock(isInActiveCall || isInActiveChat);

    // Log wake lock status for debugging (only once when state changes)
    useEffect(() => {
        if (isWakeLockSupported && (isInActiveCall || isInActiveChat)) {
            console.log(
                "[Dashboard] Wake lock:",
                isWakeLockActive ? "active" : "inactive",
                { isInActiveCall, isInActiveChat }
            );
        }
    }, [isWakeLockActive, isWakeLockSupported, isInActiveCall, isInActiveChat]);

    // Waku works with both EVM and Solana addresses
    const wakuContext = useXMTPContext();

    const isWakuInitialized = wakuContext?.isInitialized ?? false;
    const isWakuInitializing = wakuContext?.isInitializing ?? false;
    const wakuInitStatus = wakuContext?.initStatus ?? "";
    const wakuError = wakuContext?.error ?? null;
    const unreadCounts = wakuContext?.unreadCounts ?? {};
    const initializeWaku = wakuContext?.initialize ?? (() => Promise.resolve());

    // Track last message times for sorting chats (persisted to localStorage)
    const [lastMessageTimes, setLastMessageTimes] = useState<
        Record<string, number>
    >(() => {
        if (typeof window === "undefined") return {};
        try {
            const stored = localStorage.getItem(
                `spritz_last_msg_times_${userAddress?.toLowerCase()}`
            );
            return stored ? JSON.parse(stored) : {};
        } catch {
            return {};
        }
    });

    // Track last message previews for chat list display (persisted to localStorage)
    const [lastMessagePreviews, setLastMessagePreviews] = useState<
        Record<string, string>
    >(() => {
        if (typeof window === "undefined") return {};
        try {
            const stored = localStorage.getItem(
                `spritz_last_msg_previews_${userAddress?.toLowerCase()}`
            );
            return stored ? JSON.parse(stored) : {};
        } catch {
            return {};
        }
    });

    // On initial load, scan stored messages to extract last message times for conversations
    // without tracked times yet. This provides initial ordering based on actual messages.
    const hasScannedMessages = useRef(false);
    useEffect(() => {
        if (
            typeof window === "undefined" ||
            !userAddress ||
            hasScannedMessages.current
        )
            return;
        hasScannedMessages.current = true;

        try {
            // Get stored messages from Waku storage
            const messagesData = localStorage.getItem("waku_messages");
            if (!messagesData) return;

            const allMessages = JSON.parse(messagesData);
            const updates: Record<string, number> = {};
            const userAddrLower = userAddress.toLowerCase();

            Object.entries(allMessages).forEach(([topic, messages]) => {
                if (!Array.isArray(messages) || messages.length === 0) return;

                // Find the latest message timestamp
                let latestTime = 0;
                messages.forEach((msg: { sentAtNs?: string | bigint }) => {
                    const timestamp = msg.sentAtNs
                        ? Number(BigInt(msg.sentAtNs) / BigInt(1000000)) // Convert nanoseconds to milliseconds
                        : 0;
                    if (timestamp > latestTime) {
                        latestTime = timestamp;
                    }
                });

                if (latestTime === 0) return;

                // Extract conversation key from topic
                // DM topics: /shout/1/dm-{addr1}-{addr2}/proto
                // Group topics: /shout/1/group-{groupId}/proto
                // Channel topics: handled separately
                if (topic.includes("/dm-")) {
                    const match = topic.match(/\/dm-([a-f0-9x-]+)\/proto$/i);
                    if (match) {
                        // DM topic format: dm-{addr1}-{addr2} sorted alphabetically
                        const dmPair = match[1];
                        const addresses = dmPair
                            .split("-")
                            .filter((a) => a.startsWith("0x"));
                        // Find the peer address (not our address)
                        const peerAddr = addresses.find(
                            (a) => a.toLowerCase() !== userAddrLower
                        );
                        if (peerAddr) {
                            const key = peerAddr.toLowerCase();
                            if (
                                !lastMessageTimes[key] ||
                                latestTime > lastMessageTimes[key]
                            ) {
                                updates[key] = latestTime;
                            }
                        }
                    }
                } else if (topic.includes("/group-")) {
                    const match = topic.match(/\/group-([^/]+)\/proto$/);
                    if (match) {
                        const groupId = match[1];
                        const key = `group-${groupId}`;
                        if (
                            !lastMessageTimes[key] ||
                            latestTime > lastMessageTimes[key]
                        ) {
                            updates[key] = latestTime;
                        }
                    }
                }
            });

            if (Object.keys(updates).length > 0) {
                console.log(
                    "[Dashboard] Loaded message times from storage:",
                    Object.keys(updates).length,
                    "conversations"
                );
                setLastMessageTimes((prev) => ({ ...prev, ...updates }));
            }
        } catch (error) {
            console.error("[Dashboard] Failed to scan stored messages:", error);
        }
    }, [userAddress, lastMessageTimes]);

    // Persist last message times to localStorage
    useEffect(() => {
        if (userAddress && Object.keys(lastMessageTimes).length > 0) {
            try {
                localStorage.setItem(
                    `spritz_last_msg_times_${userAddress.toLowerCase()}`,
                    JSON.stringify(lastMessageTimes)
                );
            } catch {
                // Ignore storage errors
            }
        }
    }, [lastMessageTimes, userAddress]);

    // Persist last message previews to localStorage
    useEffect(() => {
        if (userAddress && Object.keys(lastMessagePreviews).length > 0) {
            try {
                localStorage.setItem(
                    `spritz_last_msg_previews_${userAddress.toLowerCase()}`,
                    JSON.stringify(lastMessagePreviews)
                );
            } catch {
                // Ignore storage errors
            }
        }
    }, [lastMessagePreviews, userAddress]);

    // Update last message times when unread counts change (new message received)
    const prevUnreadCountsRef = useRef<Record<string, number>>({});
    useEffect(() => {
        const now = Date.now();
        const prevCounts = prevUnreadCountsRef.current;
        const updates: Record<string, number> = {};

        // Check for new or increased unread counts (meaning new messages)
        Object.entries(unreadCounts).forEach(([address, count]) => {
            const prevCount = prevCounts[address] || 0;
            if (count > prevCount) {
                // New message received - update timestamp
                updates[address] = now;
            }
        });

        if (Object.keys(updates).length > 0) {
            startTransition(() =>
                setLastMessageTimes((prev) => ({ ...prev, ...updates }))
            );
        }

        prevUnreadCountsRef.current = { ...unreadCounts };
    }, [unreadCounts]);

    // Update last message time for global/alpha chat when new messages arrive
    const prevAlphaUnreadRef = useRef<number>(0);
    useEffect(() => {
        if (alphaUnreadCount > prevAlphaUnreadRef.current) {
            startTransition(() =>
                setLastMessageTimes((prev) => ({
                    ...prev,
                    "global-spritz": Date.now(),
                }))
            );
        }
        prevAlphaUnreadRef.current = alphaUnreadCount;
    }, [alphaUnreadCount]);

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

    // Get user info for Alpha chat - checks cache first for effective avatar, then friends list
    // Display name priority: ENS > Spritz username > address
    const getAlphaUserInfo = useCallback(
        (address: string) => {
            const normalizedAddress = address.toLowerCase();

            // Check if it's the current user
            // Priority: ENS > username
            if (normalizedAddress === userAddress.toLowerCase()) {
                return {
                    name:
                        userENS?.ensName ||
                        (reachUsername ? `@${reachUsername}` : null),
                    avatar: effectiveAvatar || null,
                };
            }

            // Check cache first - has effective avatar from public API
            // Cache stores: { name: string | null; avatar: string | null }
            // where name is already formatted with priority (ENS > @username)
            const cached = userInfoCache.get(normalizedAddress);

            // Check friends list for name info
            const friend = friends.find(
                (f) => f.friend_address.toLowerCase() === normalizedAddress
            );

            // Build display name with priority: local nickname > ENS > username
            const getDisplayNameForFriend = () => {
                // Local nickname takes highest priority (personal override)
                if (friend?.nickname) return friend.nickname;
                // ENS is second priority
                if (friend?.ensName) return friend.ensName;
                // Spritz username is third priority
                if (friend?.reachUsername) return `@${friend.reachUsername}`;
                // Fallback to cached name if available (already formatted correctly)
                if (cached?.name) return cached.name;
                return null;
            };

            // If we have cached info (with effective avatar), use it
            if (cached) {
                return {
                    name: getDisplayNameForFriend(),
                    avatar: cached.avatar, // Use cached effective avatar
                };
            }

            // Fallback to friend data if no cache (avatar may not be effective)
            if (friend) {
                return {
                    name: getDisplayNameForFriend(),
                    avatar: friend.avatar || null,
                };
            }

            // Return null if not found (will be fetched by useEffect)
            return null;
        },
        [
            userAddress,
            friends,
            reachUsername,
            userENS,
            effectiveAvatar,
            userInfoCache,
        ]
    );

    // Convert friends to the format FriendsList expects - memoized to prevent unnecessary re-renders
    // Uses effective avatar (custom if enabled, otherwise ENS/default)
    const friendsListData: FriendsListFriend[] = useMemo(
        () =>
            friends.map((f) => ({
                id: f.id,
                address: f.friend_address as Address,
                ensName: f.ensName || null,
                avatar: getEffectiveAvatar(f.friend_address, f.avatar || null),
                nickname: f.nickname,
                reachUsername: f.reachUsername || null,
                addedAt: f.created_at,
            })),
        [friends, getEffectiveAvatar]
    );

    // Normalize to a valid Date or null (invalid/missing values sort to bottom)
    const toValidLastMessageAt = useCallback((value: unknown): Date | null => {
        if (value == null) return null;
        const d =
            value instanceof Date ? value : new Date(value as string | number);
        const t = d.getTime();
        return Number.isFinite(t) ? d : null;
    }, []);

    // Create unified chat list combining DMs, groups, channels, and global chat
    const unifiedChats: UnifiedChatItem[] = useMemo(() => {
        const items: UnifiedChatItem[] = [];

        // Add DM chats from friends
        friendsListData.forEach((friend) => {
            const addressLower = friend.address.toLowerCase();
            const lastMsgTime = lastMessageTimes[addressLower];
            const lastMessageAt = lastMsgTime
                ? toValidLastMessageAt(lastMsgTime)
                : toValidLastMessageAt(friend.addedAt);

            items.push({
                id: `dm-${friend.address}`,
                type: "dm",
                name:
                    friend.nickname ||
                    (friend.reachUsername
                        ? `@${friend.reachUsername}`
                        : null) ||
                    friend.ensName ||
                    `${friend.address.slice(0, 6)}...${friend.address.slice(
                        -4
                    )}`,
                avatar: friend.avatar,
                lastMessage: lastMessagePreviews[addressLower] || null,
                lastMessageAt,
                unreadCount: unreadCounts[addressLower] || 0,
                isOnline: false, // Will be updated by FriendsList logic
                isPinned: pinnedIds.has(`dm-${friend.address}`),
                metadata: {
                    address: friend.address,
                    ensName: friend.ensName,
                    reachUsername: friend.reachUsername,
                },
            });
        });

        // Add Spritz Global Chat (use null when no activity so it doesn't sort as "now")
        const globalLastMsgTime = lastMessageTimes["global-spritz"];
        items.push({
            id: "global-spritz",
            type: "global",
            name: "Spritz Global",
            avatar: globalChatIconUrl,
            lastMessage:
                lastMessagePreviews["global-spritz"] || "Community chat",
            lastMessageAt: toValidLastMessageAt(globalLastMsgTime),
            unreadCount: alphaUnreadCount,
            isPinned: pinnedIds.has("global-spritz"),
            metadata: {
                isAlpha: isAlphaMember,
            },
        });

        // Add public channels
        joinedChannels.forEach((channel) => {
            const channelKey = `channel-${channel.id}`;
            const lastMsgTime = lastMessageTimes[channelKey];
            const fallbackTime = channel.updated_at || channel.created_at;
            const lastMessageAt = lastMsgTime
                ? toValidLastMessageAt(lastMsgTime)
                : toValidLastMessageAt(fallbackTime);
            items.push({
                id: channelKey,
                type: "channel",
                name: channel.name,
                avatar: channel.poap_image_url ?? channel.icon_url ?? null,
                lastMessage:
                    lastMessagePreviews[channelKey] ||
                    `${channel.member_count} members`,
                lastMessageAt,
                unreadCount: 0,
                isPinned: pinnedIds.has(channelKey),
                metadata: {
                    memberCount: channel.member_count,
                    isPublic: true,
                },
            });
        });

        // Add private groups
        groups.forEach((group) => {
            const groupKey = `group-${group.id}`;
            const lastMsgTime = lastMessageTimes[groupKey];
            const lastMessageAt = lastMsgTime
                ? toValidLastMessageAt(lastMsgTime)
                : toValidLastMessageAt(group.createdAt);
            items.push({
                id: groupKey,
                type: "group",
                name: group.name,
                avatar: null,
                lastMessage:
                    lastMessagePreviews[groupKey] ||
                    `${group.memberCount || 0} members`,
                lastMessageAt,
                unreadCount: 0,
                isPinned: pinnedIds.has(groupKey),
                metadata: {
                    memberCount: group.memberCount,
                    isPublic: false,
                },
            });
        });

        return items;
    }, [
        friendsListData,
        unreadCounts,
        lastMessageTimes,
        lastMessagePreviews,
        joinedChannels,
        groups,
        pinnedIds,
        alphaUnreadCount,
        isAlphaMember,
        globalChatIconUrl,
        toValidLastMessageAt,
    ]);

    // Function to update last message time and preview when user sends a message (non-urgent to keep list responsive)
    const updateLastMessageTime = useCallback(
        (chatKey: string, messagePreview?: string) => {
            startTransition(() => {
                setLastMessageTimes((prev) => ({
                    ...prev,
                    [chatKey]: Date.now(),
                }));
                if (messagePreview) {
                    const preview =
                        messagePreview.length > 50
                            ? messagePreview.slice(0, 50) + "..."
                            : messagePreview;
                    setLastMessagePreviews((prev) => ({
                        ...prev,
                        [chatKey]: preview,
                    }));
                }
            });
        },
        []
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
            const senderAddressLower = senderAddress.toLowerCase();
            startTransition(() =>
                setLastMessageTimes((prev) => ({
                    ...prev,
                    [senderAddressLower]: Date.now(),
                }))
            );

            // Skip notification if we're already viewing this conversation
            if (chatFriend?.address.toLowerCase() === senderAddressLower) {
                console.log(
                    "[Dashboard] Skipping notification - chat is open for:",
                    senderAddress
                );
                return;
            }

            // Pre-fetch all messages for this conversation in background
            // This way when user clicks the toast, messages are already loaded
            prefetchMessages(senderAddress);

            // Find friend info for the sender
            const friend = friendsListData.find(
                (f) => f.address.toLowerCase() === senderAddressLower
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
        chatFriend,
    ]);

    // Listen for new channel messages and show toast + notification
    useEffect(() => {
        const unsubscribe = onNewChannelMessage(
            ({ channelId, channelName, senderAddress, content }) => {
                const channelKey = `channel-${channelId}`;
                startTransition(() =>
                    setLastMessageTimes((prev) => ({
                        ...prev,
                        [channelKey]: Date.now(),
                    }))
                );

                // Skip notification if we're already viewing this channel
                if (selectedChannel?.id === channelId) {
                    console.log(
                        "[Dashboard] Skipping notification - channel chat is open:",
                        channelName
                    );
                    return;
                }

                // Find sender info
                const senderInfo = getAlphaUserInfo(senderAddress);
                const senderName =
                    senderInfo?.name || formatAddress(senderAddress);

                // Play sound and show browser notification (if sound enabled)
                if (userSettings.soundEnabled) {
                    notifyMessage(`${senderName} in ${channelName}`, content);
                }

                // Show toast notification in-app
                setToast({
                    sender: `${senderName} • ${channelName}`,
                    message:
                        content.length > 50
                            ? content.slice(0, 50) + "..."
                            : content,
                });

                // Auto-hide after 4 seconds
                setTimeout(() => setToast(null), 4000);
            }
        );

        return unsubscribe;
    }, [
        onNewChannelMessage,
        getAlphaUserInfo,
        notifyMessage,
        userSettings.soundEnabled,
        selectedChannel,
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

    // Open DM by address (from Alpha/Channel when clicking "Message" on already-friend)
    const openDMByAddress = useCallback(
        (address: string) => {
            const existing = friendsListData.find(
                (f) => f.address.toLowerCase() === address.toLowerCase()
            );
            if (existing) {
                setChatFriend(existing);
                markAsRead(existing.address);
            } else {
                const info = getAlphaUserInfo(address);
                setChatFriend({
                    id: address,
                    address: address as Address,
                    ensName: null,
                    avatar: info?.avatar ?? null,
                    nickname: info?.name ?? null,
                    reachUsername: null,
                    addedAt: new Date().toISOString(),
                });
            }
        },
        [friendsListData, getAlphaUserInfo, markAsRead]
    );

    // Handle unified chat item click
    const handleUnifiedChatClick = useCallback(
        (chat: UnifiedChatItem) => {
            switch (chat.type) {
                case "dm":
                    // Find the friend and open chat
                    const friend = friendsListData.find(
                        (f) => `dm-${f.address}` === chat.id
                    );
                    if (friend) {
                        setChatFriend(friend);
                        markAsRead(friend.address);
                    }
                    break;
                case "global":
                    setIsAlphaChatOpen(true);
                    break;
                case "channel":
                    const channelId = chat.id.replace("channel-", "");
                    const channel = joinedChannels.find(
                        (c) => c.id === channelId
                    );
                    if (channel) {
                        setSelectedChannel(channel);
                    }
                    break;
                case "group":
                    const groupId = chat.id.replace("group-", "");
                    const group = groups.find((g) => g.id === groupId);
                    if (group) {
                        setSelectedGroup(group);
                    }
                    break;
            }
        },
        [friendsListData, joinedChannels, groups, markAsRead]
    );

    // Handle call from unified chat
    const handleUnifiedCallClick = useCallback(
        (chat: UnifiedChatItem) => {
            if (chat.type !== "dm") return;
            const friend = friendsListData.find(
                (f) => `dm-${f.address}` === chat.id
            );
            if (friend) {
                handleCall(friend);
            }
        },
        [friendsListData, handleCall]
    );

    // Handle video call from unified chat
    const handleUnifiedVideoClick = useCallback(
        (chat: UnifiedChatItem) => {
            if (chat.type !== "dm") return;
            const friend = friendsListData.find(
                (f) => `dm-${f.address}` === chat.id
            );
            if (friend) {
                handleVideoCall(friend);
            }
        },
        [friendsListData, handleVideoCall]
    );

    // Determine auth type for messaging key
    const messagingAuthType = isPasskeyUser
        ? "passkey"
        : isEmailUser
        ? "email"
        : isWorldIdUser || isAlienIdUser
        ? "digitalid"
        : isSolanaUser
        ? "solana"
        : "wallet";

    return (
        <>
            {/* Messaging Key Restore Banner - prompts users to restore key when missing */}
            <MessagingKeyRestoreBanner
                userAddress={userAddress}
                authType={
                    messagingAuthType as
                        | "wallet"
                        | "passkey"
                        | "email"
                        | "digitalid"
                        | "solana"
                }
                onOpenSettings={() => setIsSettingsModalOpen(true)}
            />
            {/* Messaging Key Upgrade Banner - shows once for legacy key users */}
            <MessagingKeyUpgradeBanner
                userAddress={userAddress}
                authType={
                    messagingAuthType as
                        | "wallet"
                        | "passkey"
                        | "email"
                        | "digitalid"
                        | "solana"
                }
            />

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
                                    {effectiveAvatar ? (
                                        <img
                                            src={effectiveAvatar}
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
                                                {/* 1. Invite Friends */}
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
                                                                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                                                            />
                                                        </svg>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white text-sm font-medium">
                                                            Invite Friends
                                                        </p>
                                                        <p className="text-zinc-500 text-xs">
                                                            Share your QR code
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
                                                                    : isUsernameFetching
                                                                    ? "text-zinc-600"
                                                                    : "text-zinc-500"
                                                            }`}
                                                        >
                                                            {isUsernameFetching
                                                                ? "Loading..."
                                                                : reachUsername
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

                                                {/* Socials */}
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

                                                {/* 7. Points & Ranks - Combined */}
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
                                                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                                                        <span className="text-lg">
                                                            🏆
                                                        </span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white text-sm font-medium">
                                                            Points & Ranks
                                                        </p>
                                                        <p className="text-amber-400 text-xs">
                                                            {userPoints.toLocaleString()}{" "}
                                                            pts · View
                                                            leaderboard
                                                        </p>
                                                    </div>
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
                                                            d="M9 5l7 7-7 7"
                                                        />
                                                    </svg>
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
                                onClick={() => setShowDisconnectConfirm(true)}
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
                                                    {wakuInitStatus ||
                                                        "Enabling..."}
                                                </>
                                            ) : wakuError ? (
                                                "Retry"
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
                            className="sm:bg-zinc-900/50 sm:border sm:border-zinc-800 sm:rounded-2xl overflow-hidden mb-4 sm:mb-6 sm:border-l-4 sm:border-l-purple-500/50 sm:shadow-lg sm:shadow-purple-500/5"
                        >
                            <div className="px-3 py-3 sm:p-6">
                                <AgentsSection
                                    userAddress={userAddress}
                                    hasBetaAccess={hasBetaAccess}
                                    isBetaAccessLoading={isBetaAccessLoading}
                                    isAdmin={isAdmin}
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
                                <div
                                    id="friend-requests-section"
                                    className="sm:bg-zinc-900/50 sm:border sm:border-zinc-800 sm:rounded-2xl overflow-hidden mb-4 sm:mb-6"
                                >
                                    <div className="px-1 py-2 sm:p-4">
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
                                className="sm:bg-zinc-900/50 sm:border sm:border-zinc-800 sm:rounded-2xl overflow-hidden"
                            >
                                <div className="px-1 py-2 sm:p-4 sm:border-b sm:border-zinc-800">
                                    <div className="flex items-center justify-between gap-2">
                                        <h2 className="text-base sm:text-xl font-bold text-white">
                                            Friends
                                            <span className="text-zinc-500 font-normal text-sm ml-2">
                                                {friends.length}
                                            </span>
                                        </h2>
                                        <div className="flex items-center gap-1 sm:gap-2">
                                            {isPWA && (
                                                <button
                                                    onClick={handleSyncContacts}
                                                    disabled={
                                                        isSyncingContacts ||
                                                        isInvitesLoading ||
                                                        availableInvites === 0
                                                    }
                                                    className="w-8 h-8 sm:w-auto sm:h-auto sm:py-2 sm:px-3 rounded-lg sm:rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-medium transition-all hover:shadow-lg hover:shadow-blue-500/25 flex items-center justify-center sm:justify-start gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Share invite with friends"
                                                >
                                                    {isSyncingContacts ? (
                                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
                                                                    strokeWidth={
                                                                        2
                                                                    }
                                                                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                                                                />
                                                            </svg>
                                                            <span className="hidden sm:inline">
                                                                Share
                                                            </span>
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                            <button
                                                onClick={() =>
                                                    setIsAddFriendOpen(true)
                                                }
                                                disabled={!isSupabaseConfigured}
                                                className="w-8 h-8 sm:w-auto sm:h-auto sm:py-2 sm:px-3 rounded-lg sm:rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FF7700] text-white text-sm font-medium transition-all hover:shadow-lg hover:shadow-[#FB8D22]/25 flex items-center justify-center sm:justify-start gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                                title="Add friend"
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
                                                    Add
                                                </span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Contacts List - shown after syncing */}
                                {showContactsList && contacts.length > 0 && (
                                    <div className="px-1 pt-2 pb-1 sm:px-4 sm:pt-4 sm:pb-2 sm:border-b sm:border-zinc-800">
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
                                                const firstInvite =
                                                    invites.find(
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
                                                                    {
                                                                        contact.phone
                                                                    }
                                                                </p>
                                                            )}
                                                            {contact.email && (
                                                                <p className="text-zinc-400 text-xs truncate">
                                                                    {
                                                                        contact.email
                                                                    }
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
                                    <div className="mx-1 mt-2 mb-1 sm:mx-4 sm:mt-4 sm:mb-2">
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-lg sm:rounded-xl p-3 sm:p-4"
                                        >
                                            <div className="flex items-center justify-between gap-2 sm:gap-4">
                                                <div className="flex items-center gap-2 sm:gap-3">
                                                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center flex-shrink-0">
                                                        <span className="text-base sm:text-xl">
                                                            🎁
                                                        </span>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-white font-medium text-xs sm:text-sm">
                                                            Daily Bonus!
                                                        </p>
                                                        <p className="text-amber-400/70 text-[10px] sm:text-xs">
                                                            +3 points today
                                                        </p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={
                                                        handleClaimDailyBonus
                                                    }
                                                    disabled={isClaimingBonus}
                                                    className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs sm:text-sm font-semibold hover:shadow-lg hover:shadow-orange-500/25 transition-all disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                                                >
                                                    {isClaimingBonus ? (
                                                        <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    ) : (
                                                        <>
                                                            <span className="hidden sm:inline">
                                                                ✨
                                                            </span>
                                                            Claim
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </motion.div>
                                    </div>
                                )}

                                <div className="px-0 sm:p-4">
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
                                        onAddFriendClick={() =>
                                            setIsAddFriendOpen(true)
                                        }
                                        pendingRequestsCount={
                                            incomingRequests.length
                                        }
                                        onViewRequestsClick={() =>
                                            document
                                                .getElementById(
                                                    "friend-requests-section"
                                                )
                                                ?.scrollIntoView({
                                                    behavior: "smooth",
                                                })
                                        }
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

                            {/* Unified Chat List - Telegram-style with emoji folders */}
                            <div className="sm:bg-zinc-900/50 sm:border sm:border-zinc-800 sm:rounded-2xl overflow-hidden mb-4 sm:mb-6 sm:border-l-4 sm:border-l-blue-500/50 sm:shadow-lg sm:shadow-blue-500/5">
                                <div className="px-3 py-3 sm:px-5 sm:py-4 sm:border-b sm:border-zinc-800 bg-blue-500/5">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-3">
                                            <span
                                                className="text-2xl sm:text-3xl"
                                                aria-hidden
                                            >
                                                💬
                                            </span>
                                            <div>
                                                <h2 className="text-base sm:text-xl font-bold text-white">
                                                    Chats
                                                </h2>
                                                <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5">
                                                    Direct & group conversations
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 sm:gap-2">
                                            {/* Mark all as read - show when any unread */}
                                            {(alphaUnreadCount > 0 ||
                                                unifiedChats.some(
                                                    (c) => c.unreadCount > 0
                                                )) && (
                                                <button
                                                    onClick={async () => {
                                                        if (alphaChat.isMember)
                                                            await alphaChat.markAsRead();
                                                    }}
                                                    className="w-8 h-8 sm:w-auto sm:h-auto sm:py-2 sm:px-3 rounded-lg sm:rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all flex items-center justify-center sm:justify-start gap-2"
                                                    title="Mark all as read"
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
                                                            d="M5 13l4 4L19 7"
                                                        />
                                                    </svg>
                                                    <span className="hidden sm:inline text-sm font-medium">
                                                        Mark read
                                                    </span>
                                                </button>
                                            )}
                                            {/* Search Toggle Button */}
                                            <button
                                                onClick={() =>
                                                    setIsChatSearchOpen(
                                                        !isChatSearchOpen
                                                    )
                                                }
                                                className={`w-8 h-8 sm:w-auto sm:h-auto sm:py-2 sm:px-3 rounded-lg sm:rounded-xl transition-all flex items-center justify-center sm:justify-start gap-2 ${
                                                    isChatSearchOpen
                                                        ? "bg-[#FF5500] text-white"
                                                        : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white"
                                                }`}
                                                title="Search chats"
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
                                                <span className="hidden sm:inline text-sm font-medium">
                                                    Search
                                                </span>
                                            </button>
                                            {/* Add Folder Button */}
                                            <button
                                                onClick={() =>
                                                    setIsCreateFolderOpen(true)
                                                }
                                                className="w-8 h-8 sm:w-auto sm:h-auto sm:py-2 sm:px-3 rounded-lg sm:rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all flex items-center justify-center sm:justify-start gap-2"
                                                title="Create folder"
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
                                                        d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                                                    />
                                                </svg>
                                                <span className="hidden sm:inline text-sm font-medium">
                                                    Folder
                                                </span>
                                            </button>
                                            {/* Browse/Explore Channels Button */}
                                            <button
                                                onClick={() => {
                                                    setBrowseChannelsInitialCreate(
                                                        false
                                                    );
                                                    setIsBrowseChannelsOpen(
                                                        true
                                                    );
                                                }}
                                                className="w-8 h-8 sm:w-auto sm:h-auto sm:py-2 sm:px-3 rounded-lg sm:rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all flex items-center justify-center sm:justify-start gap-2"
                                                title="Explore channels"
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
                                                        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                                                    />
                                                </svg>
                                                <span className="hidden sm:inline text-sm font-medium">
                                                    Explore
                                                </span>
                                            </button>
                                            {/* Consolidated New Chat Menu */}
                                            <div className="relative">
                                                <button
                                                    onClick={() =>
                                                        setShowNewChatMenu(
                                                            !showNewChatMenu
                                                        )
                                                    }
                                                    className="w-8 h-8 sm:w-auto sm:h-auto sm:py-2 sm:px-3 rounded-lg sm:rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FF7700] text-white font-medium transition-all hover:shadow-lg hover:shadow-orange-500/25 flex items-center justify-center sm:justify-start gap-2"
                                                    title="Create new"
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
                                                    <span className="hidden sm:inline text-sm font-medium">
                                                        New
                                                    </span>
                                                    <svg
                                                        className="w-3 h-3 hidden sm:block"
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
                                                </button>

                                                {/* Dropdown Menu */}
                                                <AnimatePresence>
                                                    {showNewChatMenu && (
                                                        <>
                                                            {/* Backdrop */}
                                                            <motion.div
                                                                initial={{
                                                                    opacity: 0,
                                                                }}
                                                                animate={{
                                                                    opacity: 1,
                                                                }}
                                                                exit={{
                                                                    opacity: 0,
                                                                }}
                                                                className="fixed inset-0 z-40"
                                                                onClick={() =>
                                                                    setShowNewChatMenu(
                                                                        false
                                                                    )
                                                                }
                                                            />
                                                            {/* Menu */}
                                                            <motion.div
                                                                initial={{
                                                                    opacity: 0,
                                                                    scale: 0.95,
                                                                    y: -5,
                                                                }}
                                                                animate={{
                                                                    opacity: 1,
                                                                    scale: 1,
                                                                    y: 0,
                                                                }}
                                                                exit={{
                                                                    opacity: 0,
                                                                    scale: 0.95,
                                                                    y: -5,
                                                                }}
                                                                className="absolute right-0 top-full mt-2 w-56 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden z-50"
                                                            >
                                                                <div className="p-1">
                                                                    <button
                                                                        onClick={() => {
                                                                            setShowNewChatMenu(
                                                                                false
                                                                            );
                                                                            setBrowseChannelsInitialCreate(
                                                                                true
                                                                            );
                                                                            setIsBrowseChannelsOpen(
                                                                                true
                                                                            );
                                                                        }}
                                                                        className="w-full px-3 py-2.5 text-left rounded-lg hover:bg-zinc-700 transition-colors flex items-center gap-3"
                                                                    >
                                                                        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                                                            <svg
                                                                                className="w-4 h-4 text-blue-400"
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
                                                                                    d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
                                                                                />
                                                                            </svg>
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-white text-sm font-medium">
                                                                                Public
                                                                                Channel
                                                                            </p>
                                                                            <p className="text-zinc-500 text-xs">
                                                                                Anyone
                                                                                can
                                                                                join
                                                                            </p>
                                                                        </div>
                                                                    </button>
                                                                    {isWakuInitialized && (
                                                                        <button
                                                                            onClick={() => {
                                                                                setShowNewChatMenu(
                                                                                    false
                                                                                );
                                                                                setIsCreateGroupOpen(
                                                                                    true
                                                                                );
                                                                            }}
                                                                            disabled={
                                                                                friends.length ===
                                                                                0
                                                                            }
                                                                            className="w-full px-3 py-2.5 text-left rounded-lg hover:bg-zinc-700 transition-colors flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                        >
                                                                            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                                                                <svg
                                                                                    className="w-4 h-4 text-purple-400"
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
                                                                                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                                                                    />
                                                                                </svg>
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-white text-sm font-medium">
                                                                                    Private
                                                                                    Group
                                                                                </p>
                                                                                <p className="text-zinc-500 text-xs">
                                                                                    {friends.length ===
                                                                                    0
                                                                                        ? "Add friends first"
                                                                                        : "Encrypted, invite only"}
                                                                                </p>
                                                                            </div>
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </motion.div>
                                                        </>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="px-3 py-2 sm:px-5 sm:py-4">
                                    <UnifiedChatList
                                        chats={unifiedChats}
                                        userAddress={userAddress}
                                        isChatsLoading={false}
                                        onChatClick={handleUnifiedChatClick}
                                        onCallClick={handleUnifiedCallClick}
                                        onVideoClick={handleUnifiedVideoClick}
                                        showCreateFolderModal={
                                            isCreateFolderOpen
                                        }
                                        onCreateFolderModalClose={() =>
                                            setIsCreateFolderOpen(false)
                                        }
                                        showSearch={isChatSearchOpen}
                                        onSearchToggle={() =>
                                            setIsChatSearchOpen(
                                                !isChatSearchOpen
                                            )
                                        }
                                        onOpenAddFriend={() =>
                                            setIsAddFriendOpen(true)
                                        }
                                        onOpenBrowseChannels={() => {
                                            setBrowseChannelsInitialCreate(
                                                true
                                            );
                                            setIsBrowseChannelsOpen(true);
                                        }}
                                        onOpenCreateGroup={() =>
                                            setIsCreateGroupOpen(true)
                                        }
                                        canCreateGroup={
                                            friendsListData.length > 0
                                        }
                                        onMarkFolderAsRead={(
                                            _folderEmoji,
                                            chatsInFolder
                                        ) => {
                                            for (const chat of chatsInFolder) {
                                                if (chat.type === "global") {
                                                    if (alphaChat.isMember)
                                                        alphaChat.markAsRead();
                                                } else if (
                                                    chat.type === "dm" &&
                                                    chat.metadata?.address
                                                ) {
                                                    markAsRead(
                                                        chat.metadata.address
                                                    );
                                                }
                                            }
                                        }}
                                        onPinChat={(chat, pinned) =>
                                            setChatPinned(chat.id, pinned)
                                        }
                                    />
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
                        <>
                            {/* Quick Actions - Consolidated buttons */}
                            <div className="sm:bg-zinc-900/50 sm:border sm:border-zinc-800 sm:rounded-2xl overflow-hidden mb-4 sm:mb-6">
                                <div className="px-1 py-3 sm:p-4">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
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
                                                        trackRoomCreated();
                                                        navigator.clipboard.writeText(
                                                            data.room.joinUrl
                                                        );
                                                        const isStandalone =
                                                            window.matchMedia(
                                                                "(display-mode: standalone)"
                                                            ).matches ||
                                                            (
                                                                window.navigator as any
                                                            ).standalone ===
                                                                true;
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
                                            className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-400 transition-all active:scale-95"
                                        >
                                            <span className="text-xl">🚪</span>
                                            <span className="text-xs font-medium">
                                                Instant Room
                                            </span>
                                        </button>

                                        {/* New Scheduled */}
                                        <button
                                            onClick={() =>
                                                setShowNewScheduledModal(true)
                                            }
                                            className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-orange-400 transition-all active:scale-95"
                                        >
                                            <span className="text-xl">📅</span>
                                            <span className="text-xs font-medium">
                                                Schedule
                                            </span>
                                        </button>

                                        {/* Call Friend */}
                                        <button
                                            onClick={() =>
                                                setShowNewCallModal(true)
                                            }
                                            disabled={
                                                callState !== "idle" ||
                                                friendsListData.length === 0
                                            }
                                            className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 text-green-400 transition-all active:scale-95 disabled:opacity-50"
                                        >
                                            <span className="text-xl">📞</span>
                                            <span className="text-xs font-medium">
                                                Call Friend
                                            </span>
                                        </button>

                                        {/* Open My Room */}
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const res = await fetch(
                                                        `/api/rooms/permanent?wallet_address=${userAddress}`
                                                    );
                                                    if (res.ok) {
                                                        const roomUrl = `${window.location.origin}/room/${userAddress}`;
                                                        window.location.href =
                                                            roomUrl;
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
                                            className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 transition-all active:scale-95"
                                        >
                                            <span className="text-xl">🔗</span>
                                            <span className="text-xs font-medium">
                                                My Room
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Permanent Room Link - Compact */}
                            <div className="sm:bg-zinc-900/50 sm:border sm:border-zinc-800 sm:rounded-2xl overflow-hidden mb-4 sm:mb-6">
                                <div className="px-1 py-2 sm:p-4">
                                    <div className="flex items-center gap-2 bg-zinc-800/50 sm:bg-zinc-800/30 rounded-xl p-2.5 sm:p-3">
                                        <input
                                            type="text"
                                            value={`app.spritz.chat/room/${userAddress?.slice(
                                                0,
                                                8
                                            )}...`}
                                            readOnly
                                            className="flex-1 min-w-0 bg-transparent text-zinc-400 text-xs sm:text-sm font-mono truncate outline-none"
                                        />
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
                                                    btn.textContent = "Copied!";
                                                    setTimeout(() => {
                                                        btn.textContent =
                                                            original || "Copy";
                                                    }, 2000);
                                                }
                                            }}
                                            data-room-copy-btn
                                            className="shrink-0 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-xs sm:text-sm rounded-lg transition-colors"
                                        >
                                            Copy
                                        </button>
                                    </div>
                                    <p className="text-zinc-500 text-[10px] sm:text-xs mt-1.5 px-1">
                                        Your permanent room link - share for
                                        instant meetings
                                    </p>
                                </div>
                            </div>

                            {/* Scheduled Calls */}
                            <div className="sm:bg-zinc-900/50 sm:border sm:border-zinc-800 sm:rounded-2xl overflow-hidden mb-4 sm:mb-6">
                                <div className="px-1 py-2 sm:p-4 sm:border-b sm:border-zinc-800">
                                    <h2 className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
                                        <span>📅</span>
                                        Scheduled Calls
                                    </h2>
                                </div>
                                <div className="px-0 sm:p-4">
                                    <ScheduledCalls userAddress={userAddress} />
                                </div>
                            </div>

                            {/* Call History */}
                            <div className="sm:bg-zinc-900/50 sm:border sm:border-zinc-800 sm:rounded-2xl overflow-hidden mb-4 sm:mb-6">
                                <div className="px-1 py-2 sm:p-4 sm:border-b sm:border-zinc-800">
                                    <h2 className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
                                        <span>📞</span>
                                        Call History
                                    </h2>
                                </div>
                                <div className="px-0 sm:p-4">
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
                        </>
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

                {/* Bottom Navigation Bar - Mobile-First Fixed Style */}
                <nav className="fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)]">
                    <div className="bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-700/50 shadow-2xl shadow-black/50">
                        <div className="flex items-center justify-around py-1.5 px-1 max-w-lg mx-auto">
                            {/* Wallet Tab - Shows for all, beta prompt for non-beta users */}
                            <button
                                onClick={() => {
                                    // If still loading beta access, don't show prompt yet
                                    if (isBetaAccessLoading) {
                                        return; // Wait for beta access check to complete
                                    }
                                    if (hasBetaAccess) {
                                        setIsWalletModalOpen(true);
                                    } else {
                                        setShowWalletBetaPrompt(true);
                                    }
                                }}
                                className={`flex flex-col items-center justify-center min-w-[48px] py-1 px-1.5 rounded-lg transition-all ${
                                    isWalletModalOpen || showWalletBetaPrompt
                                        ? "text-emerald-400 bg-emerald-500/20"
                                        : "text-zinc-400 hover:text-zinc-200 active:bg-zinc-800/50"
                                }`}
                            >
                                {isBetaAccessLoading ? (
                                    <span className="text-xl animate-pulse">
                                        💳
                                    </span>
                                ) : (
                                    <span className="text-xl">💳</span>
                                )}
                                <span className="text-[9px] font-medium mt-0.5">
                                    Wallet
                                </span>
                            </button>

                            {/* Agents Tab */}
                            <button
                                onClick={() => setActiveNavTab("agents")}
                                className={`flex flex-col items-center justify-center min-w-[48px] py-1 px-1.5 rounded-lg transition-all ${
                                    activeNavTab === "agents"
                                        ? "text-purple-400 bg-purple-500/20"
                                        : "text-zinc-400 active:bg-zinc-800/50"
                                }`}
                            >
                                <span className="text-xl">✨</span>
                                <span className="text-[9px] font-medium mt-0.5">
                                    Agents
                                </span>
                            </button>

                            {/* Friends Tab */}
                            <button
                                onClick={() => setActiveNavTab("friends")}
                                className={`flex flex-col items-center justify-center min-w-[48px] py-1 px-1.5 rounded-lg transition-all relative ${
                                    activeNavTab === "friends"
                                        ? "text-orange-400 bg-orange-500/20"
                                        : "text-zinc-400 hover:text-zinc-200 active:bg-zinc-800/50"
                                }`}
                            >
                                <span className="text-xl">👥</span>
                                <span className="text-[9px] font-medium mt-0.5">
                                    Friends
                                </span>
                                {/* Friend request indicator */}
                                {incomingRequests.length > 0 && (
                                    <span className="absolute top-0 right-0.5 min-w-[14px] h-[14px] px-0.5 bg-orange-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center animate-pulse">
                                        {incomingRequests.length > 9
                                            ? "9+"
                                            : incomingRequests.length}
                                    </span>
                                )}
                            </button>

                            {/* Chats Tab */}
                            <button
                                onClick={() => setActiveNavTab("chats")}
                                className={`flex flex-col items-center justify-center min-w-[48px] py-1 px-1.5 rounded-lg transition-all relative ${
                                    activeNavTab === "chats"
                                        ? "text-blue-400 bg-blue-500/20"
                                        : "text-zinc-400 active:bg-zinc-800/50"
                                }`}
                            >
                                <span className="text-xl">💬</span>
                                <span className="text-[9px] font-medium mt-0.5">
                                    Chats
                                </span>
                                {/* Unread indicator */}
                                {unreadCounts &&
                                    Object.values(unreadCounts).some(
                                        (c) => c > 0
                                    ) && (
                                        <span className="absolute top-0 right-0.5 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                                    )}
                            </button>

                            {/* Calls Tab */}
                            <button
                                onClick={() => setActiveNavTab("calls")}
                                className={`flex flex-col items-center justify-center min-w-[48px] py-1 px-1.5 rounded-lg transition-all ${
                                    activeNavTab === "calls"
                                        ? "text-green-400 bg-green-500/20"
                                        : "text-zinc-400 hover:text-zinc-200 active:bg-zinc-800/50"
                                }`}
                            >
                                <span className="text-xl">📞</span>
                                <span className="text-[9px] font-medium mt-0.5">
                                    Calls
                                </span>
                            </button>

                            {/* Bug Report Tab */}
                            <button
                                onClick={() => {
                                    setIsBugReportModalOpen(true);
                                }}
                                className={`flex flex-col items-center justify-center min-w-[48px] py-1 px-1.5 rounded-lg transition-all ${
                                    isBugReportModalOpen
                                        ? "text-orange-400 bg-orange-500/20"
                                        : "text-zinc-400 hover:text-zinc-200 active:bg-zinc-800/50"
                                }`}
                            >
                                <span className="text-xl">🐛</span>
                                <span className="text-[9px] font-medium mt-0.5">
                                    Report
                                </span>
                            </button>

                            {/* Settings Tab - just opens modal, doesn't change active tab */}
                            <button
                                onClick={() => setIsSettingsModalOpen(true)}
                                className={`flex flex-col items-center justify-center min-w-[48px] py-1 px-1.5 rounded-lg transition-all ${
                                    isSettingsModalOpen
                                        ? "text-zinc-200 bg-zinc-700/50"
                                        : "text-zinc-400 hover:text-zinc-200 active:bg-zinc-800/50"
                                }`}
                            >
                                <span className="text-xl">⚙️</span>
                                <span className="text-[9px] font-medium mt-0.5">
                                    Settings
                                </span>
                            </button>
                        </div>
                    </div>
                </nav>

                {/* Spacer for fixed bottom nav + safe area */}
                <div className="h-20 pb-[env(safe-area-inset-bottom)]" />

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
                    key={chatFriend?.address || "no-chat"} // Force remount when peer changes
                    isOpen={!!chatFriend}
                    onClose={() => setChatFriend(null)}
                    userAddress={userAddress}
                    peerAddress={chatFriend?.address || ""}
                    peerName={chatFriend?.ensName || chatFriend?.nickname}
                    peerAvatar={chatFriend?.avatar}
                    onMessageSent={(preview) => {
                        if (chatFriend) {
                            updateLastMessageTime(
                                chatFriend.address.toLowerCase(),
                                preview
                            );
                        }
                    }}
                />
            )}

            {/* Username Claim Modal */}
            <UsernameClaimModal
                isOpen={isUsernameModalOpen}
                onClose={() => setIsUsernameModalOpen(false)}
                userAddress={userAddress}
                currentUsername={reachUsername}
                onSuccess={async (username) => {
                    // If username is empty string, it was removed - just refresh
                    if (!username) {
                        window.location.reload();
                        return;
                    }

                    // Check if user needs passkey prompt (Email, Digital ID, or Solana users)
                    // Wallet users and existing passkey users don't need this
                    if (needsPasskeyForWallet && !isPasskeyUser) {
                        // Check if user already has a passkey
                        try {
                            const res = await fetch(
                                "/api/passkey/credentials",
                                {
                                    credentials: "include",
                                }
                            );
                            if (res.ok) {
                                const data = await res.json();
                                if (
                                    !data.credentials ||
                                    data.credentials.length === 0
                                ) {
                                    // No passkey yet - show the prompt
                                    setShowPasskeyPrompt(true);
                                    return;
                                }
                            }
                        } catch {
                            // Failed to check - proceed without prompt
                        }
                    }

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

            {/* Passkey Prompt Modal - shown after username claim for non-wallet users */}
            <PasskeyPromptModal
                isOpen={showPasskeyPrompt}
                onClose={() => {
                    setShowPasskeyPrompt(false);
                    window.location.reload();
                }}
                onSkip={() => {
                    setShowPasskeyPrompt(false);
                    window.location.reload();
                }}
                userAddress={userAddress}
            />

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
                authType={
                    messagingAuthType as
                        | "wallet"
                        | "passkey"
                        | "email"
                        | "digitalid"
                        | "solana"
                }
                passkeyCredentialId={passkeyCredentialId}
                onOpenStatusModal={() => setIsStatusModalOpen(true)}
                availableInvites={availableInvites}
                usedInvites={usedInvites}
                onOpenInvitesModal={() => setIsInvitesModalOpen(true)}
                userEmail={userEmail}
                isEmailVerified={isEmailVerified}
                emailUpdatesOptIn={emailUpdatesOptIn}
                onEmailUpdatesOptInChange={updateEmailUpdatesOptIn}
                onOpenEmailModal={() => setIsEmailModalOpen(true)}
                ensAvatar={userENS.avatar}
                onToggleUseCustomAvatar={toggleUseCustomAvatar}
                onSetCustomAvatar={setCustomAvatar}
            />

            {/* Registration Preferences Modal */}
            <RegistrationPreferencesModal
                isOpen={isRegistrationPrefsOpen}
                onClose={() => setIsRegistrationPrefsOpen(false)}
                userAddress={userAddress}
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

            {/* QR Code Modal / Invite Friends */}
            <QRCodeModal
                isOpen={isQRCodeModalOpen}
                onClose={() => {
                    setIsQRCodeModalOpen(false);
                    clearFriendsError();
                }}
                address={userAddress as `0x${string}`}
                ensName={userENS.ensName}
                reachUsername={reachUsername || null}
                avatar={effectiveAvatar}
                onAddFriend={handleSendFriendRequest}
                isAddingFriend={isFriendsLoading}
                addFriendError={friendsError}
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
                onOpenDM={(address) => {
                    openDMByAddress(address);
                    setIsAlphaChatOpen(false);
                }}
                isAdmin={isAdmin}
                onMessageSent={() => {
                    updateLastMessageTime("global-spritz");
                }}
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
                    key={selectedGroup?.id || "no-group"} // Force remount when group changes
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
                    isFriend={(address) =>
                        friends.some(
                            (f) =>
                                f.friend_address.toLowerCase() ===
                                address.toLowerCase()
                        )
                    }
                    onOpenDM={(address) => {
                        openDMByAddress(address);
                        setSelectedGroup(null);
                    }}
                    onMessageSent={() => {
                        // Update last message time for this group (for sorting)
                        if (selectedGroup) {
                            const groupKey = `group-${selectedGroup.id}`;
                            updateLastMessageTime(groupKey);
                        }
                    }}
                    onMessageReceived={() => {
                        // Update last message time when receiving messages (for sorting)
                        if (selectedGroup) {
                            const groupKey = `group-${selectedGroup.id}`;
                            updateLastMessageTime(groupKey);
                        }
                    }}
                />
            )}

            {/* Browse Channels Modal */}
            <BrowseChannelsModal
                isOpen={isBrowseChannelsOpen}
                onClose={() => {
                    setIsBrowseChannelsOpen(false);
                    setBrowseChannelsInitialCreate(false);
                    fetchJoinedChannels();
                }}
                userAddress={userAddress}
                poapAddresses={poapAddresses}
                onJoinChannel={async (channel) => {
                    setIsBrowseChannelsOpen(false);
                    setBrowseChannelsInitialCreate(false);
                    await fetchJoinedChannels(); // Refresh the list immediately
                    setSelectedChannel(channel);
                }}
                initialShowCreate={browseChannelsInitialCreate}
            />

            {/* Channel Chat Modal */}
            {selectedChannel && (
                <ChannelChatModal
                    key={selectedChannel?.id || "no-channel"} // Force remount when channel changes
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
                    onOpenDM={(address) => {
                        openDMByAddress(address);
                        setSelectedChannel(null);
                    }}
                    notificationsEnabled={isNotificationsEnabled(
                        selectedChannel.id
                    )}
                    onToggleNotifications={() =>
                        toggleChannelNotifications(selectedChannel.id)
                    }
                    onSetActiveChannel={setActiveChannel}
                    isAdmin={isAdmin}
                    onMessageSent={() => {
                        // Update last message time for this channel (for sorting)
                        const channelKey = `channel-${selectedChannel.id}`;
                        updateLastMessageTime(channelKey);
                    }}
                    onForwardToGlobal={
                        alphaChat.isMember
                            ? async (content) => {
                                  await alphaChat.sendMessage(content);
                                  return true;
                              }
                            : undefined
                    }
                    globalChatIconUrl={globalChatIconUrl}
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
                        onClick={handleDismissDailyBonus}
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
                                onClick={handleDismissDailyBonus}
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

            {/* Global Search Modal */}
            <GlobalSearchModal
                isOpen={isGlobalSearchOpen}
                onClose={() => setIsGlobalSearchOpen(false)}
                userAddress={userAddress}
                onOpenChannel={(channelId) => {
                    const channel = joinedChannels.find(
                        (c) => c.id === channelId
                    );
                    if (channel) setSelectedChannel(channel);
                }}
            />

            {/* Wallet Modal */}
            <WalletModal
                isOpen={isWalletModalOpen}
                onClose={() => setIsWalletModalOpen(false)}
                userAddress={userAddress}
                emailVerified={siweUser?.emailVerified}
                authMethod={
                    isPasskeyUser
                        ? "passkey"
                        : isEmailUser
                        ? "email"
                        : walletType === "solana"
                        ? "solana"
                        : "wallet"
                }
            />

            {/* Wallet Beta Access Prompt Modal */}
            <AnimatePresence>
                {showWalletBetaPrompt && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-center justify-center p-4"
                        onClick={() => setShowWalletBetaPrompt(false)}
                    >
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="relative z-10 w-full max-w-sm bg-zinc-900 rounded-2xl p-6 border border-zinc-800"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={() => setShowWalletBetaPrompt(false)}
                                className="absolute top-4 right-4 text-zinc-400 hover:text-white"
                            >
                                ✕
                            </button>
                            <div className="text-center">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
                                    <span className="text-3xl">
                                        {walletBetaApplied ? "⏳" : "💳"}
                                    </span>
                                </div>
                                <h3 className="text-xl text-white font-semibold mb-2">
                                    {walletBetaApplied
                                        ? "Application Pending"
                                        : "Spritz Wallets (Beta)"}
                                </h3>
                                {isCheckingBetaStatus ? (
                                    <div className="flex items-center justify-center py-4">
                                        <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : walletBetaApplied ? (
                                    <div className="space-y-3 mb-6">
                                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                                            <p className="text-amber-400 text-sm font-medium mb-1">
                                                Application Submitted
                                            </p>
                                            <p className="text-zinc-400 text-xs">
                                                {betaAppliedAt
                                                    ? `Applied on ${new Date(
                                                          betaAppliedAt
                                                      ).toLocaleDateString(
                                                          "en-US",
                                                          {
                                                              month: "long",
                                                              day: "numeric",
                                                              year: "numeric",
                                                          }
                                                      )}`
                                                    : "Your application is being reviewed"}
                                            </p>
                                        </div>
                                        <p className="text-sm text-zinc-400">
                                            We&apos;re reviewing applications
                                            and granting access in batches.
                                            You&apos;ll be notified when your
                                            access is approved!
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-sm text-zinc-400 mb-6">
                                        Apply for beta access to use Spritz
                                        Wallets - send crypto with free gas,
                                        passkey signing, multi-chain support,
                                        and shared vaults.
                                    </p>
                                )}
                                {!walletBetaApplied &&
                                    !isCheckingBetaStatus && (
                                        <button
                                            onClick={async () => {
                                                setIsApplyingWalletBeta(true);
                                                try {
                                                    const response =
                                                        await fetch(
                                                            "/api/beta-access/apply",
                                                            {
                                                                method: "POST",
                                                                credentials:
                                                                    "include",
                                                            }
                                                        );
                                                    const data =
                                                        await response.json();
                                                    if (response.ok) {
                                                        if (
                                                            data.hasBetaAccess
                                                        ) {
                                                            // User already has access, refresh and open wallet
                                                            refreshBetaAccess();
                                                            setShowWalletBetaPrompt(
                                                                false
                                                            );
                                                            setIsWalletModalOpen(
                                                                true
                                                            );
                                                        } else {
                                                            setWalletBetaApplied(
                                                                true
                                                            );
                                                            setBetaAppliedAt(
                                                                new Date().toISOString()
                                                            );
                                                        }
                                                    }
                                                } catch (error) {
                                                    console.error(
                                                        "[Dashboard] Error applying for wallet beta:",
                                                        error
                                                    );
                                                } finally {
                                                    setIsApplyingWalletBeta(
                                                        false
                                                    );
                                                }
                                            }}
                                            disabled={isApplyingWalletBeta}
                                            className="w-full px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isApplyingWalletBeta
                                                ? "Applying..."
                                                : "Apply for Beta Access"}
                                        </button>
                                    )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Live Stream Player removed - now using /live/[id] page */}

            {/* Disconnect Confirmation Modal */}
            <AnimatePresence>
                {showDisconnectConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[200] p-4"
                        onClick={() => setShowDisconnectConfirm(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="text-center mb-6">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                                    <svg
                                        className="w-8 h-8 text-red-500"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                                        />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-semibold text-white mb-2">
                                    Disconnect Wallet?
                                </h3>
                                <p className="text-zinc-400 text-sm">
                                    Are you sure you want to disconnect?
                                    You&apos;ll need to reconnect to access your
                                    account.
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() =>
                                        setShowDisconnectConfirm(false)
                                    }
                                    className="flex-1 py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        setShowDisconnectConfirm(false);
                                        onLogout();
                                    }}
                                    className="flex-1 py-3 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
                                >
                                    Disconnect
                                </button>
                            </div>
                        </motion.div>
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
    isEmailUser,
    isWorldIdUser,
    isAlienIdUser,
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
                isEmailUser={isEmailUser}
                isWorldIdUser={isWorldIdUser}
                isAlienIdUser={isAlienIdUser}
                walletType={walletType}
                isBetaTester={isBetaTester}
                siweUser={siweUser}
            />
        </XMTPProvider>
    );
}
