"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { type Address } from "viem";
import { usePhoneVerification } from "@/hooks/usePhoneVerification";

type PhoneVerificationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  userAddress: Address;
  onSuccess: (phoneNumber: string) => void;
};

export function PhoneVerificationModal({
  isOpen,
  onClose,
  userAddress,
  onSuccess,
}: PhoneVerificationModalProps) {
  const [phoneInput, setPhoneInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const codeInputRef = useRef<HTMLInputElement>(null);

  const {
    phoneNumber,
    isVerified,
    state,
    error,
    codeExpiresAt,
    sendCode,
    verifyCode,
    reset,
    clearError,
  } = usePhoneVerification(userAddress);

  // Focus code input when code is sent
  useEffect(() => {
    if (state === "sent" && codeInputRef.current) {
      codeInputRef.current.focus();
    }
  }, [state]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (!isVerified) {
        reset();
      }
      setCodeInput("");
      clearError();
    }
  }, [isOpen, isVerified, reset, clearError]);

  // If already verified, show success
  useEffect(() => {
    if (isVerified && phoneNumber) {
      onSuccess(phoneNumber);
    }
  }, [isVerified, phoneNumber, onSuccess]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneInput || state === "sending") return;
    await sendCode(phoneInput);
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeInput || codeInput.length !== 6 || state === "verifying") return;
    const success = await verifyCode(codeInput);
    if (success) {
      onSuccess(phoneInput);
      setTimeout(onClose, 1500); // Close after showing success
    }
  };

  const formatPhone = (value: string) => {
    // Simple US phone formatting
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setPhoneInput(formatted);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCodeInput(value);
  };

  const getTimeRemaining = () => {
    if (!codeExpiresAt) return null;
    const diff = codeExpiresAt.getTime() - Date.now();
    if (diff <= 0) return "expired";
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md z-50"
          >
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-white">
                    {isVerified ? "Phone Verified" : "Verify Phone Number"}
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Already verified state */}
              {isVerified && (
                <div className="text-center py-6">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-lg text-white font-medium mb-2">Phone Number Verified</p>
                  <p className="text-zinc-400">{phoneNumber}</p>
                </div>
              )}

              {/* Phone input form */}
              {!isVerified && state !== "sent" && state !== "verifying" && state !== "verified" && (
                <form onSubmit={handleSendCode} className="space-y-4">
                  <p className="text-zinc-400 text-sm">
                    Verify your phone number to let friends find you. We&apos;ll send a 6-digit code via SMS.
                  </p>

                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={phoneInput}
                      onChange={handlePhoneChange}
                      placeholder="(555) 555-5555"
                      className="w-full py-3 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all text-lg tracking-wide"
                      autoFocus
                    />
                  </div>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-red-500/10 border border-red-500/30 rounded-xl p-3"
                      >
                        <p className="text-red-400 text-sm">{error}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    type="submit"
                    disabled={!phoneInput || phoneInput.replace(/\D/g, "").length < 10 || state === "sending"}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium transition-all hover:shadow-lg hover:shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {state === "sending" ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Sending...
                      </span>
                    ) : (
                      "Send Verification Code"
                    )}
                  </button>
                </form>
              )}

              {/* Code input form */}
              {!isVerified && (state === "sent" || state === "verifying") && (
                <form onSubmit={handleVerifyCode} className="space-y-4">
                  <p className="text-zinc-400 text-sm">
                    We sent a 6-digit code to <span className="text-white font-medium">{phoneInput}</span>
                  </p>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-zinc-400">
                        Verification Code
                      </label>
                      {codeExpiresAt && (
                        <span className="text-xs text-zinc-500">
                          Expires in {getTimeRemaining()}
                        </span>
                      )}
                    </div>
                    <input
                      ref={codeInputRef}
                      type="text"
                      inputMode="numeric"
                      value={codeInput}
                      onChange={handleCodeChange}
                      placeholder="000000"
                      className="w-full py-4 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all text-2xl tracking-[0.5em] text-center font-mono"
                      maxLength={6}
                    />
                  </div>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-red-500/10 border border-red-500/30 rounded-xl p-3"
                      >
                        <p className="text-red-400 text-sm">{error}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={reset}
                      className="flex-1 py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors"
                    >
                      Change Number
                    </button>
                    <button
                      type="submit"
                      disabled={codeInput.length !== 6 || state === "verifying"}
                      className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium transition-all hover:shadow-lg hover:shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {state === "verifying" ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Verifying...
                        </span>
                      ) : (
                        "Verify"
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => sendCode(phoneInput)}
                    className="w-full py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
                  >
                    Didn&apos;t receive the code? Send again
                  </button>
                </form>
              )}

              {/* Success state */}
              {state === "verified" && !isVerified && (
                <div className="text-center py-6">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-lg text-white font-medium">Verified!</p>
                  <p className="text-zinc-400 text-sm mt-1">Your phone number has been verified.</p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

