"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { DisplayPoll } from "./PollDisplay";

export type PollEditUpdates = {
    question?: string;
    options?: string[];
    allowsMultiple?: boolean;
    endsAt?: string | null;
    isAnonymous?: boolean;
    isClosed?: boolean;
};

type PollEditModalProps = {
    isOpen: boolean;
    onClose: () => void;
    poll: DisplayPoll | null;
    onSave: (updates: PollEditUpdates) => Promise<void>;
};

export function PollEditModal({
    isOpen,
    onClose,
    poll,
    onSave,
}: PollEditModalProps) {
    const [question, setQuestion] = useState("");
    const [options, setOptions] = useState<string[]>(["", ""]);
    const [allowsMultiple, setAllowsMultiple] = useState(false);
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [isClosed, setIsClosed] = useState(false);
    const [duration, setDuration] = useState<"none" | "1h" | "24h" | "7d">(
        "none"
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (poll && isOpen) {
            setQuestion(poll.question);
            setOptions(
                poll.options.length >= 2
                    ? [...poll.options]
                    : [...poll.options, "", ""].slice(0, 2)
            );
            setAllowsMultiple(poll.allows_multiple);
            setIsAnonymous(poll.is_anonymous);
            setIsClosed(poll.is_closed);
            setDuration(
                poll.ends_at && new Date(poll.ends_at) > new Date()
                    ? "none"
                    : "none"
            );
            setError(null);
        }
    }, [poll, isOpen]);

    const handleAddOption = () => {
        if (options.length < 10) setOptions([...options, ""]);
    };

    const handleRemoveOption = (index: number) => {
        if (options.length > 2)
            setOptions(options.filter((_, i) => i !== index));
    };

    const handleOptionChange = (index: number, value: string) => {
        const next = [...options];
        next[index] = value;
        setOptions(next);
    };

    const getEndsAt = (): string | null => {
        if (duration === "none") return null;
        const now = new Date();
        switch (duration) {
            case "1h":
                return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
            case "24h":
                return new Date(
                    now.getTime() + 24 * 60 * 60 * 1000
                ).toISOString();
            case "7d":
                return new Date(
                    now.getTime() + 7 * 24 * 60 * 60 * 1000
                ).toISOString();
            default:
                return null;
        }
    };

    const handleSubmit = async () => {
        setError(null);
        if (!question.trim()) {
            setError("Please enter a question");
            return;
        }
        const validOptions = options.filter((o) => o.trim());
        if (validOptions.length < 2) {
            setError("Please enter at least 2 options");
            return;
        }
        setIsSubmitting(true);
        try {
            await onSave({
                question: question.trim(),
                options: validOptions,
                allowsMultiple,
                endsAt: getEndsAt(),
                isAnonymous,
                isClosed,
            });
            onClose();
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to update poll"
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (isSubmitting) return;
        setError(null);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && poll && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={handleClose}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-zinc-900 rounded-2xl p-6 max-w-md w-full border border-zinc-800 max-h-[90vh] overflow-y-auto"
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                    <span className="text-xl">🗳️</span>
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white">
                                        Edit Poll
                                    </h2>
                                    <p className="text-zinc-500 text-sm">
                                        Update question and options
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleClose}
                                disabled={isSubmitting}
                                className="text-zinc-500 hover:text-white transition-colors disabled:opacity-50"
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
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                    Question *
                                </label>
                                <input
                                    type="text"
                                    value={question}
                                    onChange={(e) =>
                                        setQuestion(e.target.value)
                                    }
                                    disabled={isSubmitting}
                                    placeholder="What do you want to ask?"
                                    maxLength={200}
                                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                    Options * (min 2, max 10)
                                </label>
                                <div className="space-y-2">
                                    {options.map((option, index) => (
                                        <div key={index} className="flex gap-2">
                                            <input
                                                type="text"
                                                value={option}
                                                onChange={(e) =>
                                                    handleOptionChange(
                                                        index,
                                                        e.target.value
                                                    )
                                                }
                                                disabled={isSubmitting}
                                                placeholder={`Option ${
                                                    index + 1
                                                }`}
                                                maxLength={100}
                                                className="flex-1 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 text-sm"
                                            />
                                            {options.length > 2 && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleRemoveOption(
                                                            index
                                                        )
                                                    }
                                                    disabled={isSubmitting}
                                                    className="p-2.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-xl transition-colors disabled:opacity-50"
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
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {options.length < 10 && (
                                    <button
                                        type="button"
                                        onClick={handleAddOption}
                                        disabled={isSubmitting}
                                        className="mt-2 w-full py-2 text-sm text-purple-400 hover:bg-zinc-800 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
                                        Add Option
                                    </button>
                                )}
                            </div>

                            <div className="space-y-3 pt-2 border-t border-zinc-800">
                                <label className="flex items-center justify-between cursor-pointer">
                                    <span className="text-sm text-zinc-300">
                                        Allow multiple choices
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setAllowsMultiple(!allowsMultiple)
                                        }
                                        disabled={isSubmitting}
                                        className={`w-11 h-6 rounded-full transition-colors ${
                                            allowsMultiple
                                                ? "bg-purple-500"
                                                : "bg-zinc-700"
                                        }`}
                                    >
                                        <div
                                            className={`w-5 h-5 rounded-full bg-white transition-transform ${
                                                allowsMultiple
                                                    ? "translate-x-5"
                                                    : "translate-x-0.5"
                                            }`}
                                        />
                                    </button>
                                </label>

                                <label className="flex items-center justify-between cursor-pointer">
                                    <span className="text-sm text-zinc-300">
                                        Anonymous voting
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setIsAnonymous(!isAnonymous)
                                        }
                                        disabled={isSubmitting}
                                        className={`w-11 h-6 rounded-full transition-colors ${
                                            isAnonymous
                                                ? "bg-purple-500"
                                                : "bg-zinc-700"
                                        }`}
                                    >
                                        <div
                                            className={`w-5 h-5 rounded-full bg-white transition-transform ${
                                                isAnonymous
                                                    ? "translate-x-5"
                                                    : "translate-x-0.5"
                                            }`}
                                        />
                                    </button>
                                </label>

                                <label className="flex items-center justify-between cursor-pointer">
                                    <span className="text-sm text-zinc-300">
                                        Close poll (no more votes)
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setIsClosed(!isClosed)}
                                        disabled={isSubmitting}
                                        className={`w-11 h-6 rounded-full transition-colors ${
                                            isClosed
                                                ? "bg-purple-500"
                                                : "bg-zinc-700"
                                        }`}
                                    >
                                        <div
                                            className={`w-5 h-5 rounded-full bg-white transition-transform ${
                                                isClosed
                                                    ? "translate-x-5"
                                                    : "translate-x-0.5"
                                            }`}
                                        />
                                    </button>
                                </label>

                                <div>
                                    <label className="block text-sm text-zinc-300 mb-2">
                                        End time
                                    </label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {[
                                            {
                                                value: "none",
                                                label: "No limit",
                                            },
                                            { value: "1h", label: "1 hour" },
                                            { value: "24h", label: "24 hours" },
                                            { value: "7d", label: "7 days" },
                                        ].map((opt) => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() =>
                                                    setDuration(
                                                        opt.value as typeof duration
                                                    )
                                                }
                                                disabled={isSubmitting}
                                                className={`px-3 py-2 text-xs rounded-lg transition-colors ${
                                                    duration === opt.value
                                                        ? "bg-purple-500 text-white"
                                                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {error && (
                                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                                    <p className="text-red-400 text-sm">
                                        {error}
                                    </p>
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    disabled={isSubmitting}
                                    className="flex-1 py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={
                                        isSubmitting ||
                                        !question.trim() ||
                                        options.filter((o) => o.trim()).length <
                                            2
                                    }
                                    className="flex-1 py-3 px-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        "Save changes"
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
