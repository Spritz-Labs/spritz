"use client";

import { useMemo } from "react";
import { BackgroundEffectType } from "./ProfileWidgetTypes";

interface BackgroundEffectsProps {
    effect: BackgroundEffectType;
    accentColor?: string;
}

// Generate random positions for particles
function generateParticles(count: number, seed: number = 0) {
    const particles = [];
    for (let i = 0; i < count; i++) {
        // Use deterministic "random" based on index for SSR consistency
        const pseudoRandom = (n: number) => {
            const x = Math.sin(seed + n * 9999) * 10000;
            return x - Math.floor(x);
        };
        
        particles.push({
            id: i,
            top: `${pseudoRandom(i * 3) * 100}%`,
            left: `${pseudoRandom(i * 3 + 1) * 100}%`,
            size: 0.5 + pseudoRandom(i * 3 + 2) * 1.5,
            delay: pseudoRandom(i * 3 + 3) * 5,
            duration: 2 + pseudoRandom(i * 3 + 4) * 3,
            opacity: 0.2 + pseudoRandom(i * 3 + 5) * 0.4,
        });
    }
    return particles;
}

export function BackgroundEffects({ effect, accentColor = "#ffffff" }: BackgroundEffectsProps) {
    // Memoize particle positions so they don't change on re-render
    const particles = useMemo(() => generateParticles(20, 42), []);
    const bubbles = useMemo(() => generateParticles(15, 123), []);
    const snowflakes = useMemo(() => generateParticles(25, 789), []);

    if (effect === "none" || !effect) {
        return null;
    }

    // Sparkles - twinkling particles that fade in/out
    if (effect === "sparkles") {
        return (
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                {particles.map((p) => (
                    <div
                        key={p.id}
                        className="absolute rounded-full animate-pulse"
                        style={{
                            top: p.top,
                            left: p.left,
                            width: `${p.size * 2}px`,
                            height: `${p.size * 2}px`,
                            backgroundColor: accentColor,
                            opacity: p.opacity,
                            animationDelay: `${p.delay}s`,
                            animationDuration: `${p.duration}s`,
                            boxShadow: `0 0 ${p.size * 4}px ${accentColor}`,
                        }}
                    />
                ))}
            </div>
        );
    }

    // Stars - small white/blue dots that twinkle
    if (effect === "stars") {
        return (
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                {particles.map((p) => (
                    <div
                        key={p.id}
                        className="absolute rounded-full animate-pulse"
                        style={{
                            top: p.top,
                            left: p.left,
                            width: `${p.size}px`,
                            height: `${p.size}px`,
                            backgroundColor: p.id % 3 === 0 ? "#93c5fd" : "#ffffff",
                            opacity: p.opacity * 0.8,
                            animationDelay: `${p.delay}s`,
                            animationDuration: `${p.duration}s`,
                        }}
                    />
                ))}
            </div>
        );
    }

    // Particles - floating orbs with glow
    if (effect === "particles") {
        return (
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <style jsx>{`
                    @keyframes float {
                        0%, 100% { transform: translateY(0) translateX(0); }
                        25% { transform: translateY(-20px) translateX(10px); }
                        50% { transform: translateY(-10px) translateX(-10px); }
                        75% { transform: translateY(-30px) translateX(5px); }
                    }
                `}</style>
                {particles.map((p) => (
                    <div
                        key={p.id}
                        className="absolute rounded-full"
                        style={{
                            top: p.top,
                            left: p.left,
                            width: `${p.size * 3}px`,
                            height: `${p.size * 3}px`,
                            backgroundColor: accentColor,
                            opacity: p.opacity * 0.5,
                            animation: `float ${p.duration * 2}s ease-in-out infinite`,
                            animationDelay: `${p.delay}s`,
                            filter: `blur(${p.size}px)`,
                        }}
                    />
                ))}
            </div>
        );
    }

    // Bubbles - rising circles
    if (effect === "bubbles") {
        return (
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <style jsx>{`
                    @keyframes rise {
                        0% { transform: translateY(100vh) translateX(0) scale(0); opacity: 0; }
                        10% { opacity: 0.6; scale: 1; }
                        90% { opacity: 0.4; }
                        100% { transform: translateY(-100px) translateX(20px) scale(1.2); opacity: 0; }
                    }
                `}</style>
                {bubbles.map((p) => (
                    <div
                        key={p.id}
                        className="absolute rounded-full border"
                        style={{
                            left: p.left,
                            bottom: 0,
                            width: `${p.size * 8}px`,
                            height: `${p.size * 8}px`,
                            borderColor: `${accentColor}40`,
                            backgroundColor: `${accentColor}10`,
                            animation: `rise ${8 + p.duration * 2}s ease-in-out infinite`,
                            animationDelay: `${p.delay}s`,
                        }}
                    />
                ))}
            </div>
        );
    }

    // Snow - falling particles
    if (effect === "snow") {
        return (
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <style jsx>{`
                    @keyframes fall {
                        0% { transform: translateY(-20px) translateX(0) rotate(0deg); opacity: 0; }
                        10% { opacity: 0.8; }
                        90% { opacity: 0.6; }
                        100% { transform: translateY(100vh) translateX(30px) rotate(360deg); opacity: 0; }
                    }
                `}</style>
                {snowflakes.map((p) => (
                    <div
                        key={p.id}
                        className="absolute rounded-full"
                        style={{
                            top: 0,
                            left: p.left,
                            width: `${p.size * 2}px`,
                            height: `${p.size * 2}px`,
                            backgroundColor: "#ffffff",
                            opacity: p.opacity,
                            animation: `fall ${6 + p.duration * 2}s linear infinite`,
                            animationDelay: `${p.delay}s`,
                            boxShadow: "0 0 4px rgba(255,255,255,0.5)",
                        }}
                    />
                ))}
            </div>
        );
    }

    return null;
}
