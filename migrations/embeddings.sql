-- RAG Embeddings Migration
-- Requires pgvector extension for vector similarity search

-- Enable pgvector extension (run this first in Supabase SQL Editor)
CREATE EXTENSION IF NOT EXISTS vector;

-- Table to store chunked content with embeddings
CREATE TABLE IF NOT EXISTS shout_knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_id UUID NOT NULL REFERENCES shout_agent_knowledge(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES shout_agents(id) ON DELETE CASCADE,
    
    -- Content
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    
    -- Embedding (768 dimensions for text-embedding-004)
    embedding vector(768),
    
    -- Metadata
    token_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_chunk_per_knowledge UNIQUE (knowledge_id, chunk_index)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chunks_knowledge ON shout_knowledge_chunks(knowledge_id);
CREATE INDEX IF NOT EXISTS idx_chunks_agent ON shout_knowledge_chunks(agent_id);

-- Vector similarity index (using IVFFlat for faster approximate search)
-- Note: Run this AFTER you have some data, or it will be slow
-- CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON shout_knowledge_chunks 
-- USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- For now, use exact search (works well for small datasets)
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON shout_knowledge_chunks 
USING hnsw (embedding vector_cosine_ops);

-- Enable RLS
ALTER TABLE shout_knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can access knowledge chunks" ON shout_knowledge_chunks;
CREATE POLICY "Users can access knowledge chunks" ON shout_knowledge_chunks
    FOR ALL USING (true);

-- Function to find similar chunks for an agent
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
    p_agent_id UUID,
    p_query_embedding vector(768),
    p_match_count INTEGER DEFAULT 5,
    p_match_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    id UUID,
    knowledge_id UUID,
    content TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.knowledge_id,
        c.content,
        1 - (c.embedding <=> p_query_embedding) AS similarity
    FROM shout_knowledge_chunks c
    WHERE c.agent_id = p_agent_id
        AND 1 - (c.embedding <=> p_query_embedding) > p_match_threshold
    ORDER BY c.embedding <=> p_query_embedding
    LIMIT p_match_count;
END;
$$;

-- Update knowledge item status after indexing
CREATE OR REPLACE FUNCTION update_knowledge_indexed(
    p_knowledge_id UUID,
    p_chunk_count INTEGER
)
RETURNS void AS $$
BEGIN
    UPDATE shout_agent_knowledge
    SET status = 'indexed',
        chunk_count = p_chunk_count,
        indexed_at = NOW()
    WHERE id = p_knowledge_id;
END;
$$ LANGUAGE plpgsql;

-- Update knowledge item to failed status
CREATE OR REPLACE FUNCTION update_knowledge_failed(
    p_knowledge_id UUID,
    p_error_message TEXT
)
RETURNS void AS $$
BEGIN
    UPDATE shout_agent_knowledge
    SET status = 'failed',
        error_message = p_error_message
    WHERE id = p_knowledge_id;
END;
$$ LANGUAGE plpgsql;

