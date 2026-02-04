"use client";

import { useState, useEffect, useCallback } from "react";
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

const displayName = (name: string | null, username: string | null, address: string) =>
    name || (username ? `@${username.replace(/^@/, "")}` : null) || `${address.slice(0, 6)}...${address.slice(-4)}`;

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
    const usernameDisplay = username?.startsWith("@") ? username : username ? `@${username}` : null;
    const shareUrl = usernameDisplay
        ? `https://app.spritz.chat/user/${usernameDisplay.slice(1)}`
        : `https://app.spritz.chat/user/${peerAddress}`;

    // PWA back: push state when opened so browser back closes modal
    useEffect(() => {
        if (!isOpen || !pushStateForBack || typeof window === "undefined") return;
        const state = { userCard: true };
        window.history.pushState(state, "");
        const handlePopState = (e: PopStateEvent) => {
            if (e.state?.userCard !== true) onClose();
        };
        window.addEventListener("popstate", handlePopState);
        return () => {
            window.removeEventListener("popstate", handlePopState);
            if (window.history.state?.userCard === true) window.history.back();
        };
    }, [isOpen, pushStateForBack, onClose]);

    // Fetch notes when opened
    useEffect(() => {
        if (!isOpen || !peerAddress) return;
        setNotesFetched(false);
        fetch(`/api/user/contact-notes?subject=${encodeURIComponent(peerAddress)}`, { credentials: "include" })
            .then((r) => r.ok ? r.json() : { notes: null })
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
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col safe-area-inset"
            >
                {/* Header: back + more */}
                <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0 pt-[env(safe-area-inset-top)]">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors touch-manipulation"
                        aria-label="Back"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        <span className="text-sm font-medium">Back</span>
                    </button>
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setMoreOpen((o) => !o)}
                            className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                            aria-label="More actions"
                        >
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                <circle cx="12" cy="6" r="1.5" />
                                <circle cx="12" cy="12" r="1.5" />
                                <circle cx="12" cy="18" r="1.5" />
                            </svg>
                        </button>
                        {moreOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} aria-hidden />
                                <div className="absolute right-0 top-full mt-1 py-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-20 min-w-[200px]">
                                    <Link
                                        href={`/user/${peerAddress}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => setMoreOpen(false)}
                                        className="flex items-center gap-3 px-4 py-2.5 text-left text-white hover:bg-zinc-800 rounded-t-xl"
                                    >
                                        <span className="text-lg">👤</span>
                                        <span className="text-sm">View profile</span>
                                    </Link>
                                    <Link
                                        href={`/schedule/${peerAddress}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => setMoreOpen(false)}
                                        className="flex items-center gap-3 px-4 py-2.5 text-left text-white hover:bg-zinc-800"
                                    >
                                        <span className="text-lg">📅</span>
                                        <span className="text-sm">Schedule a call</span>
                                    </Link>
                                    {onAddFriend && (
                                        <button
                                            type="button"
                                            onClick={() => { setMoreOpen(false); handleAddFriend(); }}
                                            disabled={isFriend || addingFriend}
                                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-white hover:bg-zinc-800 disabled:opacity-50"
                                        >
                                            <span className="text-lg">➕</span>
                                            <span className="text-sm">{isFriend ? "Already in contacts" : "Add to contacts"}</span>
                                        </button>
                                    )}
                                    {onBlock && (
                                        <button
                                            type="button"
                                            onClick={() => { setMoreOpen(false); onBlock(); }}
                                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-red-400 hover:bg-zinc-800 rounded-b-xl"
                                        >
                                            <span className="text-lg">{isBlocked ? "✅" : "🚫"}</span>
                                            <span className="text-sm">{isBlocked ? "Unblock" : "Block"}</span>
                                        </button>
                                    )}
                                    {onReport && (
                                        <button
                                            type="button"
                                            onClick={() => { setMoreOpen(false); onReport(); }}
                                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-amber-400 hover:bg-zinc-800 rounded-b-xl"
                                        >
                                            <span className="text-lg">⚠️</span>
                                            <span className="text-sm">Report</span>
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
                    {/* Large avatar */}
                    <div className="flex flex-col items-center pt-6 pb-4 px-4">
                        <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 border-zinc-700 bg-zinc-800 shrink-0">
                            {peerAvatar ? (
                                <img src={peerAvatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-zinc-500">
                                    {(name || "?")[0]?.toUpperCase()}
                                </div>
                            )}
                        </div>
                        <h1 className="text-xl font-bold text-white mt-4 truncate max-w-full text-center px-2">
                            {name}
                        </h1>
                        {usernameDisplay && (
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-sm text-zinc-400 font-mono">{usernameDisplay}</span>
                                <button
                                    type="button"
                                    onClick={copyUsername}
                                    className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors"
                                    title="Copy username"
                                >
                                    {copyUsernameFeedback ? (
                                        <span className="text-emerald-400 text-xs">Copied!</span>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowQR((q) => !q)}
                                    className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors"
                                    title="Show QR code"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                                    </svg>
                                </button>
                            </div>
                        )}
                        {!usernameDisplay && (
                            <div className="flex items-center gap-2 mt-1">
                                <button
                                    type="button"
                                    onClick={copyUsername}
                                    className="text-sm text-zinc-400 hover:text-white flex items-center gap-1"
                                >
                                    Copy link
                                    {copyUsernameFeedback && <span className="text-emerald-400 text-xs">Copied!</span>}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowQR((q) => !q)}
                                    className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white"
                                    title="Show QR code"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                                    </svg>
                                </button>
                            </div>
                        )}
                        {showQR && (
                            <div className="mt-4 p-4 bg-white rounded-xl">
                                <QRCodeSVG value={shareUrl} size={160} level="M" />
                            </div>
                        )}
                    </div>

                    {/* Action row: Call, Video, Mute */}
                    <div className="flex items-center justify-center gap-4 px-4 py-4 border-t border-b border-zinc-800">
                        {onCall && (
                            <button
                                type="button"
                                onClick={() => onCall(friendForCall)}
                                className="flex flex-col items-center gap-1 p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                            >
                                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                                <span className="text-xs font-medium">Call</span>
                            </button>
                        )}
                        {onVideoCall && (
                            <button
                                type="button"
                                onClick={() => onVideoCall(friendForCall)}
                                className="flex flex-col items-center gap-1 p-3 rounded-2xl bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                            >
                                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                <span className="text-xs font-medium">Video</span>
                            </button>
                        )}
                        {onMute && (
                            <button
                                type="button"
                                onClick={onMute}
                                className={`flex flex-col items-center gap-1 p-3 rounded-2xl transition-colors ${isMuted ? "bg-zinc-700 text-zinc-400" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"}`}
                            >
                                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    {isMuted ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                    )}
                                </svg>
                                <span className="text-xs font-medium">{isMuted ? "Unmute" : "Mute"}</span>
                            </button>
                        )}
                    </div>

                    {/* Notes */}
                    <div className="px-4 py-4">
                        <label className="block text-sm font-medium text-zinc-400 mb-2">Notes (private, for you)</label>
                        {notesFetched ? (
                            <>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    onBlur={saveNotes}
                                    placeholder="Add notes about this person..."
                                    rows={3}
                                    className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5500]/50 resize-none text-sm"
                                />
                                {notesSaving && (
                                    <p className="text-xs text-zinc-500 mt-1">Saving...</p>
                                )}
                            </>
                        ) : (
                            <div className="h-20 bg-zinc-800/50 rounded-xl animate-pulse" />
                        )}
                    </div>

                    {/* Add to contacts (if not in more menu only) - also show prominent CTA */}
                    {onAddFriend && !isFriend && (
                        <div className="px-4 pb-6">
                            <button
                                type="button"
                                onClick={handleAddFriend}
                                disabled={addingFriend}
                                className="w-full py-3 px-4 rounded-xl bg-[#FF5500] hover:bg-[#FF5500]/90 text-white font-medium text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {addingFriend ? (
                                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                        </svg>
                                        Add to contacts
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
