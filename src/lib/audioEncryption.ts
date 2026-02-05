/**
 * Audio Encryption Utilities for Voice Memos
 * 
 * Uses AES-GCM with the same key derivation as DM messages
 * to provide end-to-end encryption for voice memos.
 */

// Voice message format: [VOICE:{duration}:{iv}]{encrypted_url}
// The IV is included in the message so the recipient can decrypt
const VOICE_MESSAGE_PREFIX = "[VOICE:";

/**
 * Encrypt audio data using AES-GCM
 * Returns the encrypted blob ready for upload
 */
export async function encryptAudio(
    audioBlob: Blob,
    encryptionKey: Uint8Array
): Promise<{ encryptedBlob: Blob; iv: string }> {
    // Convert blob to ArrayBuffer
    const audioBuffer = await audioBlob.arrayBuffer();
    
    // Generate random IV (12 bytes for AES-GCM)
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Import the key - create a copy of the key data
    const keyData = new Uint8Array(encryptionKey).buffer;
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "AES-GCM" },
        false,
        ["encrypt"]
    );
    
    // Encrypt the audio - create a copy of IV for the parameter
    const ivData = new Uint8Array(iv).buffer;
    const encryptedData = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: ivData },
        cryptoKey,
        audioBuffer
    );
    
    // Combine IV + encrypted data into a single blob
    const combined = new Uint8Array(iv.length + encryptedData.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encryptedData), iv.length);
    
    return {
        encryptedBlob: new Blob([combined], { type: "application/octet-stream" }),
        iv: btoa(String.fromCharCode(...iv)),
    };
}

/**
 * Decrypt audio data using AES-GCM
 * Returns the decrypted audio blob ready for playback
 */
export async function decryptAudio(
    encryptedData: ArrayBuffer,
    encryptionKey: Uint8Array
): Promise<Blob> {
    const combined = new Uint8Array(encryptedData);
    
    // Extract IV (first 12 bytes)
    const iv = combined.slice(0, 12);
    
    // Extract encrypted content
    const encrypted = combined.slice(12);
    
    // Import the key - create a copy of the key data
    const keyData = new Uint8Array(encryptionKey).buffer;
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
    );
    
    // Decrypt - create copies of IV and encrypted data for the parameters
    const ivData = new Uint8Array(iv).buffer;
    const encryptedBuffer = new Uint8Array(encrypted).buffer;
    const decryptedData = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivData },
        cryptoKey,
        encryptedBuffer
    );
    
    // Return as audio blob (WebM/Opus)
    return new Blob([decryptedData], { type: "audio/webm" });
}

/**
 * Format a voice message for sending
 * Format: [VOICE:{duration}]{url}
 */
export function formatVoiceMessage(duration: number, url: string): string {
    return `${VOICE_MESSAGE_PREFIX}${duration}]${url}`;
}

/**
 * Check if a message is a voice message
 */
export function isVoiceMessage(content: string): boolean {
    return content.startsWith(VOICE_MESSAGE_PREFIX);
}

/**
 * Parse a voice message to extract duration and URL
 */
export function parseVoiceMessage(content: string): {
    duration: number;
    url: string;
} | null {
    if (!isVoiceMessage(content)) return null;
    
    // Match [VOICE:{duration}]{url}
    const match = content.match(/^\[VOICE:(\d+)\](.+)$/);
    if (!match) return null;
    
    return {
        duration: parseInt(match[1], 10),
        url: match[2],
    };
}

/**
 * Fetch and decrypt a voice memo
 * Returns a blob URL ready for playback
 */
export async function fetchAndDecryptVoice(
    encryptedUrl: string,
    encryptionKey: Uint8Array
): Promise<string> {
    // Fetch the encrypted audio
    const response = await fetch(encryptedUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch voice memo: ${response.status}`);
    }
    
    const encryptedData = await response.arrayBuffer();
    
    // Decrypt
    const decryptedBlob = await decryptAudio(encryptedData, encryptionKey);
    
    // Create blob URL for playback
    return URL.createObjectURL(decryptedBlob);
}
