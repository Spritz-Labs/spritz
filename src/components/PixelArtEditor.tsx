"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";

const CANVAS_SIZE = 32;
const PIXEL_SIZE = 10; // Display size of each pixel

// HSV to RGB conversion
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;

    if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
    else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
    else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
    else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
    else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    return [
        Math.round((r + m) * 255),
        Math.round((g + m) * 255),
        Math.round((b + m) * 255)
    ];
}

// RGB to Hex
function rgbToHex(r: number, g: number, b: number): string {
    return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}

// Hex to RGB
function hexToRgb(hex: string): [number, number, number] | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : null;
}

// RGB to HSV
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (max !== min) {
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
            case g: h = ((b - r) / d + 2) * 60; break;
            case b: h = ((r - g) / d + 4) * 60; break;
        }
    }
    return [h, s, v];
}

// Quick access colors - most commonly used
const QUICK_COLORS = [
    "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#00ffff", "#ff00ff",
    "#ff8000", "#8000ff", "#ff0080", "#00ff80", "#0080ff", "#80ff00",
];

// Extended color palette organized by hue
const COLOR_PALETTE = [
    // Grayscale
    "#000000", "#1a1a1a", "#333333", "#4d4d4d", "#666666", "#808080", 
    "#999999", "#b3b3b3", "#cccccc", "#e6e6e6", "#f5f5f5", "#ffffff",
    // Reds
    "#330000", "#4d0000", "#660000", "#800000", "#990000", "#b30000",
    "#cc0000", "#e60000", "#ff0000", "#ff1a1a", "#ff3333", "#ff4d4d",
    "#ff6666", "#ff8080", "#ff9999", "#ffb3b3", "#ffcccc", "#ffe6e6",
    // Oranges
    "#331a00", "#4d2600", "#663300", "#804000", "#994d00", "#b35900",
    "#cc6600", "#e67300", "#ff8000", "#ff8c1a", "#ff9933", "#ffa64d",
    "#ffb366", "#ffc080", "#ffcc99", "#ffd9b3", "#ffe6cc", "#fff2e6",
    // Yellows
    "#333300", "#4d4d00", "#666600", "#808000", "#999900", "#b3b300",
    "#cccc00", "#e6e600", "#ffff00", "#ffff1a", "#ffff33", "#ffff4d",
    "#ffff66", "#ffff80", "#ffff99", "#ffffb3", "#ffffcc", "#ffffe6",
    // Lime
    "#1a3300", "#264d00", "#336600", "#408000", "#4d9900", "#59b300",
    "#66cc00", "#73e600", "#80ff00", "#8cff1a", "#99ff33", "#a6ff4d",
    "#b3ff66", "#c0ff80", "#ccff99", "#d9ffb3", "#e6ffcc", "#f2ffe6",
    // Green
    "#003300", "#004d00", "#006600", "#008000", "#009900", "#00b300",
    "#00cc00", "#00e600", "#00ff00", "#1aff1a", "#33ff33", "#4dff4d",
    "#66ff66", "#80ff80", "#99ff99", "#b3ffb3", "#ccffcc", "#e6ffe6",
    // Teal
    "#003333", "#004d4d", "#006666", "#008080", "#009999", "#00b3b3",
    "#00cccc", "#00e6e6", "#00ffff", "#1affff", "#33ffff", "#4dffff",
    "#66ffff", "#80ffff", "#99ffff", "#b3ffff", "#ccffff", "#e6ffff",
    // Blue
    "#000033", "#00004d", "#000066", "#000080", "#000099", "#0000b3",
    "#0000cc", "#0000e6", "#0000ff", "#1a1aff", "#3333ff", "#4d4dff",
    "#6666ff", "#8080ff", "#9999ff", "#b3b3ff", "#ccccff", "#e6e6ff",
    // Purple
    "#1a0033", "#26004d", "#330066", "#400080", "#4d0099", "#5900b3",
    "#6600cc", "#7300e6", "#8000ff", "#8c1aff", "#9933ff", "#a64dff",
    "#b366ff", "#c080ff", "#cc99ff", "#d9b3ff", "#e6ccff", "#f2e6ff",
    // Magenta
    "#330033", "#4d004d", "#660066", "#800080", "#990099", "#b300b3",
    "#cc00cc", "#e600e6", "#ff00ff", "#ff1aff", "#ff33ff", "#ff4dff",
    "#ff66ff", "#ff80ff", "#ff99ff", "#ffb3ff", "#ffccff", "#ffe6ff",
    // Pink
    "#33001a", "#4d0026", "#660033", "#800040", "#99004d", "#b30059",
    "#cc0066", "#e60073", "#ff0080", "#ff1a8c", "#ff3399", "#ff4da6",
    "#ff66b3", "#ff80c0", "#ff99cc", "#ffb3d9", "#ffcce6", "#ffe6f2",
    // Browns
    "#1a0f00", "#261500", "#331c00", "#402200", "#4d2900", "#593000",
    "#663300", "#734000", "#804d00", "#8c5a1a", "#996633", "#a6734d",
    "#b38066", "#c08c80", "#cc9999", "#d9a6b3", "#e6b3cc", "#f2c0e6",
    // Skin tones
    "#8d5524", "#a36629", "#b97a38", "#c68642", "#d49656", "#e0ac69",
    "#ecbf82", "#f1c27d", "#f5d0a9", "#ffdbac", "#ffe0bd", "#ffecd1",
];

