-- Allow users to update their own event registration (for PATCH /api/events/[id]/register)
CREATE POLICY "Users can update own registration"
ON shout_event_user_registrations FOR UPDATE
USING (true);
