"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";

export type UserCardFriend = {
    id: string;
    address: string;
    ensName: string | null;
    avatar: string | null;
    nickname: string | null;
    reachUsername: string | null;
    addedAt: string;
};

export interface UserCardModalProps {
    isOpen: boolean;
    onClose: () => void;
    peerAddress: string;
    peerName: string | null;
    peerAvatar: string | null;
    username: string | null;
    /** Build friend object and start audio call */
    onCall?: (friend: UserCardFriend) => void;
    /** Build friend object and start video call */
    onVideoCall?: (friend: UserCardFriend) => void;
    onMute?: () => void;
    isMuted?: boolean;
    onAddFriend?: (address: string) => Promise<boolean>;
    isFriend?: boolean;
    onBlock?: () => void;
    onReport?: () => void;
    isBlocked?: boolean;
    /** PWA: push state when opened so back button closes modal */
    pushStateForBack?: boolean;
}

const displayName = (
    name: string | null,
    username: string | null,
    address: string
) =>
    name ||
    (username ? `@${username.replace(/^@/, "")}` : null) ||
    `${address.slice(0, 6)}...${address.slice(-4)}`;

export function UserCardModal({
    isOpen,
    onClose,
    peerAddress,
    peerName,
    peerAvatar,
    username,
    onCall,
    onVideoCall,
    onMute,
    isMuted = false,
    onAddFriend,
    isFriend = false,
    onBlock,
    onReport,
    isBlocked = false,
    pushStateForBack = true,
}: UserCardModalProps) {
    const [notes, setNotes] = useState("");
    const [notesSaving, setNotesSaving] = useState(false);
    const [notesFetched, setNotesFetched] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [copyUsernameFeedback, setCopyUsernameFeedback] = useState(false);
    const [showQR, setShowQR] = useState(false);
    const [addingFriend, setAddingFriend] = useState(false);

    const name = displayName(peerName, username, peerAddress);
    const usernameDisplay = username?.startsWith("@")
        ? username
        : username
        ? `@${username}`
        : null;
    const shareUrl = usernameDisplay
        ? `https://app.spritz.chat/user/${usernameDisplay.slice(1)}`
        : `https://app.spritz.chat/user/${peerAddress}`;

    // PWA back: push state when opened so browser back closes modal
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    useEffect(() => {
        if (!isOpen || !pushStateForBack || typeof window === "undefined")
            return;
        const state = { userCard: true };
        window.history.pushState(state, "");
        const handlePopState = () => {
            onCloseRef.current();
        };
        window.addEventListener("popstate", handlePopState);
        return () => {
            window.removeEventListener("popstate", handlePopState);
            if (window.history.state?.userCard === true) window.history.back();
        };
    }, [isOpen, pushStateForBack]);

    // Fetch notes when opened
    useEffect(() => {
        if (!isOpen || !peerAddress) return;
        setNotesFetched(false);
        fetch(
            `/api/user/contact-notes?subject=${encodeURIComponent(
                peerAddress
            )}`,
            { credentials: "include" }
        )
            .then((r) => (r.ok ? r.json() : { notes: null }))
            .then((d) => {
                setNotes(d?.notes ?? "");
                setNotesFetched(true);
            })
            .catch(() => setNotesFetched(true));
    }, [isOpen, peerAddress]);

    const saveNotes = useCallback(async () => {
        if (!peerAddress) return;
        setNotesSaving(true);
        try {
            await fetch("/api/user/contact-notes", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ subject: peerAddress, notes }),
            });
        } finally {
            setNotesSaving(false);
        }
    }, [peerAddress, notes]);

    const copyUsername = useCallback(() => {
        const text = usernameDisplay || shareUrl;
        navigator.clipboard.writeText(text);
        setCopyUsernameFeedback(true);
        setTimeout(() => setCopyUsernameFeedback(false), 1500);
    }, [usernameDisplay, shareUrl]);

    const friendForCall: UserCardFriend = {
        id: peerAddress,
        address: peerAddress,
        ensName: peerName || null,
        avatar: peerAvatar,
        nickname: peerName,
        reachUsername: username?.replace(/^@/, "") || null,
        addedAt: new Date().toISOString(),
    };

    const handleAddFriend = async () => {
        if (!onAddFriend || addingFriend) return;
        setAddingFriend(true);
        try {
            await onAddFriend(peerAddress);
        } finally {
            setAddingFriend(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm"
                aria-hidden
            />
            {/* Panel: slide-up sheet on mobile, centered card on desktop */}
            <motion.div
                initial={{ opacity: 0, y: "100%" }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="fixed inset-x-0 bottom-0 z-[101] max-h-[95vh] md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-md md:max-h-[90vh] md:rounded-2xl rounded-t-3xl md:border md:border-zinc-800 shadow-2xl bg-zinc-950 flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Drag handle (mobile) */}
                <div className="flex justify-center pt-3 pb-1 md:hidden">
                    <div className="w-10 h-1 rounded-full bg-zinc-600" />
                </div>

                {/* Header: close + more */}
                <header className="flex items-center justify-between px-4 py-2 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 -ml-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors touch-manipulation"
                        aria-label="Close"
                    >
                        <svg
                            className="w-6 h-6"
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
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setMoreOpen((o) => !o)}
                            className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                            aria-label="More actions"
                        >
                            <svg
                                className="w-6 h-6"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <circle cx="12" cy="6" r="1.5" />
                                <circle cx="12" cy="12" r="1.5" />
                                <circle cx="12" cy="18" r="1.5" />
                            </svg>
                        </button>
                        {moreOpen && (
                            <>
                                <div
                                    className="fixed inset-0 z-10"
                                    onClick={() => setMoreOpen(false)}
                                    aria-hidden
                                />
                                <div className="absolute right-0 top-full mt-1 py-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-20 min-w-[220px]">
                                    <Link
                                        href={`/user/${peerAddress}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => setMoreOpen(false)}
                                        className="flex items-center gap-3 px-4 py-3 text-left text-white hover:bg-zinc-800 rounded-t-xl"
                                    >
                                        <span className="text-lg">👤</span>
                                        <span className="text-sm font-medium">
                                            View full profile
                                        </span>
                                    </Link>
                                    <Link
                                        href={`/schedule/${peerAddress}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => setMoreOpen(false)}
                                        className="flex items-center gap-3 px-4 py-3 text-left text-white hover:bg-zinc-800"
                                    >
                                        <span className="text-lg">📅</span>
                                        <span className="text-sm font-medium">
                                            Schedule a call
                                        </span>
                                    </Link>
                                    {onAddFriend && !isFriend && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMoreOpen(false);
                                                handleAddFriend();
                                            }}
                                            disabled={addingFriend}
                                            className="flex w-full items-center gap-3 px-4 py-3 text-left text-white hover:bg-zinc-800 disabled:opacity-50"
                                        >
                                            <span className="text-lg">➕</span>
                                            <span className="text-sm font-medium">
                                                Add to contacts
                                            </span>
                                        </button>
                                    )}
                                    {onBlock && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMoreOpen(false);
                                                onBlock();
                                            }}
                                            className="flex w-full items-center gap-3 px-4 py-3 text-left text-red-400 hover:bg-zinc-800"
                                        >
                                            <span className="text-lg">
                                                {isBlocked ? "✅" : "🚫"}
                                            </span>
                                            <span className="text-sm font-medium">
                                                {isBlocked
                                                    ? "Unblock"
                                                    : "Block"}
                                            </span>
                                        </button>
                                    )}
                                    {onReport && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMoreOpen(false);
                                                onReport();
                                            }}
                                            className="flex w-full items-center gap-3 px-4 py-3 text-left text-amber-400 hover:bg-zinc-800 rounded-b-xl"
                                        >
                                            <span className="text-lg">⚠️</span>
                                            <span className="text-sm font-medium">
                                                Report
                                            </span>
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
                    {/* Large avatar + name section */}
                    <div className="flex flex-col items-center pt-2 pb-6 px-6">
                        <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-full overflow-hidden ring-4 ring-zinc-800 bg-zinc-800 shadow-xl">
                            {peerAvatar ? (
                                <img
                                    src={peerAvatar}
                                    alt=""
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-5xl font-bold text-zinc-500 bg-gradient-to-br from-zinc-700 to-zinc-800">
                                    {(name || "?")[0]?.toUpperCase()}
                                </div>
                            )}
                        </div>
                        <h1 className="text-2xl font-bold text-white mt-5 truncate max-w-full text-center">
                            {name}
                        </h1>
                        {usernameDisplay && (
                            <button
                                type="button"
                                onClick={copyUsername}
                                className="mt-1 px-3 py-1 rounded-full bg-zinc-800/60 hover:bg-zinc-700 transition-colors flex items-center gap-2"
                            >
                                <span className="text-sm text-zinc-400 font-mono">
                                    {usernameDisplay}
                                </span>
                                {copyUsernameFeedback ? (
                                    <span className="text-emerald-400 text-xs font-medium">
                                        Copied!
                                    </span>
                                ) : (
                                    <svg
                                        className="w-3.5 h-3.5 text-zinc-500"
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
                                )}
                            </button>
                        )}
                        {!usernameDisplay && (
                            <button
                                type="button"
                                onClick={copyUsername}
                                className="mt-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                                {copyUsernameFeedback ? (
                                    <span className="text-emerald-400">
                                        Copied!
                                    </span>
                                ) : (
                                    "Copy profile link"
                                )}
                            </button>
                        )}
                    </div>

                    {/* Action buttons grid - larger for mobile */}
                    <div className="grid grid-cols-3 gap-3 px-5 pb-5">
                        {onCall && (
                            <button
                                type="button"
                                onClick={() => onCall(friendForCall)}
                                className="flex flex-col items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 active:bg-emerald-500/30 transition-colors touch-manipulation"
                            >
                                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                    <svg
                                        className="w-6 h-6 text-emerald-400"
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
                                <span className="text-sm font-medium text-emerald-400">
                                    Call
                                </span>
                            </button>
                        )}
                        {onVideoCall && (
                            <button
                                type="button"
                                onClick={() => onVideoCall(friendForCall)}
                                className="flex flex-col items-center justify-center gap-2 py-4 rounded-2xl bg-blue-500/15 hover:bg-blue-500/25 active:bg-blue-500/30 transition-colors touch-manipulation"
                            >
                                <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                                    <svg
                                        className="w-6 h-6 text-blue-400"
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
                                <span className="text-sm font-medium text-blue-400">
                                    Video
                                </span>
                            </button>
                        )}
                        {onMute ? (
                            <button
                                type="button"
                                onClick={onMute}
                                className={`flex flex-col items-center justify-center gap-2 py-4 rounded-2xl transition-colors touch-manipulation ${
                                    isMuted
                                        ? "bg-zinc-700/50"
                                        : "bg-zinc-800/80 hover:bg-zinc-700/60 active:bg-zinc-700"
                                }`}
                            >
                                <div
                                    className={`w-12 h-12 rounded-full flex items-center justify-center ${
                                        isMuted ? "bg-zinc-600" : "bg-zinc-700"
                                    }`}
                                >
                                    <svg
                                        className="w-6 h-6 text-zinc-300"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        {isMuted ? (
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                                            />
                                        ) : (
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                                            />
                                        )}
                                    </svg>
                                </div>
                                <span className="text-sm font-medium text-zinc-400">
                                    {isMuted ? "Unmute" : "Mute"}
                                </span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setShowQR((q) => !q)}
                                className="flex flex-col items-center justify-center gap-2 py-4 rounded-2xl bg-zinc-800/80 hover:bg-zinc-700/60 active:bg-zinc-700 transition-colors touch-manipulation"
                            >
                                <div className="w-12 h-12 rounded-full bg-zinc-700 flex items-center justify-center">
                                    <svg
                                        className="w-6 h-6 text-zinc-300"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                                        />
                                    </svg>
                                </div>
                                <span className="text-sm font-medium text-zinc-400">
                                    QR Code
                                </span>
                            </button>
                        )}
                    </div>

                    {/* QR Code (collapsible) */}
                    <AnimatePresence>
                        {showQR && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden px-5"
                            >
                                <div className="flex justify-center pb-5">
                                    <div className="p-4 bg-white rounded-2xl shadow-lg">
                                        <QRCodeSVG
                                            value={shareUrl}
                                            size={180}
                                            level="M"
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Notes section */}
                    <div className="px-5 py-4 border-t border-zinc-800/60">
                        <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                            Private Notes
                        </label>
                        {notesFetched ? (
                            <>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    onBlur={saveNotes}
                                    placeholder="Add notes about this person..."
                                    rows={3}
                                    className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700 resize-none text-sm"
                                />
                                {notesSaving && (
                                    <p className="text-xs text-zinc-500 mt-1.5 flex items-center gap-1">
                                        <span className="inline-block w-3 h-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                                        Saving...
                                    </p>
                                )}
                            </>
                        ) : (
                            <div className="h-24 bg-zinc-900 rounded-xl animate-pulse" />
                        )}
                    </div>

                    {/* Add to contacts CTA */}
                    {onAddFriend && !isFriend && (
                        <div className="px-5 pb-6 pt-2">
                            <button
                                type="button"
                                onClick={handleAddFriend}
                                disabled={addingFriend}
                                className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-[#FF5500] to-[#FF7700] hover:from-[#FF6600] hover:to-[#FF8800] active:from-[#E84D00] active:to-[#FF6600] text-white font-semibold text-base transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
                            >
                                {addingFriend ? (
                                    <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <>
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
                                                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                                            />
                                        </svg>
                                        Add to Contacts
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
