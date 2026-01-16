"use client";

import { useState } from "react";
import { GuestbookWidgetConfig } from "../ProfileWidgetTypes";

interface GuestbookWidgetProps {
    config: GuestbookWidgetConfig;
    size: string;
}

export function GuestbookWidget({ config, size }: GuestbookWidgetProps) {
    const { title = "Guestbook", messages = [] } = config;
    const [newMessage, setNewMessage] = useState("");
    
    const isLarge = size === '4x2';
    const displayMessages = messages.slice(0, isLarge ? 6 : 3);
    
    return (
        <div className="w-full h-full p-4 flex flex-col bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-2xl">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-white flex items-center gap-2">
                    <span>📝</span>
                    {title}
                </h3>
                <span className="text-xs text-zinc-500">{messages.length} entries</span>
            </div>
            
            {/* Messages list */}
            <div className="flex-1 overflow-y-auto space-y-2 mb-3">
                {displayMessages.length > 0 ? (
                    displayMessages.map((msg) => (
                        <div
                            key={msg.id}
                            className="p-2 bg-zinc-800/50 rounded-lg"
                        >
                            <div className="flex items-start gap-2">
                                <span className="text-lg">{msg.emoji || '💬'}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-white line-clamp-2">{msg.content}</p>
                                    <p className="text-[10px] text-zinc-500 mt-1">
                                        — {msg.author}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
                        No messages yet. Be the first!
                    </div>
                )}
            </div>
            
            {/* Input */}
            <div className="flex gap-2">
                <input
                    type="text"
                    placeholder="Leave a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="flex-1 px-3 py-2 bg-zinc-800/70 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                />
                <button className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors">
                    Send
                </button>
            </div>
        </div>
    );
}