interface PixelArtEditorProps {
    isOpen: boolean;
    onClose: () => void;
    onSend: (imageData: string) => Promise<void>;
    isSending?: boolean;
}

export function PixelArtEditor({
    isOpen,
    onClose,
    onSend,
    isSending,
}: PixelArtEditorProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [selectedColor, setSelectedColor] = useState("#000000");
    const [pixels, setPixels] = useState<string[][]>(() =>
        Array(CANVAS_SIZE)
            .fill(null)
            .map(() => Array(CANVAS_SIZE).fill("#ffffff"))
    );
    const [history, setHistory] = useState<string[][][]>([]);
    const [isDrawing, setIsDrawing] = useState(false);
    const [tool, setTool] = useState<"draw" | "erase" | "fill">("draw");
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [customColor, setCustomColor] = useState("#ff0000");
    const [showShareMenu, setShowShareMenu] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showCloseConfirm, setShowCloseConfirm] = useState(false);
    const [hue, setHue] = useState(0);
    const [saturation, setSaturation] = useState(100);
    const [brightness, setBrightness] = useState(100);
    const colorWheelRef = useRef<HTMLDivElement>(null);
    const satBrightRef = useRef<HTMLDivElement>(null);
    const [isDraggingWheel, setIsDraggingWheel] = useState(false);
    const [isDraggingSatBright, setIsDraggingSatBright] = useState(false);
    const lastDrawnPixelRef = useRef<{ x: number; y: number } | null>(null);

    // Draw the canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Clear canvas
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw pixels
        pixels.forEach((row, y) => {
            row.forEach((color, x) => {
                ctx.fillStyle = color;
                ctx.fillRect(
                    x * PIXEL_SIZE,
                    y * PIXEL_SIZE,
                    PIXEL_SIZE,
                    PIXEL_SIZE
                );
            });
        });

        // Draw grid
        ctx.strokeStyle = "#e0e0e0";
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= CANVAS_SIZE; i++) {
            ctx.beginPath();
            ctx.moveTo(i * PIXEL_SIZE, 0);
            ctx.lineTo(i * PIXEL_SIZE, CANVAS_SIZE * PIXEL_SIZE);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * PIXEL_SIZE);
            ctx.lineTo(CANVAS_SIZE * PIXEL_SIZE, i * PIXEL_SIZE);
            ctx.stroke();
        }
    }, [pixels]);

    // Get pixel coordinates from mouse/touch event
    const getPixelCoords = useCallback(
        (e: React.MouseEvent | React.TouchEvent) => {
            const canvas = canvasRef.current;
            if (!canvas) return null;

            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            let clientX, clientY;
            if ("touches" in e) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            const x = Math.floor(((clientX - rect.left) * scaleX) / PIXEL_SIZE);
            const y = Math.floor(((clientY - rect.top) * scaleY) / PIXEL_SIZE);

            if (x >= 0 && x < CANVAS_SIZE && y >= 0 && y < CANVAS_SIZE) {
                return { x, y };
            }
            return null;
        },
        []
    );

    // Save current state to history (max 50 states)
    const saveToHistory = useCallback(() => {
        setHistory((prev) => {
            const newHistory = [...prev, pixels.map((row) => [...row])];
            // Keep only the last 50 states to prevent memory issues
            if (newHistory.length > 50) {
                return newHistory.slice(-50);
            }
            return newHistory;
        });
    }, [pixels]);

    // Undo last action
    const handleUndo = useCallback(() => {
        if (history.length === 0) return;
        const newHistory = [...history];
        const previousState = newHistory.pop();
        if (previousState) {
            setPixels(previousState);
            setHistory(newHistory);
        }
    }, [history]);

    // Flood fill algorithm
    const floodFill = useCallback(
        (startX: number, startY: number, newColor: string) => {
            const targetColor = pixels[startY][startX];
            if (targetColor === newColor) return;

            const newPixels = pixels.map((row) => [...row]);
            const stack: [number, number][] = [[startX, startY]];

            while (stack.length > 0) {
                const [x, y] = stack.pop()!;
                if (x < 0 || x >= CANVAS_SIZE || y < 0 || y >= CANVAS_SIZE)
                    continue;
                if (newPixels[y][x] !== targetColor) continue;

                newPixels[y][x] = newColor;
                stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
            }

            setPixels(newPixels);
        },
        [pixels]
    );

    // Handle drawing
    const handleDraw = useCallback(
        (x: number, y: number) => {
            if (tool === "fill") {
                floodFill(x, y, selectedColor);
            } else {
                const color = tool === "erase" ? "#ffffff" : selectedColor;
                setPixels((prev) => {
                    const newPixels = prev.map((row) => [...row]);
                    newPixels[y][x] = color;
                    return newPixels;
                });
            }
        },
        [tool, selectedColor, floodFill]
    );

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            const coords = getPixelCoords(e);
            if (coords) {
                // Save to history before starting a new stroke
                saveToHistory();
                setIsDrawing(true);
                lastDrawnPixelRef.current = coords;
                handleDraw(coords.x, coords.y);
            }
        },
        [getPixelCoords, handleDraw, saveToHistory]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent) => {
            if (!isDrawing || tool === "fill") return;
            const coords = getPixelCoords(e);
            if (coords) {
                // Only draw if we moved to a new pixel
                if (
                    !lastDrawnPixelRef.current ||
                    lastDrawnPixelRef.current.x !== coords.x ||
                    lastDrawnPixelRef.current.y !== coords.y
                ) {
                    lastDrawnPixelRef.current = coords;
                    handleDraw(coords.x, coords.y);
                }
            }
        },
        [isDrawing, tool, getPixelCoords, handleDraw]
    );

    const handleMouseUp = useCallback(() => {
        setIsDrawing(false);
        lastDrawnPixelRef.current = null;
    }, []);

    const handleTouchStart = useCallback(
        (e: React.TouchEvent) => {
            e.preventDefault();
            const coords = getPixelCoords(e);
            if (coords) {
                // Save to history before starting a new stroke
                saveToHistory();
                setIsDrawing(true);
                lastDrawnPixelRef.current = coords;
                handleDraw(coords.x, coords.y);
            }
        },
        [getPixelCoords, handleDraw, saveToHistory]
    );

    const handleTouchMove = useCallback(
        (e: React.TouchEvent) => {
            e.preventDefault();
            if (!isDrawing || tool === "fill") return;
            const coords = getPixelCoords(e);
            if (coords) {
                // Only draw if we moved to a new pixel
                if (
                    !lastDrawnPixelRef.current ||
                    lastDrawnPixelRef.current.x !== coords.x ||
                    lastDrawnPixelRef.current.y !== coords.y
                ) {
                    lastDrawnPixelRef.current = coords;
                    handleDraw(coords.x, coords.y);
                }
            }
        },
        [isDrawing, tool, getPixelCoords, handleDraw]
    );

    // Clear canvas
    const handleClear = () => {
        saveToHistory();
        setPixels(
            Array(CANVAS_SIZE)
                .fill(null)
                .map(() => Array(CANVAS_SIZE).fill("#ffffff"))
        );
    };

    // Export to PNG data URL (actual 32x32 image)
    const exportToPNG = useCallback((): string => {
        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = CANVAS_SIZE;
        exportCanvas.height = CANVAS_SIZE;
        const ctx = exportCanvas.getContext("2d");
        if (!ctx) return "";

        pixels.forEach((row, y) => {
            row.forEach((color, x) => {
                ctx.fillStyle = color;
                ctx.fillRect(x, y, 1, 1);
            });
        });

        return exportCanvas.toDataURL("image/png");
    }, [pixels]);

    // Send the pixel art
    const handleSend = async () => {
        const imageData = exportToPNG();
        await onSend(imageData);
    };

    // Share functions
    const shareText = "Check out this pixel art I saw on Spritz! 🍊";
    const shareUrl = "https://spritz.chat";

    const shareToTwitter = () => {
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
        window.open(url, "_blank", "noopener,noreferrer");
        setShowShareMenu(false);
    };

    const shareToFacebook = () => {
        const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`;
        window.open(url, "_blank", "noopener,noreferrer");
        setShowShareMenu(false);
    };

    const shareToLinkedIn = () => {
        const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
        window.open(url, "_blank", "noopener,noreferrer");
        setShowShareMenu(false);
    };

    const shareToReddit = () => {
        const url = `https://reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareText)}`;
        window.open(url, "_blank", "noopener,noreferrer");
        setShowShareMenu(false);
    };

    const shareToTelegram = () => {
        const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
        window.open(url, "_blank", "noopener,noreferrer");
        setShowShareMenu(false);
    };

    const shareToWhatsApp = () => {
        const url = `https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`;
        window.open(url, "_blank", "noopener,noreferrer");
        setShowShareMenu(false);
    };

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
        setShowShareMenu(false);
    };

    const downloadImage = () => {
        const imageData = exportToPNG();
        const link = document.createElement("a");
        link.download = "pixel-art.png";
        link.href = imageData;
        link.click();
        setShowShareMenu(false);
    };

    // Check if canvas has been modified
    const isCanvasDirty = useCallback(() => {
        // Check if any pixel is not white, or if there's undo history
        if (history.length > 0) return true;
        return pixels.some(row => row.some(color => color !== "#ffffff"));
    }, [pixels, history]);

    // Handle close with confirmation if dirty
    const handleClose = useCallback(() => {
        if (isCanvasDirty()) {
            setShowCloseConfirm(true);
        } else {
            onClose();
        }
    }, [isCanvasDirty, onClose]);

    // Close on escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (showCloseConfirm) {
                    setShowCloseConfirm(false);
                } else {
                    handleClose();
                }
            }
        };
        if (isOpen) {
            document.addEventListener("keydown", handleEscape);
        }
        return () => document.removeEventListener("keydown", handleEscape);
    }, [isOpen, handleClose, showCloseConfirm]);

    // Reset canvas when opening
    useEffect(() => {
        if (isOpen) {
            setPixels(
                Array(CANVAS_SIZE)
                    .fill(null)
                    .map(() => Array(CANVAS_SIZE).fill("#ffffff"))
            );
            setHistory([]);
            setTool("draw");
            setShowShareMenu(false);
            setCopied(false);
        }
    }, [isOpen]);

    // Close share menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setShowShareMenu(false);
        if (showShareMenu) {
            // Delay to prevent immediate closing
            setTimeout(() => {
                document.addEventListener("click", handleClickOutside);
            }, 0);
            return () => document.removeEventListener("click", handleClickOutside);
        }
    }, [showShareMenu]);

    // Update custom color and selected color when HSV changes
    useEffect(() => {
        const [r, g, b] = hsvToRgb(hue, saturation / 100, brightness / 100);
        const newColor = rgbToHex(r, g, b);
        setCustomColor(newColor);
        // Auto-apply color when picker is open
        if (showColorPicker) {
            setSelectedColor(newColor);
        }
    }, [hue, saturation, brightness, showColorPicker]);

    // Hue slider interaction (linear bar)
    const handleWheelInteraction = useCallback((clientX: number) => {
        const slider = colorWheelRef.current;
        if (!slider) return;

        const rect = slider.getBoundingClientRect();
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        setHue((x / rect.width) * 360);
    }, []);

    // Saturation/Brightness interaction
    const handleSatBrightInteraction = useCallback((clientX: number, clientY: number) => {
        const panel = satBrightRef.current;
        if (!panel) return;

        const rect = panel.getBoundingClientRect();
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const y = Math.max(0, Math.min(clientY - rect.top, rect.height));

        setSaturation(Math.round((x / rect.width) * 100));
        setBrightness(Math.round(100 - (y / rect.height) * 100));
    }, []);

    // Mouse/Touch handlers for sat/bright panel
    const handleSatBrightMouseDown = (e: React.MouseEvent) => {
        setIsDraggingSatBright(true);
        handleSatBrightInteraction(e.clientX, e.clientY);
    };

    const handleSatBrightTouchStart = (e: React.TouchEvent) => {
        setIsDraggingSatBright(true);
        handleSatBrightInteraction(e.touches[0].clientX, e.touches[0].clientY);
    };

    // Global mouse/touch move and up handlers
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDraggingWheel) handleWheelInteraction(e.clientX);
            if (isDraggingSatBright) handleSatBrightInteraction(e.clientX, e.clientY);
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (isDraggingWheel || isDraggingSatBright) {
                e.preventDefault();
            }
            if (isDraggingWheel) handleWheelInteraction(e.touches[0].clientX);
            if (isDraggingSatBright) handleSatBrightInteraction(e.touches[0].clientX, e.touches[0].clientY);
        };

        const handleEnd = () => {
            setIsDraggingWheel(false);
            setIsDraggingSatBright(false);
        };

        if (isDraggingWheel || isDraggingSatBright) {
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleEnd);
            document.addEventListener("touchmove", handleTouchMove, { passive: false });
            document.addEventListener("touchend", handleEnd);
        }

        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleEnd);
            document.removeEventListener("touchmove", handleTouchMove);
            document.removeEventListener("touchend", handleEnd);
        };
    }, [isDraggingWheel, isDraggingSatBright, handleWheelInteraction, handleSatBrightInteraction]);

    // Use portal to render outside of any transformed parent (fixes PWA z-index issues)
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none"
                    onClick={handleClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-xl font-semibold text-white">
                                    Pixel Art
                                </h2>
                                <p className="text-zinc-500 text-sm">
                                    Create a 32×32 masterpiece
                                </p>
                            </div>
                            <button
                                onClick={handleClose}
                                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2}
                                    stroke="currentColor"
                                    className="w-5 h-5"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </div>

                        {/* Canvas */}
                        <div className="flex justify-center mb-4">
                            <div
                                className="border-2 border-zinc-700 rounded-lg overflow-hidden select-none"
                                style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}
                            >
                                <canvas
                                    ref={canvasRef}
                                    width={CANVAS_SIZE * PIXEL_SIZE}
                                    height={CANVAS_SIZE * PIXEL_SIZE}
                                    className="cursor-crosshair select-none"
                                    style={{
                                        width: "100%",
                                        maxWidth: CANVAS_SIZE * PIXEL_SIZE,
                                        imageRendering: "pixelated",
                                        touchAction: "none",
                                        WebkitUserSelect: "none",
                                        userSelect: "none",
                                    }}
                                    onMouseDown={handleMouseDown}
                                    onMouseMove={handleMouseMove}
                                    onMouseUp={handleMouseUp}
                                    onMouseLeave={handleMouseUp}
                                    onTouchStart={handleTouchStart}
                                    onTouchMove={handleTouchMove}
                                    onTouchEnd={handleMouseUp}
                                />
                            </div>
                        </div>

                        {/* Tools */}
                        <div className="flex items-center justify-center gap-2 mb-4">
                            <button
                                onClick={() => setTool("draw")}
                                className={`p-2.5 rounded-lg transition-colors ${
                                    tool === "draw"
                                        ? "bg-[#FF5500] text-white"
                                        : "bg-zinc-800 text-zinc-400 hover:text-white"
                                }`}
                                title="Draw"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2}
                                    stroke="currentColor"
                                    className="w-5 h-5"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"
                                    />
                                </svg>
                            </button>
                            <button
                                onClick={() => setTool("erase")}
                                className={`p-2.5 rounded-lg transition-colors ${
                                    tool === "erase"
                                        ? "bg-[#FF5500] text-white"
                                        : "bg-zinc-800 text-zinc-400 hover:text-white"
                                }`}
                                title="Erase"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2}
                                    stroke="currentColor"
                                    className="w-5 h-5"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.375-6.375a1.125 1.125 0 010-1.59L9.42 4.83c.211-.211.498-.33.796-.33H19.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9.284c-.298 0-.585-.119-.796-.33z"
                                    />
                                </svg>
                            </button>
                            <button
                                onClick={() => setTool("fill")}
                                className={`p-2.5 rounded-lg transition-colors ${
                                    tool === "fill"
                                        ? "bg-[#FF5500] text-white"
                                        : "bg-zinc-800 text-zinc-400 hover:text-white"
                                }`}
                                title="Fill"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2}
                                    stroke="currentColor"
                                    className="w-5 h-5"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42"
                                    />
                                </svg>
                            </button>
                            <div className="w-px h-8 bg-zinc-700 mx-1" />
                            <button
                                onClick={handleUndo}
                                disabled={history.length === 0}
                                className="p-2.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-zinc-800 disabled:hover:text-zinc-400"
                                title={`Undo${history.length > 0 ? ` (${history.length})` : ""}`}
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2}
                                    stroke="currentColor"
                                    className="w-5 h-5"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
                                    />
                                </svg>
                            </button>
                            <button
                                onClick={handleClear}
                                className="p-2.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                                title="Clear"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2}
                                    stroke="currentColor"
                                    className="w-5 h-5"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                    />
                                </svg>
                            </button>
                        </div>

                        {/* Current Color & Color Picker Toggle */}
                        <div className="flex items-center gap-3 mb-3">
                            <div
                                className="w-10 h-10 rounded-lg border-2 border-zinc-600 flex-shrink-0"
                                style={{ backgroundColor: selectedColor }}
                                title={selectedColor}
                            />
                            <button
                                onClick={() =>
                                    setShowColorPicker(!showColorPicker)
                                }
                                className="flex-1 py-2 px-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 text-sm transition-colors flex items-center gap-2"
                            >
                                <span>🎨</span>
                                {showColorPicker
                                    ? "Hide Color Wheel"
                                    : "Color Wheel"}
                            </button>
                        </div>

                        {/* Color Wheel Picker */}
                        <AnimatePresence>
                            {showColorPicker && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden mb-3"
                                >
                                    <div className="p-4 bg-zinc-800 rounded-lg">
                                        {/* Large Saturation/Brightness Panel - Main picker */}
                                        <div
                                            ref={satBrightRef}
                                            className="relative w-full h-40 sm:h-48 rounded-lg cursor-crosshair touch-none mb-4"
                                            style={{
                                                background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue}, 100%, 50%))`,
                                            }}
                                            onMouseDown={handleSatBrightMouseDown}
                                            onTouchStart={handleSatBrightTouchStart}
                                        >
                                            {/* Saturation/Brightness indicator */}
                                            <div
                                                className="absolute w-5 h-5 border-2 border-white rounded-full pointer-events-none"
                                                style={{
                                                    left: `calc(${saturation}% - 10px)`,
                                                    top: `calc(${100 - brightness}% - 10px)`,
                                                    backgroundColor: customColor,
                                                    boxShadow: "0 0 0 2px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.3)",
                                                }}
                                            />
                                        </div>

                                        {/* Hue Slider Bar */}
                                        <div className="mb-4">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-zinc-400 w-8 shrink-0">Hue</span>
                                                <div
                                                    ref={colorWheelRef}
                                                    className="relative flex-1 h-6 rounded-lg cursor-crosshair touch-none"
                                                    style={{
                                                        background: "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
                                                    }}
                                                    onMouseDown={(e) => {
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                                                        setHue((x / rect.width) * 360);
                                                        setIsDraggingWheel(true);
                                                    }}
                                                    onTouchStart={(e) => {
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        const x = Math.max(0, Math.min(e.touches[0].clientX - rect.left, rect.width));
                                                        setHue((x / rect.width) * 360);
                                                        setIsDraggingWheel(true);
                                                    }}
                                                >
                                                    {/* Hue indicator */}
                                                    <div
                                                        className="absolute w-2 h-8 -top-1 border-2 border-white rounded-sm pointer-events-none"
                                                        style={{
                                                            left: `calc(${(hue / 360) * 100}% - 4px)`,
                                                            backgroundColor: `hsl(${hue}, 100%, 50%)`,
                                                            boxShadow: "0 0 0 1px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.3)",
                                                        }}
                                                    />
                                                </div>
                                                <span className="text-xs text-zinc-400 w-10 text-right shrink-0">{Math.round(hue)}°</span>
                                            </div>
                                        </div>

                                        {/* Saturation & Brightness Sliders */}
                                        <div className="space-y-3 mb-4">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-zinc-400 w-8 shrink-0">Sat</span>
                                                <div className="relative flex-1 h-4 rounded-lg cursor-pointer touch-none"
                                                    style={{
                                                        background: `linear-gradient(to right, hsl(${hue}, 0%, ${brightness / 2}%), hsl(${hue}, 100%, ${50 * brightness / 100}%))`,
                                                    }}
                                                    onMouseDown={(e) => {
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                                                        setSaturation(Math.round((x / rect.width) * 100));
                                                    }}
                                                    onTouchStart={(e) => {
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        const x = Math.max(0, Math.min(e.touches[0].clientX - rect.left, rect.width));
                                                        setSaturation(Math.round((x / rect.width) * 100));
                                                    }}
                                                >
                                                    <div
                                                        className="absolute w-3 h-6 -top-1 border-2 border-white rounded-sm pointer-events-none"
                                                        style={{
                                                            left: `calc(${saturation}% - 6px)`,
                                                            backgroundColor: `hsl(${hue}, ${saturation}%, ${50 * brightness / 100}%)`,
                                                            boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
                                                        }}
                                                    />
                                                </div>
                                                <span className="text-xs text-zinc-400 w-10 text-right shrink-0">{saturation}%</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-zinc-400 w-8 shrink-0">Brt</span>
                                                <div className="relative flex-1 h-4 rounded-lg cursor-pointer touch-none"
                                                    style={{
                                                        background: `linear-gradient(to right, #000, hsl(${hue}, ${saturation}%, 50%))`,
                                                    }}
                                                    onMouseDown={(e) => {
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                                                        setBrightness(Math.round((x / rect.width) * 100));
                                                    }}
                                                    onTouchStart={(e) => {
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        const x = Math.max(0, Math.min(e.touches[0].clientX - rect.left, rect.width));
                                                        setBrightness(Math.round((x / rect.width) * 100));
                                                    }}
                                                >
                                                    <div
                                                        className="absolute w-3 h-6 -top-1 border-2 border-white rounded-sm pointer-events-none"
                                                        style={{
                                                            left: `calc(${brightness}% - 6px)`,
                                                            backgroundColor: customColor,
                                                            boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
                                                        }}
                                                    />
                                                </div>
                                                <span className="text-xs text-zinc-400 w-10 text-right shrink-0">{brightness}%</span>
                                            </div>
                                        </div>

                                        {/* Color preview and hex input */}
                                        <div className="flex items-center gap-2">
                                            <div
                                                className="w-12 h-12 rounded-lg border-2 border-zinc-600 shrink-0"
                                                style={{ backgroundColor: customColor }}
                                            />
                                            <input
                                                type="text"
                                                value={customColor}
                                                onChange={(e) => {
                                                    const hex = e.target.value;
                                                    setCustomColor(hex);
                                                    const rgb = hexToRgb(hex);
                                                    if (rgb) {
                                                        const [h, s, v] = rgbToHsv(...rgb);
                                                        setHue(h);
                                                        setSaturation(Math.round(s * 100));
                                                        setBrightness(Math.round(v * 100));
                                                    }
                                                }}
                                                className="flex-1 bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2.5 text-white text-sm font-mono"
                                                placeholder="#ff0000"
                                            />
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Quick Colors */}
                        <div className="flex flex-wrap gap-1.5 mb-2 p-2 bg-zinc-800 rounded-lg">
                            {QUICK_COLORS.map((color, index) => (
                                <button
                                    key={index}
                                    onClick={() => setSelectedColor(color)}
                                    className={`w-7 h-7 rounded-lg transition-transform hover:scale-110 ${
                                        selectedColor === color
                                            ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-800"
                                            : ""
                                    }`}
                                    style={{ backgroundColor: color }}
                                    title={color}
                                />
                            ))}
                        </div>

                        {/* Full Color Palette */}
                        <div className="grid grid-cols-12 gap-0.5 mb-4 p-2 bg-zinc-800 rounded-lg max-h-40 overflow-y-auto">
                            {COLOR_PALETTE.map((color, index) => (
                                <button
                                    key={index}
                                    onClick={() => setSelectedColor(color)}
                                    className={`w-5 h-5 sm:w-6 sm:h-6 rounded transition-transform hover:scale-110 ${
                                        selectedColor === color
                                            ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-800"
                                            : ""
                                    }`}
                                    style={{ backgroundColor: color }}
                                    title={color}
                                />
                            ))}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3">
                            <button
                                onClick={handleClose}
                                className="py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            
                            {/* Share Button with Dropdown */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowShareMenu(!showShareMenu)}
                                    className="py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                    </svg>
                                    Share
                                </button>
                                
                                <AnimatePresence>
                                    {showShareMenu && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.95, y: 5 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95, y: 5 }}
                                            className="absolute bottom-full left-0 mb-2 w-56 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-20"
                                        >
                                            <div className="p-2 space-y-1">
                                                <button
                                                    onClick={shareToTwitter}
                                                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-3"
                                                >
                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                                    </svg>
                                                    Share on X
                                                </button>
                                                <button
                                                    onClick={shareToFacebook}
                                                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-3"
                                                >
                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                                    </svg>
                                                    Share on Facebook
                                                </button>
                                                <button
                                                    onClick={shareToLinkedIn}
                                                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-3"
                                                >
                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                                                    </svg>
                                                    Share on LinkedIn
                                                </button>
                                                <button
                                                    onClick={shareToReddit}
                                                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-3"
                                                >
                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
                                                    </svg>
                                                    Share on Reddit
                                                </button>
                                                <button
                                                    onClick={shareToTelegram}
                                                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-3"
                                                >
                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                                                    </svg>
                                                    Share on Telegram
                                                </button>
                                                <button
                                                    onClick={shareToWhatsApp}
                                                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-3"
                                                >
                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                                    </svg>
                                                    Share on WhatsApp
                                                </button>
                                                
                                                <div className="border-t border-zinc-700 my-2" />
                                                
                                                <button
                                                    onClick={downloadImage}
                                                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-3"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                    </svg>
                                                    Download Image
                                                </button>
                                                <button
                                                    onClick={copyLink}
                                                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-3"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                                    </svg>
                                                    {copied ? "Copied!" : "Copy Link"}
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                            
                            <button
                                onClick={handleSend}
                                disabled={isSending}
                                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FF5500] text-white font-medium transition-all hover:shadow-lg hover:shadow-[#FB8D22]/25 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSending ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg
                                            className="animate-spin h-4 w-4"
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
                                        Uploading...
                                    </span>
                                ) : (
                                    "Send Pixel Art"
                                )}
                            </button>
                        </div>

                        {/* Close Confirmation Dialog */}
                        <AnimatePresence>
                            {showCloseConfirm && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-2xl flex items-center justify-center z-10"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <motion.div
                                        initial={{ scale: 0.9, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0.9, opacity: 0 }}
                                        className="bg-zinc-800 border border-zinc-700 rounded-xl p-5 max-w-xs mx-4 text-center"
                                    >
                                        <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-3">
                                            <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                        </div>
                                        <h3 className="text-lg font-semibold text-white mb-2">
                                            Discard your art?
                                        </h3>
                                        <p className="text-sm text-zinc-400 mb-4">
                                            You have unsaved changes that will be lost if you close now.
                                        </p>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setShowCloseConfirm(false)}
                                                className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white font-medium transition-colors"
                                            >
                                                Keep Editing
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowCloseConfirm(false);
                                                    onClose();
                                                }}
                                                className="flex-1 py-2.5 px-4 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 font-medium transition-colors"
                                            >
                                                Discard
                                            </button>
                                        </div>
                                    </motion.div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}









