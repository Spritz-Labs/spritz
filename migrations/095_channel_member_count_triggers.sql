-- Keep shout_public_channels.member_count in sync with shout_channel_members via triggers.
-- This fixes staff-only channels (e.g. The Bunker) where members are added via upsert without calling the join API.

-- Trigger function: after insert on shout_channel_members, increment channel member_count
CREATE OR REPLACE FUNCTION trigger_increment_channel_member_count()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM increment_channel_members(NEW.channel_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function: after delete on shout_channel_members, decrement channel member_count
CREATE OR REPLACE FUNCTION trigger_decrement_channel_member_count()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM decrement_channel_members(OLD.channel_id);
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_channel_members_after_insert ON shout_channel_members;
CREATE TRIGGER tr_channel_members_after_insert
    AFTER INSERT ON shout_channel_members
    FOR EACH ROW
    EXECUTE FUNCTION trigger_increment_channel_member_count();

DROP TRIGGER IF EXISTS tr_channel_members_after_delete ON shout_channel_members;
CREATE TRIGGER tr_channel_members_after_delete
    AFTER DELETE ON shout_channel_members
    FOR EACH ROW
    EXECUTE FUNCTION trigger_decrement_channel_member_count();

-- Fix existing counts (e.g. The Bunker and any channel where members were added outside the join API)
UPDATE shout_public_channels c
SET member_count = COALESCE(
    (SELECT count(*)::integer FROM shout_channel_members m WHERE m.channel_id = c.id),
    0
)
WHERE c.member_count IS DISTINCT FROM (
    SELECT count(*)::integer FROM shout_channel_members m WHERE m.channel_id = c.id
);
