import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

export type PlaceDetails = {
    placeId: string;
    name: string;
    formattedAddress: string;
    location: {
        lat: number;
        lng: number;
    };
    types: string[];
    rating?: number;
    userRatingsTotal?: number;
    priceLevel?: number;
    phone?: string;
    website?: string;
    openingHours?: {
        openNow?: boolean;
        weekdayText?: string[];
        periods?: Array<{
            open: { day: number; hour: number; minute: number };
            close?: { day: number; hour: number; minute: number };
        }>;
    };
    reviews?: Array<{
        author: string;
        rating: number;
        text: string;
        time: string;
        profilePhotoUrl?: string;
    }>;
    photos?: string[];
    editorialSummary?: string;
};

// GET /api/places/[placeId] - Get detailed place information
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ placeId: string }> }
) {
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

        const { placeId } = await params;

        if (!placeId) {
            return NextResponse.json(
                { error: "Place ID is required" },
                { status: 400 }
            );
        }

        // Fetch place details from Google Places API (New)
        const url = `https://places.googleapis.com/v1/places/${placeId}`;
        
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
                "X-Goog-FieldMask": "id,displayName,formattedAddress,location,types,rating,userRatingCount,priceLevel,nationalPhoneNumber,internationalPhoneNumber,websiteUri,currentOpeningHours,regularOpeningHours,reviews,photos,editorialSummary,addressComponents",
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Places] Google API error:", errorText);
            return NextResponse.json(
                { error: "Failed to get place details" },
                { status: 500 }
            );
        }

        const place = await response.json();

        // Transform to our format
        const details: PlaceDetails = {
            placeId: place.id,
            name: place.displayName?.text || "Unknown",
            formattedAddress: place.formattedAddress || "",
            location: {
                lat: place.location?.latitude || 0,
                lng: place.location?.longitude || 0,
            },
            types: place.types || [],
            rating: place.rating,
            userRatingsTotal: place.userRatingCount,
            priceLevel: typeof place.priceLevel === "string"
                ? ["PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"].indexOf(place.priceLevel)
                : undefined,
            phone: place.internationalPhoneNumber || place.nationalPhoneNumber,
            website: place.websiteUri,
            openingHours: place.currentOpeningHours || place.regularOpeningHours ? {
                openNow: place.currentOpeningHours?.openNow,
                weekdayText: place.regularOpeningHours?.weekdayDescriptions,
                periods: place.regularOpeningHours?.periods?.map((p: { open?: { day: number; hour: number; minute: number }; close?: { day: number; hour: number; minute: number } }) => ({
                    open: p.open,
                    close: p.close,
                })),
            } : undefined,
            reviews: place.reviews?.slice(0, 5).map((r: { authorAttribution?: { displayName?: string; photoUri?: string }; rating?: number; text?: { text?: string }; relativePublishTimeDescription?: string }) => ({
                author: r.authorAttribution?.displayName || "Anonymous",
                rating: r.rating || 0,
                text: r.text?.text || "",
                time: r.relativePublishTimeDescription || "",
                profilePhotoUrl: r.authorAttribution?.photoUri,
            })),
            photos: place.photos?.slice(0, 10).map((p: { name: string }) => p.name),
            editorialSummary: place.editorialSummary?.text,
        };

        // Also return the raw data for IPFS storage
        return NextResponse.json({
            details,
            rawData: place, // Full Google data for IPFS backup
        });
    } catch (error) {
        console.error("[Places] Details error:", error);
        return NextResponse.json(
            { error: "Failed to get place details" },
            { status: 500 }
        );
    }
}
