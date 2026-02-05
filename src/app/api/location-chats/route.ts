import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";
import crypto from "crypto";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;
const PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Calculate distance between two points using Haversine formula (returns meters)
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// 1 mile in meters
const ONE_MILE_METERS = 1609.34;

// Generate a Waku content topic for a location chat
function generateWakuContentTopic(placeId: string): string {
    const hash = crypto.createHash("sha256").update(placeId).digest("hex").substring(0, 16);
    return `/spritz/1/location-chat-${hash}/proto`;
}

// Generate a symmetric encryption key for the Waku channel
function generateWakuSymmetricKey(): string {
    return crypto.randomBytes(32).toString("base64");
}

// Upload data to IPFS via Pinata
async function uploadToIPFS(data: object, name: string): Promise<{ hash: string; url: string } | null> {
    if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
        console.warn("[LocationChat] Pinata not configured, skipping IPFS upload");
        return null;
    }

    try {
        const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                pinata_api_key: PINATA_API_KEY,
                pinata_secret_api_key: PINATA_SECRET_KEY,
            },
            body: JSON.stringify({
                pinataContent: data,
                pinataMetadata: {
                    name,
                    keyvalues: {
                        type: "location-chat-data",
                        timestamp: new Date().toISOString(),
                    },
                },
                pinataOptions: {
                    cidVersion: 1,
                },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[LocationChat] Pinata error:", errorText);
            return null;
        }

        const result = await response.json();
        return {
            hash: result.IpfsHash,
            url: `https://${PINATA_GATEWAY}/ipfs/${result.IpfsHash}`,
        };
    } catch (error) {
        console.error("[LocationChat] IPFS upload error:", error);
        return null;
    }
}

// GET /api/location-chats - List location chats (with optional filters)
export async function GET(request: NextRequest) {
    // Rate limit
    const rateLimitResponse = await checkRateLimit(request, "general");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const { searchParams } = new URL(request.url);
        const lat = searchParams.get("lat");
        const lng = searchParams.get("lng");
        const radius = searchParams.get("radius") || "5000"; // Default 5km
        const placeId = searchParams.get("placeId");
        const limit = parseInt(searchParams.get("limit") || "20");

        let query = supabase
            .from("shout_location_chats")
            .select("*")
            .eq("is_active", true)
            .order("member_count", { ascending: false })
            .limit(limit);

        // Filter by place ID if provided
        if (placeId) {
            query = query.eq("google_place_id", placeId);
        }

        // For location-based search, we'll do a simple bounding box query
        // Note: For production, consider using PostGIS for proper geospatial queries
        if (lat && lng) {
            const latNum = parseFloat(lat);
            const lngNum = parseFloat(lng);
            const radiusNum = parseFloat(radius);
            
            // Approximate degrees for the radius (very rough, good enough for nearby)
            const latDelta = radiusNum / 111320; // 1 degree lat ≈ 111.32 km
            const lngDelta = radiusNum / (111320 * Math.cos(latNum * Math.PI / 180));

            query = query
                .gte("latitude", latNum - latDelta)
                .lte("latitude", latNum + latDelta)
                .gte("longitude", lngNum - lngDelta)
                .lte("longitude", lngNum + lngDelta);
        }

        const { data, error } = await query;

        if (error) {
            console.error("[LocationChat] Fetch error:", error);
            return NextResponse.json(
                { error: "Failed to fetch location chats" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            chats: data || [],
            count: data?.length || 0,
        });
    } catch (error) {
        console.error("[LocationChat] GET error:", error);
        return NextResponse.json(
            { error: "Failed to fetch location chats" },
            { status: 500 }
        );
    }
}

