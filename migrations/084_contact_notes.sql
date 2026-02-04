-- Contact notes: per-viewer notes about another user (for user card / profile view)
CREATE TABLE IF NOT EXISTS shout_contact_notes (
    viewer_address TEXT NOT NULL,
    subject_address TEXT NOT NULL,
    notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (viewer_address, subject_address)
);

CREATE INDEX IF NOT EXISTS idx_contact_notes_viewer ON shout_contact_notes(viewer_address);

ALTER TABLE shout_contact_notes ENABLE ROW LEVEL SECURITY;

-- Backend API uses service_role; access is enforced in API (viewer_address = session user)
CREATE POLICY "Service role has full access to contact notes"
    ON shout_contact_notes FOR ALL TO service_role
    USING (true) WITH CHECK (true);

COMMENT ON TABLE shout_contact_notes IS 'User-defined notes about another user (viewer_address is the note author, subject_address is the person the note is about)';
