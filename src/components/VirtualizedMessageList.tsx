"use client";

import React, { useRef, useEffect, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

interface VirtualizedMessageListProps<T> {
    messages: T[];
    estimateSize?: (index: number) => number;
    overscan?: number;
    renderMessage: (message: T, index: number) => React.ReactNode;
    getKey: (message: T, index: number) => string;
    className?: string;
    autoScrollToBottom?: boolean;
    onLoadMore?: () => void;
    loadMoreThreshold?: number;
}

/**
 * Virtualized message list for chat interfaces.
 * Only renders visible messages plus a configurable overscan buffer,
 * drastically reducing DOM nodes for long conversations.
 */
export function VirtualizedMessageList<T>({
    messages,
    estimateSize = () => 72,
    overscan = 10,
    renderMessage,
    getKey,
    className = "",
    autoScrollToBottom = true,
    onLoadMore,
    loadMoreThreshold = 5,
}: VirtualizedMessageListProps<T>) {
    const parentRef = useRef<HTMLDivElement>(null);
    const wasAtBottomRef = useRef(true);

    const virtualizer = useVirtualizer({
        count: messages.length,
        getScrollElement: () => parentRef.current,
        estimateSize,
        overscan,
        getItemKey: (index) => getKey(messages[index], index),
    });

    const scrollToBottom = useCallback(() => {
        if (messages.length > 0) {
            virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
        }
    }, [virtualizer, messages.length]);

    useEffect(() => {
        if (autoScrollToBottom && wasAtBottomRef.current) {
            scrollToBottom();
        }
    }, [messages.length, autoScrollToBottom, scrollToBottom]);

    const handleScroll = useCallback(() => {
        const el = parentRef.current;
        if (!el) return;

        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
        wasAtBottomRef.current = atBottom;

        if (onLoadMore && el.scrollTop < loadMoreThreshold * estimateSize(0)) {
            onLoadMore();
        }
    }, [onLoadMore, loadMoreThreshold, estimateSize]);

    const items = virtualizer.getVirtualItems();

    return (
        <div ref={parentRef} className={`overflow-y-auto ${className}`} onScroll={handleScroll}>
            <div
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                }}
            >
                {items.map((virtualItem) => (
                    <div
                        key={virtualItem.key}
                        data-index={virtualItem.index}
                        ref={virtualizer.measureElement}
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            transform: `translateY(${virtualItem.start}px)`,
                        }}
                    >
                        {renderMessage(messages[virtualItem.index], virtualItem.index)}
                    </div>
                ))}
            </div>
        </div>
    );
}

export { useVirtualizer } from "@tanstack/react-virtual";
