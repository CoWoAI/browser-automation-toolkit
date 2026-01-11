-- Combined schema for Docker initialization
-- This file is mounted to /docker-entrypoint-initdb.d/init.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Logs table for automation logs
CREATE TABLE IF NOT EXISTS logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(64) NOT NULL,
    level VARCHAR(16) NOT NULL DEFAULT 'info',
    tool VARCHAR(128),
    message TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_tool ON logs(tool) WHERE tool IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_logs_external_id ON logs(external_id);

-- Full-text search on message
CREATE INDEX IF NOT EXISTS idx_logs_message_search ON logs USING gin(to_tsvector('english', message));

-- Schema migrations tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mark initial migration as applied
INSERT INTO schema_migrations (version) VALUES ('001_create_logs.sql')
ON CONFLICT (version) DO NOTHING;
