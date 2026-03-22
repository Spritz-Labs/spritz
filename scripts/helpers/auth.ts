import { SignJWT } from "jose";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "./env.js";

const SECRET = new TextEncoder().encode(env.SESSION_SECRET);

export type AuthMethod = "wallet" | "email" | "passkey";

export async function mintSessionToken(
    userAddress: string,
    authMethod: AuthMethod = "wallet",
    expiresInDays = 7,
): Promise<string> {
    return new SignJWT({
        userAddress: userAddress.toLowerCase(),
        authMethod,
    })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(`${expiresInDays}d`)
        .sign(SECRET);
}

export async function siweLogin(baseUrl: string): Promise<string> {
    const account = privateKeyToAccount(env.TEST_WALLET_PRIVATE_KEY as `0x${string}`);

    const nonceRes = await fetch(`${baseUrl}/api/auth/verify?address=${account.address}`);
    const { message } = (await nonceRes.json()) as { message: string };

    const signature = await account.signMessage({ message });

    const verifyRes = await fetch(`${baseUrl}/api/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: account.address, signature, message }),
    });

    const data = (await verifyRes.json()) as { sessionToken?: string };
    if (!data.sessionToken) {
        throw new Error(`SIWE login failed: ${JSON.stringify(data)}`);
    }
    return data.sessionToken;
}
