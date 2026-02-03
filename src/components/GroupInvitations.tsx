"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { GroupInvitation } from "@/hooks/useGroupInvitations";

interface GroupInvitationsProps {
    invitations: GroupInvitation[];
    onAccept: (invitationId: string) => Promise<{
        success: boolean;
        groupId?: string;
        groupName?: string;
        symmetricKey?: string;
        members?: string[];
        passwordProtected?: boolean;
        passwordSalt?: string;
        passwordHash?: string;
        error?: string;
    }>;
    onDecline: (invitationId: string, groupId: string) => Promise<boolean>;
    onJoinGroup: (
        groupId: string,
        groupData?: { name: string; symmetricKey: string; members: string[] }
    ) => Promise<void>;
    /** When accepting a password-protected invite: verify password and join with derived key */
    onAcceptWithPassword?: (
        groupId: string,
        groupName: string,
        members: string[],
        passwordSalt: string,
        passwordHash: string,
        password: string
    ) => Promise<boolean>;
    isLoading?: boolean;
}

export function GroupInvitations({
    invitations,
    onAccept,
    onDecline,
    onJoinGroup,
    onAcceptWithPassword,
    isLoading,
}: GroupInvitationsProps) {
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [passwordModal, setPasswordModal] = useState<{
        groupId: string;
        groupName: string;
        members: string[];
        passwordSalt: string;
        passwordHash: string;
    } | null>(null);
    const [passwordInput, setPasswordInput] = useState("");
    const [passwordError, setPasswordError] = useState<string | null>(null);

    const formatAddress = (address: string) =>
        `${address.slice(0, 6)}...${address.slice(-4)}`;

    const handleAccept = async (invitation: GroupInvitation) => {
        setProcessingId(invitation.id);
        setError(null);

        try {
            const result = await onAccept(invitation.id);
            if (result.success && result.groupId) {
                if (
                    result.passwordProtected &&
                    result.passwordSalt &&
                    result.passwordHash &&
                    result.members &&
                    result.groupName &&
                    onAcceptWithPassword
                ) {
                    setPasswordModal({
                        groupId: result.groupId,
                        groupName: result.groupName,
                        members: result.members,
                        passwordSalt: result.passwordSalt,
                        passwordHash: result.passwordHash,
                    });
                    setPasswordInput("");
                    setPasswordError(null);
                } else if (
                    result.symmetricKey &&
                    result.members &&
                    result.groupName
                ) {
                    const groupData = {
                        name: result.groupName,
                        symmetricKey: result.symmetricKey,
                        members: result.members,
                    };
                    await onJoinGroup(result.groupId, groupData);
                }
            } else if (!result.success) {
                setError(result.error || "Failed to accept invitation");
            }
        } catch (err) {
            setError("Failed to accept invitation");
        } finally {
            setProcessingId(null);
        }
    };

    const handlePasswordSubmit = async () => {
        if (!passwordModal || !onAcceptWithPassword || !passwordInput.trim())
            return;
        setPasswordError(null);
        const ok = await onAcceptWithPassword(
            passwordModal.groupId,
            passwordModal.groupName,
            passwordModal.members,
            passwordModal.passwordSalt,
            passwordModal.passwordHash,
            passwordInput.trim()
        );
        if (ok) {
            setPasswordModal(null);
            setPasswordInput("");
        } else {
            setPasswordError("Wrong password");
        }
    };

    const handleDecline = async (invitation: GroupInvitation) => {
        setProcessingId(invitation.id);
        setError(null);

        try {
            await onDecline(invitation.id, invitation.groupId);
        } catch (err) {
            setError("Failed to leave group");
        } finally {
            setProcessingId(null);
        }
    };

    if (invitations.length === 0) {
        return null;
    }

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
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
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                </svg>
                Group Invitations ({invitations.length})
            </h3>

            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                    <p className="text-red-400 text-sm">{error}</p>
                </div>
            )}

            <AnimatePresence mode="popLayout">
                {invitations.map((invitation) => (
                    <motion.div
                        key={invitation.id}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="bg-gradient-to-r from-[#FF5500]/10 to-[#FB8D22]/10 border border-[#FF5500]/30 rounded-xl p-4"
                    >
                        <div className="flex items-start gap-3">
                            {/* Group Icon */}
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FF5500] to-[#FB8D22] flex items-center justify-center flex-shrink-0">
                                <svg
                                    className="w-6 h-6 text-white"
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

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <p className="text-white font-medium">
                                    {invitation.groupName}
                                </p>
                                <p className="text-zinc-400 text-sm">
                                    Invited by{" "}
                                    {formatAddress(invitation.inviterAddress)}
                                </p>
                                <p className="text-zinc-500 text-xs mt-1">
                                    {invitation.createdAt.toLocaleDateString()}
                                </p>
                                {invitation.passwordProtected && (
                                    <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                        🔒 Password protected
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Info text */}
                        <p className="text-zinc-500 text-xs mt-3">
                            {invitation.passwordProtected
                                ? "Enter the group password when you accept to decrypt messages."
                                : "You've been added to this group. Accept to show it in your list, or decline to leave."}
                        </p>

                        {/* Actions */}
                        <div className="flex gap-2 mt-3">
                            <button
                                onClick={() => handleDecline(invitation)}
                                disabled={processingId === invitation.id}
                                className="flex-1 py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                Leave Group
                            </button>
                            <button
                                onClick={() => handleAccept(invitation)}
                                disabled={processingId === invitation.id}
                                className="flex-1 py-2 px-3 rounded-lg bg-gradient-to-r from-[#FF5500] to-[#FF5500] hover:from-[#E04D00] hover:to-[#E04D00] text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {processingId === invitation.id ? (
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
                                        Opening...
                                    </>
                                ) : (
                                    "Accept"
                                )}
                            </button>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>

            {/* Password modal for password-protected invitations */}
            <AnimatePresence>
                {passwordModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                        onClick={() => setPasswordModal(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm"
                        >
                            <h3 className="text-lg font-semibold text-white mb-1">
                                Enter group password
                            </h3>
                            <p className="text-zinc-400 text-sm mb-4">
                                &ldquo;{passwordModal.groupName}&rdquo; is
                                password protected.
                            </p>
                            <input
                                type="password"
                                value={passwordInput}
                                onChange={(e) => {
                                    setPasswordInput(e.target.value);
                                    setPasswordError(null);
                                }}
                                onKeyDown={(e) =>
                                    e.key === "Enter" && handlePasswordSubmit()
                                }
                                placeholder="Password"
                                className="w-full py-2.5 px-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5500]/50 text-sm mb-2"
                                autoFocus
                            />
                            {passwordError && (
                                <p className="text-red-400 text-xs mb-2">
                                    {passwordError}
                                </p>
                            )}
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPasswordModal(null)}
                                    className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handlePasswordSubmit}
                                    disabled={!passwordInput.trim()}
                                    className="flex-1 py-2.5 rounded-xl bg-[#FF5500] hover:bg-[#E04D00] text-white text-sm font-medium disabled:opacity-50"
                                >
                                    Join
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
