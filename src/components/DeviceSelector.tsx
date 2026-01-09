"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";

type DeviceInfo = {
    deviceId: string;
    label: string;
    kind: MediaDeviceKind;
};

type DeviceSelectorProps = {
    onMicrophoneChange?: (deviceId: string) => Promise<void> | void;
    onSpeakerChange?: (deviceId: string) => void;
    onCameraChange?: (deviceId: string) => Promise<void> | void;
    showCamera?: boolean;
    selectedMicId?: string | null;
    selectedSpeakerId?: string | null;
    selectedCameraId?: string | null;
    className?: string;
};

export function useDevices() {
    const [audioInputs, setAudioInputs] = useState<DeviceInfo[]>([]);
    const [audioOutputs, setAudioOutputs] = useState<DeviceInfo[]>([]);
    const [videoInputs, setVideoInputs] = useState<DeviceInfo[]>([]);
    const [selectedMicId, setSelectedMicId] = useState<string | null>(null);
    const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null);
    const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);

    const enumerateDevices = useCallback(async () => {
        try {
            // Request permissions first to get device labels
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            } catch {
                // Try audio only if video fails
                try {
                    await navigator.mediaDevices.getUserMedia({ audio: true });
                } catch {
                    console.warn("[DeviceSelector] Could not get media permissions");
                }
            }

            const devices = await navigator.mediaDevices.enumerateDevices();
            
            const inputs = devices
                .filter((d) => d.kind === "audioinput")
                .map((d) => ({
                    deviceId: d.deviceId,
                    label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
                    kind: d.kind,
                }));
            
            const outputs = devices
                .filter((d) => d.kind === "audiooutput")
                .map((d) => ({
                    deviceId: d.deviceId,
                    label: d.label || `Speaker ${d.deviceId.slice(0, 8)}`,
                    kind: d.kind,
                }));
            
            const cameras = devices
                .filter((d) => d.kind === "videoinput")
                .map((d) => ({
                    deviceId: d.deviceId,
                    label: d.label || `Camera ${d.deviceId.slice(0, 8)}`,
                    kind: d.kind,
                }));

            setAudioInputs(inputs);
            setAudioOutputs(outputs);
            setVideoInputs(cameras);

            // Set defaults if not already set
            if (!selectedMicId && inputs.length > 0) {
                setSelectedMicId(inputs[0].deviceId);
            }
            if (!selectedSpeakerId && outputs.length > 0) {
                setSelectedSpeakerId(outputs[0].deviceId);
            }
            if (!selectedCameraId && cameras.length > 0) {
                setSelectedCameraId(cameras[0].deviceId);
            }

            return { inputs, outputs, cameras };
        } catch (err) {
            console.error("[DeviceSelector] Error enumerating devices:", err);
            return { inputs: [], outputs: [], cameras: [] };
        }
    }, [selectedMicId, selectedSpeakerId, selectedCameraId]);

    useEffect(() => {
        enumerateDevices();

        // Listen for device changes
        const handleDeviceChange = () => {
            enumerateDevices();
        };

        navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
        return () => {
            navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
        };
    }, [enumerateDevices]);

    return {
        audioInputs,
        audioOutputs,
        videoInputs,
        selectedMicId,
        selectedSpeakerId,
        selectedCameraId,
        setSelectedMicId,
        setSelectedSpeakerId,
        setSelectedCameraId,
        enumerateDevices,
    };
}

