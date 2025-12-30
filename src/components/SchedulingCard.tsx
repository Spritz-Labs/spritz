"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { SchedulingData } from "@/hooks/useAgents";

interface SchedulingCardProps {
    scheduling: SchedulingData;
    userAddress?: string;
    onBooked?: () => void;
}

export function SchedulingCard({ scheduling, userAddress, onBooked }: SchedulingCardProps) {
    const [step, setStep] = useState<"type" | "time" | "details" | "confirm" | "success">("type");
    const [meetingType, setMeetingType] = useState<"free" | "paid" | null>(null);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [selectedTime, setSelectedTime] = useState<string | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);
    const [guestName, setGuestName] = useState("");
    const [guestEmail, setGuestEmail] = useState("");
    const [notes, setNotes] = useState("");
    const [isBooking, setIsBooking] = useState(false);
    const [bookingError, setBookingError] = useState<string | null>(null);

    const dates = Object.keys(scheduling.slotsByDate);
    const duration = meetingType === "paid" ? scheduling.paidDuration : scheduling.freeDuration;
    const price = meetingType === "paid" ? (scheduling.priceCents / 100).toFixed(2) : "0";

    // Find the actual slot object from the time string
    const findSlotForTime = (date: string, time: string) => {
        // Parse the time to find a matching slot
        const dateSlots = scheduling.slots.filter(slot => {
            const slotDate = new Date(slot.start);
            const slotDateStr = slotDate.toLocaleDateString('en-US', { 
                weekday: 'long', month: 'long', day: 'numeric', 
                timeZone: scheduling.timezone 
            });
            return slotDateStr === date;
        });
        
        return dateSlots.find(slot => {
            const slotTime = new Date(slot.start).toLocaleTimeString('en-US', {
                hour: 'numeric', minute: '2-digit', hour12: true,
                timeZone: scheduling.timezone
            });
            return slotTime === time;
        });
    };

    const handleTimeSelect = (date: string, time: string) => {
        setSelectedDate(date);
        setSelectedTime(time);
        const slot = findSlotForTime(date, time);
        setSelectedSlot(slot || null);
        setStep("details");
    };

    const handleBook = async () => {
        if (!selectedSlot || !guestEmail) return;
        
        setIsBooking(true);
        setBookingError(null);

        try {
            const res = await fetch("/api/scheduling/schedule", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    recipientAddress: scheduling.ownerAddress,
                    scheduledAt: selectedSlot.start,
                    durationMinutes: duration,
                    isPaid: meetingType === "paid",
                    guestEmail,
                    guestName,
                    notes,
                    schedulerAddress: userAddress,
                    timezone: scheduling.timezone,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to book");
            }

            setStep("success");
            onBooked?.();
        } catch (err) {
            setBookingError(err instanceof Error ? err.message : "Failed to book");
        } finally {
            setIsBooking(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-xl p-4 mt-3"
        >
            <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">📅</span>
                <h4 className="font-semibold text-white">Schedule a Meeting</h4>
            </div>

            <AnimatePresence mode="wait">
                {/* Step 1: Choose meeting type */}
                {step === "type" && (
                    <motion.div
                        key="type"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="space-y-3"
                    >
                        <p className="text-sm text-zinc-400">What type of meeting would you like?</p>
                        <div className="grid grid-cols-2 gap-2">
                            {scheduling.freeEnabled && (
                                <button
                                    onClick={() => { setMeetingType("free"); setStep("time"); }}
                                    className="p-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-green-500/50 transition-all text-left"
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-green-400">✓</span>
                                        <span className="font-medium text-white">Free Call</span>
                                    </div>
                                    <p className="text-xs text-zinc-400">{scheduling.freeDuration} minutes</p>
                                </button>
                            )}
                            {scheduling.paidEnabled && (
                                <button
                                    onClick={() => { setMeetingType("paid"); setStep("time"); }}
                                    className="p-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-amber-500/50 transition-all text-left"
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-amber-400">⭐</span>
                                        <span className="font-medium text-white">Paid Session</span>
                                    </div>
                                    <p className="text-xs text-zinc-400">
                                        {scheduling.paidDuration} min • ${(scheduling.priceCents / 100).toFixed(2)}
                                    </p>
                                </button>
                            )}
                        </div>
                        {!scheduling.freeEnabled && !scheduling.paidEnabled && (
                            <p className="text-sm text-zinc-500">No meeting types available</p>
                        )}
                    </motion.div>
                )}

                {/* Step 2: Choose time */}
                {step === "time" && (
                    <motion.div
                        key="time"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="space-y-3"
                    >
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-zinc-400">
                                Select a time ({meetingType === "paid" ? "Paid" : "Free"} • {duration} min)
                            </p>
                            <button
                                onClick={() => setStep("type")}
                                className="text-xs text-zinc-500 hover:text-white"
                            >
                                ← Back
                            </button>
                        </div>
                        <p className="text-xs text-zinc-500">Times shown in {scheduling.timezone}</p>
                        
                        <div className="max-h-48 overflow-y-auto space-y-3 pr-1">
                            {dates.map(date => (
                                <div key={date}>
                                    <p className="text-xs font-medium text-zinc-300 mb-2">{date}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {scheduling.slotsByDate[date].map(time => (
                                            <button
                                                key={`${date}-${time}`}
                                                onClick={() => handleTimeSelect(date, time)}
                                                className="px-2.5 py-1.5 text-xs rounded-lg bg-zinc-800 hover:bg-blue-500/20 hover:border-blue-500/50 border border-zinc-700 text-zinc-300 hover:text-white transition-all"
                                            >
                                                {time}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* Step 3: Enter details */}
                {step === "details" && (
                    <motion.div
                        key="details"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="space-y-3"
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-white font-medium">{selectedDate}</p>
                                <p className="text-xs text-zinc-400">{selectedTime} • {duration} min</p>
                            </div>
                            <button
                                onClick={() => setStep("time")}
                                className="text-xs text-zinc-500 hover:text-white"
                            >
                                Change
                            </button>
                        </div>
                        
                        <div className="space-y-2">
                            <input
                                type="text"
                                placeholder="Your name"
                                value={guestName}
                                onChange={(e) => setGuestName(e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                            />
                            <input
                                type="email"
                                placeholder="Your email *"
                                value={guestEmail}
                                onChange={(e) => setGuestEmail(e.target.value)}
                                required
                                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                            />
                            <textarea
                                placeholder="Notes (optional)"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={2}
                                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 resize-none"
                            />
                        </div>

                        {meetingType === "paid" && (
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                                <span className="text-amber-400">💰</span>
                                <span className="text-sm text-amber-300">
                                    Payment of ${price} USDC required
                                </span>
                            </div>
                        )}

                        <button
                            onClick={() => setStep("confirm")}
                            disabled={!guestEmail}
                            className="w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-400 hover:to-purple-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-all"
                        >
                            {meetingType === "paid" ? `Continue to Payment` : "Review & Confirm"}
                        </button>
                    </motion.div>
                )}

                {/* Step 4: Confirm */}
                {step === "confirm" && (
                    <motion.div
                        key="confirm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="space-y-3"
                    >
                        <div className="p-3 rounded-lg bg-zinc-800/50 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-zinc-400">Date & Time</span>
                                <span className="text-white">{selectedDate}, {selectedTime}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-zinc-400">Duration</span>
                                <span className="text-white">{duration} minutes</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-zinc-400">Type</span>
                                <span className="text-white">{meetingType === "paid" ? "Paid Session" : "Free Call"}</span>
                            </div>
                            {meetingType === "paid" && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-zinc-400">Price</span>
                                    <span className="text-amber-400">${price} USDC</span>
                                </div>
                            )}
                            <div className="flex justify-between text-sm">
                                <span className="text-zinc-400">Email</span>
                                <span className="text-white truncate max-w-[150px]">{guestEmail}</span>
                            </div>
                        </div>

                        {bookingError && (
                            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                                {bookingError}
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button
                                onClick={() => setStep("details")}
                                className="flex-1 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-sm transition-all"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleBook}
                                disabled={isBooking}
                                className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 disabled:opacity-50 text-white font-medium text-sm transition-all flex items-center justify-center gap-2"
                            >
                                {isBooking ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Booking...
                                    </>
                                ) : (
                                    <>✓ Confirm Booking</>
                                )}
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* Step 5: Success */}
                {step === "success" && (
                    <motion.div
                        key="success"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center py-4"
                    >
                        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-500/20 flex items-center justify-center">
                            <span className="text-2xl">✅</span>
                        </div>
                        <h4 className="font-semibold text-white mb-1">Booking Confirmed!</h4>
                        <p className="text-sm text-zinc-400 mb-2">
                            {selectedDate} at {selectedTime}
                        </p>
                        <p className="text-xs text-zinc-500">
                            A confirmation email has been sent to {guestEmail}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

export default SchedulingCard;

