/**
 * Media Encryption Utilities for Voice Memos and Images
 * 
 * Uses AES-GCM with the same key derivation as DM messages
 * to provide end-to-end encryption for media attachments.
 */

// Voice message format: [VOICE:{duration}]{encrypted_url}
const VOICE_MESSAGE_PREFIX = "[VOICE:";

// Image message format: [ENC_IMAGE:{mimeType}]{encrypted_url}
const ENCRYPTED_IMAGE_PREFIX = "[ENC_IMAGE:";

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

// ============================================================
// Image Encryption Utilities
// ============================================================

/**
 * Encrypt image data using AES-GCM
 * Returns the encrypted blob ready for upload
 */
export async function encryptImage(
    imageBlob: Blob,
    encryptionKey: Uint8Array
): Promise<{ encryptedBlob: Blob; iv: string }> {
    // Convert blob to ArrayBuffer
    const imageBuffer = await imageBlob.arrayBuffer();
    
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
    
    // Encrypt the image - create a copy of IV for the parameter
    const ivData = new Uint8Array(iv).buffer;
    const encryptedData = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: ivData },
        cryptoKey,
        imageBuffer
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
 * Decrypt image data using AES-GCM
 * Returns the decrypted image blob
 */
export async function decryptImage(
    encryptedData: ArrayBuffer,
    encryptionKey: Uint8Array,
    mimeType: string = "image/jpeg"
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
    
    // Return as image blob with the original MIME type
    return new Blob([decryptedData], { type: mimeType });
}

/**
 * Format an encrypted image message for sending
 * Format: [ENC_IMAGE:{mimeType}]{url}
 */
export function formatEncryptedImageMessage(mimeType: string, url: string): string {
    return `${ENCRYPTED_IMAGE_PREFIX}${mimeType}]${url}`;
}

/**
 * Check if a message is an encrypted image
 */
export function isEncryptedImageMessage(content: string): boolean {
    return content.startsWith(ENCRYPTED_IMAGE_PREFIX);
}

/**
 * Parse an encrypted image message to extract mimeType and URL
 */
export function parseEncryptedImageMessage(content: string): {
    mimeType: string;
    url: string;
} | null {
    if (!isEncryptedImageMessage(content)) return null;
    
    // Match [ENC_IMAGE:{mimeType}]{url}
    const match = content.match(/^\[ENC_IMAGE:([^\]]+)\](.+)$/);
    if (!match) return null;
    
    return {
        mimeType: match[1],
        url: match[2],
    };
}

/**
 * Fetch and decrypt an encrypted image
 * Returns a blob URL ready for display
 */
export async function fetchAndDecryptImage(
    encryptedUrl: string,
    encryptionKey: Uint8Array,
    mimeType: string = "image/jpeg"
): Promise<string> {
    // Fetch the encrypted image
    const response = await fetch(encryptedUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch encrypted image: ${response.status}`);
    }
    
    const encryptedData = await response.arrayBuffer();
    
    // Decrypt
    const decryptedBlob = await decryptImage(encryptedData, encryptionKey, mimeType);
    
    // Create blob URL for display
    return URL.createObjectURL(decryptedBlob);
}
