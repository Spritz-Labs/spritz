"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

type VoiceRecorderProps = {
    onSend: (audioBlob: Blob, duration: number) => void;
    onCancel: () => void;
    isOpen: boolean;
};

export function VoiceRecorder({ onSend, onCancel, isOpen }: VoiceRecorderProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [duration, setDuration] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Clean up on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (audioUrl) URL.revokeObjectURL(audioUrl);
            if (mediaRecorderRef.current?.state === "recording") {
                mediaRecorderRef.current.stop();
            }
        };
    }, [audioUrl]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setIsRecording(false);
            setDuration(0);
            setAudioBlob(null);
            if (audioUrl) {
                URL.revokeObjectURL(audioUrl);
                setAudioUrl(null);
            }
            setIsPlaying(false);
            audioChunksRef.current = [];
        }
    }, [isOpen, audioUrl]);

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: "audio/webm;codecs=opus",
            });

            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
                setAudioBlob(blob);
                setAudioUrl(URL.createObjectURL(blob));

                // Stop all tracks
                stream.getTracks().forEach((track) => track.stop());
            };

            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start(100); // Collect data every 100ms
            setIsRecording(true);
            setDuration(0);

            // Start timer
            timerRef.current = setInterval(() => {
                setDuration((prev) => prev + 1);
            }, 1000);
        } catch (err) {
            console.error("Failed to start recording:", err);
            alert("Could not access microphone. Please grant permission.");
        }
    }, []);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const handleSend = useCallback(() => {
        if (audioBlob) {
            onSend(audioBlob, duration);
        }
    }, [audioBlob, duration, onSend]);

    const handleCancel = useCallback(() => {
        if (isRecording) {
            stopRecording();
        }
        onCancel();
    }, [isRecording, stopRecording, onCancel]);

    const togglePlayback = useCallback(() => {
        if (!audioRef.current || !audioUrl) return;

        if (isPlaying) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    }, [isPlaying, audioUrl]);

    // Format duration as mm:ss
    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="absolute bottom-full mb-2 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-xl p-4 shadow-xl"
                >
                    <div className="flex items-center gap-4">
                        {/* Cancel Button */}
                        <button
                            onClick={handleCancel}
                            className="w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
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

                        {/* Waveform / Duration Display */}
                        <div className="flex-1 flex items-center gap-3">
                            {isRecording ? (
                                <>
                                    {/* Recording indicator */}
                                    <div className="flex items-center gap-2">
                                        <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                                        <span className="text-red-400 text-sm font-medium">
                                            Recording
                                        </span>
                                    </div>
                                    {/* Animated waveform */}
                                    <div className="flex items-center gap-0.5 h-8">
                                        {Array.from({ length: 20 }).map((_, i) => (
                                            <motion.div
                                                key={i}
                                                className="w-1 bg-[#FF5500] rounded-full"
                                                animate={{
                                                    height: [8, 24, 8],
                                                }}
                                                transition={{
                                                    duration: 0.5,
                                                    repeat: Infinity,
                                                    delay: i * 0.05,
                                                }}
                                            />
                                        ))}
                                    </div>
                                </>
                            ) : audioUrl ? (
                                <>
                                    {/* Playback controls */}
                                    <button
                                        onClick={togglePlayback}
                                        className="w-8 h-8 rounded-full bg-[#FF5500] hover:bg-[#E04D00] flex items-center justify-center text-white transition-colors"
                                    >
                                        {isPlaying ? (
                                            <svg
                                                className="w-4 h-4"
                                                fill="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <rect x="6" y="4" width="4" height="16" />
                                                <rect x="14" y="4" width="4" height="16" />
                                            </svg>
                                        ) : (
                                            <svg
                                                className="w-4 h-4 ml-0.5"
                                                fill="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path d="M8 5v14l11-7z" />
                                            </svg>
                                        )}
                                    </button>
                                    <div className="flex-1 h-2 bg-zinc-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-[#FF5500] rounded-full w-0" />
                                    </div>
                                    <audio
                                        ref={audioRef}
                                        src={audioUrl}
                                        onEnded={() => setIsPlaying(false)}
                                    />
                                </>
                            ) : (
                                <span className="text-zinc-500 text-sm">
                                    Tap the mic to start recording
                                </span>
                            )}

                            {/* Duration */}
                            <span className="text-zinc-400 text-sm font-mono min-w-[3rem] text-right">
                                {formatDuration(duration)}
                            </span>
                        </div>

                        {/* Record / Send Button */}
                        {audioUrl ? (
                            <button
                                onClick={handleSend}
                                className="w-12 h-12 rounded-full bg-[#FF5500] hover:bg-[#E04D00] flex items-center justify-center text-white transition-colors"
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
                                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                                    />
                                </svg>
                            </button>
                        ) : (
                            <button
                                onClick={isRecording ? stopRecording : startRecording}
                                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                                    isRecording
                                        ? "bg-red-500 hover:bg-red-600"
                                        : "bg-[#FF5500] hover:bg-[#E04D00]"
                                } text-white`}
                            >
                                {isRecording ? (
                                    <svg
                                        className="w-5 h-5"
                                        fill="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <rect x="6" y="6" width="12" height="12" rx="2" />
                                    </svg>
                                ) : (
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
                                            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                                        />
                                    </svg>
                                )}
                            </button>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// Voice message player component
type VoiceMessageProps = {
    audioUrl: string;
    duration: number;
    isOwn: boolean;
};

export function VoiceMessage({ audioUrl, duration, isOwn }: VoiceMessageProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const togglePlayback = () => {
        if (!audioRef.current) return;

        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    return (
        <div className="flex items-center gap-3 min-w-[200px]">
            <button
                onClick={togglePlayback}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                    isOwn
                        ? "bg-white/20 hover:bg-white/30 text-white"
                        : "bg-[#FF5500] hover:bg-[#E04D00] text-white"
                }`}
            >
                {isPlaying ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="4" width="4" height="16" />
                        <rect x="14" y="4" width="4" height="16" />
                    </svg>
                ) : (
                    <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                )}
            </button>

            <div className="flex-1">
                {/* Waveform visualization */}
                <div className="flex items-center gap-0.5 h-6">
                    {Array.from({ length: 30 }).map((_, i) => {
                        const height = Math.random() * 16 + 8;
                        const isActive = i / 30 <= progress;
                        return (
                            <div
                                key={i}
                                className={`w-1 rounded-full transition-colors ${
                                    isActive
                                        ? isOwn
                                            ? "bg-white"
                                            : "bg-[#FF5500]"
                                        : isOwn
                                        ? "bg-white/30"
                                        : "bg-zinc-600"
                                }`}
                                style={{ height: `${height}px` }}
                            />
                        );
                    })}
                </div>
                <span
                    className={`text-xs ${
                        isOwn ? "text-white/70" : "text-zinc-500"
                    }`}
                >
                    {formatDuration(duration)}
                </span>
            </div>

            <audio
                ref={audioRef}
                src={audioUrl}
                onTimeUpdate={() => {
                    if (audioRef.current) {
                        setProgress(
                            audioRef.current.currentTime / audioRef.current.duration
                        );
                    }
                }}
                onEnded={() => {
                    setIsPlaying(false);
                    setProgress(0);
                }}
            />
        </div>
    );
}

