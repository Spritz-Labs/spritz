"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useWalletClient } from "wagmi";
import {
  clearCachedKey,
  getOrDeriveMessagingKey,
  type AuthType,
} from "@/lib/messagingKey";

// Storage keys
const MESSAGING_KEYPAIR_STORAGE = "waku_messaging_keypair";
const MESSAGING_KEY_SOURCE_STORAGE = "spritz_messaging_key_source";
const UPGRADE_DISMISSED_KEY = "spritz_mek_upgrade_dismissed";

interface MessagingKeyUpgradeBannerProps {
  userAddress: string | null;
  authType: AuthType | null;
  /** Called when the modal is dismissed (either upgraded or later) */
  onDismiss?: () => void;
  /** Called when no upgrade is needed (so downstream modals can proceed) */
  onNotNeeded?: () => void;
}

/**
 * Checks whether a wallet user has a legacy messaging key that needs upgrading.
 * Returns true if upgrade is needed.
 */
export function checkNeedsKeyUpgrade(
  userAddress: string | null,
  authType: AuthType | null,
): boolean {
  if (!userAddress || typeof window === "undefined") return false;
  if (authType !== "wallet") return false;

  // Check if user already dismissed
  const dismissed = localStorage.getItem(UPGRADE_DISMISSED_KEY);
  if (dismissed === userAddress.toLowerCase()) return false;

  // Check for existing keypair and its source
  const storedJson = localStorage.getItem(MESSAGING_KEYPAIR_STORAGE);
  const storedSource = localStorage.getItem(MESSAGING_KEY_SOURCE_STORAGE);

  if (storedJson) {
    try {
      const stored = JSON.parse(storedJson);
      if (stored.publicKey && stored.privateKey) {
        const isLegacy =
          !storedSource ||
          storedSource === "legacy" ||
          storedSource === "passkey-fallback";
        return isLegacy;
      }
    } catch {
      // Invalid stored data
    }
  }

  return false;
}

/**
 * Shows a centered modal for WALLET users with legacy (non-deterministic) keys.
 * Prompts them to upgrade to the new deterministic key system.
 * Appears immediately after login, before the username claim modal.
 */
export function MessagingKeyUpgradeBanner({
  userAddress,
  authType,
  onDismiss,
  onNotNeeded,
}: MessagingKeyUpgradeBannerProps) {
  const [showModal, setShowModal] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChecked, setHasChecked] = useState(false);

  const { data: walletClient } = useWalletClient();

  // Check if user has a legacy key that needs upgrade
  useEffect(() => {
    if (!userAddress || typeof window === "undefined") {
      if (!hasChecked) {
        setHasChecked(true);
        onNotNeeded?.();
      }
      return;
    }

    const needsUpgrade = checkNeedsKeyUpgrade(userAddress, authType);

    if (needsUpgrade) {
      setShowModal(true);
    } else if (!hasChecked) {
      onNotNeeded?.();
    }

    setHasChecked(true);
  }, [userAddress, authType, hasChecked, onNotNeeded]);

  const handleUpgrade = useCallback(async () => {
    if (!userAddress || !walletClient || authType !== "wallet") return;

    setIsUpgrading(true);
    setError(null);

    try {
      // Clear the old key
      localStorage.removeItem(MESSAGING_KEYPAIR_STORAGE);
      localStorage.removeItem(MESSAGING_KEY_SOURCE_STORAGE);
      clearCachedKey(userAddress);

      // Derive new deterministic key using wallet signature
      const result = await getOrDeriveMessagingKey({
        authType: "wallet",
        userAddress,
        walletClient,
      });

      if (result.success && result.keypair) {
        // Save the new key
        localStorage.setItem(
          MESSAGING_KEYPAIR_STORAGE,
          JSON.stringify({
            publicKey: result.keypair.publicKey,
            privateKey: result.keypair.privateKey,
          }),
        );
        localStorage.setItem(
          MESSAGING_KEY_SOURCE_STORAGE,
          result.keypair.derivedFrom,
        );

        setShowModal(false);
        onDismiss?.();

        console.log("[MessagingKey] Upgraded to deterministic key");
      } else {
        setError(result.error || "Failed to upgrade key");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upgrade failed");
    } finally {
      setIsUpgrading(false);
    }
  }, [userAddress, authType, walletClient, onDismiss]);

  const handleDismiss = useCallback(() => {
    if (userAddress) {
      localStorage.setItem(UPGRADE_DISMISSED_KEY, userAddress.toLowerCase());
    }
    setShowModal(false);
    onDismiss?.();
  }, [userAddress, onDismiss]);

  // Don't render if not a wallet user or no modal to show
  if (!showModal || authType !== "wallet") return null;

  return (
    <AnimatePresence>
      {showModal && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Centered Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm z-50"
          >
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
              <div className="space-y-6">
                {/* Icon */}
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-2xl bg-[#FF5500]/20 flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-[#FF5500]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  </div>
                </div>

                {/* Title */}
                <h2 className="text-xl font-bold text-white text-center">
                  Message Encryption
                </h2>

                {/* Description */}
                <p className="text-zinc-400 text-center text-sm">
                  Upgrade your encryption key for seamless cross-device
                  messaging. Sign once, works everywhere.
                </p>

                {error && (
                  <p className="text-xs text-red-400 text-center">{error}</p>
                )}

                {/* Upgrade button */}
                <button
                  onClick={handleUpgrade}
                  disabled={isUpgrading || !walletClient}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FB8D22] text-white font-medium transition-all hover:shadow-lg hover:shadow-[#FB8D22]/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isUpgrading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Signing...
                    </>
                  ) : (
                    "Upgrade Key"
                  )}
                </button>

                {/* Later button */}
                <button
                  onClick={handleDismiss}
                  disabled={isUpgrading}
                  className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors text-sm font-medium"
                >
                  Later
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
