-- Add suggested questions for agents
-- Official agents can define custom questions; others get auto-generated

ALTER TABLE shout_agents 
ADD COLUMN IF NOT EXISTS suggested_questions TEXT[];

COMMENT ON COLUMN shout_agents.suggested_questions IS 'Custom suggested questions for Official agents (up to 4). NULL for auto-generated.';
