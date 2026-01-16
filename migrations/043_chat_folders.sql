-- Chat Folders table for organizing chats into emoji-labeled folders
CREATE TABLE IF NOT EXISTS shout_chat_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address TEXT NOT NULL,
    emoji TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_address, emoji)
);

-- Chat folder assignments - which chats belong to which folders
CREATE TABLE IF NOT EXISTS shout_chat_folder_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    chat_type TEXT NOT NULL CHECK (chat_type IN ('dm', 'group', 'channel', 'global')),
    folder_emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_address, chat_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_chat_folders_user ON shout_chat_folders(user_address);
CREATE INDEX IF NOT EXISTS idx_chat_folder_assignments_user ON shout_chat_folder_assignments(user_address);
CREATE INDEX IF NOT EXISTS idx_chat_folder_assignments_folder ON shout_chat_folder_assignments(user_address, folder_emoji);

-- Enable RLS
ALTER TABLE shout_chat_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE shout_chat_folder_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chat_folders
CREATE POLICY "Users can view their own folders" ON shout_chat_folders
    FOR SELECT USING (true);

CREATE POLICY "Users can insert their own folders" ON shout_chat_folders
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own folders" ON shout_chat_folders
    FOR UPDATE USING (true);

CREATE POLICY "Users can delete their own folders" ON shout_chat_folders
    FOR DELETE USING (true);

-- RLS Policies for chat_folder_assignments
CREATE POLICY "Users can view their own assignments" ON shout_chat_folder_assignments
    FOR SELECT USING (true);

CREATE POLICY "Users can insert their own assignments" ON shout_chat_folder_assignments
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own assignments" ON shout_chat_folder_assignments
    FOR UPDATE USING (true);

CREATE POLICY "Users can delete their own assignments" ON shout_chat_folder_assignments
    FOR DELETE USING (true);
