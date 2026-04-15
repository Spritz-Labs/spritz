"use client";

import { useSolanaDisplayLabel } from "@/hooks/useSolanaDisplayNames";

/**
 * Renders a truncated address, or the wallet's primary SNS `.sol` name when resolvable (Solana).
 */
export function SolanaOrTruncatedAddress({
    address,
    className,
}: {
    address: string;
    className?: string;
}) {
    const label = useSolanaDisplayLabel(address);
    return <span className={className}>{label}</span>;
}
