-- Migration: Seed default system prompts for media analysis
-- Run this in Supabase SQL Editor after 001_create_analysis_tables.sql

-- Master System Prompt (applies to all media types)
INSERT INTO ai_prompts (prompt_type, organization_id, prompt_name, prompt_content, is_active)
VALUES (
  'master',
  NULL,
  'default',
  'You are an AI assistant analyzing media content from archived chat messages.
Your role is to provide accurate, concise descriptions that make the content
searchable and accessible.

Guidelines:
- Be objective and factual in descriptions
- Note any text visible in images/videos
- Identify key objects, people (without identifying individuals), and actions
- Keep descriptions concise but comprehensive
- If content is unclear or low quality, note this
- Flag any potentially sensitive content without detailed description',
  true
)
ON CONFLICT (prompt_type, organization_id, prompt_name) DO UPDATE
SET prompt_content = EXCLUDED.prompt_content, updated_at = NOW();

-- Image System Prompt
INSERT INTO ai_prompts (prompt_type, organization_id, prompt_name, prompt_content, is_active)
VALUES (
  'image',
  NULL,
  'default',
  'Analyze this image and provide:
1. A brief summary (1-2 sentences)
2. Key elements visible (objects, text, scenes)
3. Any notable details relevant to the context

Format your response as:
SUMMARY: [brief description]
ELEMENTS: [comma-separated list]
DETAILS: [additional observations]',
  true
)
ON CONFLICT (prompt_type, organization_id, prompt_name) DO UPDATE
SET prompt_content = EXCLUDED.prompt_content, updated_at = NOW();

-- Video System Prompt
INSERT INTO ai_prompts (prompt_type, organization_id, prompt_name, prompt_content, is_active)
VALUES (
  'video',
  NULL,
  'default',
  'Analyze this video and provide:
1. Overall summary of the video content
2. Key actions or events observed
3. Any progression or changes throughout
4. Notable elements (text, objects, scenes)
5. Audio transcription if speech is present

Format your response as:
SUMMARY: [what the video shows]
ACTIONS: [what is happening]
ELEMENTS: [key objects/text visible]
TRANSCRIPTION: [any speech or important audio, or "No speech detected"]',
  true
)
ON CONFLICT (prompt_type, organization_id, prompt_name) DO UPDATE
SET prompt_content = EXCLUDED.prompt_content, updated_at = NOW();

-- Audio System Prompt
INSERT INTO ai_prompts (prompt_type, organization_id, prompt_name, prompt_content, is_active)
VALUES (
  'audio',
  NULL,
  'default',
  'Transcribe this audio message and provide context.

Format your response as:
TRANSCRIPTION: [the transcribed text]
LANGUAGE: [detected language]
NOTES: [any relevant observations about tone, background sounds, etc.]',
  true
)
ON CONFLICT (prompt_type, organization_id, prompt_name) DO UPDATE
SET prompt_content = EXCLUDED.prompt_content, updated_at = NOW();
