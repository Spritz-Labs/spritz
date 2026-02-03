"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { type UserSettings } from "@/hooks/useUserSettings";
import { useCalendar } from "@/hooks/useCalendar";
import { useAddressBook, type AddressBookEntry } from "@/hooks/useSendSuggestions";
import { AvailabilityWindowsModal } from "./AvailabilityWindowsModal";
import { KeyBackupModal } from "./KeyBackupModal";
import { PasskeyManager } from "./PasskeyManager";
import { MessagingKeyStatus } from "./MessagingKeyStatusInline";
import { RegistrationPreferencesModal } from "./RegistrationPreferencesModal";
import { supabase } from "@/config/supabase";
import { isAddress } from "viem";

// Supported payment networks
const PAYMENT_NETWORKS = [
    { value: "base", label: "Base", icon: "🔵" },
    { value: "ethereum", label: "Ethereum", icon: "⟠" },
    { value: "arbitrum", label: "Arbitrum", icon: "🔷" },
    { value: "optimism", label: "Optimism", icon: "🔴" },
    { value: "polygon", label: "Polygon", icon: "🟣" },
    { value: "base-sepolia", label: "Base Sepolia (Testnet)", icon: "🧪" },
];

type SettingsModalProps = {
    isOpen: boolean;
    onClose: () => void;
    settings: UserSettings;
    onToggleSound: () => void;
    // Censorship resistance props
    onToggleDecentralizedCalls: () => void;
    isHuddle01Configured: boolean;
    // Public profile props
    onTogglePublicLanding: () => void;
    onUpdateBio: (bio: string) => void;
    // Push notification props
    pushSupported: boolean;
    pushPermission: NotificationPermission;
    pushSubscribed: boolean;
    pushLoading: boolean;
    pushError: string | null;
    onEnablePush: () => Promise<boolean>;
    onDisablePush: () => Promise<boolean>;
    // Calendar props
    userAddress: string | null;
    // Auth type for messaging key
    authType?: "wallet" | "passkey" | "email" | "digitalid" | "solana";
    passkeyCredentialId?: string | null;
    // Status props
    onOpenStatusModal: () => void;
    // Invites props
    availableInvites: number;
    usedInvites: number;
    onOpenInvitesModal: () => void;
    // Email props
    userEmail: string | null;
    isEmailVerified: boolean;
    emailUpdatesOptIn: boolean;
    onEmailUpdatesOptInChange: (enabled: boolean) => Promise<boolean>;
    onOpenEmailModal: () => void;
    // Avatar props
    ensAvatar: string | null;
    onToggleUseCustomAvatar: () => void;
    onSetCustomAvatar: (url: string | null) => void;
};

