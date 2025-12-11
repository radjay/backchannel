-- Migration: Update media_analysis table for structured JSON responses
-- Run this in Supabase SQL Editor

-- Add new columns for structured data
ALTER TABLE media_analysis
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS transcription TEXT,
ADD COLUMN IF NOT EXISTS summary TEXT,
ADD COLUMN IF NOT EXISTS elements JSONB,
ADD COLUMN IF NOT EXISTS actions JSONB,
ADD COLUMN IF NOT EXISTS language VARCHAR(50),
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS raw_response JSONB;

-- The 'content' column will store the primary response (description or transcription)
-- for backwards compatibility and simple queries

-- Create index on transcription for search
CREATE INDEX IF NOT EXISTS idx_media_analysis_transcription ON media_analysis USING gin(to_tsvector('english', COALESCE(transcription, '')));
CREATE INDEX IF NOT EXISTS idx_media_analysis_description ON media_analysis USING gin(to_tsvector('english', COALESCE(description, '')));
