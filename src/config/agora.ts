"use client";

export const agoraAppId = process.env.NEXT_PUBLIC_AGORA_APP_ID || "";

export const isAgoraConfigured = !!agoraAppId;

// Generate a temporary token for testing (in production, generate server-side)
export async function getAgoraToken(channelName: string, uid: number): Promise<string | null> {
  // For development/testing, we can use null token if App ID is in testing mode
  // In production, you should call your backend to generate tokens
  const tokenEndpoint = process.env.NEXT_PUBLIC_AGORA_TOKEN_ENDPOINT;
  
  if (!tokenEndpoint) {
    // Return null to use no token (works with Agora testing mode)
    return null;
  }

  try {
    const response = await fetch(`${tokenEndpoint}?channel=${channelName}&uid=${uid}`);
    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error("Failed to get Agora token:", error);
    return null;
  }
}


















