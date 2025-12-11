-- Migration: Create tables for AI-powered media analysis
-- Run this in Supabase SQL Editor

-- 1. Analysis Jobs Queue
-- Used by archiver to enqueue jobs, analyzer to process them
CREATE TABLE IF NOT EXISTS analysis_jobs (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(255) NOT NULL UNIQUE,
  message_id INTEGER REFERENCES messages(id),
  room_id VARCHAR(255) NOT NULL,
  organization_id INTEGER,
  media_type VARCHAR(20) NOT NULL,           -- 'image', 'video', 'audio'
  media_url TEXT NOT NULL,                   -- mxc:// URL
  media_info JSONB,                          -- dimensions, duration, mimetype, size
  status VARCHAR(20) DEFAULT 'pending',      -- 'pending', 'processing', 'completed', 'failed'
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  CONSTRAINT valid_media_type CHECK (media_type IN ('image', 'video', 'audio'))
);

-- Indexes for efficient polling
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON analysis_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_event_id ON analysis_jobs(event_id);

-- 2. AI Prompts Storage
-- Stores system prompts with hierarchy: master -> media-type -> organization
CREATE TABLE IF NOT EXISTS ai_prompts (
  id SERIAL PRIMARY KEY,
  prompt_type VARCHAR(50) NOT NULL,          -- 'master', 'image', 'video', 'audio'
  organization_id INTEGER,                   -- NULL for global prompts
  prompt_name VARCHAR(100) NOT NULL,
  prompt_content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(prompt_type, organization_id, prompt_name)
);

CREATE INDEX IF NOT EXISTS idx_ai_prompts_type ON ai_prompts(prompt_type, organization_id);

-- 3. Media Analysis Results
-- Stores the AI-generated analysis for each media item
CREATE TABLE IF NOT EXISTS media_analysis (
  id SERIAL PRIMARY KEY,
  message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
  event_id VARCHAR(255) NOT NULL,
  media_type VARCHAR(20) NOT NULL,           -- 'image', 'video', 'audio'
  analysis_type VARCHAR(50) NOT NULL,        -- 'description', 'transcription'
  content TEXT NOT NULL,                     -- The analysis text
  provider VARCHAR(50),                      -- 'gemini', 'claude', 'openai'
  model_used VARCHAR(100),                   -- e.g., 'gemini-2.5-flash', 'claude-sonnet-4'
  tokens_used INTEGER,
  processing_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(event_id, analysis_type)
);

CREATE INDEX IF NOT EXISTS idx_media_analysis_event_id ON media_analysis(event_id);
CREATE INDEX IF NOT EXISTS idx_media_analysis_message_id ON media_analysis(message_id);

-- Enable Row Level Security (optional, adjust as needed)
-- ALTER TABLE analysis_jobs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE ai_prompts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE media_analysis ENABLE ROW LEVEL SECURITY;
