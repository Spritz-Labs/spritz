"use client";

import { useState, useCallback, useEffect } from "react";
import { type Address } from "viem";
import { supabase, isSupabaseConfigured } from "@/config/supabase";
import { useENS } from "./useENS";

export type FriendRequest = {
  id: string;
  from_address: string;
  to_address: string;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
  // Resolved data
  fromEnsName?: string | null;
  fromAvatar?: string | null;
  toEnsName?: string | null;
  toAvatar?: string | null;
};

export type Friend = {
  id: string;
  user_address: string;
  friend_address: string;
  nickname: string | null;
  created_at: string;
  // Resolved data
  ensName?: string | null;
  avatar?: string | null;
  shoutUsername?: string | null;
};

export function useFriendRequests(userAddress: Address | null) {
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { resolveAddressOrENS } = useENS();

  // Fetch all data
  const fetchData = useCallback(async () => {
    console.log("[fetchData] Starting...", { userAddress, isSupabaseConfigured, hasSupabase: !!supabase });
    if (!userAddress || !isSupabaseConfigured || !supabase) {
      console.log("[fetchData] Skipping - missing requirements");
      return;
    }

    setIsLoading(true);
    try {
      const normalizedAddress = userAddress.toLowerCase();
      console.log("[fetchData] Fetching for address:", normalizedAddress);

      // Fetch incoming requests
      const { data: incoming, error: incomingError } = await supabase
        .from("shout_friend_requests")
        .select("*")
        .eq("to_address", normalizedAddress)
        .eq("status", "pending");
      
      console.log("[fetchData] Incoming requests:", incoming, "Error:", incomingError);

      // Fetch outgoing requests
      const { data: outgoing, error: outgoingError } = await supabase
        .from("shout_friend_requests")
        .select("*")
        .eq("from_address", normalizedAddress)
        .eq("status", "pending");
      
      console.log("[fetchData] Outgoing requests:", outgoing, "Error:", outgoingError);

      // Fetch friends
      const { data: friendsData, error: friendsError } = await supabase
        .from("shout_friends")
        .select("*")
        .eq("user_address", normalizedAddress);
      
      console.log("[fetchData] Friends:", friendsData, "Error:", friendsError);

      // Resolve ENS for incoming requests
      const resolvedIncoming = await Promise.all(
        (incoming || []).map(async (req) => {
          const resolved = await resolveAddressOrENS(req.from_address);
          return {
            ...req,
            fromEnsName: resolved?.ensName,
            fromAvatar: resolved?.avatar,
          };
        })
      );

      // Resolve ENS and Shout username for friends (with error tolerance)
      const resolvedFriends = await Promise.all(
        (friendsData || []).map(async (friend) => {
          let ensName: string | null = null;
          let avatar: string | null = null;
          let shoutUsername: string | null = null;
          
          // Try ENS resolution (don't let it block friends list)
          try {
            const resolved = await resolveAddressOrENS(friend.friend_address);
            ensName = resolved?.ensName || null;
            avatar = resolved?.avatar || null;
          } catch (err) {
            console.warn("[fetchData] ENS resolution failed for:", friend.friend_address);
          }
          
          // Lookup Shout username
          try {
            if (supabase) {
              const { data: usernameData } = await supabase
                .from("shout_usernames")
                .select("username")
                .eq("wallet_address", friend.friend_address.toLowerCase())
                .maybeSingle();
              shoutUsername = usernameData?.username || null;
            }
          } catch (err) {
            console.warn("[fetchData] Username lookup failed for:", friend.friend_address);
          }
          
          return {
            ...friend,
            ensName,
            avatar,
            shoutUsername,
          };
        })
      );

      setIncomingRequests(resolvedIncoming);
      setOutgoingRequests(outgoing || []);
      setFriends(resolvedFriends);
    } catch (err) {
      console.error("Error fetching friend data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, resolveAddressOrENS]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time subscription for friend requests
  useEffect(() => {
    if (!userAddress || !isSupabaseConfigured || !supabase) return;

    const normalizedAddress = userAddress.toLowerCase();

    const channel = supabase
      .channel("friend_requests_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shout_friend_requests",
          filter: `to_address=eq.${normalizedAddress}`,
        },
        () => {
          fetchData();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shout_friend_requests",
          filter: `from_address=eq.${normalizedAddress}`,
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      if (supabase) supabase.removeChannel(channel);
    };
  }, [userAddress, fetchData]);

  // Send friend request
  const sendFriendRequest = useCallback(
    async (toAddress: string): Promise<boolean> => {
      console.log("[sendFriendRequest] Starting with:", { toAddress, userAddress, isSupabaseConfigured });
      
      if (!userAddress) {
        setError("Not logged in");
        return false;
      }
      
      if (!isSupabaseConfigured || !supabase) {
        setError("Supabase not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
        return false;
      }

      if (!toAddress || toAddress.length < 10) {
        setError("Invalid address provided");
        return false;
      }

      setIsLoading(true);
      setError(null);

      try {
        const normalizedFrom = userAddress.toLowerCase();
        const normalizedTo = toAddress.toLowerCase();
        
        console.log("[sendFriendRequest] Normalized addresses:", { normalizedFrom, normalizedTo });

        // Check if already friends
        console.log("[sendFriendRequest] Checking if already friends...");
        const { data: existingFriend, error: friendCheckError } = await supabase
          .from("shout_friends")
          .select("id")
          .eq("user_address", normalizedFrom)
          .eq("friend_address", normalizedTo)
          .maybeSingle();

        if (friendCheckError) {
          console.warn("[sendFriendRequest] Friend check warning:", friendCheckError);
          // Don't fail, just continue - table might not exist yet
        }

        if (existingFriend) {
          setError("Already friends with this address");
          return false;
        }

        // Check if request already exists (in either direction)
        console.log("[sendFriendRequest] Checking for existing requests...");
        const { data: existingRequests, error: requestCheckError } = await supabase
          .from("shout_friend_requests")
          .select("id, status")
          .or(`and(from_address.eq.${normalizedFrom},to_address.eq.${normalizedTo}),and(from_address.eq.${normalizedTo},to_address.eq.${normalizedFrom})`);
        
        if (requestCheckError) {
          console.warn("[sendFriendRequest] Request check warning:", requestCheckError);
          // Don't fail, just continue
        }

        console.log("[sendFriendRequest] Existing requests found:", existingRequests);

        // Only block if there's a pending request
        const pendingRequest = existingRequests?.find(r => r.status === "pending");
        if (pendingRequest) {
          setError("Friend request already pending");
          return false;
        }

        // Delete any old rejected/accepted requests to allow fresh start
        const oldRequests = existingRequests?.filter(r => r.status !== "pending");
        if (oldRequests && oldRequests.length > 0) {
          console.log("[sendFriendRequest] Cleaning up old requests...");
          for (const req of oldRequests) {
            await supabase
              .from("shout_friend_requests")
              .delete()
              .eq("id", req.id);
          }
        }

        // Ensure user exists
        console.log("[sendFriendRequest] Upserting user...");
        const { error: upsertError } = await supabase.from("shout_users").upsert({
          wallet_address: normalizedFrom,
        }, { onConflict: "wallet_address" });
        
        if (upsertError) {
          console.error("[sendFriendRequest] Upsert error:", upsertError);
        }

        // Create friend request
        console.log("[sendFriendRequest] Inserting friend request...");
        const { data: insertData, error: insertError } = await supabase
          .from("shout_friend_requests")
          .insert({
            from_address: normalizedFrom,
            to_address: normalizedTo,
            status: "pending",
          })
          .select();

        console.log("[sendFriendRequest] Insert result:", { insertData, insertError });

        if (insertError) {
          console.error("[sendFriendRequest] Insert error details:", insertError);
          throw new Error(insertError.message || "Failed to create friend request");
        }

        await fetchData();
        console.log("[sendFriendRequest] Success!");
        return true;
      } catch (err) {
        console.error("[sendFriendRequest] Caught error:", err);
        const errorMessage = err instanceof Error ? err.message : "Failed to send request";
        setError(errorMessage);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [userAddress, fetchData]
  );

  // Accept friend request
  const acceptRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      if (!userAddress || !isSupabaseConfigured || !supabase) return false;

      setIsLoading(true);
      try {
        const normalizedAddress = userAddress.toLowerCase();

        // Get the request
        const { data: request } = await supabase
          .from("shout_friend_requests")
          .select("*")
          .eq("id", requestId)
          .maybeSingle();

        if (!request) {
          setError("Request not found");
          return false;
        }

        // Update request status
        await supabase
          .from("shout_friend_requests")
          .update({ status: "accepted", updated_at: new Date().toISOString() })
          .eq("id", requestId);

        // Create bidirectional friendship
        await supabase.from("shout_friends").insert([
          {
            user_address: normalizedAddress,
            friend_address: request.from_address,
          },
          {
            user_address: request.from_address,
            friend_address: normalizedAddress,
          },
        ]);

        await fetchData();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to accept request");
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [userAddress, fetchData]
  );

  // Reject friend request
  const rejectRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      if (!isSupabaseConfigured || !supabase) return false;

      setIsLoading(true);
      try {
        await supabase
          .from("shout_friend_requests")
          .update({ status: "rejected", updated_at: new Date().toISOString() })
          .eq("id", requestId);

        await fetchData();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reject request");
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [fetchData]
  );

  // Remove friend
  const removeFriend = useCallback(
    async (friendId: string): Promise<boolean> => {
      if (!userAddress || !isSupabaseConfigured || !supabase) return false;

      setIsLoading(true);
      try {
        const friend = friends.find((f) => f.id === friendId);
        if (!friend) return false;

        const normalizedAddress = userAddress.toLowerCase();

        // Remove both directions of friendship
        await supabase
          .from("shout_friends")
          .delete()
          .or(`and(user_address.eq.${normalizedAddress},friend_address.eq.${friend.friend_address}),and(user_address.eq.${friend.friend_address},friend_address.eq.${normalizedAddress})`);

        await fetchData();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove friend");
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [userAddress, friends, fetchData]
  );

  // Update friend nickname
  const updateNickname = useCallback(
    async (friendId: string, nickname: string): Promise<boolean> => {
      if (!isSupabaseConfigured || !supabase) return false;

      try {
        await supabase
          .from("shout_friends")
          .update({ nickname })
          .eq("id", friendId);

        await fetchData();
        return true;
      } catch (err) {
        return false;
      }
    },
    [fetchData]
  );

  return {
    incomingRequests,
    outgoingRequests,
    friends,
    isLoading,
    error,
    sendFriendRequest,
    acceptRequest,
    rejectRequest,
    removeFriend,
    updateNickname,
    clearError: () => setError(null),
    refresh: fetchData,
    isConfigured: isSupabaseConfigured,
  };
}

