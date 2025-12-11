"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { type Address } from "viem";
import { supabase, isSupabaseConfigured } from "@/config/supabase";
import { type SocialLinks, SOCIAL_PLATFORMS } from "@/hooks/useSocials";
import { SocialLinksDisplay } from "./SocialsModal";

export type Friend = {
  id: string;
  address: Address;
  ensName: string | null;
  avatar: string | null;
  nickname: string | null;
  shoutUsername: string | null;
  addedAt: string;
  isOnline?: boolean;
};

type FriendStatus = {
  emoji: string;
  text: string;
  isDnd: boolean;
};

type FriendsListProps = {
  friends: Friend[];
  onCall: (friend: Friend) => void;
  onVideoCall?: (friend: Friend) => void;
  onChat?: (friend: Friend) => void;
  onRemove: (friendId: string) => void;
  isCallActive: boolean;
  unreadCounts?: Record<string, number>;
  hideChat?: boolean;
  friendsXMTPStatus?: Record<string, boolean>; // address -> can receive XMTP
};

export function FriendsList({
  friends,
  onCall,
  onVideoCall,
  onChat,
  onRemove,
  isCallActive,
  unreadCounts = {},
  hideChat = false,
  friendsXMTPStatus = {},
}: FriendsListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [friendStatuses, setFriendStatuses] = useState<Record<string, FriendStatus>>({});
  const [friendSocials, setFriendSocials] = useState<Record<string, SocialLinks>>({});
  const [friendPhones, setFriendPhones] = useState<Record<string, string>>({});

  // Fetch friend socials
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || friends.length === 0) return;

    const fetchSocials = async () => {
      if (!supabase) return;
      
      try {
        const addresses = friends.map(f => f.address.toLowerCase());
        
        const { data, error } = await supabase
          .from("shout_socials")
          .select("*")
          .in("wallet_address", addresses);

        if (error) {
          // Only log if there's actual error info
          if (error.message || error.code) {
            console.warn("[FriendsList] Error fetching socials:", error.message || error.code);
          }
          return;
        }

        if (data) {
          const socials: Record<string, SocialLinks> = {};
          data.forEach((row) => {
            socials[row.wallet_address] = {
              x: row.x_username || undefined,
              farcaster: row.farcaster_username || undefined,
              instagram: row.instagram_username || undefined,
              tiktok: row.tiktok_username || undefined,
              youtube: row.youtube_handle || undefined,
              linkedin: row.linkedin_username || undefined,
              github: row.github_username || undefined,
            };
          });
          setFriendSocials(socials);
        }
      } catch (err) {
        // Silently handle network errors - socials are non-critical
        console.warn("[FriendsList] Failed to fetch socials");
      }
    };

    fetchSocials();
  }, [friends]);

  // Fetch friend phone numbers
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || friends.length === 0) return;

    const fetchPhones = async () => {
      if (!supabase) return;
      
      try {
        const addresses = friends.map(f => f.address.toLowerCase());
        
        const { data, error } = await supabase
          .from("shout_phone_numbers")
          .select("wallet_address, phone_number")
          .in("wallet_address", addresses)
          .eq("verified", true);

        if (error) {
          if (error.message || error.code) {
            console.warn("[FriendsList] Error fetching phones:", error.message || error.code);
          }
          return;
        }

        if (data) {
          const phones: Record<string, string> = {};
          data.forEach((row) => {
            phones[row.wallet_address] = row.phone_number;
          });
          setFriendPhones(phones);
        }
      } catch (err) {
        // Silently handle network errors - phones are non-critical
        console.warn("[FriendsList] Failed to fetch phones");
      }
    };

    fetchPhones();
  }, [friends]);

  // Fetch friend statuses
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || friends.length === 0) return;

    const fetchStatuses = async () => {
      if (!supabase) return;
      
      const addresses = friends.map(f => f.address.toLowerCase());
      
      const { data, error } = await supabase
        .from("shout_user_settings")
        .select("wallet_address, status_emoji, status_text, is_dnd")
        .in("wallet_address", addresses);

      if (error) {
        console.error("[FriendsList] Error fetching statuses:", error);
        return;
      }

      if (data) {
        const statuses: Record<string, FriendStatus> = {};
        data.forEach((row) => {
          statuses[row.wallet_address] = {
            emoji: row.status_emoji || "💬",
            text: row.status_text || "",
            isDnd: row.is_dnd || false,
          };
        });
        setFriendStatuses(statuses);
      }
    };

    fetchStatuses();

    // Subscribe to realtime updates
    const channel = supabase
      ?.channel("friend-statuses")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shout_user_settings",
        },
        (payload) => {
          const newData = payload.new as any;
          if (newData && friends.some(f => f.address.toLowerCase() === newData.wallet_address)) {
            setFriendStatuses(prev => ({
              ...prev,
              [newData.wallet_address]: {
                emoji: newData.status_emoji || "💬",
                text: newData.status_text || "",
                isDnd: newData.is_dnd || false,
              },
            }));
          }
        }
      )
      .subscribe();

    return () => {
      if (channel) supabase?.removeChannel(channel);
    };
  }, [friends]);

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatPhoneNumber = (phone: string) => {
    // Show formatted phone: (***) ***-1234
    if (phone.length >= 4) {
      const last4 = phone.slice(-4);
      return `(***) ***-${last4}`;
    }
    return "Verified";
  };

  const getDisplayName = (friend: Friend) => {
    // Priority: nickname > shoutUsername > ensName > address
    return friend.nickname || (friend.shoutUsername ? `@${friend.shoutUsername}` : null) || friend.ensName || formatAddress(friend.address);
  };

  const getSecondaryText = (friend: Friend) => {
    const displayName = getDisplayName(friend);
    const parts: string[] = [];
    
    // Show shoutUsername if not already the display name
    if (friend.shoutUsername && !displayName.includes(friend.shoutUsername)) {
      parts.push(`@${friend.shoutUsername}`);
    }
    // Show ENS if not already the display name
    if (friend.ensName && !displayName.includes(friend.ensName)) {
      parts.push(friend.ensName);
    }
    // Always show truncated address if we have other names
    if (parts.length > 0 || friend.nickname || friend.shoutUsername || friend.ensName) {
      parts.push(formatAddress(friend.address));
    }
    
    return parts.length > 0 ? parts.join(" · ") : null;
  };

  if (friends.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-zinc-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        </div>
        <p className="text-zinc-400 font-medium">No friends yet</p>
        <p className="text-zinc-600 text-sm mt-1">
          Add friends to start calling them
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <AnimatePresence>
        {friends.map((friend, index) => (
          <motion.div
            key={friend.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ delay: index * 0.05 }}
            className="group"
          >
            <div className="bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 rounded-xl p-3 sm:p-4 transition-all">
              <div className="flex items-center gap-3">
                {/* Avatar & Info - Clickable to expand on mobile */}
                <button
                  onClick={() => setExpandedId(expandedId === friend.id ? null : friend.id)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left sm:cursor-default"
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    {friend.avatar ? (
                      <img
                        src={friend.avatar}
                        alt={getDisplayName(friend)}
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                        <span className="text-white font-bold text-base sm:text-lg">
                          {getDisplayName(friend)[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                    {friend.isOnline && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 sm:w-4 sm:h-4 bg-emerald-500 rounded-full border-2 border-zinc-800" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 mr-1">
                    <div className="flex items-center gap-1.5">
                      {/* Status emoji */}
                      {friendStatuses[friend.address.toLowerCase()] && (
                        <span className="text-sm flex-shrink-0" title={friendStatuses[friend.address.toLowerCase()].text || "Status"}>
                          {friendStatuses[friend.address.toLowerCase()].emoji}
                        </span>
                      )}
                      <p className="text-white font-medium truncate text-sm sm:text-base">
                        {getDisplayName(friend)}
                      </p>
                      {/* Phone verified badge */}
                      {friendPhones[friend.address.toLowerCase()] && (
                        <span 
                          className="flex-shrink-0 text-emerald-400" 
                          title={`Phone verified: ${formatPhoneNumber(friendPhones[friend.address.toLowerCase()])}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                        </span>
                      )}
                      {/* DND badge */}
                      {friendStatuses[friend.address.toLowerCase()]?.isDnd && (
                        <span className="flex-shrink-0 text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
                          DND
                        </span>
                      )}
                    </div>
                    {/* Status text or secondary info */}
                    {friendStatuses[friend.address.toLowerCase()]?.text ? (
                      <p className="text-zinc-400 text-xs sm:text-sm truncate">
                        {friendStatuses[friend.address.toLowerCase()].text}
                      </p>
                    ) : getSecondaryText(friend) ? (
                      <p className="text-zinc-500 text-xs sm:text-sm truncate">
                        {getSecondaryText(friend)}
                      </p>
                    ) : null}
                  </div>
                </button>

                {/* Actions - Compact on mobile */}
                <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                  {/* Chat Button - hidden on small mobile, shown on sm+ */}
                  {!hideChat && onChat && friendsXMTPStatus[friend.address.toLowerCase()] !== false && (
                    <div className="relative hidden sm:block">
                      <button
                        onClick={() => onChat(friend)}
                        disabled={friendsXMTPStatus[friend.address.toLowerCase()] === undefined}
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-colors ${
                          friendsXMTPStatus[friend.address.toLowerCase()] === undefined
                            ? "bg-zinc-700/50 text-zinc-500 cursor-not-allowed"
                            : unreadCounts[friend.address.toLowerCase()]
                              ? "bg-blue-500 hover:bg-blue-600 text-white"
                              : "bg-blue-500/10 hover:bg-blue-500/20 text-blue-400"
                        }`}
                        title="Chat"
                      >
                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </button>
                      {unreadCounts[friend.address.toLowerCase()] > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {unreadCounts[friend.address.toLowerCase()] > 9 ? "9+" : unreadCounts[friend.address.toLowerCase()]}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Voice Call Button */}
                  <button
                    onClick={() => onCall(friend)}
                    disabled={isCallActive}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Call"
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </button>

                  {/* Video Call Button - hidden on small mobile */}
                  {onVideoCall && (
                    <button
                      onClick={() => onVideoCall(friend)}
                      disabled={isCallActive}
                      className="hidden sm:flex w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Video"
                    >
                      <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  )}

                  {/* More Options */}
                  <button
                    onClick={() => setExpandedId(expandedId === friend.id ? null : friend.id)}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-zinc-700/50 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Expanded Options */}
              <AnimatePresence>
                {expandedId === friend.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 pt-3 border-t border-zinc-700/50"
                  >
                    {/* Mobile-only action buttons */}
                    <div className="flex items-center gap-2 mb-3 sm:hidden">
                      {/* Video Call - Mobile */}
                      {onVideoCall && (
                        <button
                          onClick={() => {
                            onVideoCall(friend);
                            setExpandedId(null);
                          }}
                          disabled={isCallActive}
                          className="flex-1 py-2.5 px-3 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Video
                        </button>
                      )}
                      {/* Chat - Mobile */}
                      {!hideChat && onChat && friendsXMTPStatus[friend.address.toLowerCase()] !== false && (
                        <button
                          onClick={() => {
                            onChat(friend);
                            setExpandedId(null);
                          }}
                          disabled={friendsXMTPStatus[friend.address.toLowerCase()] === undefined}
                          className={`flex-1 py-2.5 px-3 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 ${
                            friendsXMTPStatus[friend.address.toLowerCase()] === undefined
                              ? "bg-zinc-700/50 text-zinc-500 cursor-not-allowed"
                              : unreadCounts[friend.address.toLowerCase()]
                                ? "bg-blue-500 hover:bg-blue-600 text-white"
                                : "bg-blue-500/10 hover:bg-blue-500/20 text-blue-400"
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          Chat
                          {unreadCounts[friend.address.toLowerCase()] > 0 && (
                            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                              {unreadCounts[friend.address.toLowerCase()] > 9 ? "9+" : unreadCounts[friend.address.toLowerCase()]}
                            </span>
                          )}
                        </button>
                      )}
                    </div>
                    
                    {/* Friend's Phone Number */}
                    {friendPhones[friend.address.toLowerCase()] && (
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 rounded-lg">
                          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <span className="text-emerald-300 text-sm font-medium">
                            {formatPhoneNumber(friendPhones[friend.address.toLowerCase()])}
                          </span>
                          <svg className="w-3.5 h-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                    )}

                    {/* Friend's Socials */}
                    {friendSocials[friend.address.toLowerCase()] && 
                     Object.values(friendSocials[friend.address.toLowerCase()]).some(Boolean) && (
                      <div className="mb-3">
                        <p className="text-zinc-500 text-xs mb-2">Socials</p>
                        <SocialLinksDisplay 
                          socials={friendSocials[friend.address.toLowerCase()]} 
                          compact 
                        />
                      </div>
                    )}
                    
                    {/* Copy & Remove buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(friend.address);
                        }}
                        className="flex-1 py-2 px-3 rounded-lg bg-zinc-700/50 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy
                      </button>
                      <button
                        onClick={() => {
                          onRemove(friend.id);
                          setExpandedId(null);
                        }}
                        className="py-2 px-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm transition-colors flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Remove
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}


