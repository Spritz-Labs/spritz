import { fileTypeFromBuffer } from "file-type";

// Allowed MIME types for images
export const ALLOWED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png", 
    "image/gif",
    "image/webp",
];

// Allowed MIME types for videos
export const ALLOWED_VIDEO_TYPES = [
    "video/mp4",
    "video/webm",
    "video/quicktime", // .mov
];

// All allowed media types
export const ALLOWED_MEDIA_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

export interface FileValidationResult {
    isValid: boolean;
    detectedType: string | null;
    error?: string;
}

/**
 * Validate file content by checking magic bytes (file signature)
 * This prevents attacks where malicious files are uploaded with fake MIME types
 */
export async function validateFileContent(
    buffer: Buffer | ArrayBuffer,
    allowedTypes: string[] = ALLOWED_IMAGE_TYPES
): Promise<FileValidationResult> {
    try {
        // Convert ArrayBuffer to Buffer if needed
        const buf = buffer instanceof Buffer ? buffer : Buffer.from(new Uint8Array(buffer));
        
        // Detect file type from magic bytes
        const fileType = await fileTypeFromBuffer(buf);
        
        if (!fileType) {
            return {
                isValid: false,
                detectedType: null,
                error: "Could not determine file type - file may be corrupted or invalid",
            };
        }
        
        const detectedMime = fileType.mime;
        
        // Check if detected type is allowed
        if (!allowedTypes.includes(detectedMime)) {
            return {
                isValid: false,
                detectedType: detectedMime,
                error: `File type "${detectedMime}" is not allowed. Allowed types: ${allowedTypes.join(", ")}`,
            };
        }
        
        return {
            isValid: true,
            detectedType: detectedMime,
        };
    } catch (error) {
        console.error("[FileValidation] Error validating file:", error);
        return {
            isValid: false,
            detectedType: null,
            error: "Failed to validate file content",
        };
    }
}

/**
 * Validate image file content
 */
export async function validateImageContent(buffer: Buffer | ArrayBuffer): Promise<FileValidationResult> {
    return validateFileContent(buffer, ALLOWED_IMAGE_TYPES);
}

/**
 * Validate video file content
 */
export async function validateVideoContent(buffer: Buffer | ArrayBuffer): Promise<FileValidationResult> {
    return validateFileContent(buffer, ALLOWED_VIDEO_TYPES);
}

/**
 * Validate any media file (image or video)
 */
export async function validateMediaContent(buffer: Buffer | ArrayBuffer): Promise<FileValidationResult> {
    return validateFileContent(buffer, ALLOWED_MEDIA_TYPES);
}

/**
 * Get file extension from detected MIME type
 */
export async function getFileExtension(buffer: Buffer | ArrayBuffer): Promise<string | null> {
    try {
        const buf = buffer instanceof Buffer ? buffer : Buffer.from(new Uint8Array(buffer));
        const fileType = await fileTypeFromBuffer(buf);
        return fileType?.ext || null;
    } catch {
        return null;
    }
}
