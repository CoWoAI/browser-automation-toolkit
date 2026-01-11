-- +migrate Up
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(64) NOT NULL,
    level VARCHAR(16) NOT NULL DEFAULT 'info',
    tool VARCHAR(128),
    message TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_logs_created_at ON logs(created_at DESC);
CREATE INDEX idx_logs_level ON logs(level);
CREATE INDEX idx_logs_tool ON logs(tool) WHERE tool IS NOT NULL;
CREATE INDEX idx_logs_external_id ON logs(external_id);

-- Full-text search on message
CREATE INDEX idx_logs_message_search ON logs USING gin(to_tsvector('english', message));

-- +migrate Down
DROP TABLE IF EXISTS logs;
