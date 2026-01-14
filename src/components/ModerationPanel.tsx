"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useModeration, MUTE_DURATION_OPTIONS } from "@/hooks/useModeration";
import type { Moderator, MutedUser } from "@/app/api/moderation/route";

interface ModerationPanelProps {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string;
    channelId?: string | null;
    channelName?: string;
    getUserInfo?: (address: string) => { name: string | null; avatar: string | null } | null;
}

export function ModerationPanel({
    isOpen,
    onClose,
    userAddress,
    channelId,
    channelName,
    getUserInfo,
}: ModerationPanelProps) {
    const {
        permissions,
        moderators,
        mutedUsers,
        isLoading,
        actionLoading,
        promoteMod,
        demoteMod,
        unmuteUser,
        refresh,
    } = useModeration(userAddress, channelId);

    const [activeTab, setActiveTab] = useState<"moderators" | "muted">("moderators");
    const [showAddMod, setShowAddMod] = useState(false);
    const [newModAddress, setNewModAddress] = useState("");
    const [newModPermissions, setNewModPermissions] = useState({
        canPin: true,
        canDelete: true,
        canMute: true,
        canManageMods: false,
    });
    const [addingMod, setAddingMod] = useState(false);

    const formatAddress = (address: string) => {
        const info = getUserInfo?.(address);
        if (info?.name) return info.name;
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    const handleAddMod = async () => {
        if (!newModAddress.trim()) return;

        setAddingMod(true);
        const success = await promoteMod(newModAddress.trim(), newModPermissions);
        if (success) {
            setNewModAddress("");
            setShowAddMod(false);
            setNewModPermissions({
                canPin: true,
                canDelete: true,
                canMute: true,
                canManageMods: false,
            });
        }
        setAddingMod(false);
    };

    const handleRemoveMod = async (mod: Moderator) => {
        const confirmed = window.confirm(
            `Remove ${formatAddress(mod.user_address)} as moderator?`
        );
        if (!confirmed) return;
        await demoteMod(mod.user_address);
    };

    const handleUnmute = async (mute: MutedUser) => {
        const confirmed = window.confirm(
            `Unmute ${formatAddress(mute.user_address)}?`
        );
        if (!confirmed) return;
        await unmuteUser(mute.user_address);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="fixed z-50 inset-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg sm:max-h-[80vh] overflow-hidden"
            >
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl h-full flex flex-col">
                    {/* Header */}
                    <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                        <div>
                            <h2 className="text-white font-semibold flex items-center gap-2">
                                <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                Moderation
                            </h2>
                            <p className="text-zinc-500 text-sm">
                                {channelName || "Spritz Global Chat"}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                        >
                            <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-zinc-800">
                        <button
                            onClick={() => setActiveTab("moderators")}
                            className={`flex-1 py-3 text-sm font-medium transition-colors ${
                                activeTab === "moderators"
                                    ? "text-amber-400 border-b-2 border-amber-400"
                                    : "text-zinc-400 hover:text-white"
                            }`}
                        >
                            Moderators ({moderators.length})
                        </button>
                        <button
                            onClick={() => setActiveTab("muted")}
                            className={`flex-1 py-3 text-sm font-medium transition-colors ${
                                activeTab === "muted"
                                    ? "text-red-400 border-b-2 border-red-400"
                                    : "text-zinc-400 hover:text-white"
                            }`}
                        >
                            Muted Users ({mutedUsers.length})
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : activeTab === "moderators" ? (
                            <>
                                {/* Add Moderator Button */}
                                {permissions.canManageMods && (
                                    <div className="mb-4">
                                        {!showAddMod ? (
                                            <button
                                                onClick={() => setShowAddMod(true)}
                                                className="w-full py-3 px-4 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                                </svg>
                                                Add Moderator
                                            </button>
                                        ) : (
                                            <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
                                                <input
                                                    type="text"
                                                    value={newModAddress}
                                                    onChange={(e) => setNewModAddress(e.target.value)}
                                                    placeholder="Wallet address (0x...)"
                                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
                                                />

                                                <div className="space-y-2">
                                                    <p className="text-xs text-zinc-500 font-medium">Permissions:</p>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {[
                                                            { key: "canPin", label: "Pin Messages" },
                                                            { key: "canDelete", label: "Delete Messages" },
                                                            { key: "canMute", label: "Mute Users" },
                                                            { key: "canManageMods", label: "Manage Mods" },
                                                        ].map(({ key, label }) => (
                                                            <label key={key} className="flex items-center gap-2 text-sm text-zinc-300">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={newModPermissions[key as keyof typeof newModPermissions]}
                                                                    onChange={(e) =>
                                                                        setNewModPermissions((prev) => ({
                                                                            ...prev,
                                                                            [key]: e.target.checked,
                                                                        }))
                                                                    }
                                                                    className="w-4 h-4 rounded bg-zinc-700 border-zinc-600 text-amber-500 focus:ring-amber-500"
                                                                />
                                                                {label}
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setShowAddMod(false)}
                                                        className="flex-1 py-2 px-4 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        onClick={handleAddMod}
                                                        disabled={!newModAddress.trim() || addingMod}
                                                        className="flex-1 py-2 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                                                    >
                                                        {addingMod ? "Adding..." : "Add"}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Moderators List */}
                                {moderators.length === 0 ? (
                                    <div className="text-center py-8">
                                        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                                            <svg className="w-6 h-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                            </svg>
                                        </div>
                                        <p className="text-zinc-400 text-sm">No moderators yet</p>
                                        {permissions.canManageMods && (
                                            <p className="text-zinc-500 text-xs mt-1">Add trusted community members above</p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {moderators.map((mod) => (
                                            <div
                                                key={mod.id}
                                                className="bg-zinc-800/50 rounded-xl p-4 flex items-center gap-3"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm">
                                                    {formatAddress(mod.user_address).slice(0, 2).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white font-medium text-sm truncate">
                                                        {formatAddress(mod.user_address)}
                                                    </p>
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {mod.can_pin && (
                                                            <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                                                                Pin
                                                            </span>
                                                        )}
                                                        {mod.can_delete && (
                                                            <span className="text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded">
                                                                Delete
                                                            </span>
                                                        )}
                                                        {mod.can_mute && (
                                                            <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded">
                                                                Mute
                                                            </span>
                                                        )}
                                                        {mod.can_manage_mods && (
                                                            <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                                                                Admin
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-zinc-500 text-[10px] mt-1">
                                                        Added {formatTime(mod.granted_at)}
                                                    </p>
                                                </div>
                                                {permissions.canManageMods && (
                                                    <button
                                                        onClick={() => handleRemoveMod(mod)}
                                                        disabled={actionLoading === `demote-${mod.user_address}`}
                                                        className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                        title="Remove moderator"
                                                    >
                                                        {actionLoading === `demote-${mod.user_address}` ? (
                                                            <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                                        ) : (
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            /* Muted Users Tab */
                            <>
                                {mutedUsers.length === 0 ? (
                                    <div className="text-center py-8">
                                        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                                            <svg className="w-6 h-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                                            </svg>
                                        </div>
                                        <p className="text-zinc-400 text-sm">No muted users</p>
                                        <p className="text-zinc-500 text-xs mt-1">The community is behaving nicely!</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {mutedUsers.map((mute) => (
                                            <div
                                                key={mute.id}
                                                className="bg-zinc-800/50 rounded-xl p-4 flex items-center gap-3"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 font-bold text-sm">
                                                    {formatAddress(mute.user_address).slice(0, 2).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white font-medium text-sm truncate">
                                                        {formatAddress(mute.user_address)}
                                                    </p>
                                                    {mute.reason && (
                                                        <p className="text-zinc-400 text-xs truncate">
                                                            Reason: {mute.reason}
                                                        </p>
                                                    )}
                                                    <p className="text-zinc-500 text-[10px] mt-1">
                                                        {mute.muted_until ? (
                                                            <>Until {formatTime(mute.muted_until)}</>
                                                        ) : (
                                                            <span className="text-red-400">Permanent</span>
                                                        )}
                                                        {" • "}By {formatAddress(mute.muted_by)}
                                                    </p>
                                                </div>
                                                {permissions.canMute && (
                                                    <button
                                                        onClick={() => handleUnmute(mute)}
                                                        disabled={actionLoading === `unmute-${mute.user_address}`}
                                                        className="p-2 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                                                        title="Unmute user"
                                                    >
                                                        {actionLoading === `unmute-${mute.user_address}` ? (
                                                            <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                                                        ) : (
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-zinc-800">
                        <div className="flex items-center justify-between text-xs text-zinc-500">
                            <span>
                                Your role: {
                                    permissions.isSuperAdmin ? "Super Admin" :
                                    permissions.isAdmin ? "Admin" :
                                    permissions.isModerator ? "Moderator" : "Member"
                                }
                            </span>
                            <button
                                onClick={refresh}
                                className="text-zinc-400 hover:text-white transition-colors"
                            >
                                Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

// Quick mute dialog component
interface QuickMuteDialogProps {
    isOpen: boolean;
    onClose: () => void;
    targetAddress: string;
    targetName: string;
    onMute: (duration: string, reason?: string) => Promise<boolean>;
}

export function QuickMuteDialog({
    isOpen,
    onClose,
    targetAddress,
    targetName,
    onMute,
}: QuickMuteDialogProps) {
    const [duration, setDuration] = useState("1h");
    const [reason, setReason] = useState("");
    const [isMuting, setIsMuting] = useState(false);

    const handleMute = async () => {
        setIsMuting(true);
        const success = await onMute(duration, reason || undefined);
        if (success) {
            onClose();
            setReason("");
            setDuration("1h");
        }
        setIsMuting(false);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            />
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="fixed z-[60] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm"
            >
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-2xl">
                    <h3 className="text-white font-semibold mb-1">Mute User</h3>
                    <p className="text-zinc-400 text-sm mb-4">
                        Mute <span className="text-white">{targetName}</span> from sending messages
                    </p>

                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs text-zinc-500 mb-1.5">Duration</label>
                            <select
                                value={duration}
                                onChange={(e) => setDuration(e.target.value)}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-orange-500"
                            >
                                {MUTE_DURATION_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs text-zinc-500 mb-1.5">Reason (optional)</label>
                            <input
                                type="text"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Why are you muting this user?"
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-orange-500"
                            />
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={onClose}
                                className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleMute}
                                disabled={isMuting}
                                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                            >
                                {isMuting ? "Muting..." : "Mute User"}
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
