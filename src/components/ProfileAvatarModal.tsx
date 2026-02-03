"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { formatAddress } from "@/utils/address";
import { SpritzLogo } from "./SpritzLogo";
import { GoLiveModal } from "./GoLiveModal";
import { STATUS_PRESETS } from "@/hooks/useUserSettings";
import type { Stream } from "@/app/api/streams/route";

type ProfileAvatarModalProps = {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: "profile" | "goLive";
    userAddress: string;
    effectiveAvatar: string | null;
    displayName: string;
    statusEmoji: string;
    statusText: string;
    onUpdateStatus?: (emoji: string, text: string) => Promise<boolean>;
    publicBio?: string | null;
    /** Public profile (landing) enabled - shown in Profile tab with Edit / View / Copy Link */
    publicLandingEnabled: boolean;
    onTogglePublicLanding: () => void;
    onUpdateBio: (bio: string) => void;
    currentStream: Stream | null;
    onCreateStream: (
        title?: string,
        description?: string
    ) => Promise<Stream | null>;
    onGoLive: (streamId: string) => Promise<boolean>;
    onEndStream: (streamId: string) => Promise<boolean>;
};

export function ProfileAvatarModal({
    isOpen,
    onClose,
    initialTab = "profile",
    userAddress,
    effectiveAvatar,
    displayName,
    statusEmoji,
    statusText,
    onUpdateStatus,
    publicBio = "",
    publicLandingEnabled,
    onTogglePublicLanding,
    onUpdateBio,
    currentStream,
    onCreateStream,
    onGoLive,
    onEndStream,
}: ProfileAvatarModalProps) {
    const [activeTab, setActiveTab] = useState<"profile" | "goLive">(
        initialTab
    );
    const [copiedLink, setCopiedLink] = useState(false);
    const [editEmoji, setEditEmoji] = useState(statusEmoji);
    const [editText, setEditText] = useState(statusText);
    const [isSavingStatus, setIsSavingStatus] = useState(false);
    const [showPresetLabels, setShowPresetLabels] = useState(false);

    useEffect(() => {
        if (isOpen) setActiveTab(initialTab);
    }, [isOpen, initialTab]);

    useEffect(() => {
        if (isOpen) {
            setEditEmoji(statusEmoji);
            setEditText(statusText);
        }
    }, [isOpen, statusEmoji, statusText]);

    const showProfile = activeTab === "profile";
    const showGoLive = activeTab === "goLive";

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                style={{
                    paddingTop: "env(safe-area-inset-top)",
                    paddingBottom: "env(safe-area-inset-bottom)",
                }}
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="w-full max-w-lg max-h-[90dvh] bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header with close and tabs */}
                    <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                        <div className="flex rounded-xl bg-zinc-800/80 p-1 gap-0.5">
                            <button
                                onClick={() => setActiveTab("profile")}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    activeTab === "profile"
                                        ? "bg-zinc-700 text-white"
                                        : "text-zinc-400 hover:text-white"
                                }`}
                            >
                                Profile
                            </button>
                            <button
                                onClick={() => setActiveTab("goLive")}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                                    activeTab === "goLive"
                                        ? "bg-zinc-700 text-white"
                                        : "text-zinc-400 hover:text-white"
                                }`}
                            >
                                <svg
                                    className="w-4 h-4 shrink-0 text-red-500"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                    aria-hidden
                                >
                                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                                </svg>
                                Go Live
                            </button>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                            aria-label="Close"
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

                    {/* Tab content */}
                    <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                        <AnimatePresence mode="wait">
                            {showProfile && (
                                <motion.div
                                    key="profile"
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 8 }}
                                    transition={{ duration: 0.15 }}
                                    className="flex-1 overflow-y-auto p-6 flex flex-col items-center"
                                >
                                    {/* Large avatar */}
                                    <div className="mb-6">
                                        {effectiveAvatar ? (
                                            <img
                                                src={effectiveAvatar}
                                                alt="Profile"
                                                className="w-32 h-32 rounded-2xl object-cover ring-2 ring-zinc-700"
                                            />
                                        ) : (
                                            <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center ring-2 ring-zinc-700">
                                                <SpritzLogo
                                                    size="lg"
                                                    rounded="xl"
                                                    className="text-white/90"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <h2 className="text-white font-bold text-xl mb-0.5">
                                        {displayName}
                                    </h2>
                                    <p className="text-zinc-500 text-sm mb-4">
                                        {formatAddress(userAddress)}
                                    </p>

                                    {/* Status: editable when onUpdateStatus provided */}
                                    {onUpdateStatus ? (
                                        <div className="w-full max-w-xs space-y-3 mb-4">
                                            <div className="rounded-xl bg-zinc-800/80 px-4 py-3 flex items-center gap-2">
                                                <span className="text-xl shrink-0">
                                                    {editEmoji}
                                                </span>
                                                <input
                                                    type="text"
                                                    value={editText}
                                                    onChange={(e) =>
                                                        setEditText(
                                                            e.target.value.slice(
                                                                0,
                                                                80
                                                            )
                                                        )
                                                    }
                                                    placeholder="What's your status?"
                                                    className="flex-1 bg-transparent text-zinc-300 text-sm placeholder:text-zinc-500 focus:outline-none"
                                                    maxLength={80}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <p className="text-xs text-zinc-500">
                                                    Quick status
                                                </p>
                                                <div className="flex flex-wrap gap-1.5 justify-center">
                                                    {STATUS_PRESETS.map(
                                                        (preset, idx) => (
                                                            <button
                                                                key={idx}
                                                                type="button"
                                                                title={
                                                                    preset.text ||
                                                                    "Clear status"
                                                                }
                                                                onClick={() => {
                                                                    setEditEmoji(
                                                                        preset.emoji
                                                                    );
                                                                    setEditText(
                                                                        preset.text
                                                                    );
                                                                }}
                                                                className={`min-w-[2.25rem] py-1.5 rounded-lg text-base transition-colors flex items-center justify-center gap-1 ${
                                                                    editEmoji ===
                                                                        preset.emoji &&
                                                                    editText ===
                                                                        preset.text
                                                                        ? "bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/30"
                                                                        : "bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-700"
                                                                } ${
                                                                    showPresetLabels
                                                                        ? "px-2.5"
                                                                        : "px-1.5"
                                                                }`}
                                                            >
                                                                <span>
                                                                    {
                                                                        preset.emoji
                                                                    }
                                                                </span>
                                                                {showPresetLabels && (
                                                                    <span className="text-xs truncate max-w-[4.5rem]">
                                                                        {preset.text ||
                                                                            "—"}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        )
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setShowPresetLabels(
                                                            (v) => !v
                                                        )
                                                    }
                                                    className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
                                                >
                                                    {showPresetLabels
                                                        ? "Hide labels"
                                                        : "Show labels"}
                                                </button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    if (!onUpdateStatus) return;
                                                    setIsSavingStatus(true);
                                                    const ok =
                                                        await onUpdateStatus(
                                                            editEmoji,
                                                            editText
                                                        );
                                                    setIsSavingStatus(false);
                                                    if (ok) {
                                                        // Parent will refetch and pass new props
                                                    }
                                                }}
                                                disabled={isSavingStatus}
                                                className="w-full py-2 rounded-xl bg-orange-500/20 border border-orange-500/30 text-orange-400 text-sm font-medium hover:bg-orange-500/30 disabled:opacity-50 transition-colors"
                                            >
                                                {isSavingStatus
                                                    ? "Saving..."
                                                    : "Save status"}
                                            </button>
                                        </div>
                                    ) : (
                                        (statusEmoji || statusText) && (
                                            <div className="w-full max-w-xs rounded-xl bg-zinc-800/80 px-4 py-3 mb-4 text-center">
                                                <span className="text-lg mr-1.5">
                                                    {statusEmoji}
                                                </span>
                                                <span className="text-zinc-300 text-sm">
                                                    {statusText || "No status"}
                                                </span>
                                            </div>
                                        )
                                    )}

                                    {/* Enable Public Profile */}
                                    <div className="w-full max-w-sm mt-2 mb-4">
                                        <button
                                            onClick={onTogglePublicLanding}
                                            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                                        publicLandingEnabled
                                                            ? "bg-blue-500/20"
                                                            : "bg-zinc-700/50"
                                                    }`}
                                                >
                                                    <svg
                                                        className={`w-4 h-4 transition-colors ${
                                                            publicLandingEnabled
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
                                                    <p className="text-white font-medium text-sm">
                                                        Enable Public Profile
                                                    </p>
                                                    <p className="text-zinc-500 text-xs">
                                                        {publicLandingEnabled
                                                            ? `Your profile is public at /user/${userAddress?.slice(
                                                                  0,
                                                                  6
                                                              )}...${
                                                                  userAddress?.slice(
                                                                      -4
                                                                  ) ?? ""
                                                              }`
                                                            : "Create a public profile page"}
                                                    </p>
                                                </div>
                                            </div>
                                            <div
                                                className={`w-11 h-6 rounded-full transition-colors relative ${
                                                    publicLandingEnabled
                                                        ? "bg-blue-500"
                                                        : "bg-zinc-700"
                                                }`}
                                            >
                                                <div
                                                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                                                        publicLandingEnabled
                                                            ? "translate-x-5"
                                                            : "translate-x-0.5"
                                                    }`}
                                                />
                                            </div>
                                        </button>

                                        {publicLandingEnabled &&
                                            userAddress && (
                                                <div className="mt-3 space-y-3">
                                                    <div>
                                                        <label className="block text-sm text-zinc-400 mb-1">
                                                            Profile Bio
                                                        </label>
                                                        <textarea
                                                            value={
                                                                publicBio ?? ""
                                                            }
                                                            onChange={(e) =>
                                                                onUpdateBio(
                                                                    e.target.value.slice(
                                                                        0,
                                                                        280
                                                                    )
                                                                )
                                                            }
                                                            placeholder="Tell visitors about yourself..."
                                                            rows={3}
                                                            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 text-sm resize-none"
                                                        />
                                                        <p className="text-xs text-zinc-500 mt-1 text-right">
                                                            {
                                                                (
                                                                    publicBio ??
                                                                    ""
                                                                ).length
                                                            }
                                                            /280
                                                        </p>
                                                    </div>

                                                    <div className="flex gap-2">
                                                        <Link
                                                            href={`/user/${userAddress.toLowerCase()}/edit`}
                                                            onClick={onClose}
                                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500/10 border border-orange-500/30 rounded-xl hover:bg-orange-500/20 transition-colors text-orange-400 text-sm font-medium"
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
                                                                    strokeWidth={
                                                                        2
                                                                    }
                                                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                                                />
                                                            </svg>
                                                            Edit
                                                        </Link>
                                                        <Link
                                                            href={`/user/${userAddress.toLowerCase()}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={onClose}
                                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-700/50 border border-zinc-600 rounded-xl hover:bg-zinc-700 transition-colors text-zinc-300 text-sm font-medium"
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
                                                                    strokeWidth={
                                                                        2
                                                                    }
                                                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                                                />
                                                            </svg>
                                                            View
                                                        </Link>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (!userAddress)
                                                                return;
                                                            const link = `${
                                                                typeof window !==
                                                                "undefined"
                                                                    ? window
                                                                          .location
                                                                          .origin
                                                                    : ""
                                                            }/user/${userAddress.toLowerCase()}`;
                                                            navigator.clipboard.writeText(
                                                                link
                                                            );
                                                            setCopiedLink(true);
                                                            setTimeout(
                                                                () =>
                                                                    setCopiedLink(
                                                                        false
                                                                    ),
                                                                2000
                                                            );
                                                        }}
                                                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl hover:bg-blue-500/20 transition-colors text-blue-400 text-sm font-medium"
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
                                                                        strokeWidth={
                                                                            2
                                                                        }
                                                                        d="M5 13l4 4L19 7"
                                                                    />
                                                                </svg>
                                                                Copied!
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
                                                                        strokeWidth={
                                                                            2
                                                                        }
                                                                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                                                    />
                                                                </svg>
                                                                Copy Link
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            )}
                                    </div>
                                </motion.div>
                            )}

                            {showGoLive && (
                                <motion.div
                                    key="goLive"
                                    initial={{ opacity: 0, x: 8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -8 }}
                                    transition={{ duration: 0.15 }}
                                    className="flex-1 min-h-0 flex flex-col"
                                >
                                    <GoLiveModal
                                        isOpen={true}
                                        onClose={onClose}
                                        embed={true}
                                        userAddress={userAddress}
                                        currentStream={currentStream}
                                        onCreateStream={onCreateStream}
                                        onGoLive={onGoLive}
                                        onEndStream={onEndStream}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
