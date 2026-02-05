import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

export type PlaceResult = {
    placeId: string;
    name: string;
    address: string;
    location: {
        lat: number;
        lng: number;
    };
    types: string[];
    rating?: number;
    userRatingsTotal?: number;
    priceLevel?: number;
    openNow?: boolean;
    photos?: string[];
    icon?: string;
    vicinity?: string;
};

// POST /api/places/search - Search for places near a location
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

        if (!GOOGLE_PLACES_API_KEY) {
            console.error("[Places] Missing Google Places API key");
            return NextResponse.json(
                { error: "Google Places API not configured" },
                { status: 500 }
            );
        }

        const body = await request.json();
        const { 
            query, 
            lat, 
            lng, 
            radius = 1000, // Default 1km radius
            type // Optional place type filter
        } = body;

        if (!lat || !lng) {
            return NextResponse.json(
                { error: "Location (lat, lng) is required" },
                { status: 400 }
            );
        }

        // Build Google Places API URL
        // Using Places API (New) - Nearby Search
        let url: string;
        let fetchOptions: RequestInit;

        if (query) {
            // Text Search when query is provided
            url = "https://places.googleapis.com/v1/places:searchText";
            fetchOptions = {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
                    "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.photos,places.iconMaskBaseUri",
                },
                body: JSON.stringify({
                    textQuery: query,
                    locationBias: {
                        circle: {
                            center: { latitude: lat, longitude: lng },
                            radius: radius,
                        },
                    },
                    maxResultCount: 20,
                }),
            };
        } else {
            // Nearby Search when no query (discover nearby places)
            url = "https://places.googleapis.com/v1/places:searchNearby";
            
            const requestBody: Record<string, unknown> = {
                locationRestriction: {
                    circle: {
                        center: { latitude: lat, longitude: lng },
                        radius: radius,
                    },
                },
                maxResultCount: 20,
            };

            // Add type filter if provided
            if (type) {
                requestBody.includedTypes = [type];
            } else {
                // Default to popular place types for social meetups
                requestBody.includedTypes = [
                    "restaurant", "cafe", "bar", "coffee_shop", 
                    "night_club", "park", "museum", "shopping_mall",
                    "gym", "movie_theater", "bowling_alley", "spa"
                ];
            }

            fetchOptions = {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
                    "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.photos,places.iconMaskBaseUri",
                },
                body: JSON.stringify(requestBody),
            };
        }

        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Places] Google API error:", errorText);
            return NextResponse.json(
                { error: "Failed to search places" },
                { status: 500 }
            );
        }

        const data = await response.json();

        // Transform Google Places API response to our format
        const places: PlaceResult[] = (data.places || []).map((place: Record<string, unknown>) => {
            const location = place.location as { latitude: number; longitude: number } | undefined;
            const displayName = place.displayName as { text: string } | undefined;
            const photos = place.photos as Array<{ name: string }> | undefined;
            const openingHours = place.currentOpeningHours as { openNow?: boolean } | undefined;
            
            return {
                placeId: place.id as string,
                name: displayName?.text || "Unknown",
                address: place.formattedAddress as string || "",
                location: {
                    lat: location?.latitude || 0,
                    lng: location?.longitude || 0,
                },
                types: (place.types as string[]) || [],
                rating: place.rating as number | undefined,
                userRatingsTotal: place.userRatingCount as number | undefined,
                priceLevel: typeof place.priceLevel === "string" 
                    ? ["PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"].indexOf(place.priceLevel)
                    : undefined,
                openNow: openingHours?.openNow,
                photos: photos?.slice(0, 3).map((p) => p.name),
                icon: place.iconMaskBaseUri as string | undefined,
                vicinity: place.formattedAddress as string,
            };
        });

        return NextResponse.json({
            places,
            count: places.length,
        });
    } catch (error) {
        console.error("[Places] Search error:", error);
        return NextResponse.json(
            { error: "Failed to search places" },
            { status: 500 }
        );
    }
}
