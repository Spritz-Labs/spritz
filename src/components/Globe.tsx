"use client";

import { useEffect, useRef, useState } from "react";
import createGlobe from "cobe";

export function Globe({
    className = "",
    size = 800,
}: {
    className?: string;
    size?: number;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isClient, setIsClient] = useState(false);
    const [actualSize, setActualSize] = useState(size);

    useEffect(() => {
        setIsClient(true);
        // Make globe responsive to screen size
        const updateSize = () => {
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;
            // On mobile, make globe fill more of the screen
            // Use the larger dimension to ensure visibility
            const isMobile = screenWidth < 768;
            const multiplier = isMobile ? 1.2 : 0.85;
            const minSize = isMobile ? 350 : 500;
            const maxSize = isMobile ? 600 : 900;
            const screenMin = Math.min(screenWidth, screenHeight);
            const newSize = Math.max(
                minSize,
                Math.min(maxSize, screenMin * multiplier)
            );
            setActualSize(newSize);
        };
        updateSize();
        window.addEventListener("resize", updateSize);
        return () => window.removeEventListener("resize", updateSize);
    }, []);

    useEffect(() => {
        if (!isClient || !canvasRef.current) return;

        let phi = 0;

        const globe = createGlobe(canvasRef.current, {
            devicePixelRatio: 2,
            width: actualSize * 2,
            height: actualSize * 2,
            phi: 0,
            theta: 0.3,
            dark: 1,
            diffuse: 3, // Increased diffuse lighting
            mapSamples: 16000,
            mapBrightness: 12, // Much brighter map for mobile visibility
            baseColor: [0.5, 0.5, 0.6], // Brighter base color
            markerColor: [255 / 255, 85 / 255, 0 / 255], // #FF5500 orange
            glowColor: [0.5, 0.3, 0.1], // Warm orange glow
            markers: [
                // Major tech hubs with connections
                { location: [37.7749, -122.4194], size: 0.12 }, // San Francisco
                { location: [40.7128, -74.006], size: 0.12 }, // New York
                { location: [51.5074, -0.1278], size: 0.1 }, // London
                { location: [35.6762, 139.6503], size: 0.1 }, // Tokyo
                { location: [1.3521, 103.8198], size: 0.08 }, // Singapore
                { location: [52.52, 13.405], size: 0.08 }, // Berlin
                { location: [-33.8688, 151.2093], size: 0.08 }, // Sydney
                { location: [48.8566, 2.3522], size: 0.08 }, // Paris
                { location: [55.7558, 37.6173], size: 0.07 }, // Moscow
                { location: [19.076, 72.8777], size: 0.09 }, // Mumbai
                { location: [22.3193, 114.1694], size: 0.09 }, // Hong Kong
                { location: [37.5665, 126.978], size: 0.08 }, // Seoul
                { location: [-23.5505, -46.6333], size: 0.08 }, // São Paulo
                { location: [25.2048, 55.2708], size: 0.07 }, // Dubai
                { location: [34.0522, -118.2437], size: 0.09 }, // Los Angeles
                { location: [47.6062, -122.3321], size: 0.07 }, // Seattle
                { location: [43.6532, -79.3832], size: 0.07 }, // Toronto
            ],
            onRender: (state) => {
                // Auto rotate
                state.phi = phi;
                phi += 0.004;
                state.width = actualSize * 2;
                state.height = actualSize * 2;
            },
        });

        return () => {
            globe.destroy();
        };
    }, [isClient, actualSize]);

    if (!isClient) {
        return (
            <div
                className={className}
                style={{ width: actualSize, height: actualSize }}
            />
        );
    }

    return (
        <canvas
            ref={canvasRef}
            className={className}
            style={{
                width: actualSize,
                height: actualSize,
                display: "block",
            }}
        />
    );
}




