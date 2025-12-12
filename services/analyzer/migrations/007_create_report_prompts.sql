-- Migration: Create report_prompts table for AI report generation
-- This table stores system and room-specific prompts for generating conversation reports

CREATE TABLE IF NOT EXISTS report_prompts (
  id SERIAL PRIMARY KEY,
  prompt_type VARCHAR(50) NOT NULL,      -- 'system' or 'room'
  room_id VARCHAR(255),                   -- NULL for system prompt, room_id for room-specific
  prompt_content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(prompt_type, room_id)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_report_prompts_type_room ON report_prompts(prompt_type, room_id);

-- Seed default system prompt
INSERT INTO report_prompts (prompt_type, room_id, prompt_content, is_active)
VALUES (
  'system',
  NULL,
  'You are an AI assistant that summarizes chat conversations. Generate a concise, well-organized report based on the messages provided.

Your report should include:

1. **Overview**: Brief summary of the conversation topic(s) and participants involved
2. **Key Points**: Main discussion items, decisions made, or important information shared
3. **Media Summary**: Note any images, videos, or audio files shared and describe their context if mentioned
4. **Timeline**: If relevant, highlight important timestamps or sequence of events
5. **Action Items**: Any tasks, follow-ups, or commitments mentioned by participants

Guidelines:
- Keep the report professional, objective, and easy to scan
- Use bullet points and clear sections for readability
- Include relevant timestamps when discussing specific events
- Maintain neutrality - report what was said without judgment
- If the conversation is casual/social, adapt the format accordingly
- For short conversations, keep the summary proportionally brief

The messages will be provided in the format:
[YYYY-MM-DD HH:MM] Sender: Message content
Media attachments are indicated as [IMAGE], [VIDEO], [AUDIO], or [FILE]',
  true
)
ON CONFLICT (prompt_type, room_id) DO UPDATE SET
  prompt_content = EXCLUDED.prompt_content,
  updated_at = NOW();
