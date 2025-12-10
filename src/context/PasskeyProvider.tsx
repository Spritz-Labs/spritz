"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import {
  createWebAuthnCredential,
  toWebAuthnAccount,
  entryPoint07Address,
  type WebAuthnAccount,
  type P256Credential,
  type SmartAccount,
} from "viem/account-abstraction";
import { createPublicClient, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import {
  toSafeSmartAccount,
  type SafeSmartAccountImplementation,
} from "permissionless/accounts";
import { createSmartAccountClient } from "permissionless";

// Storage keys
const CREDENTIAL_STORAGE_KEY = "shout_passkey_credential";

// Types
export type PasskeyState = {
  isLoading: boolean;
  isAuthenticated: boolean;
  credential: P256Credential | null;
  webAuthnAccount: WebAuthnAccount | null;
  smartAccount: SmartAccount<SafeSmartAccountImplementation<"0.7">> | null;
  smartAccountAddress: Address | null;
  error: string | null;
  hasStoredCredential: boolean;
};

export type PasskeyContextType = PasskeyState & {
  register: (username: string) => Promise<void>;
  login: () => Promise<void>;
  logout: () => void;
  clearError: () => void;
};

const PasskeyContext = createContext<PasskeyContextType | null>(null);

// Get the chain and bundler URL from environment
const chain = baseSepolia;
const bundlerUrl = process.env.NEXT_PUBLIC_PIMLICO_BUNDLER_URL;
const pimlicoApiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;

export function PasskeyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PasskeyState>({
    isLoading: false,
    isAuthenticated: false,
    credential: null,
    webAuthnAccount: null,
    smartAccount: null,
    smartAccountAddress: null,
    error: null,
    hasStoredCredential: false,
  });

  // Check for stored credential on mount
  useEffect(() => {
    const stored = localStorage.getItem(CREDENTIAL_STORAGE_KEY);
    setState((prev) => ({ ...prev, hasStoredCredential: !!stored }));
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const createSmartAccountFromCredential = useCallback(
    async (credential: P256Credential) => {
      if (!bundlerUrl && !pimlicoApiKey) {
        console.warn("Pimlico not configured - using derived address");
        // Generate a deterministic address from the credential public key
        const mockAddress = `0x${credential.publicKey.slice(2, 42)}` as Address;
        return {
          webAuthnAccount: toWebAuthnAccount({ credential }),
          smartAccount: null,
          smartAccountAddress: mockAddress,
        };
      }

      const actualBundlerUrl =
        bundlerUrl ||
        `https://api.pimlico.io/v2/${chain.id}/rpc?apikey=${pimlicoApiKey}`;

      const publicClient = createPublicClient({
        chain,
        transport: http(),
      });

      const pimlicoClient = createPimlicoClient({
        transport: http(actualBundlerUrl),
        entryPoint: {
          address: entryPoint07Address,
          version: "0.7",
        },
      });

      const webAuthnAccount = toWebAuthnAccount({ credential });

      const safeAccount = await toSafeSmartAccount({
        client: publicClient,
        owners: [webAuthnAccount],
        version: "1.4.1",
        entryPoint: {
          address: entryPoint07Address,
          version: "0.7",
        },
        safe4337ModuleAddress: "0x7579EE8307284F293B1927136486880611F20002",
        erc7579LaunchpadAddress: "0x7579011aB74c46090561ea277Ba79D510c6C00ff",
        attesters: ["0x000000333034E9f539ce08819E12c1b8Cb29084d"],
        attestersThreshold: 1,
      });

      const smartAccountClient = createSmartAccountClient({
        account: safeAccount,
        chain,
        bundlerTransport: http(actualBundlerUrl),
        paymaster: pimlicoClient,
        userOperation: {
          estimateFeesPerGas: async () => {
            return (await pimlicoClient.getUserOperationGasPrice()).fast;
          },
        },
      });

      return {
        webAuthnAccount,
        smartAccount: smartAccountClient.account,
        smartAccountAddress: safeAccount.address,
      };
    },
    []
  );

  const register = useCallback(
    async (username: string) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // Create WebAuthn credential (passkey)
        const credential = await createWebAuthnCredential({
          name: username || "Shout User",
        });

        // Store credential in localStorage
        const credentialToStore = {
          id: credential.id,
          publicKey: credential.publicKey,
          raw: {
            id: credential.raw.id,
            type: credential.raw.type,
          },
        };
        localStorage.setItem(
          CREDENTIAL_STORAGE_KEY,
          JSON.stringify(credentialToStore)
        );

        // Create smart account from credential
        const { webAuthnAccount, smartAccount, smartAccountAddress } =
          await createSmartAccountFromCredential(credential);

        setState({
          isLoading: false,
          isAuthenticated: true,
          credential,
          webAuthnAccount,
          smartAccount: smartAccount as SmartAccount<
            SafeSmartAccountImplementation<"0.7">
          > | null,
          smartAccountAddress,
          error: null,
          hasStoredCredential: true,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to register passkey";
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
      }
    },
    [createSmartAccountFromCredential]
  );

  const login = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Try to get stored credential info
      const storedCredential = localStorage.getItem(CREDENTIAL_STORAGE_KEY);

      if (!storedCredential) {
        throw new Error("No passkey found. Please register first.");
      }

      const parsedCredential = JSON.parse(storedCredential);

      // Use WebAuthn to authenticate with the stored credential
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [
            {
              id: Uint8Array.from(atob(parsedCredential.id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
              type: "public-key",
            },
          ],
          userVerification: "preferred",
          timeout: 60000,
        },
      });

      if (!assertion) {
        throw new Error("Authentication failed. Please try again.");
      }

      // Reconstruct credential
      const credential: P256Credential = {
        id: parsedCredential.id,
        publicKey: parsedCredential.publicKey,
        raw: {
          id: parsedCredential.raw.id,
          type: parsedCredential.raw.type,
        } as PublicKeyCredential,
      };

      // Create smart account from credential
      const { webAuthnAccount, smartAccount, smartAccountAddress } =
        await createSmartAccountFromCredential(credential);

      setState({
        isLoading: false,
        isAuthenticated: true,
        credential,
        webAuthnAccount,
        smartAccount: smartAccount as SmartAccount<
          SafeSmartAccountImplementation<"0.7">
        > | null,
        smartAccountAddress,
        error: null,
        hasStoredCredential: true,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to login with passkey";
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
    }
  }, [createSmartAccountFromCredential]);

  const logout = useCallback(() => {
    setState({
      isLoading: false,
      isAuthenticated: false,
      credential: null,
      webAuthnAccount: null,
      smartAccount: null,
      smartAccountAddress: null,
      error: null,
      hasStoredCredential: true,
    });
  }, []);

  return (
    <PasskeyContext.Provider
      value={{
        ...state,
        register,
        login,
        logout,
        clearError,
      }}
    >
      {children}
    </PasskeyContext.Provider>
  );
}

export function usePasskeyContext() {
  const context = useContext(PasskeyContext);
  if (!context) {
    throw new Error("usePasskeyContext must be used within a PasskeyProvider");
  }
  return context;
}






