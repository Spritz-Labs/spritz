# UX improvements: Chats, DMs, Channels, Group chats

Recommendations and implemented changes to improve UX across the unified chat list, DMs, channels, and group chats.

---

## Implemented

### 1. Empty-state CTAs (Unified Chat List)

- When there are **no chats yet**, the empty state now shows actionable buttons:
    - **Add friend** – opens Add Friend modal
    - **Browse channels** – opens Browse Channels (with create flow)
    - **Create group** – opens Create Group modal (disabled when user has no friends)
- When a folder is selected and empty, copy explains to use the folder icon on a chat to move it.

### 2. Suggested prompts in empty DMs (ChatModal)

- When a DM has **no messages yet**, the empty state shows three quick starters:
    - "Hey! 👋"
    - "What's up?"
    - "Let's chat!"
- Tapping one sends that message immediately (no need to type).

---

## Recommended next steps

### Discovery & onboarding

- **New user empty state**  
  If the user has no friends and no chats, consider a single CTA: “Add your first friend” or “Connect wallet to find friends,” instead of multiple options.
- **First-time tooltips**  
  Optional one-time hints: “Tap a chat to open it,” “Long-press a chat to add to a folder,” “Use the + button to start a channel or group.”

### Consistency across chat types

- **Suggested starters everywhere**  
  Use the same pattern (2–3 tap-to-send suggestions) in:
    - Group chat empty state (`GroupChatModal`)
    - Channel empty state (`ChannelChatModal`)
    - Global/Alpha empty state (`AlphaChatModal`)
- **Unread / “New messages”**  
  You already have `UnreadDivider` and scroll-to-bottom in channel chat. Use the same pattern in DMs and group chat so “new since you left” is clear and one tap scrolls to bottom.
- **Loading states**  
  Use `ChatSkeleton` (or the same skeleton pattern) in all chat modals on first load so DM, group, and channel feel consistent.

### Keyboard & power users

- **Global shortcuts**
    - `Cmd/Ctrl + K`: focus chat search or open global search.
    - `Cmd/Ctrl + N`: open the “New” menu (channel / group).
- **In-chat**
    - `Cmd/Ctrl + F`: open in-chat message search where available.
    - `Escape`: close modal or clear reply/selection (already in place in many modals).
- **Accessibility**  
  Ensure chat list and message list are focusable and navigable with keyboard (arrow keys, Enter to open/send).

### List & navigation

- **Last message preview**  
  You already show `lastMessage` in the unified list. For groups/channels, consider prefixing with sender name (e.g. “Alice: See you there”) when space allows.
- **Sort options**  
  Let users switch list sort: “Recent” (default), “Unread first,” “A–Z.”
- **“New DM” from New menu**  
  Add a “Message a friend” (or “New DM”) option that opens Add Friend or a friend picker, so starting a DM doesn’t require going to the Friends tab first.

### Composer & replies

- **Draft restored**  
  When a draft is restored on open, show a short toast or inline note: “Draft restored” with an option to discard, so users know why the input is pre-filled.
- **Reply bar**  
  Keep the reply preview compact and clearly dismissible (X or swipe). Consider showing a thin left border or icon so reply context is obvious.

### Channels & groups

- **Channel list**  
  In Browse Channels, show member count, last activity, or a short description so users can choose without opening each channel.
- **Group info**  
  In group header, show member count and optional “View all” to open a member list (and add/remove if the user has permission).

### Performance & polish

- **Virtualized list**  
  For channels or DMs with hundreds of rows, virtualize the chat list so scroll stays smooth.
- **Optimistic updates**  
  You already do optimistic sends. Consistently roll back and show a “Tap to retry” or “Resend” on failure across DM, group, and channel.

---

## File reference

| Area              | Main files                                                                    |
| ----------------- | ----------------------------------------------------------------------------- |
| Unified chat list | `UnifiedChatList.tsx`, `Dashboard.tsx` (unifiedChats, handleUnifiedChatClick) |
| DM                | `ChatModal.tsx`                                                               |
| Group             | `GroupChatModal.tsx`                                                          |
| Channel           | `ChannelChatModal.tsx`                                                        |
| Global / Alpha    | `AlphaChatModal.tsx`                                                          |
| Empty states      | Above components + `GroupsList.tsx`, `GlobalSearchModal.tsx`                  |
| New chat menu     | `Dashboard.tsx` (New dropdown: Public Channel, Private Group)                 |
