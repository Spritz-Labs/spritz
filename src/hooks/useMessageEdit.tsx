"use client";

import { useState, useCallback } from "react";

const EDIT_TIME_LIMIT_MS = 15 * 60 * 1000; // 15 minutes

export type EditingMessage = {
    id: string;
    content: string;
    sentAt: Date;
};

export function useMessageEdit() {
    const [editingMessage, setEditingMessage] = useState<EditingMessage | null>(null);
    const [editText, setEditText] = useState("");

    // Check if a message can be edited (within time limit and is own message)
    const canEditMessage = useCallback((sentAt: Date): boolean => {
        const now = Date.now();
        const messageTime = sentAt.getTime();
        return now - messageTime < EDIT_TIME_LIMIT_MS;
    }, []);

    // Get remaining edit time for a message
    const getEditTimeRemaining = useCallback((sentAt: Date): number => {
        const now = Date.now();
        const messageTime = sentAt.getTime();
        const remaining = EDIT_TIME_LIMIT_MS - (now - messageTime);
        return Math.max(0, remaining);
    }, []);

    // Format remaining time as "Xm" or "Xs"
    const formatEditTimeRemaining = useCallback((sentAt: Date): string => {
        const remaining = getEditTimeRemaining(sentAt);
        if (remaining <= 0) return "";
        
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        
        if (minutes > 0) {
            return `${minutes}m left to edit`;
        }
        return `${seconds}s left to edit`;
    }, [getEditTimeRemaining]);

    // Start editing a message
    const startEditing = useCallback((message: EditingMessage) => {
        if (!canEditMessage(message.sentAt)) {
            return false;
        }
        setEditingMessage(message);
        setEditText(message.content);
        return true;
    }, [canEditMessage]);

    // Cancel editing
    const cancelEditing = useCallback(() => {
        setEditingMessage(null);
        setEditText("");
    }, []);

    // Get edited content (call before saving)
    const getEditedContent = useCallback((): string | null => {
        if (!editingMessage) return null;
        if (!editText.trim()) return null;
        if (editText.trim() === editingMessage.content) return null;
        return editText.trim();
    }, [editingMessage, editText]);

    // Check if content has changed
    const hasChanges = useCallback((): boolean => {
        if (!editingMessage) return false;
        return editText.trim() !== editingMessage.content && editText.trim() !== "";
    }, [editingMessage, editText]);

    return {
        editingMessage,
        editText,
        setEditText,
        canEditMessage,
        getEditTimeRemaining,
        formatEditTimeRemaining,
        startEditing,
        cancelEditing,
        getEditedContent,
        hasChanges,
        isEditing: !!editingMessage,
    };
}

// Component for the edit indicator on messages
export function EditIndicator({ className = "" }: { className?: string }) {
    return (
        <span className={`text-xs text-zinc-500 italic ${className}`}>
            (edited)
        </span>
    );
}

// Component for inline edit controls
export function EditControls({
    onSave,
    onCancel,
    hasChanges,
    isSaving,
}: {
    onSave: () => void;
    onCancel: () => void;
    hasChanges: boolean;
    isSaving?: boolean;
}) {
    return (
        <div className="flex items-center gap-2 mt-2">
            <button
                onClick={onCancel}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
                disabled={isSaving}
            >
                Cancel
            </button>
            <button
                onClick={onSave}
                disabled={!hasChanges || isSaving}
                className="px-3 py-1.5 text-xs bg-[#FF5500] text-white rounded-lg hover:bg-[#E04D00] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                {isSaving ? "Saving..." : "Save"}
            </button>
        </div>
    );
}