export function DeviceSelector({
    onMicrophoneChange,
    onSpeakerChange,
    onCameraChange,
    showCamera = false,
    selectedMicId: externalMicId,
    selectedSpeakerId: externalSpeakerId,
    selectedCameraId: externalCameraId,
    className = "",
}: DeviceSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const {
        audioInputs,
        audioOutputs,
        videoInputs,
        selectedMicId: internalMicId,
        selectedSpeakerId: internalSpeakerId,
        selectedCameraId: internalCameraId,
        setSelectedMicId,
        setSelectedSpeakerId,
        setSelectedCameraId,
    } = useDevices();

    // Use external values if provided, otherwise use internal state
    const currentMicId = externalMicId ?? internalMicId;
    const currentSpeakerId = externalSpeakerId ?? internalSpeakerId;
    const currentCameraId = externalCameraId ?? internalCameraId;

    const handleMicChange = async (deviceId: string) => {
        setSelectedMicId(deviceId);
        if (onMicrophoneChange) {
            await onMicrophoneChange(deviceId);
        }
    };

    const handleSpeakerChange = (deviceId: string) => {
        setSelectedSpeakerId(deviceId);
        if (onSpeakerChange) {
            onSpeakerChange(deviceId);
        }
    };

    const handleCameraChange = async (deviceId: string) => {
        setSelectedCameraId(deviceId);
        if (onCameraChange) {
            await onCameraChange(deviceId);
        }
    };

    return (
        <div className={`relative ${className}`}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-3 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white transition-all"
                title="Audio/Video Settings"
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
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                </svg>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <div
                            className="fixed inset-0 z-40"
                            onClick={() => setIsOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 overflow-hidden"
                        >
                            <div className="p-3 border-b border-zinc-800">
                                <h3 className="text-sm font-semibold text-white">
                                    Device Settings
                                </h3>
                            </div>

                            {/* Microphone Selection */}
                            <div className="p-3 border-b border-zinc-800">
                                <label className="flex items-center gap-2 text-xs text-zinc-400 mb-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                    </svg>
                                    Microphone
                                </label>
                                <select
                                    value={currentMicId || ""}
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            handleMicChange(e.target.value);
                                        }
                                    }}
                                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                >
                                    {audioInputs.map((device) => (
                                        <option key={device.deviceId} value={device.deviceId}>
                                            {device.label}
                                        </option>
                                    ))}
                                    {audioInputs.length === 0 && (
                                        <option value="">No microphones found</option>
                                    )}
                                </select>
                            </div>

                            {/* Speaker Selection */}
                            <div className={`p-3 ${showCamera ? "border-b border-zinc-800" : ""}`}>
                                <label className="flex items-center gap-2 text-xs text-zinc-400 mb-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                    </svg>
                                    Speaker
                                </label>
                                <select
                                    value={currentSpeakerId || ""}
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            handleSpeakerChange(e.target.value);
                                        }
                                    }}
                                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                >
                                    {audioOutputs.map((device) => (
                                        <option key={device.deviceId} value={device.deviceId}>
                                            {device.label}
                                        </option>
                                    ))}
                                    {audioOutputs.length === 0 && (
                                        <option value="">No speakers found</option>
                                    )}
                                </select>
                            </div>

                            {/* Camera Selection */}
                            {showCamera && (
                                <div className="p-3">
                                    <label className="flex items-center gap-2 text-xs text-zinc-400 mb-2">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                        Camera
                                    </label>
                                    <select
                                        value={currentCameraId || ""}
                                        onChange={(e) => {
                                            if (e.target.value) {
                                                handleCameraChange(e.target.value);
                                            }
                                        }}
                                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    >
                                        {videoInputs.map((device) => (
                                            <option key={device.deviceId} value={device.deviceId}>
                                                {device.label}
                                            </option>
                                        ))}
                                        {videoInputs.length === 0 && (
                                            <option value="">No cameras found</option>
                                        )}
                                    </select>
                                </div>
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

// Compact inline version for smaller UIs
export function DeviceSelectorInline({
    onMicrophoneChange,
    onSpeakerChange,
    onCameraChange,
    showCamera = false,
}: DeviceSelectorProps) {
    const {
        audioInputs,
        audioOutputs,
        videoInputs,
        selectedMicId,
        selectedSpeakerId,
        selectedCameraId,
        setSelectedMicId,
        setSelectedSpeakerId,
        setSelectedCameraId,
    } = useDevices();

    const handleMicChange = async (deviceId: string) => {
        setSelectedMicId(deviceId);
        if (onMicrophoneChange) {
            await onMicrophoneChange(deviceId);
        }
    };

    const handleSpeakerChange = (deviceId: string) => {
        setSelectedSpeakerId(deviceId);
        if (onSpeakerChange) {
            onSpeakerChange(deviceId);
        }
    };

    const handleCameraChange = async (deviceId: string) => {
        setSelectedCameraId(deviceId);
        if (onCameraChange) {
            await onCameraChange(deviceId);
        }
    };

    return (
        <div className="space-y-3">
            {/* Microphone */}
            <div>
                <label className="flex items-center gap-2 text-xs text-zinc-400 mb-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    Microphone
                </label>
                <select
                    value={selectedMicId || ""}
                    onChange={(e) => e.target.value && handleMicChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                    {audioInputs.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                            {device.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Speaker */}
            <div>
                <label className="flex items-center gap-2 text-xs text-zinc-400 mb-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                    Speaker
                </label>
                <select
                    value={selectedSpeakerId || ""}
                    onChange={(e) => e.target.value && handleSpeakerChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                    {audioOutputs.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                            {device.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Camera */}
            {showCamera && (
                <div>
                    <label className="flex items-center gap-2 text-xs text-zinc-400 mb-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Camera
                    </label>
                    <select
                        value={selectedCameraId || ""}
                        onChange={(e) => e.target.value && handleCameraChange(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                        {videoInputs.map((device) => (
                            <option key={device.deviceId} value={device.deviceId}>
                                {device.label}
                            </option>
                        ))}
                    </select>
                </div>
            )}
        </div>
    );
}
