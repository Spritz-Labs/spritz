"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

const CANVAS_SIZE = 32;
const PIXEL_SIZE = 10; // Display size of each pixel

// Extended color palette with lots of options
const COLOR_PALETTE = [
    // Row 1 - Grayscale
    "#000000",
    "#1a1a1a",
    "#333333",
    "#4d4d4d",
    "#666666",
    "#808080",
    "#999999",
    "#b3b3b3",
    "#cccccc",
    "#e6e6e6",
    "#ffffff",
    // Row 2 - Reds
    "#330000",
    "#660000",
    "#990000",
    "#cc0000",
    "#ff0000",
    "#ff3333",
    "#ff6666",
    "#ff9999",
    "#ffcccc",
    // Row 3 - Oranges
    "#331a00",
    "#663300",
    "#994d00",
    "#cc6600",
    "#ff8000",
    "#ff9933",
    "#ffb366",
    "#ffcc99",
    "#ffe6cc",
    // Row 4 - Yellows
    "#333300",
    "#666600",
    "#999900",
    "#cccc00",
    "#ffff00",
    "#ffff33",
    "#ffff66",
    "#ffff99",
    "#ffffcc",
    // Row 5 - Lime/Yellow-Greens
    "#1a3300",
    "#336600",
    "#4d9900",
    "#66cc00",
    "#80ff00",
    "#99ff33",
    "#b3ff66",
    "#ccff99",
    "#e6ffcc",
    // Row 6 - Greens
    "#003300",
    "#006600",
    "#009900",
    "#00cc00",
    "#00ff00",
    "#33ff33",
    "#66ff66",
    "#99ff99",
    "#ccffcc",
    // Row 7 - Teals
    "#003333",
    "#006666",
    "#009999",
    "#00cccc",
    "#00ffff",
    "#33ffff",
    "#66ffff",
    "#99ffff",
    "#ccffff",
    // Row 8 - Blues
    "#000033",
    "#000066",
    "#000099",
    "#0000cc",
    "#0000ff",
    "#3333ff",
    "#6666ff",
    "#9999ff",
    "#ccccff",
    // Row 9 - Purples
    "#1a0033",
    "#330066",
    "#4d0099",
    "#6600cc",
    "#8000ff",
    "#9933ff",
    "#b366ff",
    "#cc99ff",
    "#e6ccff",
    // Row 10 - Magentas
    "#330033",
    "#660066",
    "#990099",
    "#cc00cc",
    "#ff00ff",
    "#ff33ff",
    "#ff66ff",
    "#ff99ff",
    "#ffccff",
    // Row 11 - Pinks
    "#330019",
    "#660033",
    "#99004d",
    "#cc0066",
    "#ff0080",
    "#ff3399",
    "#ff66b3",
    "#ff99cc",
    "#ffcce6",
    // Row 12 - Browns & Earth tones
    "#1a0f00",
    "#332200",
    "#4d3300",
    "#664400",
    "#805500",
    "#996633",
    "#b38d4d",
    "#ccb366",
    "#e6d9b3",
    // Row 13 - Skin tones
    "#8d5524",
    "#c68642",
    "#e0ac69",
    "#f1c27d",
    "#ffdbac",
    "#ffe0bd",
    "#ffecd1",
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
    const [isDrawing, setIsDrawing] = useState(false);
    const [tool, setTool] = useState<"draw" | "erase" | "fill">("draw");
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [customColor, setCustomColor] = useState("#ff0000");

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
                setIsDrawing(true);
                handleDraw(coords.x, coords.y);
            }
        },
        [getPixelCoords, handleDraw]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent) => {
            if (!isDrawing || tool === "fill") return;
            const coords = getPixelCoords(e);
            if (coords) {
                handleDraw(coords.x, coords.y);
            }
        },
        [isDrawing, tool, getPixelCoords, handleDraw]
    );

    const handleMouseUp = useCallback(() => {
        setIsDrawing(false);
    }, []);

    const handleTouchStart = useCallback(
        (e: React.TouchEvent) => {
            e.preventDefault();
            const coords = getPixelCoords(e);
            if (coords) {
                setIsDrawing(true);
                handleDraw(coords.x, coords.y);
            }
        },
        [getPixelCoords, handleDraw]
    );

    const handleTouchMove = useCallback(
        (e: React.TouchEvent) => {
            e.preventDefault();
            if (!isDrawing || tool === "fill") return;
            const coords = getPixelCoords(e);
            if (coords) {
                handleDraw(coords.x, coords.y);
            }
        },
        [isDrawing, tool, getPixelCoords, handleDraw]
    );

    // Clear canvas
    const handleClear = () => {
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

    // Close on escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        if (isOpen) {
            document.addEventListener("keydown", handleEscape);
        }
        return () => document.removeEventListener("keydown", handleEscape);
    }, [isOpen, onClose]);

    // Reset canvas when opening
    useEffect(() => {
        if (isOpen) {
            setPixels(
                Array(CANVAS_SIZE)
                    .fill(null)
                    .map(() => Array(CANVAS_SIZE).fill("#ffffff"))
            );
            setTool("draw");
        }
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    onClick={onClose}
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
                                onClick={onClose}
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
                                className="border-2 border-zinc-700 rounded-lg overflow-hidden"
                                style={{ touchAction: "none" }}
                            >
                                <canvas
                                    ref={canvasRef}
                                    width={CANVAS_SIZE * PIXEL_SIZE}
                                    height={CANVAS_SIZE * PIXEL_SIZE}
                                    className="cursor-crosshair"
                                    style={{
                                        width: "100%",
                                        maxWidth: CANVAS_SIZE * PIXEL_SIZE,
                                        imageRendering: "pixelated",
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

                        {/* Current Color & Custom Color Picker */}
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
                                    ? "Hide Custom Color"
                                    : "Custom Color"}
                            </button>
                        </div>

                        {/* Custom Color Picker */}
                        <AnimatePresence>
                            {showColorPicker && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden mb-3"
                                >
                                    <div className="flex items-center gap-2 p-3 bg-zinc-800 rounded-lg">
                                        <input
                                            type="color"
                                            value={customColor}
                                            onChange={(e) =>
                                                setCustomColor(e.target.value)
                                            }
                                            className="w-10 h-10 rounded cursor-pointer border-0"
                                        />
                                        <input
                                            type="text"
                                            value={customColor}
                                            onChange={(e) =>
                                                setCustomColor(e.target.value)
                                            }
                                            className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-white text-sm font-mono"
                                            placeholder="#ff0000"
                                        />
                                        <button
                                            onClick={() =>
                                                setSelectedColor(customColor)
                                            }
                                            className="px-3 py-1.5 bg-[#FF5500] hover:bg-[#FB8D22] text-white text-sm rounded transition-colors"
                                        >
                                            Use
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Color Palette */}
                        <div className="grid grid-cols-11 gap-1 mb-4 p-2 bg-zinc-800 rounded-lg max-h-32 overflow-y-auto">
                            {COLOR_PALETTE.map((color, index) => (
                                <button
                                    key={index}
                                    onClick={() => setSelectedColor(color)}
                                    className={`w-6 h-6 rounded transition-transform hover:scale-110 ${
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
                                onClick={onClose}
                                className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors"
                            >
                                Cancel
                            </button>
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
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}








