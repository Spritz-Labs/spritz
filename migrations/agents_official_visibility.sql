-- Add 'official' visibility option for AI Agents
-- Official agents are created by admins and visible to all users
-- They are searchable like public agents but managed by any admin

-- Drop the existing constraint if it exists
ALTER TABLE shout_agents
DROP CONSTRAINT IF EXISTS shout_agents_visibility_check;

-- Add the new constraint with 'official' option
ALTER TABLE shout_agents
ADD CONSTRAINT shout_agents_visibility_check
CHECK (visibility IN ('private', 'friends', 'public', 'official'));

-- Create index for official agents if not exists
CREATE INDEX IF NOT EXISTS idx_agents_official ON shout_agents(visibility)
WHERE visibility = 'official';

-- Comment on the visibility column
COMMENT ON COLUMN shout_agents.visibility IS 'Agent visibility: private (owner only), friends (owner + friends), public (discoverable), official (Spritz official agents managed by admins)';
