"use client";

import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
    type ReactNode,
} from "react";

// Storage keys
const WORLD_ID_SESSION_KEY = "spritz_world_id_session";
const WORLD_ID_ADDRESS_KEY = "spritz_world_id_address";

// Types
export type WorldIdAuthState = {
    isLoading: boolean;
    isAuthenticated: boolean;
    worldIdAddress: string | null; // nullifier_hash serves as unique ID
    verificationLevel: "orb" | "device" | null;
    error: string | null;
};

export type WorldIdAuthContextType = WorldIdAuthState & {
    setAuthenticated: (nullifierHash: string, level: "orb" | "device") => void;
    logout: () => void;
    clearError: () => void;
};

const WorldIdAuthContext = createContext<WorldIdAuthContextType | null>(null);

export function WorldIdProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<WorldIdAuthState>({
        isLoading: true,
        isAuthenticated: false,
        worldIdAddress: null,
        verificationLevel: null,
        error: null,
    });

    // Restore session on mount
    useEffect(() => {
        const restoreSession = () => {
            try {
                const storedAddress = localStorage.getItem(WORLD_ID_ADDRESS_KEY);
                const storedSession = localStorage.getItem(WORLD_ID_SESSION_KEY);

                if (storedAddress && storedSession) {
                    const session = JSON.parse(storedSession);
                    // Check if session is still valid (30 days)
                    if (session.exp && session.exp > Date.now()) {
                        console.log("[WorldId] Restored session for:", storedAddress.slice(0, 10) + "...");
                        setState({
                            isLoading: false,
                            isAuthenticated: true,
                            worldIdAddress: storedAddress,
                            verificationLevel: session.level || "device",
                            error: null,
                        });
                        return;
                    }
                }
            } catch (e) {
                console.warn("[WorldId] Failed to restore session:", e);
            }

            setState((prev) => ({ ...prev, isLoading: false }));
        };

        // Small delay to allow other providers to initialize
        const timeout = setTimeout(restoreSession, 100);
        return () => clearTimeout(timeout);
    }, []);

    const setAuthenticated = useCallback((nullifierHash: string, level: "orb" | "device") => {
        console.log("[WorldId] ✓ Authenticated with nullifier:", nullifierHash.slice(0, 10) + "...");

        // Store session (30 day expiry)
        const sessionData = {
            level,
            exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
        };
        localStorage.setItem(WORLD_ID_ADDRESS_KEY, nullifierHash);
        localStorage.setItem(WORLD_ID_SESSION_KEY, JSON.stringify(sessionData));

        setState({
            isLoading: false,
            isAuthenticated: true,
            worldIdAddress: nullifierHash,
            verificationLevel: level,
            error: null,
        });
    }, []);

    const logout = useCallback(() => {
        console.log("[WorldId] Logging out...");

        // Clear storage
        localStorage.removeItem(WORLD_ID_ADDRESS_KEY);
        localStorage.removeItem(WORLD_ID_SESSION_KEY);

        setState({
            isLoading: false,
            isAuthenticated: false,
            worldIdAddress: null,
            verificationLevel: null,
            error: null,
        });

        // Reload to clear all state
        window.location.reload();
    }, []);

    const clearError = useCallback(() => {
        setState((prev) => ({ ...prev, error: null }));
    }, []);

    return (
        <WorldIdAuthContext.Provider
            value={{
                ...state,
                setAuthenticated,
                logout,
                clearError,
            }}
        >
            {children}
        </WorldIdAuthContext.Provider>
    );
}

export function useWorldIdContext() {
    const context = useContext(WorldIdAuthContext);
    if (!context) {
        throw new Error(
            "useWorldIdContext must be used within a WorldIdProvider"
        );
    }
    return context;
}