// POST /api/location-chats - Create a new location chat
export async function POST(request: NextRequest) {
    // Rate limit
    const rateLimitResponse = await checkRateLimit(request, "general");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        // Require authentication
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { placeId, name, description, emoji, userLat, userLng } = body;

        if (!placeId) {
            return NextResponse.json(
                { error: "Google Place ID is required" },
                { status: 400 }
            );
        }

        // Require user location for creating a chat
        if (typeof userLat !== "number" || typeof userLng !== "number") {
            return NextResponse.json(
                { error: "Your location is required to create a location chat" },
                { status: 400 }
            );
        }

        // Check if chat already exists for this place
        const { data: existingChat } = await supabase
            .from("shout_location_chats")
            .select("*")
            .eq("google_place_id", placeId)
            .single();

        if (existingChat) {
            return NextResponse.json({
                chat: existingChat,
                existing: true,
                message: "A chat already exists for this location",
            });
        }

        // Fetch full place details from Google
        if (!GOOGLE_PLACES_API_KEY) {
            return NextResponse.json(
                { error: "Google Places API not configured" },
                { status: 500 }
            );
        }

        const placeResponse = await fetch(
            `https://places.googleapis.com/v1/places/${placeId}`,
            {
                headers: {
                    "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
                    "X-Goog-FieldMask": "id,displayName,formattedAddress,location,types,rating,userRatingCount,priceLevel,nationalPhoneNumber,internationalPhoneNumber,websiteUri,currentOpeningHours,regularOpeningHours,reviews,photos,editorialSummary,addressComponents",
                },
            }
        );

        if (!placeResponse.ok) {
            const errorText = await placeResponse.text();
            console.error("[LocationChat] Google API error:", errorText);
            return NextResponse.json(
                { error: "Failed to fetch place details" },
                { status: 500 }
            );
        }

        const place = await placeResponse.json();

        // Validate user is within 1 mile of the location
        const placeLat = place.location?.latitude;
        const placeLng = place.location?.longitude;
        
        if (typeof placeLat !== "number" || typeof placeLng !== "number") {
            return NextResponse.json(
                { error: "Could not determine place location" },
                { status: 400 }
            );
        }

        const distanceMeters = calculateDistance(userLat, userLng, placeLat, placeLng);
        const distanceMiles = distanceMeters / ONE_MILE_METERS;
        
        if (distanceMeters > ONE_MILE_METERS) {
            console.log(`[LocationChat] User too far: ${distanceMiles.toFixed(2)} miles from ${place.displayName?.text}`);
            return NextResponse.json(
                { 
                    error: `You must be within 1 mile of this location to create a chat. You are currently ${distanceMiles.toFixed(1)} miles away.`,
                    distance: distanceMiles,
                },
                { status: 403 }
            );
        }

        console.log(`[LocationChat] User is ${distanceMiles.toFixed(2)} miles from ${place.displayName?.text}`);

        // Prepare data for IPFS storage (full Google Places data)
        const ipfsData = {
            googlePlaceData: place,
            createdAt: new Date().toISOString(),
            createdBy: session.userAddress,
        };

        // Upload to IPFS via Pinata
        const ipfsResult = await uploadToIPFS(
            ipfsData,
            `location-chat-${place.displayName?.text || placeId}`
        );

        // Generate Waku messaging credentials
        const wakuContentTopic = generateWakuContentTopic(placeId);
        const wakuSymmetricKey = generateWakuSymmetricKey();

        // Extract photo references
        const photoRefs = place.photos?.slice(0, 5).map((p: { name: string }) => p.name) || [];

        // Create the location chat in Supabase
        const chatData = {
            name: name || place.displayName?.text || "Unknown Location",
            description: description || place.editorialSummary?.text || null,
            emoji: emoji || "📍",
            
            // Google Places data
            google_place_id: placeId,
            google_place_name: place.displayName?.text || "Unknown",
            google_place_types: place.types || [],
            google_place_address: place.formattedAddress || null,
            google_place_rating: place.rating || null,
            google_place_user_ratings_total: place.userRatingCount || null,
            google_place_price_level: typeof place.priceLevel === "string"
                ? ["PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"].indexOf(place.priceLevel)
                : null,
            google_place_phone: place.internationalPhoneNumber || place.nationalPhoneNumber || null,
            google_place_website: place.websiteUri || null,
            google_place_hours: place.regularOpeningHours || place.currentOpeningHours || null,
            google_place_photos: photoRefs,
            
            // Location
            latitude: place.location?.latitude || 0,
            longitude: place.location?.longitude || 0,
            formatted_address: place.formattedAddress || null,
            
            // IPFS
            ipfs_hash: ipfsResult?.hash || null,
            ipfs_url: ipfsResult?.url || null,
            
            // Waku/Logos decentralized messaging
            messaging_type: "waku",
            waku_symmetric_key: wakuSymmetricKey,
            waku_content_topic: wakuContentTopic,
            
            // Creator
            creator_address: session.userAddress,
            member_count: 1, // Creator is first member
        };

        const { data: newChat, error: insertError } = await supabase
            .from("shout_location_chats")
            .insert(chatData)
            .select()
            .single();

        if (insertError) {
            console.error("[LocationChat] Insert error:", insertError);
            return NextResponse.json(
                { error: "Failed to create location chat" },
                { status: 500 }
            );
        }

        // Auto-join creator as first member
        await supabase
            .from("shout_location_chat_members")
            .insert({
                location_chat_id: newChat.id,
                user_address: session.userAddress,
            });

        console.log("[LocationChat] Created:", newChat.id, newChat.name);

        return NextResponse.json({
            chat: newChat,
            existing: false,
            ipfs: ipfsResult,
        });
    } catch (error) {
        console.error("[LocationChat] POST error:", error);
        return NextResponse.json(
            { error: "Failed to create location chat" },
            { status: 500 }
        );
    }
}
