import { NextRequest, NextResponse } from "next/server";

// Spotify Client Credentials token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string | null> {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) return null;

    // Return cached token if still valid (with 60s buffer)
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
        return cachedToken.token;
    }

    try {
        const res = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
            },
            body: "grant_type=client_credentials",
        });

        if (!res.ok) {
            console.error("[Spotify] Token request failed:", res.status);
            return null;
        }

        const data = await res.json();
        cachedToken = {
            token: data.access_token,
            expiresAt: Date.now() + data.expires_in * 1000,
        };

        return cachedToken.token;
    } catch (err) {
        console.error("[Spotify] Token error:", err);
        return null;
    }
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");
    const type = searchParams.get("type") || "track"; // track, album, playlist, artist

    if (!query || query.trim().length < 2) {
        return NextResponse.json({ error: "Query too short" }, { status: 400 });
    }

    const token = await getSpotifyToken();
    if (!token) {
        return NextResponse.json(
            { error: "Spotify search not configured", available: false },
            { status: 503 },
        );
    }

    try {
        const validTypes = ["track", "album", "playlist", "artist"];
        const searchType = validTypes.includes(type) ? type : "track";

        const spotifyRes = await fetch(
            `https://api.spotify.com/v1/search?${new URLSearchParams({
                q: query.trim(),
                type: searchType,
                limit: "8",
                market: "US",
            })}`,
            {
                headers: { Authorization: `Bearer ${token}` },
            },
        );

        if (!spotifyRes.ok) {
            // Token might have expired mid-request; clear cache
            if (spotifyRes.status === 401) cachedToken = null;
            throw new Error(`Spotify API ${spotifyRes.status}`);
        }

        const data = await spotifyRes.json();

        // Normalize results into a simple format for the frontend
        type SpotifyResult = {
            id: string;
            name: string;
            artist: string;
            image: string;
            url: string;
            type: string;
        };

        const results: SpotifyResult[] = [];

        if (data.tracks?.items) {
            for (const track of data.tracks.items) {
                results.push({
                    id: track.id,
                    name: track.name,
                    artist: track.artists?.map((a: { name: string }) => a.name).join(", ") || "",
                    image: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || "",
                    url: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
                    type: "track",
                });
            }
        }

        if (data.albums?.items) {
            for (const album of data.albums.items) {
                results.push({
                    id: album.id,
                    name: album.name,
                    artist: album.artists?.map((a: { name: string }) => a.name).join(", ") || "",
                    image: album.images?.[1]?.url || album.images?.[0]?.url || "",
                    url: album.external_urls?.spotify || `https://open.spotify.com/album/${album.id}`,
                    type: "album",
                });
            }
        }

        if (data.playlists?.items) {
            for (const playlist of data.playlists.items) {
                results.push({
                    id: playlist.id,
                    name: playlist.name,
                    artist: playlist.owner?.display_name || "",
                    image: playlist.images?.[0]?.url || "",
                    url: playlist.external_urls?.spotify || `https://open.spotify.com/playlist/${playlist.id}`,
                    type: "playlist",
                });
            }
        }

        if (data.artists?.items) {
            for (const artist of data.artists.items) {
                results.push({
                    id: artist.id,
                    name: artist.name,
                    artist: "",
                    image: artist.images?.[1]?.url || artist.images?.[0]?.url || "",
                    url: artist.external_urls?.spotify || `https://open.spotify.com/artist/${artist.id}`,
                    type: "artist",
                });
            }
        }

        return NextResponse.json({ results, available: true });
    } catch (err) {
        console.error("[Spotify] Search error:", err);
        return NextResponse.json(
            { error: "Spotify search failed", available: true },
            { status: 500 },
        );
    }
}
