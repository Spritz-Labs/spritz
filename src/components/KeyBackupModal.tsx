"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  generateRecoveryPhrase,
  deriveKeyFromPhraseAndPin,
  encryptWithDerivedKey,
  decryptWithDerivedKey,
  getVerificationIndices,
  verifyWords,
  validatePin,
  validatePhrase,
  isBackupEnabled,
  setBackupEnabled,
  storeSalt,
  getStoredSalt,
  getWordAtIndex,
} from "@/lib/keyRecovery";
import { supabase } from "@/config/supabase";

// Helper to shuffle an array (Fisher-Yates)
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

type KeyBackupModalProps = {
  isOpen: boolean;
  onClose: () => void;
  userAddress: string | null;
  onKeyRestored?: () => void;
};

type Step = "choice" | "pin" | "phrase" | "verify" | "complete" | "restore";

const MESSAGING_KEYPAIR_STORAGE = "waku_messaging_keypair";

export function KeyBackupModal({ isOpen, onClose, userAddress, onKeyRestored }: KeyBackupModalProps) {
  const [step, setStep] = useState<Step>("choice");
  const [backupEnabled, setBackupEnabledState] = useState(false);
  
  // PIN state
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  
  // Phrase state
  const [phrase, setPhrase] = useState("");
  const [phraseCopied, setPhraseCopied] = useState(false);
  
  // Verification state
  const [verifyIndices, setVerifyIndices] = useState<number[]>([]);
  const [verifyInputs, setVerifyInputs] = useState<string[]>(["", "", ""]);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [currentVerifyIndex, setCurrentVerifyIndex] = useState(0); // Track which word we're verifying (0, 1, or 2)
  
  // Get shuffled words for the word picker
  const shuffledWords = useMemo(() => {
    if (!phrase) return [];
    return shuffleArray(phrase.split(" "));
  }, [phrase]);
  
  // Restore state
  const [restorePhrase, setRestorePhrase] = useState("");
  const [restorePin, setRestorePin] = useState("");
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  
  // Loading
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setBackupEnabledState(isBackupEnabled());
      setStep("choice");
      resetState();
    }
  }, [isOpen]);

  const resetState = () => {
    setPin("");
    setConfirmPin("");
    setPinError(null);
    setPhrase("");
    setPhraseCopied(false);
    setVerifyIndices([]);
    setVerifyInputs(["", "", ""]);
    setVerifyError(null);
    setCurrentVerifyIndex(0);
    setRestorePhrase("");
    setRestorePin("");
    setRestoreError(null);
    setRestoreSuccess(false);
    setLoading(false);
  };

  // Step 1: Create PIN
  const handleCreatePin = () => {
    setPinError(null);
    
    if (!validatePin(pin)) {
      setPinError("PIN must be exactly 6 digits");
      return;
    }
    
    if (pin !== confirmPin) {
      setPinError("PINs do not match");
      return;
    }
    
    // Generate phrase and move to next step
    const newPhrase = generateRecoveryPhrase();
    setPhrase(newPhrase);
    setStep("phrase");
  };

  // Step 2: User viewed phrase, generate verification
  const handlePhraseConfirmed = () => {
    const indices = getVerificationIndices();
    setVerifyIndices(indices);
    setVerifyInputs(["", "", ""]);
    setCurrentVerifyIndex(0);
    setStep("verify");
  };
  
  // Handle word selection in verification
  const handleWordSelect = (word: string) => {
    const newInputs = [...verifyInputs];
    newInputs[currentVerifyIndex] = word;
    setVerifyInputs(newInputs);
    setVerifyError(null);
    
    // Check if this word is correct
    const correctWord = getWordAtIndex(phrase, verifyIndices[currentVerifyIndex]);
    if (word.toLowerCase() !== correctWord.toLowerCase()) {
      setVerifyError("Incorrect word. Please try again.");
      // Clear the selection after a brief delay
      setTimeout(() => {
        const clearedInputs = [...newInputs];
        clearedInputs[currentVerifyIndex] = "";
        setVerifyInputs(clearedInputs);
      }, 800);
      return;
    }
    
    // Move to next word or finish
    if (currentVerifyIndex < 2) {
      setTimeout(() => {
        setCurrentVerifyIndex(currentVerifyIndex + 1);
      }, 300);
    }
  };

  // Generate a new messaging keypair if one doesn't exist
  const ensureKeypairExists = async (): Promise<string> => {
    let keypairJson = localStorage.getItem(MESSAGING_KEYPAIR_STORAGE);
    
    if (!keypairJson) {
      if (!userAddress) {
        throw new Error("Not connected - please try again");
      }
      
      // Generate new ECDH keypair using P-256 curve
      const keyPair = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveBits"]
      );
      
      // Export keys for storage
      const publicKeyBuffer = await crypto.subtle.exportKey("raw", keyPair.publicKey);
      const privateKeyBuffer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
      
      const keypair = {
        publicKey: btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer))),
        privateKey: btoa(String.fromCharCode(...new Uint8Array(privateKeyBuffer))),
      };
      
      // Store locally
      keypairJson = JSON.stringify(keypair);
      localStorage.setItem(MESSAGING_KEYPAIR_STORAGE, keypairJson);
      
      // Also upload public key to Supabase for ECDH key exchange
      if (supabase) {
        try {
          await supabase
            .from("shout_user_settings")
            .upsert({
              wallet_address: userAddress.toLowerCase(),
              messaging_public_key: keypair.publicKey,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: "wallet_address",
            });
          console.log("[KeyBackup] Public key uploaded to Supabase");
        } catch (err) {
          console.warn("[KeyBackup] Failed to upload public key:", err);
          // Continue anyway - local backup still works
        }
      }
      
      console.log("[KeyBackup] Generated new messaging keypair for backup");
    }
    
    return keypairJson;
  };

  // Step 3: Verify words
  const handleVerify = async () => {
    setVerifyError(null);
    
    if (!verifyWords(phrase, verifyIndices, verifyInputs)) {
      setVerifyError("Words do not match. Please check your recovery phrase.");
      return;
    }
    
    setLoading(true);
    
    try {
      // Derive encryption key from phrase + PIN
      const derived = await deriveKeyFromPhraseAndPin(phrase, pin);
      if (!derived) {
        throw new Error("Failed to derive key");
      }
      
      // Store the salt
      storeSalt(derived.salt);
      
      // Get or create the ECDH keypair
      const keypairJson = await ensureKeypairExists();
      
      // Encrypt the keypair
      const keypairBytes = new TextEncoder().encode(keypairJson);
      const encrypted = await encryptWithDerivedKey(keypairBytes, derived.key);
      
      // Upload to Supabase
      if (supabase && userAddress) {
        const saltBase64 = btoa(String.fromCharCode(...derived.salt));
        
        await supabase
          .from("shout_user_settings")
          .upsert({
            wallet_address: userAddress.toLowerCase(),
            messaging_backup_encrypted: encrypted,
            messaging_backup_salt: saltBase64,
            messaging_backup_enabled: true,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: "wallet_address",
          });
      }
      
      setBackupEnabled(true);
      setBackupEnabledState(true);
      setStep("complete");
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setLoading(false);
    }
  };

  // Restore from phrase + PIN
  const handleRestore = async () => {
    setRestoreError(null);
    setLoading(true);
    
    try {
      // Validate inputs
      const phraseValidation = validatePhrase(restorePhrase);
      if (!phraseValidation.valid) {
        throw new Error(phraseValidation.error);
      }
      
      if (!validatePin(restorePin)) {
        throw new Error("PIN must be exactly 6 digits");
      }
      
      // Fetch encrypted backup from Supabase
      if (!supabase || !userAddress) {
        throw new Error("Not connected");
      }
      
      const { data, error } = await supabase
        .from("shout_user_settings")
        .select("messaging_backup_encrypted, messaging_backup_salt")
        .eq("wallet_address", userAddress.toLowerCase())
        .single();
      
      if (error || !data?.messaging_backup_encrypted || !data?.messaging_backup_salt) {
        throw new Error("No backup found for this account");
      }
      
      // Get salt
      const salt = Uint8Array.from(atob(data.messaging_backup_salt), c => c.charCodeAt(0));
      
      // Derive key
      const derived = await deriveKeyFromPhraseAndPin(restorePhrase, restorePin, salt);
      if (!derived) {
        throw new Error("Failed to derive key");
      }
      
      // Decrypt
      const decrypted = await decryptWithDerivedKey(data.messaging_backup_encrypted, derived.key);
      if (!decrypted) {
        throw new Error("Decryption failed. Check your recovery phrase and PIN.");
      }
      
      // Parse and store keypair
      const keypairJson = new TextDecoder().decode(decrypted);
      JSON.parse(keypairJson); // Validate JSON
      localStorage.setItem(MESSAGING_KEYPAIR_STORAGE, keypairJson);
      
      // Store salt for future use
      storeSalt(salt);
      setBackupEnabled(true);
      setBackupEnabledState(true);
      
      setRestoreSuccess(true);
      onKeyRestored?.();
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setLoading(false);
    }
  };

  // Disable backup
  const handleDisableBackup = async () => {
    setLoading(true);
    try {
      if (supabase && userAddress) {
        await supabase
          .from("shout_user_settings")
          .update({
            messaging_backup_encrypted: null,
            messaging_backup_salt: null,
            messaging_backup_enabled: false,
            updated_at: new Date().toISOString(),
          })
          .eq("wallet_address", userAddress.toLowerCase());
      }
      
      setBackupEnabled(false);
      setBackupEnabledState(false);
      localStorage.removeItem("spritz_backup_salt");
      localStorage.removeItem("spritz_backup_enabled");
    } catch (err) {
      console.error("Failed to disable backup:", err);
    } finally {
      setLoading(false);
    }
  };

  const copyPhrase = async () => {
    await navigator.clipboard.writeText(phrase);
    setPhraseCopied(true);
    setTimeout(() => setPhraseCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-zinc-900 rounded-2xl w-full max-w-md border border-zinc-800 overflow-hidden max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              {step === "choice" && "Message Encryption Backup"}
              {step === "pin" && "Create PIN"}
              {step === "phrase" && "Recovery Phrase"}
              {step === "verify" && "Verify Phrase"}
              {step === "complete" && "Backup Complete"}
              {step === "restore" && "Restore Backup"}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-lg">
              <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-4">
            {/* Choice Step */}
            {step === "choice" && (
              <div className="space-y-4">
                <p className="text-zinc-400 text-sm">
                  Choose how to manage your message encryption keys. Keys are stored locally by default for maximum security.
                </p>

                {backupEnabled ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <span className="text-emerald-400 font-medium">Backup Enabled</span>
                    </div>
                    <p className="text-zinc-400 text-sm">
                      Your keys are backed up and can be restored on new devices.
                    </p>
                    <button
                      onClick={handleDisableBackup}
                      disabled={loading}
                      className="mt-3 text-sm text-red-400 hover:text-red-300"
                    >
                      Disable Backup
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setStep("pin")}
                      className="w-full p-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-left transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                          <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-white font-medium">Enable Cloud Backup</p>
                          <p className="text-zinc-500 text-sm">Restore on new devices with phrase + PIN</p>
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() => setStep("restore")}
                      className="w-full p-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-left transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                          <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-white font-medium">Restore from Backup</p>
                          <p className="text-zinc-500 text-sm">Enter recovery phrase + PIN</p>
                        </div>
                      </div>
                    </button>
                  </>
                )}

                <div className="bg-zinc-800/50 rounded-lg p-3 mt-4">
                  <p className="text-zinc-500 text-xs">
                    <strong className="text-zinc-400">Local Only Mode:</strong> Without backup, your encryption keys exist only on this device. If you lose access, messages cannot be recovered.
                  </p>
                </div>
              </div>
            )}

            {/* PIN Step */}
            {step === "pin" && (
              <div className="space-y-4">
                <p className="text-zinc-400 text-sm">
                  Create a 6-digit PIN to protect your backup. You&apos;ll need this PIN along with your recovery phrase to restore.
                </p>

                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Enter PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-white text-center text-2xl tracking-widest font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Confirm PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-white text-center text-2xl tracking-widest font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>

                {pinError && (
                  <p className="text-red-400 text-sm">{pinError}</p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep("choice")}
                    className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleCreatePin}
                    disabled={pin.length !== 6 || confirmPin.length !== 6}
                    className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition-colors"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* Phrase Step */}
            {step === "phrase" && (
              <div className="space-y-4">
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                  <p className="text-amber-400 text-sm">
                    <strong>Write these words down!</strong> You&apos;ll need them to restore your messages. Never share them with anyone.
                  </p>
                </div>

                <div className="bg-zinc-800 rounded-xl p-4">
                  <div className="grid grid-cols-3 gap-2">
                    {phrase.split(" ").map((word, i) => (
                      <div key={i} className="flex items-center gap-2 bg-zinc-700/50 rounded-lg p-2">
                        <span className="text-zinc-500 text-xs w-4">{i + 1}.</span>
                        <span className="text-white font-mono text-sm">{word}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={copyPhrase}
                  className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {phraseCopied ? (
                    <>
                      <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy to Clipboard
                    </>
                  )}
                </button>

                <button
                  onClick={handlePhraseConfirmed}
                  className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition-colors"
                >
                  I&apos;ve Written It Down
                </button>
              </div>
            )}

            {/* Verify Step */}
            {step === "verify" && (
              <div className="space-y-4">
                <p className="text-zinc-400 text-sm">
                  Tap the correct words from your recovery phrase to verify you&apos;ve saved it.
                </p>

                {/* Progress indicator */}
                <div className="flex items-center justify-center gap-2">
                  {verifyIndices.map((idx, i) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                          verifyInputs[i]
                            ? "bg-green-500 text-white"
                            : i === currentVerifyIndex
                            ? "bg-orange-500 text-white"
                            : "bg-zinc-700 text-zinc-400"
                        }`}
                      >
                        {verifyInputs[i] ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          i + 1
                        )}
                      </div>
                      {i < 2 && (
                        <div className={`w-8 h-0.5 ${verifyInputs[i] ? "bg-green-500" : "bg-zinc-700"}`} />
                      )}
                    </div>
                  ))}
                </div>

                {/* Current word to select */}
                <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                  <p className="text-zinc-500 text-sm mb-1">Select word</p>
                  <p className="text-white text-2xl font-bold">#{verifyIndices[currentVerifyIndex]}</p>
                  {verifyInputs[currentVerifyIndex] && (
                    <p className="text-green-400 text-sm mt-1 font-medium">
                      ✓ {verifyInputs[currentVerifyIndex]}
                    </p>
                  )}
                </div>

                {/* Word grid - tap to select */}
                <div className="grid grid-cols-3 gap-2">
                  {shuffledWords.map((word, i) => {
                    const isSelected = verifyInputs.includes(word);
                    const isCurrentSelection = verifyInputs[currentVerifyIndex] === word;
                    return (
                      <button
                        key={`${word}-${i}`}
                        onClick={() => !isSelected && handleWordSelect(word)}
                        disabled={isSelected && !isCurrentSelection}
                        className={`py-3 px-2 rounded-xl text-sm font-medium transition-all ${
                          isCurrentSelection
                            ? "bg-green-500 text-white"
                            : isSelected
                            ? "bg-zinc-700/50 text-zinc-500 cursor-not-allowed"
                            : "bg-zinc-800 hover:bg-zinc-700 text-white active:scale-95"
                        }`}
                      >
                        {word}
                      </button>
                    );
                  })}
                </div>

                {verifyError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-500/10 border border-red-500/20 rounded-lg p-3"
                  >
                    <p className="text-red-400 text-sm text-center">{verifyError}</p>
                  </motion.div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep("phrase")}
                    className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleVerify}
                    disabled={loading || verifyInputs.some(v => !v.trim())}
                    className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition-colors"
                  >
                    {loading ? "Saving..." : "Complete Backup"}
                  </button>
                </div>
              </div>
            )}

            {/* Complete Step */}
            {step === "complete" && (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-white font-semibold text-lg mb-2">Backup Complete!</h3>
                <p className="text-zinc-400 text-sm mb-6">
                  Your encryption keys are now backed up. You can restore them on any device using your recovery phrase and PIN.
                </p>
                <button
                  onClick={onClose}
                  className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition-colors"
                >
                  Done
                </button>
              </div>
            )}

            {/* Restore Step */}
            {step === "restore" && (
              <div className="space-y-4">
                {restoreSuccess ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                      <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-white font-semibold text-lg mb-2">Restore Complete!</h3>
                    <p className="text-zinc-400 text-sm mb-6">
                      Your encryption keys have been restored.
                    </p>
                    <button
                      onClick={() => window.location.reload()}
                      className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition-colors"
                    >
                      Reload App
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-zinc-400 text-sm">
                      Enter your 12-word recovery phrase and 6-digit PIN to restore your encryption keys.
                    </p>

                    <div>
                      <label className="block text-sm text-zinc-400 mb-2">Recovery Phrase</label>
                      <textarea
                        value={restorePhrase}
                        onChange={(e) => setRestorePhrase(e.target.value)}
                        placeholder="Enter your 12-word recovery phrase..."
                        rows={3}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-white text-sm focus:outline-none focus:border-orange-500 resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-zinc-400 mb-2">PIN</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={restorePin}
                        onChange={(e) => setRestorePin(e.target.value.replace(/\D/g, ""))}
                        placeholder="000000"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-white text-center text-2xl tracking-widest font-mono focus:outline-none focus:border-orange-500"
                      />
                    </div>

                    {restoreError && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                        <p className="text-red-400 text-sm">{restoreError}</p>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => setStep("choice")}
                        className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleRestore}
                        disabled={loading || !restorePhrase.trim() || restorePin.length !== 6}
                        className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition-colors"
                      >
                        {loading ? "Restoring..." : "Restore"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