export function SettingsModal({
    isOpen,
    onClose,
    settings,
    onToggleSound,
    onToggleDecentralizedCalls,
    isHuddle01Configured,
    onTogglePublicLanding,
    onUpdateBio,
    pushSupported,
    pushPermission,
    pushSubscribed,
    pushLoading,
    pushError,
    onEnablePush,
    onDisablePush,
    userAddress,
    authType = "wallet",
    passkeyCredentialId,
    onOpenStatusModal,
    availableInvites,
    usedInvites,
    onOpenInvitesModal,
    userEmail,
    isEmailVerified,
    emailUpdatesOptIn,
    onEmailUpdatesOptInChange,
    onOpenEmailModal,
    ensAvatar,
    onToggleUseCustomAvatar,
    onSetCustomAvatar,
}: SettingsModalProps) {
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const [avatarError, setAvatarError] = useState<string | null>(null);
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const [showKeyBackup, setShowKeyBackup] = useState(false);
    const [showPasskeyManager, setShowPasskeyManager] = useState(false);
    const [showAddressBook, setShowAddressBook] = useState(false);
    const [showRegistrationPrefs, setShowRegistrationPrefs] = useState(false);
    
    // Address book
    const { entries: addressBookEntries, isLoading: addressBookLoading, addEntry, updateEntry, deleteEntry, refresh: refreshAddressBook } = useAddressBook();
    const [newAddressLabel, setNewAddressLabel] = useState("");
    const [newAddressValue, setNewAddressValue] = useState("");
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
    const [editingLabel, setEditingLabel] = useState("");
    const [addressBookError, setAddressBookError] = useState<string | null>(null);
    
    const [isAddingAddress, setIsAddingAddress] = useState(false);
    
    // Check if input looks like an ENS name
    const isEnsName = useCallback((input: string) => {
        return /\.(eth|xyz|com|org|id|art|luxury|kred|club|luxe|reverse)$/i.test(input.trim());
    }, []);
    
    // Handle adding new address to address book
    const handleAddToAddressBook = useCallback(async () => {
        if (!newAddressLabel.trim() || !newAddressValue.trim()) {
            setAddressBookError("Both label and address/ENS are required");
            return;
        }
        
        const input = newAddressValue.trim();
        
        // Basic validation - must be either a valid address or look like an ENS name
        if (!isAddress(input) && !isEnsName(input)) {
            setAddressBookError("Enter a valid address (0x...) or ENS name (e.g., vitalik.eth)");
            return;
        }
        
        try {
            setAddressBookError(null);
            setIsAddingAddress(true);
            await addEntry({
                address: input, // API will resolve ENS if needed
                label: newAddressLabel.trim(),
            });
            setNewAddressLabel("");
            setNewAddressValue("");
        } catch (err) {
            setAddressBookError(err instanceof Error ? err.message : "Failed to add");
        } finally {
            setIsAddingAddress(false);
        }
    }, [newAddressLabel, newAddressValue, addEntry, isEnsName]);
    
    // Handle updating entry label
    const handleUpdateLabel = useCallback(async (id: string) => {
        if (!editingLabel.trim()) return;
        
        try {
            await updateEntry(id, { label: editingLabel.trim() });
            setEditingEntryId(null);
            setEditingLabel("");
        } catch {
            // Silently fail
        }
    }, [editingLabel, updateEntry]);
    
    // Handle toggling favorite
    const handleToggleFavorite = useCallback(async (entry: AddressBookEntry) => {
        await updateEntry(entry.id, { isFavorite: !entry.isFavorite });
    }, [updateEntry]);
    
    // Handle delete
    const handleDeleteEntry = useCallback(async (id: string) => {
        if (confirm("Remove this address from your address book?")) {
            await deleteEntry(id);
        }
    }, [deleteEntry]);

    // Resize image for avatar (ensure high quality)
    // Increased to 1024px and 95% quality for sharper profile photos
    const resizeImageForAvatar = (file: File, maxSize: number = 1024): Promise<Blob> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            img.onload = () => {
                if (!ctx) {
                    reject(new Error('Could not get canvas context'));
                    return;
                }
                
                // Calculate dimensions (crop to square, then resize)
                const size = Math.min(img.width, img.height);
                const sx = (img.width - size) / 2;
                const sy = (img.height - size) / 2;
                
                // Set canvas to target size (use original size if smaller than max)
                const targetSize = Math.min(size, maxSize);
                canvas.width = targetSize;
                canvas.height = targetSize;
                
                // Enable high-quality image smoothing
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                
                // Draw cropped and resized image
                ctx.drawImage(img, sx, sy, size, size, 0, 0, targetSize, targetSize);
                
                // Convert to blob with high quality
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Failed to create image blob'));
                        }
                    },
                    'image/jpeg',
                    0.95 // Higher quality (was 0.9)
                );
            };
            
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = URL.createObjectURL(file);
        });
    };

    // Handle avatar file upload
    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !userAddress) return;

        // Validate file
        if (!file.type.startsWith('image/')) {
            setAvatarError('Please select an image file');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setAvatarError('Image must be less than 5MB');
            return;
        }

        setIsUploadingAvatar(true);
        setAvatarError(null);

        try {
            // Resize image for better quality (1024x1024, high quality JPEG)
            const resizedBlob = await resizeImageForAvatar(file, 1024);
            const resizedFile = new File([resizedBlob], 'avatar.jpg', { type: 'image/jpeg' });
            
            const formData = new FormData();
            formData.append('file', resizedFile);

            const res = await fetch('/api/upload?type=avatar', {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to upload');
            }

            const { url } = await res.json();
            onSetCustomAvatar(url);
        } catch (err) {
            setAvatarError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setIsUploadingAvatar(false);
            // Reset input
            if (avatarInputRef.current) {
                avatarInputRef.current.value = '';
            }
        }
    };

    const handlePushToggle = async () => {
        // Prevent double-clicks by checking loading state
        if (pushLoading) return;
        
        if (pushSubscribed) {
            await onDisablePush();
        } else {
            await onEnablePush();
        }
    };

    // Calendar hook
    const {
        connection,
        isConnected,
        isLoading: calendarLoading,
        error: calendarError,
        availabilityWindows,
        connect: connectCalendar,
        disconnect: disconnectCalendar,
    } = useCalendar(userAddress);

    const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);
    
    // Scheduling settings state
    const [schedulingEnabled, setSchedulingEnabled] = useState(false);
    const [schedulingSlug, setSchedulingSlug] = useState("");
    const [schedulingTitle, setSchedulingTitle] = useState("");
    const [schedulingBio, setSchedulingBio] = useState("");
    const [schedulingFreeEnabled, setSchedulingFreeEnabled] = useState(true);
    const [schedulingPaidEnabled, setSchedulingPaidEnabled] = useState(false);
    const [schedulingFreeDuration, setSchedulingFreeDuration] = useState(15);
    const [schedulingPaidDuration, setSchedulingPaidDuration] = useState(30);
    const [schedulingPrice, setSchedulingPrice] = useState(0);
    // Local string states for inputs to allow empty values during typing
    // Initialize with numeric values so they're never empty initially
    const [freeDurationInput, setFreeDurationInput] = useState<string>("15");
    const [paidDurationInput, setPaidDurationInput] = useState<string>("30");
    const [priceInput, setPriceInput] = useState<string>("0");
    // Refs to track if inputs are focused to prevent unwanted resets
    const freeDurationInputRef = useRef<HTMLInputElement>(null);
    const paidDurationInputRef = useRef<HTMLInputElement>(null);
    const priceInputRef = useRef<HTMLInputElement>(null);
    const [schedulingWallet, setSchedulingWallet] = useState("");
    const [schedulingNetwork, setSchedulingNetwork] = useState("base");
    const [schedulingLoading, setSchedulingLoading] = useState(false);
    const [schedulingError, setSchedulingError] = useState<string | null>(null);
    const [schedulingSaved, setSchedulingSaved] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    
    // Load scheduling settings
    useEffect(() => {
        if (userAddress && isOpen) {
            fetch(`/api/scheduling/settings?userAddress=${encodeURIComponent(userAddress)}`)
                .then((res) => res.json())
                .then((data) => {
                    if (data.scheduling_enabled !== undefined) {
                        setSchedulingEnabled(data.scheduling_enabled);
                        setSchedulingSlug(data.scheduling_slug || "");
                        setSchedulingTitle(data.scheduling_title || "");
                        setSchedulingBio(data.scheduling_bio || "");
                        setSchedulingFreeEnabled(data.scheduling_free_enabled ?? true);
                        setSchedulingPaidEnabled(data.scheduling_paid_enabled ?? false);
                        setSchedulingFreeDuration(data.scheduling_free_duration_minutes || 15);
                        setSchedulingPaidDuration(data.scheduling_paid_duration_minutes || 30);
                        setSchedulingPrice(data.scheduling_price_cents || 0);
                        setSchedulingWallet(data.scheduling_wallet_address || "");
                        setSchedulingNetwork(data.scheduling_network || "base");
                        // Initialize input strings - always set them, never leave empty
                        // Only update if inputs are not currently focused to avoid interrupting user typing
                        const freeDur = data.scheduling_free_duration_minutes || 15;
                        const paidDur = data.scheduling_paid_duration_minutes || 30;
                        const price = data.scheduling_price_cents || 0;
                        if (document.activeElement !== freeDurationInputRef.current) {
                            setFreeDurationInput(freeDur.toString());
                        }
                        if (document.activeElement !== paidDurationInputRef.current) {
                            setPaidDurationInput(paidDur.toString());
                        }
                        if (document.activeElement !== priceInputRef.current) {
                            setPriceInput((price / 100).toString());
                        }
                    }
                })
                .catch((err) => console.error("[Settings] Failed to load scheduling settings:", err));
        }
    }, [userAddress, isOpen]);
    
    const handleSaveSchedulingSettings = async () => {
        if (!userAddress) return;
        
        setSchedulingLoading(true);
        setSchedulingError(null);
        setSchedulingSaved(false);
        
        try {
            const res = await fetch("/api/scheduling/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userAddress,
                    scheduling_enabled: schedulingEnabled,
                    scheduling_slug: schedulingSlug || null,
                    scheduling_title: schedulingTitle || null,
                    scheduling_bio: schedulingBio || null,
                    scheduling_free_enabled: schedulingFreeEnabled,
                    scheduling_paid_enabled: schedulingPaidEnabled,
                    scheduling_free_duration_minutes: schedulingFreeDuration,
                    scheduling_paid_duration_minutes: schedulingPaidDuration,
                    scheduling_price_cents: schedulingPrice,
                    scheduling_wallet_address: schedulingWallet || null,
                    scheduling_network: schedulingNetwork,
                }),
            });
            
            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.error || "Failed to save scheduling settings");
            }
            
            setSchedulingSaved(true);
            setTimeout(() => setSchedulingSaved(false), 2000);
        } catch (err) {
            setSchedulingError(err instanceof Error ? err.message : "Failed to save settings");
        } finally {
            setSchedulingLoading(false);
        }
    };
    
    const copySchedulingLink = () => {
        // Custom slugs use /cal/, usernames/addresses use /schedule/
        const link = schedulingSlug
            ? `${window.location.origin}/cal/${schedulingSlug}`
            : `${window.location.origin}/schedule/${userAddress}`;
        navigator.clipboard.writeText(link);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
    };

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[calc(100%-2rem)] sm:max-w-md sm:max-h-[calc(100vh-4rem)] z-50 flex flex-col"
                    >
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-full sm:max-h-[calc(100vh-4rem)]">
                            {/* Header - Fixed */}
                            <div className="flex items-center justify-between p-6 pb-4 border-b border-zinc-800/50 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center">
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
                                    <h2 className="text-xl font-bold text-white">
                                        Settings
                                    </h2>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
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

                            {/* Settings List - Scrollable */}
                            <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4 space-y-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                                {/* Profile Section */}
                                <div className="mb-4">
                                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">
                                        Profile
                                    </h3>

                                    {/* Profile Photo */}
                                    <div className="px-4 py-3 rounded-xl bg-zinc-800/50 mb-2">
                                        <div className="flex items-center gap-4">
                                            {/* Current Avatar */}
                                            <div className="relative">
                                                {(settings.useCustomAvatar && settings.customAvatarUrl) || (!settings.useCustomAvatar && ensAvatar) ? (
                                                    <img
                                                        src={settings.useCustomAvatar ? settings.customAvatarUrl! : ensAvatar!}
                                                        alt="Profile"
                                                        className="w-16 h-16 rounded-full object-cover border-2 border-zinc-700"
                                                    />
                                                ) : (
                                                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center border-2 border-zinc-700">
                                                        <span className="text-white text-xl font-bold">
                                                            {userAddress?.slice(2, 4).toUpperCase() || "?"}
                                                        </span>
                                                    </div>
                                                )}
                                                {isUploadingAvatar && (
                                                    <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Upload Controls */}
                                            <div className="flex-1">
                                                <p className="text-white font-medium text-sm mb-1">Profile Photo</p>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        ref={avatarInputRef}
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={handleAvatarUpload}
                                                        className="hidden"
                                                        id="avatar-upload"
                                                    />
                                                    <button
                                                        onClick={() => avatarInputRef.current?.click()}
                                                        disabled={isUploadingAvatar}
                                                        className="px-3 py-1.5 text-xs rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white transition-colors disabled:opacity-50"
                                                    >
                                                        {isUploadingAvatar ? 'Uploading...' : 'Upload'}
                                                    </button>
                                                    {settings.customAvatarUrl && (
                                                        <button
                                                            onClick={() => onSetCustomAvatar(null)}
                                                            className="px-3 py-1.5 text-xs rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
                                                        >
                                                            Remove
                                                        </button>
                                                    )}
                                                </div>
                                                {avatarError && (
                                                    <p className="text-red-400 text-xs mt-1">{avatarError}</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Toggle ENS vs Custom Avatar */}
                                        {(settings.customAvatarUrl || ensAvatar) && (
                                            <div className="mt-3 pt-3 border-t border-zinc-700/50">
                                                <button
                                                    onClick={onToggleUseCustomAvatar}
                                                    disabled={!settings.customAvatarUrl}
                                                    className="w-full flex items-center justify-between disabled:opacity-50"
                                                >
                                                    <div className="text-left">
                                                        <p className="text-white text-sm">
                                                            {settings.useCustomAvatar ? 'Using custom photo' : 'Using ENS avatar'}
                                                        </p>
                                                        <p className="text-zinc-500 text-xs">
                                                            {settings.customAvatarUrl 
                                                                ? 'Toggle to switch between custom and ENS'
                                                                : 'Upload a photo to use custom avatar'}
                                                        </p>
                                                    </div>
                                                    <div
                                                        className={`w-11 h-6 rounded-full transition-colors relative ${
                                                            settings.useCustomAvatar
                                                                ? "bg-orange-500"
                                                                : "bg-zinc-700"
                                                        }`}
                                                    >
                                                        <div
                                                            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                                                                settings.useCustomAvatar
                                                                    ? "translate-x-5"
                                                                    : "translate-x-0.5"
                                                            }`}
                                                        />
                                                    </div>
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Status */}
                                    <button
                                        onClick={() => {
                                            onClose();
                                            onOpenStatusModal();
                                        }}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-zinc-700/50 flex items-center justify-center text-lg">
                                                {settings.statusEmoji}
                                            </div>
                                            <div className="text-left">
                                                <p className="text-white font-medium">Status</p>
                                                <p className="text-zinc-500 text-xs truncate max-w-[150px]">
                                                    {settings.statusText || "Set your status"}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {settings.isDnd && (
                                                <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
                                                    DND
                                                </span>
                                            )}
                                            <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    </button>

                                    {/* Invites */}
                                    <button
                                        onClick={() => {
                                            onClose();
                                            onOpenInvitesModal();
                                        }}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors mt-2"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-[#FF5500]/20 flex items-center justify-center">
                                                <svg className="w-4 h-4 text-[#FFBBA7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                                </svg>
                                            </div>
                                            <div className="text-left">
                                                <p className="text-white font-medium">Invites</p>
                                                <p className="text-zinc-500 text-xs">
                                                    Earn 100 pts per referral
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {availableInvites > 0 && (
                                                <span className="text-xs bg-[#FF5500]/20 text-[#FFBBA7] px-2 py-0.5 rounded-full font-medium">
                                                    {availableInvites}
                                                </span>
                                            )}
                                            <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    </button>

                                    {/* Get email updates - only when user has verified email */}
                                    {userEmail && isEmailVerified && (
                                        <div className="mt-2 flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-zinc-700/50 flex items-center justify-center">
                                                    <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                                    </svg>
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-white font-medium">Get email updates</p>
                                                    <p className="text-zinc-500 text-xs">
                                                        Product news and updates at {userEmail}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    const ok = await onEmailUpdatesOptInChange(!emailUpdatesOptIn);
                                                    if (!ok) {
                                                        // Optionally show error toast
                                                    }
                                                }}
                                                className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                                                    emailUpdatesOptIn ? "bg-emerald-500" : "bg-zinc-700"
                                                }`}
                                            >
                                                <div
                                                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                                                        emailUpdatesOptIn ? "translate-x-5" : "translate-x-0.5"
                                                    }`}
                                                />
                                            </button>
                                        </div>
                                    )}

                                    {/* Registration Preferences */}
                                    <button
                                        onClick={() => setShowRegistrationPrefs(true)}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors mt-2"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                                <span className="text-lg">🎫</span>
                                            </div>
                                            <div className="text-left">
                                                <p className="text-white font-medium">Event Registration</p>
                                                <p className="text-zinc-500 text-xs">
                                                    Save info for quick registration
                                                </p>
                                            </div>
                                        </div>
                                        <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                </div>

                                {/* Censorship Resistance Section */}
                                <div className="mb-4">
                                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">
                                        Privacy & Security
                                    </h3>

                                    {/* Censorship Resistance Toggle */}
                                    <button
                                        onClick={onToggleDecentralizedCalls}
                                        disabled={!isHuddle01Configured && !settings.decentralizedCalls}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                                settings.decentralizedCalls
                                                    ? "bg-emerald-500/20"
                                                    : "bg-zinc-700/50"
                                            }`}>
                                                <svg
                                                    className={`w-4 h-4 transition-colors ${
                                                        settings.decentralizedCalls
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
                                                        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                                                    />
                                                </svg>
                                            </div>
                                            <div className="text-left">
                                                <p className="text-white font-medium">
                                                    Censorship Resistance
                                                </p>
                                                <p className="text-zinc-500 text-xs">
                                                    {settings.decentralizedCalls
                                                        ? "Using Web3 Provider"
                                                        : "Using Centralized Provider"}
                                                </p>
                                            </div>
                                        </div>
                                        <div
                                            className={`w-11 h-6 rounded-full transition-colors relative ${
                                                settings.decentralizedCalls
                                                    ? "bg-emerald-500"
                                                    : "bg-zinc-700"
                                            }`}
                                        >
                                            <div
                                                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                                                    settings.decentralizedCalls
                                                        ? "translate-x-5"
                                                        : "translate-x-0.5"
                                                }`}
                                            />
                                        </div>
                                    </button>
                                    {!isHuddle01Configured && (
                                        <p className="text-amber-500/80 text-xs mt-2 px-4">
                                            Set NEXT_PUBLIC_HUDDLE01_PROJECT_ID and NEXT_PUBLIC_HUDDLE01_API_KEY to enable
                                        </p>
                                    )}

                                    {/* Message Encryption - Simplified Status */}
                                    <MessagingKeyStatus 
                                        userAddress={userAddress} 
                                        authType={authType}
                                        passkeyCredentialId={passkeyCredentialId}
                                    />

                                    {/* Passkeys */}
                                    <button
                                        onClick={() => setShowPasskeyManager(true)}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors mt-2"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-[#FF5500]/20 flex items-center justify-center">
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
                                            <div className="text-left">
                                                <p className="text-white font-medium">
                                                    Passkeys
                                                </p>
                                                <p className="text-zinc-500 text-xs">
                                                    Manage biometric login
                                                </p>
                                            </div>
                                        </div>
                                        <svg
                                            className="w-5 h-5 text-zinc-500"
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

                                    {/* Address Book */}
                                    <button
                                        onClick={() => setShowAddressBook(true)}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors mt-2"
                                    >
                                        <div className="flex items-center gap-3">
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
                                                        strokeWidth={2}
                                                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                                                    />
                                                </svg>
                                            </div>
                                            <div className="text-left">
                                                <p className="text-white font-medium">
                                                    Address Book
                                                </p>
                                                <p className="text-zinc-500 text-xs">
                                                    {addressBookEntries.length > 0 
                                                        ? `${addressBookEntries.length} saved address${addressBookEntries.length === 1 ? '' : 'es'}`
                                                        : 'Save frequent recipients'
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                        <svg
                                            className="w-5 h-5 text-zinc-500"
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

                                    {/* Public Profile Toggle */}
                                    <button
                                        onClick={onTogglePublicLanding}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors mt-2"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                                settings.publicLandingEnabled
                                                    ? "bg-blue-500/20"
                                                    : "bg-zinc-700/50"
                                            }`}>
                                                <svg
                                                    className={`w-4 h-4 transition-colors ${
                                                        settings.publicLandingEnabled
                                                            ? "text-blue-400"
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
                                                        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                                                    />
                                                </svg>
                                            </div>
                                            <div className="text-left">
                                                <p className="text-white font-medium">
                                                    Enable Public Profile
                                                </p>
                                                <p className="text-zinc-500 text-xs">
                                                    {settings.publicLandingEnabled
                                                        ? "Your profile is public at /user/[address]"
                                                        : "Create a public profile page"}
                                                </p>
                                            </div>
                                        </div>
                                        <div
                                            className={`w-11 h-6 rounded-full transition-colors relative ${
                                                settings.publicLandingEnabled
                                                    ? "bg-blue-500"
                                                    : "bg-zinc-700"
                                            }`}
                                        >
                                            <div
                                                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                                                    settings.publicLandingEnabled
                                                        ? "translate-x-5"
                                                        : "translate-x-0.5"
                                                }`}
                                            />
                                        </div>
                                    </button>

                                    {/* Public Profile Settings - Only show when enabled */}
                                    {settings.publicLandingEnabled && userAddress && (
                                        <div className="mt-3 px-4 space-y-3">
                                            {/* Bio Input */}
                                            <div>
                                                <label className="block text-sm text-zinc-400 mb-1">
                                                    Profile Bio
                                                </label>
                                                <textarea
                                                    value={settings.publicBio}
                                                    onChange={(e) => {
                                                        const newBio = e.target.value.slice(0, 280); // Max 280 chars like Twitter
                                                        onUpdateBio(newBio);
                                                    }}
                                                    placeholder="Tell visitors about yourself..."
                                                    rows={3}
                                                    className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 text-sm resize-none"
                                                />
                                                <p className="text-xs text-zinc-500 mt-1 text-right">
                                                    {settings.publicBio.length}/280
                                                </p>
                                            </div>

                                            {/* Profile Action Buttons */}
                                            <div className="flex gap-2">
                                                {/* Edit Profile Button */}
                                                <a
                                                    href={`/user/${userAddress?.toLowerCase()}/edit`}
                                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500/10 border border-orange-500/30 rounded-xl hover:bg-orange-500/20 transition-colors text-orange-400"
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
                                                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                                        />
                                                    </svg>
                                                    <span className="text-sm font-medium">Edit</span>
                                                </a>

                                                {/* View Profile Button */}
                                                <a
                                                    href={`/user/${userAddress?.toLowerCase()}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-700/50 border border-zinc-600 rounded-xl hover:bg-zinc-700 transition-colors text-zinc-300"
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
                                                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                                        />
                                                    </svg>
                                                    <span className="text-sm font-medium">View</span>
                                                </a>
                                            </div>

                                            {/* Copy Profile Link Button */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!userAddress) return;
                                                    const link = `${window.location.origin}/user/${userAddress.toLowerCase()}`;
                                                    navigator.clipboard.writeText(link);
                                                    setCopiedLink(true);
                                                    setTimeout(() => setCopiedLink(false), 2000);
                                                }}
                                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl hover:bg-blue-500/20 transition-colors text-blue-400"
                                            >
                                                {copiedLink ? (
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
                                                                d="M5 13l4 4L19 7"
                                                            />
                                                        </svg>
                                                        <span className="text-sm font-medium">Copied!</span>
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
                                                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                                            />
                                                        </svg>
                                                        <span className="text-sm font-medium">Copy Link</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Sound & Notifications Section */}
                                <div className="mb-4">
                                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">
                                        Sound & Notifications
                                    </h3>

                                    {/* Sound Effects Toggle */}
                                    <button
                                        onClick={onToggleSound}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-xl">
                                                {settings.soundEnabled
                                                    ? "🔊"
                                                    : "🔇"}
                                            </span>
                                            <div className="text-left">
                                                <p className="text-white font-medium">
                                                    Sound Effects
                                                </p>
                                                <p className="text-zinc-500 text-xs">
                                                    Message and call sounds
                                                </p>
                                            </div>
                                        </div>
                                        <div
                                            className={`w-11 h-6 rounded-full transition-colors relative ${
                                                settings.soundEnabled
                                                    ? "bg-emerald-500"
                                                    : "bg-zinc-700"
                                            }`}
                                        >
                                            <div
                                                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                                                    settings.soundEnabled
                                                        ? "translate-x-5"
                                                        : "translate-x-0.5"
                                                }`}
                                            />
                                        </div>
                                    </button>

                                    {/* Push Notifications Toggle */}
                                    {pushSupported && (
                                        <div className="mt-2">
                                            <button
                                                onClick={handlePushToggle}
                                                disabled={
                                                    pushLoading ||
                                                    pushPermission === "denied"
                                                }
                                                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xl">
                                                        {pushSubscribed
                                                            ? "🔔"
                                                            : "🔕"}
                                                    </span>
                                                    <div className="text-left">
                                                        <p className="text-white font-medium">
                                                            Push Notifications
                                                        </p>
                                                        <p className="text-zinc-500 text-xs">
                                                            {pushPermission ===
                                                            "denied"
                                                                ? "Blocked in browser settings"
                                                                : "Get notified of incoming calls"}
                                                        </p>
                                                    </div>
                                                </div>
                                                {pushLoading ? (
                                                    <div className="w-5 h-5 border-2 border-[#FB8D22] border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <div
                                                        className={`w-11 h-6 rounded-full transition-colors relative ${
                                                            pushSubscribed
                                                                ? "bg-[#FB8D22]"
                                                                : "bg-zinc-700"
                                                        }`}
                                                    >
                                                        <div
                                                            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                                                                pushSubscribed
                                                                    ? "translate-x-5"
                                                                    : "translate-x-0.5"
                                                            }`}
                                                        />
                                                    </div>
                                                )}
                                            </button>
                                            {pushError && (
                                                <p className="text-red-400 text-xs mt-2 px-4">
                                                    {pushError}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                    
                                    {/* Check for App Updates - only show for PWA */}
                                    {typeof window !== "undefined" && 
                                     (window.matchMedia("(display-mode: standalone)").matches || 
                                      // @ts-expect-error - iOS Safari specific
                                      window.navigator.standalone === true) && (
                                        <div className="mt-2">
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        const registration = await navigator.serviceWorker.ready;
                                                        await registration.update();
                                                        
                                                        if (registration.waiting) {
                                                            // New version available - reload
                                                            registration.waiting.postMessage({ type: "SKIP_WAITING" });
                                                            window.location.reload();
                                                        } else {
                                                            // No update available
                                                            alert("You're on the latest version! ✓");
                                                        }
                                                    } catch (err) {
                                                        console.error("[Settings] Update check failed:", err);
                                                        alert("Could not check for updates. Try again later.");
                                                    }
                                                }}
                                                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xl">🔄</span>
                                                    <div className="text-left">
                                                        <p className="text-white font-medium">
                                                            Check for Updates
                                                        </p>
                                                        <p className="text-zinc-500 text-xs">
                                                            Manually check for app updates
                                                        </p>
                                                    </div>
                                                </div>
                                                <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Availability Section */}
                                <div className="mb-4">
                                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">
                                        Availability
                                    </h3>

                                    {/* Set Availability Windows */}
                                    <button
                                        onClick={() => setShowAvailabilityModal(true)}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-xl">🕐</span>
                                            <div className="text-left">
                                                <p className="text-white font-medium">
                                                    Availability Windows
                                                </p>
                                                <p className="text-zinc-500 text-xs">
                                                    {availabilityWindows.length > 0 
                                                        ? `${availabilityWindows.length} time slot${availabilityWindows.length > 1 ? "s" : ""} configured`
                                                        : "Set when you're available for calls"
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {availabilityWindows.length > 0 && (
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs">
                                                    {availabilityWindows.length}
                                                </span>
                                            )}
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
                                                    d="M9 5l7 7-7 7"
                                                />
                                            </svg>
                                        </div>
                                    </button>
                                </div>

                                {/* Google Calendar Integration Section */}
                                <div className="mb-4">
                                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">
                                        Google Calendar Sync
                                    </h3>

                                    {/* Google Calendar Connection */}
                                    <div className="space-y-2">
                                        {isConnected ? (
                                            <div className="px-4 py-3 rounded-xl bg-zinc-800/50 border border-emerald-500/20">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-3">
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
                                                                    strokeWidth={2}
                                                                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                                                />
                                                            </svg>
                                                        </div>
                                                        <div className="text-left flex-1">
                                                            <p className="text-white font-medium text-sm">
                                                                Google Calendar
                                                            </p>
                                                            <p className="text-zinc-500 text-xs">
                                                                {connection?.calendar_email || "Connected"}
                                                            </p>
                                                            {connection?.last_sync_at && (
                                                                <p className="text-zinc-600 text-xs mt-0.5">
                                                                    Last synced: {new Date(connection.last_sync_at).toLocaleDateString()}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                                        <span className="text-emerald-400 text-xs">Connected</span>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={connectCalendar}
                                                        disabled={calendarLoading}
                                                        className="flex-1 px-3 py-2 text-xs rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 transition-colors disabled:opacity-50"
                                                        title="Reconnect calendar"
                                                    >
                                                        {calendarLoading ? "..." : "Reconnect"}
                                                    </button>
                                                    <button
                                                        onClick={disconnectCalendar}
                                                        disabled={calendarLoading}
                                                        className="flex-1 px-3 py-2 text-xs rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors disabled:opacity-50"
                                                        title="Disconnect calendar"
                                                    >
                                                        {calendarLoading ? "..." : "Disconnect"}
                                                    </button>
                                                </div>
                                                <p className="text-zinc-600 text-xs mt-2">
                                                    Syncs busy times to prevent double-booking
                                                </p>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={connectCalendar}
                                                disabled={calendarLoading}
                                                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-zinc-700/50 flex items-center justify-center">
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
                                                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                                            />
                                                        </svg>
                                                    </div>
                                                    <div className="text-left">
                                                        <p className="text-white font-medium">
                                                            Connect Google Calendar
                                                        </p>
                                                        <p className="text-zinc-500 text-xs">
                                                            Optional: Sync busy times to prevent conflicts
                                                        </p>
                                                    </div>
                                                </div>
                                                {calendarLoading ? (
                                                    <div className="w-5 h-5 border-2 border-[#FB8D22] border-t-transparent rounded-full animate-spin" />
                                                ) : (
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
                                                            d="M9 5l7 7-7 7"
                                                        />
                                                    </svg>
                                                )}
                                            </button>
                                        )}
                                        {calendarError && (
                                            <div className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30">
                                                <p className="text-red-400 text-xs">
                                                    {calendarError}
                                                </p>
                                                {calendarError.includes("Database tables not found") && (
                                                    <p className="text-red-300 text-xs mt-1">
                                                        Please run the <code className="bg-red-500/20 px-1 rounded">google_calendar.sql</code> migration in Supabase.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Scheduling Settings Section */}
                                <div className="mb-4">
                                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">
                                        Scheduling
                                    </h3>

                                    {/* Enable Scheduling Toggle */}
                                    <div className="mb-3">
                                        <button
                                            onClick={() => {
                                                // Check if email is required and not present
                                                if (!schedulingEnabled && (!userEmail || !isEmailVerified)) {
                                                    setSchedulingError("Email verification is required to enable scheduling. Please verify your email first.");
                                                    setTimeout(() => {
                                                        onOpenEmailModal();
                                                    }, 500);
                                                    return;
                                                }
                                                setSchedulingEnabled(!schedulingEnabled);
                                            }}
                                            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-xl">📅</span>
                                                <div className="text-left">
                                                    <p className="text-white font-medium">
                                                        Enable Scheduling
                                                    </p>
                                                    <p className="text-zinc-500 text-xs">
                                                        {!userEmail || !isEmailVerified 
                                                            ? "Email verification required" 
                                                            : "Get a public booking page"}
                                                    </p>
                                                </div>
                                            </div>
                                            <div
                                                className={`w-11 h-6 rounded-full transition-colors relative ${
                                                    schedulingEnabled
                                                        ? "bg-emerald-500"
                                                        : "bg-zinc-700"
                                                }`}
                                            >
                                                <div
                                                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                                                        schedulingEnabled
                                                            ? "translate-x-5"
                                                            : "translate-x-0.5"
                                                    }`}
                                                />
                                            </div>
                                        </button>
                                    </div>

                                    {/* Scheduling Configuration */}
                                    {schedulingEnabled && (
                                        <div className="space-y-4 px-4 py-4 rounded-xl bg-zinc-800/30 border border-zinc-700">
                                            {/* Your Scheduling Link */}
                                            <div className="bg-zinc-900/50 rounded-lg p-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs text-zinc-500 mb-1">Your booking link</p>
                                                        <p className="text-sm text-orange-400 font-mono truncate">
                                                            spritz.chat/{schedulingSlug ? `cal/${schedulingSlug}` : `schedule/${userAddress ? `${userAddress.slice(0, 6)}...` : "you"}`}
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={copySchedulingLink}
                                                        className="shrink-0 px-3 py-1.5 rounded-lg bg-orange-500/20 text-orange-400 text-xs font-medium hover:bg-orange-500/30 transition-colors"
                                                    >
                                                        {linkCopied ? "Copied!" : "Copy"}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Custom Slug */}
                                            <div>
                                                <label className="block text-sm text-zinc-400 mb-1">
                                                    Custom URL (optional)
                                                </label>
                                                <div className="flex items-center gap-0">
                                                    <span className="px-3 py-2 rounded-l-lg bg-zinc-900/50 border border-r-0 border-zinc-700 text-zinc-500 text-sm">
                                                        /cal/
                                                    </span>
                                                    <input
                                                        type="text"
                                                        value={schedulingSlug}
                                                        onChange={(e) => setSchedulingSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                                                        placeholder="yourname"
                                                        className="flex-1 px-3 py-2 rounded-r-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500 text-sm"
                                                    />
                                                </div>
                                            </div>

                                            {/* Page Title */}
                                            <div>
                                                <label className="block text-sm text-zinc-400 mb-1">
                                                    Page Title
                                                </label>
                                                <input
                                                    type="text"
                                                    value={schedulingTitle}
                                                    onChange={(e) => setSchedulingTitle(e.target.value)}
                                                    placeholder="Book a call with me"
                                                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500 text-sm"
                                                />
                                            </div>

                                            {/* Bio */}
                                            <div>
                                                <label className="block text-sm text-zinc-400 mb-1">
                                                    Short Bio
                                                </label>
                                                <textarea
                                                    value={schedulingBio}
                                                    onChange={(e) => setSchedulingBio(e.target.value)}
                                                    placeholder="Tell visitors about yourself..."
                                                    rows={2}
                                                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500 text-sm resize-none"
                                                />
                                            </div>

                                            {/* Meeting Types */}
                                            <div className="space-y-3">
                                                <p className="text-sm text-zinc-400 font-medium">Meeting Types</p>
                                                
                                                {/* Free Option */}
                                                <div className={`rounded-lg border transition-colors ${schedulingFreeEnabled ? "bg-emerald-500/10 border-emerald-500/30" : "bg-zinc-900/50 border-zinc-700"}`}>
                                                    <button
                                                        onClick={() => setSchedulingFreeEnabled(!schedulingFreeEnabled)}
                                                        className="w-full flex items-center justify-between px-3 py-2.5"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${schedulingFreeEnabled ? "bg-emerald-500 border-emerald-500" : "border-zinc-600"}`}>
                                                                {schedulingFreeEnabled && (
                                                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                            <span className="text-white text-sm font-medium">Free Consultation</span>
                                                        </div>
                                                        <span className="text-emerald-400 text-xs font-medium">Free</span>
                                                    </button>
                                                    {schedulingFreeEnabled && (
                                                        <div className="px-3 pb-3 pt-1">
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    ref={freeDurationInputRef}
                                                                    type="number"
                                                                    min="5"
                                                                    max="60"
                                                                    step="5"
                                                                    value={freeDurationInput}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        // Always update the input string, even if empty
                                                                        setFreeDurationInput(val);
                                                                        // Only update numeric state if valid
                                                                        const num = parseInt(val, 10);
                                                                        if (!isNaN(num) && num >= 5 && num <= 60) {
                                                                            setSchedulingFreeDuration(num);
                                                                        }
                                                                    }}
                                                                    onFocus={(e) => {
                                                                        // Select all text on focus for easy editing
                                                                        e.target.select();
                                                                    }}
                                                                    onBlur={(e) => {
                                                                        const val = e.target.value;
                                                                        const num = parseInt(val, 10);
                                                                        if (val === "" || isNaN(num) || num < 5 || num > 60) {
                                                                            setSchedulingFreeDuration(15);
                                                                            setFreeDurationInput("15");
                                                                        } else {
                                                                            setFreeDurationInput(num.toString());
                                                                        }
                                                                    }}
                                                                    className="w-20 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-orange-500"
                                                                />
                                                                <span className="text-zinc-500 text-xs">minutes</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Paid Option */}
                                                <div className={`rounded-lg border transition-colors ${schedulingPaidEnabled ? "bg-orange-500/10 border-orange-500/30" : "bg-zinc-900/50 border-zinc-700"}`}>
                                                    <button
                                                        onClick={() => setSchedulingPaidEnabled(!schedulingPaidEnabled)}
                                                        className="w-full flex items-center justify-between px-3 py-2.5"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${schedulingPaidEnabled ? "bg-orange-500 border-orange-500" : "border-zinc-600"}`}>
                                                                {schedulingPaidEnabled && (
                                                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                            <span className="text-white text-sm font-medium">Priority Session</span>
                                                        </div>
                                                        <span className="text-orange-400 text-xs font-medium">Paid</span>
                                                    </button>
                                                    {schedulingPaidEnabled && (
                                                        <div className="px-3 pb-3 pt-1 space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    ref={paidDurationInputRef}
                                                                    type="number"
                                                                    min="5"
                                                                    max="120"
                                                                    step="5"
                                                                    value={paidDurationInput}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        // Always update the input string, even if empty
                                                                        setPaidDurationInput(val);
                                                                        // Only update numeric state if valid
                                                                        const num = parseInt(val, 10);
                                                                        if (!isNaN(num) && num >= 5 && num <= 120) {
                                                                            setSchedulingPaidDuration(num);
                                                                        }
                                                                    }}
                                                                    onFocus={(e) => {
                                                                        // Select all text on focus for easy editing
                                                                        e.target.select();
                                                                    }}
                                                                    onBlur={(e) => {
                                                                        const val = e.target.value;
                                                                        const num = parseInt(val, 10);
                                                                        if (val === "" || isNaN(num) || num < 5 || num > 120) {
                                                                            setSchedulingPaidDuration(30);
                                                                            setPaidDurationInput("30");
                                                                        } else {
                                                                            setPaidDurationInput(num.toString());
                                                                        }
                                                                    }}
                                                                    className="w-20 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-orange-500"
                                                                />
                                                                <span className="text-zinc-500 text-xs">minutes</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-zinc-500 text-xs">$</span>
                                                                <input
                                                                    ref={priceInputRef}
                                                                    type="number"
                                                                    min="1"
                                                                    step="1"
                                                                    value={priceInput}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        // Always update the input string, even if empty
                                                                        setPriceInput(val);
                                                                        // Only update numeric state if valid
                                                                        const num = parseFloat(val);
                                                                        if (!isNaN(num) && num >= 0) {
                                                                            setSchedulingPrice(Math.round(num * 100));
                                                                        }
                                                                    }}
                                                                    onFocus={(e) => {
                                                                        // Select all text on focus for easy editing
                                                                        e.target.select();
                                                                    }}
                                                                    onBlur={(e) => {
                                                                        const val = e.target.value;
                                                                        const num = parseFloat(val);
                                                                        if (val === "" || isNaN(num) || num < 1) {
                                                                            const defaultPrice = schedulingPrice > 0 ? schedulingPrice / 100 : 1;
                                                                            setSchedulingPrice(Math.round(defaultPrice * 100));
                                                                            setPriceInput(defaultPrice.toString());
                                                                        } else {
                                                                            setPriceInput(num.toString());
                                                                        }
                                                                    }}
                                                                    placeholder="25"
                                                                    className="w-20 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-orange-500"
                                                                />
                                                                <span className="text-zinc-500 text-xs">USDC</span>
                                                            </div>
                                                            {/* Network selector */}
                                                            <div>
                                                                <label className="block text-zinc-500 text-xs mb-1">Payment Network</label>
                                                                <select
                                                                    value={schedulingNetwork}
                                                                    onChange={(e) => setSchedulingNetwork(e.target.value)}
                                                                    className="w-full px-2 py-1.5 rounded bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-orange-500"
                                                                >
                                                                    {PAYMENT_NETWORKS.map((network) => (
                                                                        <option key={network.value} value={network.value}>
                                                                            {network.icon} {network.label}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                            <input
                                                                type="text"
                                                                value={schedulingWallet}
                                                                onChange={(e) => setSchedulingWallet(e.target.value)}
                                                                placeholder="Payment wallet (0x...)"
                                                                spellCheck={false}
                                                                autoComplete="off"
                                                                autoCorrect="off"
                                                                autoCapitalize="off"
                                                                className="w-full px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 text-xs font-mono focus:outline-none focus:border-orange-500"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Save Button */}
                                            <button
                                                onClick={handleSaveSchedulingSettings}
                                                disabled={schedulingLoading || (schedulingPaidEnabled && schedulingPrice > 0 && !schedulingWallet) || (!schedulingFreeEnabled && !schedulingPaidEnabled)}
                                                className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium hover:from-orange-400 hover:to-amber-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            >
                                                {schedulingLoading ? (
                                                    <>
                                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                        Saving...
                                                    </>
                                                ) : schedulingSaved ? (
                                                    <>
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                        Saved!
                                                    </>
                                                ) : (
                                                    "Save Scheduling Settings"
                                                )}
                                            </button>

                                            {schedulingError && (
                                                <p className="text-red-400 text-xs text-center">
                                                    {schedulingError}
                                                </p>
                                            )}

                                            {!schedulingFreeEnabled && !schedulingPaidEnabled && (
                                                <p className="text-amber-500/80 text-xs text-center">
                                                    Enable at least one meeting type
                                                </p>
                                            )}

                                            {schedulingEnabled && !isConnected && (
                                                <p className="text-zinc-500 text-xs text-center">
                                                    💡 Connect Google Calendar above to sync availability
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* App Info */}
                                <div className="pt-4 border-t border-zinc-800">
                                    <p className="text-zinc-600 text-xs text-center">
                                        Spritz v1.0 • PWA App
                                    </p>
                                </div>
                            </div>

                            {/* Done Button - Fixed Footer */}
                            <div className="p-6 pt-4 border-t border-zinc-800/50 shrink-0">
                                <button
                                    onClick={onClose}
                                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FF5500] text-white font-medium transition-all hover:shadow-lg hover:shadow-[#FB8D22]/25"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
            
            {/* Availability Windows Modal */}
            <AvailabilityWindowsModal
                isOpen={showAvailabilityModal}
                onClose={() => setShowAvailabilityModal(false)}
                userAddress={userAddress}
            />

            {/* Key Backup Modal */}
            <KeyBackupModal
                isOpen={showKeyBackup}
                onClose={() => setShowKeyBackup(false)}
                userAddress={userAddress}
            />

            {/* Passkey Manager Modal */}
            <AnimatePresence>
                {showPasskeyManager && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                        onClick={() => setShowPasskeyManager(false)}
                    >
                        <div onClick={(e) => e.stopPropagation()}>
                            <PasskeyManager
                                userAddress={userAddress || ""}
                                onClose={() => setShowPasskeyManager(false)}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Address Book Modal */}
            <AnimatePresence>
                {showAddressBook && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                        onClick={() => setShowAddressBook(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-md bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl max-h-[85vh] flex flex-col"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                        <span className="text-xl">📖</span>
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-semibold text-white">Address Book</h2>
                                        <p className="text-xs text-zinc-500">Save addresses for quick access</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowAddressBook(false)}
                                    className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
                                >
                                    <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Add new address form */}
                            <div className="p-4 border-b border-zinc-800 bg-zinc-800/30">
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        value={newAddressLabel}
                                        onChange={(e) => setNewAddressLabel(e.target.value)}
                                        placeholder="Label (e.g., Mom, Work)"
                                        maxLength={50}
                                        className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                                    />
                                    <input
                                        type="text"
                                        value={newAddressValue}
                                        onChange={(e) => setNewAddressValue(e.target.value)}
                                        placeholder="0x... or ENS (vitalik.eth)"
                                        spellCheck={false}
                                        autoComplete="off"
                                        autoCorrect="off"
                                        autoCapitalize="off"
                                        className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                                    />
                                    {addressBookError && (
                                        <p className="text-xs text-red-400">{addressBookError}</p>
                                    )}
                                    <button
                                        onClick={handleAddToAddressBook}
                                        disabled={!newAddressLabel.trim() || !newAddressValue.trim() || isAddingAddress}
                                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isAddingAddress ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                {isEnsName(newAddressValue) ? "Resolving ENS..." : "Adding..."}
                                            </>
                                        ) : (
                                            "Add to Address Book"
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Entries list */}
                            <div className="flex-1 overflow-y-auto">
                                {addressBookLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                                    </div>
                                ) : addressBookEntries.length === 0 ? (
                                    <div className="text-center py-12 px-4">
                                        <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                                            <span className="text-3xl">📖</span>
                                        </div>
                                        <p className="text-zinc-400 text-sm">No saved addresses yet</p>
                                        <p className="text-zinc-500 text-xs mt-1">
                                            Add addresses above or save them when sending
                                        </p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-zinc-800">
                                        {addressBookEntries.map((entry) => (
                                            <div 
                                                key={entry.id}
                                                className="p-4 hover:bg-zinc-800/30 transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    {/* Avatar/icon */}
                                                    <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0">
                                                        <span className="text-lg">📖</span>
                                                    </div>
                                                    
                                                    {/* Info */}
                                                    <div className="flex-1 min-w-0">
                                                        {editingEntryId === entry.id ? (
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="text"
                                                                    value={editingLabel}
                                                                    onChange={(e) => setEditingLabel(e.target.value)}
                                                                    className="flex-1 px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                                                                    autoFocus
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === "Enter") handleUpdateLabel(entry.id);
                                                                        if (e.key === "Escape") {
                                                                            setEditingEntryId(null);
                                                                            setEditingLabel("");
                                                                        }
                                                                    }}
                                                                />
                                                                <button
                                                                    onClick={() => handleUpdateLabel(entry.id)}
                                                                    className="p-1 text-emerald-400 hover:text-emerald-300"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        setEditingEntryId(null);
                                                                        setEditingLabel("");
                                                                    }}
                                                                    className="p-1 text-zinc-400 hover:text-zinc-300"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-medium text-white truncate">
                                                                        {entry.label}
                                                                    </span>
                                                                    {entry.isFavorite && (
                                                                        <span className="text-yellow-400 text-xs">★</span>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2 text-xs text-zinc-500">
                                                                    <span className="font-mono truncate">
                                                                        {entry.address.slice(0, 8)}...{entry.address.slice(-6)}
                                                                    </span>
                                                                    {entry.ensName && (
                                                                        <span className="text-emerald-400">{entry.ensName}</span>
                                                                    )}
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>

                                                    {/* Actions */}
                                                    {editingEntryId !== entry.id && (
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => handleToggleFavorite(entry)}
                                                                className={`p-1.5 rounded hover:bg-zinc-700 transition-colors ${
                                                                    entry.isFavorite ? "text-yellow-400" : "text-zinc-500 hover:text-yellow-400"
                                                                }`}
                                                                title={entry.isFavorite ? "Remove from favorites" : "Add to favorites"}
                                                            >
                                                                <svg className="w-4 h-4" fill={entry.isFavorite ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setEditingEntryId(entry.id);
                                                                    setEditingLabel(entry.label);
                                                                }}
                                                                className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors"
                                                                title="Edit label"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                onClick={() => navigator.clipboard.writeText(entry.address)}
                                                                className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors"
                                                                title="Copy address"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteEntry(entry.id)}
                                                                className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-700 transition-colors"
                                                                title="Delete"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Registration Preferences Modal */}
            {userAddress && (
                <RegistrationPreferencesModal
                    isOpen={showRegistrationPrefs}
                    onClose={() => setShowRegistrationPrefs(false)}
                    userAddress={userAddress}
                />
            )}
        </>
    );
}


