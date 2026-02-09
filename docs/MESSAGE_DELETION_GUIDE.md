# Message Deletion Guide

## How Message Deletion Works

Message deletion is fully implemented across all chat types in Spritz. Users can delete their own messages, and admins/moderators can delete any message for moderation purposes.

## User Experience

### For Regular Users
1. **Tap on your own message** - The message highlights with an orange background
2. **Message Action Bar appears** at the bottom of the screen with quick actions
3. **Tap "More"** to expand additional actions
4. **Tap "Delete"** (appears in red) - A confirmation prompt will appear
5. **Confirm deletion** - The message is permanently deleted

### For Admins/Moderators
1. **Tap on any message** (including messages from other users)
2. **Message Action Bar appears**
3. **Tap "More"** → **"Delete"** (available for all messages)
4. **Confirm deletion** - The message is removed

## Implementation by Chat Type

### 1. Direct Messages (DMs)
- **File**: `src/components/ChatModal.tsx`
- **Delete Permission**: `isOwn || isGlobalAdmin`
- **Who can delete**:
  - Users: Their own messages
  - Global admins: Any message
- **Method**: Soft delete (marks message as deleted in database)

### 2. Group Chats
- **File**: `src/components/GroupChatModal.tsx`
- **Delete Permission**: `isOwn || isAdmin`
- **Who can delete**:
  - Users: Their own messages
  - Group admins: Any message in their group
  - Global admins: Any message
- **Method**: Removes from local state (Waku-based, ephemeral)

### 3. Public Channels
- **File**: `src/components/ChannelChatModal.tsx`
- **Delete Permission**: `isOwn || isAdmin`
- **API**: `/api/channels/[id]/messages/[messageId]` (DELETE)
- **Who can delete**:
  - Users: Their own messages
  - Channel admins: Any message
  - Global admins: Any message
- **Method**: Soft delete via API (marks as deleted)

### 4. POAP Channels
- Same as Public Channels (POAP channels are regular channels with a `poap_event_id`)

### 5. Spritz Global Chat
- **File**: `src/components/AlphaChatModal.tsx`
- **Delete Permission**: `isOwn || moderation.permissions.canDelete`
- **API**: `/api/alpha/messages/[messageId]` (DELETE)
- **Who can delete**:
  - Users: Their own messages
  - Moderators with delete permission: Any message
- **Method**: Soft delete via API

### 6. Location Chats
- **File**: `src/components/LocationChatModal.tsx`
- **Delete Permission**: `isOwn || canModerateChat`
- **API**: `/api/location-chats/[id]/messages` (DELETE with messageId param)
- **Who can delete**:
  - Users: Their own messages
  - Chat creator: Any message
  - Global admins: Any message
- **Method**: Hard delete via API

## API Endpoints

### Channel Messages
```
DELETE /api/channels/[id]/messages/[messageId]
```
- Checks if user is message owner OR admin
- Soft deletes the message (marks `is_deleted: true`)

### Global Chat Messages
```
DELETE /api/alpha/messages/[messageId]
```
- Checks if user is message owner OR has moderation permissions
- Soft deletes the message

### Location Chat Messages
```
DELETE /api/location-chats/[id]/messages?messageId=xxx
```
- Checks if user is message owner OR chat creator OR global admin
- Hard deletes the message

### DMs
```
DELETE /api/messages/delete?messageId=xxx
```
- Checks if user is message owner OR global admin
- Soft deletes the message

## Security

### Authentication
All delete endpoints require proper authentication via session cookies. The previous header-based authentication fallback has been removed to prevent spoofing attacks.

### Authorization Checks
Each endpoint verifies:
1. **Session exists** - User must be logged in
2. **Ownership OR Admin status** - User must either own the message or have admin/moderator rights
3. **Message exists** - Message must exist in the specified chat

### Admin Detection
- **Global Admins**: Checked via `shout_admins` table
- **Channel Admins**: Checked via channel creator or global admin
- **Group Admins**: Checked via group membership with admin role
- **Location Chat Moderators**: Checked via chat creator or global admin

## Code Components

### MessageActionBar
**File**: `src/components/MessageActionBar.tsx`

Shows the delete button when:
```typescript
show: (config.canDelete ?? config.isOwn) && !!callbacks.onDelete
```

The delete button appears in the "More" actions section and is styled in red to indicate it's a destructive action.

### Message Configuration
When a user taps a message, a `MessageActionConfig` is created:
```typescript
{
  messageId: string;
  messageContent: string;
  isOwn: boolean;
  canDelete: boolean; // isOwn || isAdmin/isModerator
  // ... other properties
}
```

## Testing Checklist

To verify message deletion works correctly:

- [ ] **DMs**: User can delete own messages
- [ ] **DMs**: Admin can delete any message
- [ ] **Group Chats**: User can delete own messages
- [ ] **Group Chats**: Group admin can delete any message
- [ ] **Public Channels**: User can delete own messages  
- [ ] **Public Channels**: Channel admin can delete any message
- [ ] **POAP Channels**: Same as public channels
- [ ] **Global Chat**: User can delete own messages
- [ ] **Global Chat**: Moderator can delete any message
- [ ] **Location Chats**: User can delete own messages
- [ ] **Location Chats**: Chat creator can delete any message
- [ ] **Location Chats**: Global admin can delete any message

## Troubleshooting

### Delete button not showing
1. Check if `MessageActionBar` is receiving the `onDelete` callback
2. Verify `canDelete` is set correctly: `isOwn || isAdmin`
3. Ensure the message is tappable (not blocked by other UI elements)

### Delete fails with 403 Forbidden
1. Check user session is valid
2. Verify admin status in `shout_admins` table (for global admins)
3. Check channel/group membership for context-specific admins

### Delete button shows but does nothing on PWA
This was a z-index/stacking context issue that was fixed by using React Portals. The `MessageActionBar` now renders directly to `document.body`.

## Recent Fixes

1. **SSR Portal Fix** (2026-02-09): Added mounted state check to prevent React Portal errors during server-side rendering
2. **PWA Z-Index Fix** (2026-02-09): Used React Portal to fix `MessageActionBar` not appearing on PWA due to stacking context issues
3. **Security Fix**: Removed `x-user-address` header fallback to prevent authentication spoofing
4. **Membership Check**: Added proper membership verification for channel reactions and messages
