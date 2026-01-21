import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { createClient } from "@supabase/supabase-js";
import { isAddress, createPublicClient, http, normalize } from "viem";
import { mainnet } from "viem/chains";

// Public client for ENS resolution
const ensClient = createPublicClient({
    chain: mainnet,
    transport: http(process.env.NEXT_PUBLIC_ETH_RPC_URL || "https://eth.llamarpc.com"),
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export interface AddressBookEntry {
    id: string;
    address: string;
    label: string;
    ensName: string | null;
    notes: string | null;
    isFavorite: boolean;
    useCount: number;
    lastUsedAt: string | null;
    createdAt: string;
}

/**
 * GET /api/address-book
 * 
 * Get the user's address book entries
 */
export async function GET(request: NextRequest) {
    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userAddress = session.userAddress.toLowerCase();

    try {
        const { data, error } = await supabase
            .from("shout_address_book")
            .select("*")
            .eq("user_address", userAddress)
            .order("is_favorite", { ascending: false })
            .order("use_count", { ascending: false })
            .order("label", { ascending: true });

        if (error) {
            console.error("[AddressBook] Error fetching:", error);
            return NextResponse.json({ error: "Failed to fetch address book" }, { status: 500 });
        }

        const entries: AddressBookEntry[] = (data || []).map((entry) => ({
            id: entry.id,
            address: entry.address,
            label: entry.label,
            ensName: entry.ens_name,
            notes: entry.notes,
            isFavorite: entry.is_favorite,
            useCount: entry.use_count,
            lastUsedAt: entry.last_used_at,
            createdAt: entry.created_at,
        }));

        return NextResponse.json({ entries });
    } catch (err) {
        console.error("[AddressBook] Error:", err);
        return NextResponse.json({ error: "Failed to fetch address book" }, { status: 500 });
    }
}

/**
 * POST /api/address-book
 * 
 * Add a new address to the address book
 */
export async function POST(request: NextRequest) {
    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userAddress = session.userAddress.toLowerCase();

    try {
        const body = await request.json();
        const { address: inputAddress, label, ensName: inputEnsName, notes, isFavorite } = body;

        // Validate label
        if (!label || typeof label !== "string" || label.trim().length === 0) {
            return NextResponse.json({ error: "Label is required" }, { status: 400 });
        }

        if (label.length > 50) {
            return NextResponse.json({ error: "Label too long (max 50 characters)" }, { status: 400 });
        }

        let resolvedAddress: string;
        let resolvedEnsName: string | null = inputEnsName || null;

        // Check if input is an ENS name or address
        if (!inputAddress) {
            return NextResponse.json({ error: "Address or ENS name is required" }, { status: 400 });
        }

        const trimmedInput = inputAddress.trim();
        
        // Check if it looks like an ENS name (contains a dot and ends with common TLDs)
        const isEnsName = /\.(eth|xyz|com|org|id|art|luxury|kred|club|luxe|reverse)$/i.test(trimmedInput);
        
        if (isEnsName) {
            // Resolve ENS name to address
            try {
                const normalizedName = normalize(trimmedInput.toLowerCase());
                const address = await ensClient.getEnsAddress({ name: normalizedName });
                
                if (!address) {
                    return NextResponse.json({ error: `Could not resolve ENS name: ${trimmedInput}` }, { status: 400 });
                }
                
                resolvedAddress = address.toLowerCase();
                resolvedEnsName = normalizedName;
            } catch (ensError) {
                console.error("[AddressBook] ENS resolution error:", ensError);
                return NextResponse.json({ error: `Invalid ENS name: ${trimmedInput}` }, { status: 400 });
            }
        } else if (isAddress(trimmedInput)) {
            // It's a valid address
            resolvedAddress = trimmedInput.toLowerCase();
            
            // Optionally try to get reverse ENS for the address if not provided
            if (!resolvedEnsName) {
                try {
                    const ensName = await ensClient.getEnsName({ address: trimmedInput as `0x${string}` });
                    if (ensName) {
                        resolvedEnsName = ensName;
                    }
                } catch {
                    // Ignore reverse lookup errors
                }
            }
        } else {
            return NextResponse.json({ error: "Invalid address or ENS name" }, { status: 400 });
        }

        // Check if address already exists
        const { data: existing } = await supabase
            .from("shout_address_book")
            .select("id")
            .eq("user_address", userAddress)
            .eq("address", resolvedAddress)
            .single();

        if (existing) {
            return NextResponse.json({ error: "Address already in address book" }, { status: 409 });
        }

        // Insert new entry
        const { data, error } = await supabase
            .from("shout_address_book")
            .insert({
                user_address: userAddress,
                address: resolvedAddress,
                label: label.trim(),
                ens_name: resolvedEnsName,
                notes: notes || null,
                is_favorite: isFavorite || false,
            })
            .select()
            .single();

        if (error) {
            console.error("[AddressBook] Error inserting:", error);
            return NextResponse.json({ error: "Failed to add address" }, { status: 500 });
        }

        return NextResponse.json({
            entry: {
                id: data.id,
                address: data.address,
                label: data.label,
                ensName: data.ens_name,
                notes: data.notes,
                isFavorite: data.is_favorite,
                useCount: data.use_count,
                lastUsedAt: data.last_used_at,
                createdAt: data.created_at,
            },
        });
    } catch (err) {
        console.error("[AddressBook] Error:", err);
        return NextResponse.json({ error: "Failed to add address" }, { status: 500 });
    }
}

/**
 * PATCH /api/address-book
 * 
 * Update an address book entry (toggle favorite, update label, etc.)
 */
export async function PATCH(request: NextRequest) {
    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userAddress = session.userAddress.toLowerCase();

    try {
        const body = await request.json();
        const { id, label, notes, isFavorite, incrementUseCount } = body;

        if (!id) {
            return NextResponse.json({ error: "Entry ID required" }, { status: 400 });
        }

        // Build update object
        const updates: Record<string, unknown> = {};
        
        if (label !== undefined) {
            if (typeof label !== "string" || label.trim().length === 0) {
                return NextResponse.json({ error: "Label cannot be empty" }, { status: 400 });
            }
            if (label.length > 50) {
                return NextResponse.json({ error: "Label too long" }, { status: 400 });
            }
            updates.label = label.trim();
        }
        
        if (notes !== undefined) {
            updates.notes = notes;
        }
        
        if (isFavorite !== undefined) {
            updates.is_favorite = isFavorite;
        }
        
        if (incrementUseCount) {
            // Use raw SQL for increment
            const { error: incError } = await supabase.rpc("increment_address_book_use_count", {
                entry_id: id,
            });
            if (incError) {
                // If the function doesn't exist, do a manual update
                const { data: current } = await supabase
                    .from("shout_address_book")
                    .select("use_count")
                    .eq("id", id)
                    .eq("user_address", userAddress)
                    .single();
                
                if (current) {
                    updates.use_count = (current.use_count || 0) + 1;
                    updates.last_used_at = new Date().toISOString();
                }
            }
        }

        if (Object.keys(updates).length === 0 && !incrementUseCount) {
            return NextResponse.json({ error: "No updates provided" }, { status: 400 });
        }

        const { data, error } = await supabase
            .from("shout_address_book")
            .update(updates)
            .eq("id", id)
            .eq("user_address", userAddress)
            .select()
            .single();

        if (error) {
            console.error("[AddressBook] Error updating:", error);
            return NextResponse.json({ error: "Failed to update" }, { status: 500 });
        }

        if (!data) {
            return NextResponse.json({ error: "Entry not found" }, { status: 404 });
        }

        return NextResponse.json({
            entry: {
                id: data.id,
                address: data.address,
                label: data.label,
                ensName: data.ens_name,
                notes: data.notes,
                isFavorite: data.is_favorite,
                useCount: data.use_count,
                lastUsedAt: data.last_used_at,
                createdAt: data.created_at,
            },
        });
    } catch (err) {
        console.error("[AddressBook] Error:", err);
        return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }
}

/**
 * DELETE /api/address-book
 * 
 * Delete an address book entry
 */
export async function DELETE(request: NextRequest) {
    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userAddress = session.userAddress.toLowerCase();

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "Entry ID required" }, { status: 400 });
        }

        const { error } = await supabase
            .from("shout_address_book")
            .delete()
            .eq("id", id)
            .eq("user_address", userAddress);

        if (error) {
            console.error("[AddressBook] Error deleting:", error);
            return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[AddressBook] Error:", err);
        return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }
}
