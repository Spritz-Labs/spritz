/**
 * Livepeer API utilities for live streaming
 */

const LIVEPEER_API_KEY = process.env.LIVEPEER_API_KEY;
const LIVEPEER_API_URL = "https://livepeer.studio/api";

export type LivepeerStream = {
    id: string;
    name: string;
    streamKey: string;
    playbackId: string;
    rtmpIngestUrl: string;
    record: boolean;
    isActive: boolean;
    createdAt: number;
};

export type LivepeerAsset = {
    id: string;
    playbackId: string;
    playbackUrl: string;
    downloadUrl: string;
    status: {
        phase: "waiting" | "processing" | "ready" | "failed";
        progress?: number;
    };
    videoSpec?: {
        duration: number;
        format: string;
    };
    size?: number;
};

/**
 * Create a new stream on Livepeer
 */
export async function createLivepeerStream(name: string): Promise<LivepeerStream | null> {
    if (!LIVEPEER_API_KEY) {
        console.error("[Livepeer] API key not configured");
        return null;
    }

    try {
        const response = await fetch(`${LIVEPEER_API_URL}/stream`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${LIVEPEER_API_KEY}`,
            },
            body: JSON.stringify({
                name,
                record: true, // Enable recording for VOD playback
                profiles: [
                    // Transcoding profiles
                    { name: "720p", bitrate: 2000000, fps: 30, width: 1280, height: 720 },
                    { name: "480p", bitrate: 1000000, fps: 30, width: 854, height: 480 },
                    { name: "360p", bitrate: 500000, fps: 30, width: 640, height: 360 },
                ],
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error("[Livepeer] Failed to create stream:", error);
            return null;
        }

        const data = await response.json();
        return {
            id: data.id,
            name: data.name,
            streamKey: data.streamKey,
            playbackId: data.playbackId,
            rtmpIngestUrl: `rtmp://rtmp.livepeer.com/live/${data.streamKey}`,
            record: data.record,
            isActive: data.isActive,
            createdAt: data.createdAt,
        };
    } catch (error) {
        console.error("[Livepeer] Error creating stream:", error);
        return null;
    }
}

/**
 * Get stream details
 */
export async function getLivepeerStream(streamId: string): Promise<LivepeerStream | null> {
    if (!LIVEPEER_API_KEY) {
        console.error("[Livepeer] API key not configured");
        return null;
    }

    try {
        const response = await fetch(`${LIVEPEER_API_URL}/stream/${streamId}`, {
            headers: {
                Authorization: `Bearer ${LIVEPEER_API_KEY}`,
            },
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return {
            id: data.id,
            name: data.name,
            streamKey: data.streamKey,
            playbackId: data.playbackId,
            rtmpIngestUrl: `rtmp://rtmp.livepeer.com/live/${data.streamKey}`,
            record: data.record,
            isActive: data.isActive,
            createdAt: data.createdAt,
        };
    } catch (error) {
        console.error("[Livepeer] Error getting stream:", error);
        return null;
    }
}

/**
 * Delete/terminate a stream
 */
export async function deleteLivepeerStream(streamId: string): Promise<boolean> {
    if (!LIVEPEER_API_KEY) {
        console.error("[Livepeer] API key not configured");
        return false;
    }

    try {
        const response = await fetch(`${LIVEPEER_API_URL}/stream/${streamId}`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${LIVEPEER_API_KEY}`,
            },
        });

        return response.ok;
    } catch (error) {
        console.error("[Livepeer] Error deleting stream:", error);
        return false;
    }
}

/**
 * Get assets (recordings) for a stream
 */
export async function getLivepeerStreamAssets(streamId: string): Promise<LivepeerAsset[]> {
    if (!LIVEPEER_API_KEY) {
        console.error("[Livepeer] API key not configured");
        return [];
    }

    try {
        const response = await fetch(`${LIVEPEER_API_URL}/stream/${streamId}/assets`, {
            headers: {
                Authorization: `Bearer ${LIVEPEER_API_KEY}`,
            },
        });

        if (!response.ok) {
            return [];
        }

        const assets = await response.json();
        return assets.map((asset: Record<string, unknown>) => ({
            id: asset.id,
            playbackId: asset.playbackId,
            playbackUrl: `https://livepeercdn.studio/hls/${asset.playbackId}/index.m3u8`,
            downloadUrl: asset.downloadUrl,
            status: asset.status,
            videoSpec: asset.videoSpec,
            size: asset.size,
        }));
    } catch (error) {
        console.error("[Livepeer] Error getting stream assets:", error);
        return [];
    }
}

/**
 * Get a specific asset
 */
export async function getLivepeerAsset(assetId: string): Promise<LivepeerAsset | null> {
    if (!LIVEPEER_API_KEY) {
        console.error("[Livepeer] API key not configured");
        return null;
    }

    try {
        const response = await fetch(`${LIVEPEER_API_URL}/asset/${assetId}`, {
            headers: {
                Authorization: `Bearer ${LIVEPEER_API_KEY}`,
            },
        });

        if (!response.ok) {
            return null;
        }

        const asset = await response.json();
        return {
            id: asset.id,
            playbackId: asset.playbackId,
            playbackUrl: `https://livepeercdn.studio/hls/${asset.playbackId}/index.m3u8`,
            downloadUrl: asset.downloadUrl,
            status: asset.status,
            videoSpec: asset.videoSpec,
            size: asset.size,
        };
    } catch (error) {
        console.error("[Livepeer] Error getting asset:", error);
        return null;
    }
}

/**
 * Generate playback URL from playback ID
 */
export function getPlaybackUrl(playbackId: string): string {
    return `https://livepeercdn.studio/hls/${playbackId}/index.m3u8`;
}

/**
 * Generate WebRTC ingest URL for browser streaming
 * @param streamKey - The Livepeer stream key (NOT the stream ID!)
 */
export function getWebRTCIngestUrl(streamKey: string): string {
    return `https://livepeer.studio/webrtc/${streamKey}`;
}

/**
 * Generate thumbnail URL for a playback ID
 */
export function getThumbnailUrl(playbackId: string): string {
    return `https://livepeercdn.studio/thumbnail/${playbackId}/0/0/thumbnail.png`;
}

