# PRD: AI-Powered Media Analysis

## Overview

Add AI-powered analysis capabilities to the archiver service to automatically process and extract insights from media content (images, videos, and audio) as messages are archived.

## Goals

1. **Image Analysis**: Generate descriptions of visual content in images
2. **Video Analysis**: Describe visual content and transcribe audio
3. **Audio Analysis**: Transcribe voice notes and audio messages
4. **Contextual Processing**: Support organization-specific prompts for domain-relevant analysis
5. **Searchability**: Make media content searchable via text descriptions

## Non-Goals

- Real-time streaming analysis
- Face recognition or identification
- Sentiment analysis (future consideration)
- Translation (future consideration)

## Key Decisions

- **Default Provider**: Gemini 2.5 Flash for all media analysis (vision + audio transcription)
- **Provider Architecture**: Abstraction layer supporting Gemini, Claude, OpenAI (configurable per media type)
- **Max Video Length**: 5 minutes
- **Processing Mode**: Job queue - archiver enqueues, analyzer service processes
- **Architecture**: Separate analyzer service (decoupled from archiver)

---

## System Architecture

### Service Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│  Matrix Server  │────────▶│    Archiver     │────────▶│   Supabase DB   │
│                 │  sync   │    Service      │  store  │                 │
└─────────────────┘         └────────┬────────┘         └────────▲────────┘
                                     │                           │
                                     │ enqueue job               │ read job
                                     │ (on media msg)            │ store results
                                     ▼                           │
                            ┌─────────────────┐                  │
                            │                 │                  │
                            │  analysis_jobs  │──────────────────┤
                            │     (queue)     │                  │
                            │                 │                  │
                            └────────┬────────┘                  │
                                     │                           │
                                     │ poll for pending          │
                                     ▼                           │
                            ┌─────────────────┐                  │
                            │                 │                  │
                            │    Analyzer     │──────────────────┘
                            │    Service      │
                            │                 │
                            └────────┬────────┘
                                     │
                                     │ analyze
                                     ▼
                            ┌─────────────────┐
                            │                 │
                            │  Gemini 2.5     │
                            │  Flash API      │
                            │                 │
                            └─────────────────┘
```

### Service Responsibilities

**Archiver Service** (`services/archiver-js/`)
- Syncs messages from Matrix
- Downloads and stores media files
- Enqueues analysis jobs for media messages
- Does NOT wait for analysis to complete

**Analyzer Service** (`services/analyzer/`)
- Polls for pending analysis jobs
- Downloads media from Matrix (or storage)
- Routes to configured AI provider via provider abstraction
- Stores analysis results
- Updates job status

### Prompt Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│                  Master System Prompt                    │
│  (Base instructions for all media processing)            │
├─────────────────────────────────────────────────────────┤
│     Media-Type System Prompts (Image/Video/Audio)        │
│  (Type-specific analysis instructions)                   │
├─────────────────────────────────────────────────────────┤
│         Organization-Specific System Prompts             │
│  (Domain context: terminology, focus areas, etc.)        │
└─────────────────────────────────────────────────────────┘
```

### Provider Architecture

The analyzer uses a provider abstraction layer to support multiple AI backends:

```
┌─────────────────────────────────────────────────────────┐
│                   Analyzer Service                       │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Provider Interface                  │    │
│  │  analyzeImage(media, prompt) → AnalysisResult   │    │
│  │  analyzeVideo(media, prompt) → AnalysisResult   │    │
│  │  analyzeAudio(media, prompt) → AnalysisResult   │    │
│  └─────────────────────────────────────────────────┘    │
│           │              │              │                │
│           ▼              ▼              ▼                │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│  │   Gemini    │ │   Claude    │ │   OpenAI    │        │
│  │  Provider   │ │  Provider   │ │  Provider   │        │
│  │  (default)  │ │  (future)   │ │  (future)   │        │
│  └─────────────┘ └─────────────┘ └─────────────┘        │
└─────────────────────────────────────────────────────────┘
```

**Provider Interface** (`src/providers/types.ts`):

```typescript
interface AnalysisProvider {
  name: string;

  // Capability flags
  supportsImage: boolean;
  supportsVideo: boolean;
  supportsAudio: boolean;
  maxVideoDurationSec?: number;

  // Analysis methods
  analyzeImage(media: Buffer, mimeType: string, prompt: string): Promise<AnalysisResult>;
  analyzeVideo(media: Buffer, mimeType: string, prompt: string): Promise<AnalysisResult>;
  analyzeAudio(media: Buffer, mimeType: string, prompt: string): Promise<AnalysisResult>;
}

interface AnalysisResult {
  content: string;           // The analysis text
  tokensUsed?: number;
  processingTimeMs: number;
  modelUsed: string;         // e.g., "gemini-2.5-flash", "claude-sonnet-4"
}
```

**Configuration** allows selecting provider per media type:

```typescript
// config.ts
export const config = {
  providers: {
    image: process.env.IMAGE_PROVIDER || 'gemini',   // 'gemini' | 'claude' | 'openai'
    video: process.env.VIDEO_PROVIDER || 'gemini',
    audio: process.env.AUDIO_PROVIDER || 'gemini',
  },
  // Provider-specific settings
  gemini: {
    apiKey: process.env.GOOGLE_AI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  },
  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o',
  },
};
```

### Job Queue Schema

```sql
CREATE TABLE analysis_jobs (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(255) NOT NULL UNIQUE,
  message_id INTEGER REFERENCES messages(id),
  room_id VARCHAR(255) NOT NULL,
  organization_id INTEGER REFERENCES organizations(id),
  media_type VARCHAR(20) NOT NULL,           -- 'image', 'video', 'audio'
  media_url TEXT NOT NULL,                   -- mxc:// URL
  media_info JSONB,                          -- dimensions, duration, mimetype, size
  status VARCHAR(20) DEFAULT 'pending',      -- 'pending', 'processing', 'completed', 'failed'
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- Index for efficient polling
  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX idx_analysis_jobs_status ON analysis_jobs(status, created_at);
CREATE INDEX idx_analysis_jobs_event_id ON analysis_jobs(event_id);
```

### Prompt Storage

Prompts will be stored in Supabase with the following structure:

```sql
CREATE TABLE ai_prompts (
  id SERIAL PRIMARY KEY,
  prompt_type VARCHAR(50) NOT NULL,        -- 'master', 'image', 'video', 'audio'
  organization_id INTEGER REFERENCES organizations(id),  -- NULL for global prompts
  prompt_name VARCHAR(100) NOT NULL,
  prompt_content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(prompt_type, organization_id, prompt_name)
);
```

### Analysis Results Storage

```sql
CREATE TABLE media_analysis (
  id SERIAL PRIMARY KEY,
  message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
  event_id VARCHAR(255) NOT NULL,
  media_type VARCHAR(20) NOT NULL,         -- 'image', 'video', 'audio'
  analysis_type VARCHAR(50) NOT NULL,      -- 'description', 'transcription', 'frames'
  content TEXT NOT NULL,                   -- JSON for structured data, text for descriptions
  provider VARCHAR(50),                    -- 'gemini', 'claude', 'openai'
  model_used VARCHAR(100),                 -- e.g., 'gemini-2.5-flash', 'claude-sonnet-4'
  tokens_used INTEGER,
  processing_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(event_id, analysis_type)
);

-- Index for efficient lookups
CREATE INDEX idx_media_analysis_event_id ON media_analysis(event_id);
CREATE INDEX idx_media_analysis_message_id ON media_analysis(message_id);
```

---

## Processing Pipeline

### Archiver Flow (Job Enqueueing)

```
Media Message Received from Matrix
        │
        ▼
┌───────────────────────────────────────┐
│ Archiver: Store message in DB         │
└─────────┬─────────────────────────────┘
          │
          ▼
┌───────────────────────────────────────┐
│ Is media message?                     │
│ (m.image, m.video, m.audio)           │
└─────────┬─────────────────────────────┘
          │ yes
          ▼
┌───────────────────────────────────────┐
│ Insert into analysis_jobs:           │
│ - event_id, room_id, org_id           │
│ - media_type, media_url, media_info   │
│ - status = 'pending'                  │
└───────────────────────────────────────┘
          │
          ▼
      [Continue archiving - don't wait]
```

### Analyzer Flow (Job Processing)

```
┌───────────────────────────────────────┐
│ Poll for pending jobs:                │
│ SELECT * FROM analysis_jobs           │
│ WHERE status = 'pending'              │
│ ORDER BY created_at ASC               │
│ LIMIT 1 FOR UPDATE SKIP LOCKED        │
└─────────┬─────────────────────────────┘
          │
          ▼
┌───────────────────────────────────────┐
│ Update status = 'processing'          │
│ Update started_at = NOW()             │
└─────────┬─────────────────────────────┘
          │
          ▼
┌───────────────────────────────────────┐
│ Download media from Matrix            │
│ (using mxc:// URL)                    │
└─────────┬─────────────────────────────┘
          │
          ▼
┌───────────────────────────────────────┐
│ Check constraints:                    │
│ - Video < 5 minutes                   │
│ - File size within limits             │
└─────────┬─────────────────────────────┘
          │
          ▼
┌───────────────────────────────────────┐
│ Build prompt:                         │
│ 1. Master prompt                      │
│ 2. Media-type prompt (image/video/    │
│    audio)                             │
│ 3. Organization prompt (if exists)    │
└─────────┬─────────────────────────────┘
          │
          ▼
┌───────────────────────────────────────┐
│ Send to Gemini 2.5 Flash              │
│ - Image: base64 encoded               │
│ - Video: file upload                  │
│ - Audio: file upload                  │
└─────────┬─────────────────────────────┘
          │
          ▼
┌───────────────────────────────────────┐
│ Store result in media_analysis        │
│ Update job status = 'completed'       │
│ Update completed_at = NOW()           │
└───────────────────────────────────────┘
```

### Error Handling Flow

```
┌───────────────────────────────────────┐
│ If error occurs during processing:    │
└─────────┬─────────────────────────────┘
          │
          ▼
┌───────────────────────────────────────┐
│ Increment attempts                    │
│ Store error in last_error             │
└─────────┬─────────────────────────────┘
          │
          ▼
┌───────────────────────────────────────┐
│ attempts < 3?                         │
└─────────┬─────────────────────────────┘
          │
     ┌────┴────┐
     │ yes     │ no
     ▼         ▼
┌─────────┐ ┌─────────────────┐
│ status  │ │ status = 'failed'│
│ = 'pending'│ │ (manual review) │
│ (retry) │ └─────────────────┘
└─────────┘
```

**API**: Google Gemini 2.5 Flash for all media types

---

## System Prompts

### Master System Prompt (All Media)

```
You are an AI assistant analyzing media content from archived chat messages.
Your role is to provide accurate, concise descriptions that make the content
searchable and accessible.

Guidelines:
- Be objective and factual in descriptions
- Note any text visible in images/videos
- Identify key objects, people (without identifying individuals), and actions
- Keep descriptions concise but comprehensive
- If content is unclear or low quality, note this
- Flag any potentially sensitive content without detailed description
```

### Image System Prompt

```
Analyze this image and provide:
1. A brief summary (1-2 sentences)
2. Key elements visible (objects, text, scenes)
3. Any notable details relevant to the context

Format your response as:
SUMMARY: [brief description]
ELEMENTS: [comma-separated list]
DETAILS: [additional observations]
```

### Video System Prompt

```
These frames are extracted from a video message. Analyze them to understand
what is happening in the video.

Provide:
1. Overall summary of the video content
2. Key actions or events observed
3. Any progression or changes across frames
4. Notable elements (text, objects, scenes)

Format your response as:
SUMMARY: [what the video shows]
ACTIONS: [what is happening]
ELEMENTS: [key objects/text visible]
```

### Audio System Prompt

```
This is a transcription of an audio message. Clean up the transcription if needed
and provide any relevant context.

Format:
TRANSCRIPTION: [cleaned text]
LANGUAGE: [detected language]
NOTES: [any relevant observations about tone, background sounds mentioned, etc.]
```

### Organization-Specific Prompts (Examples)

**XP Ops (Business)**:
```
Additional context: This is from a business operations chat.
Pay attention to:
- Product names and SKUs
- Order numbers and quantities
- Business terminology
- Action items or requests
```

**Family Ops (Personal)**:
```
Additional context: This is from a family group chat.
Pay attention to:
- Events and dates mentioned
- Location references
- Family-related activities
```

---

## Implementation Plan

### Phase 1: Database & Infrastructure

1. **Database Setup**
   - Create `analysis_jobs` table (job queue)
   - Create `ai_prompts` table
   - Create `media_analysis` table
   - Seed default system prompts
   - Create indexes for efficient polling

2. **Configuration**
   - Add GOOGLE_AI_API_KEY to environment
   - Add configuration for processing limits (max video length, etc.)

### Phase 2: Archiver Integration (Job Enqueueing)

1. **Implementation** (`services/archiver-js/`)
   - Add job enqueueing logic when media messages are archived
   - Detect media types (m.image, m.video, m.audio)
   - Extract media metadata (dimensions, duration, size)
   - Insert jobs into `analysis_jobs` table with status='pending'
   - Continue archiving without waiting for analysis

2. **Testing**
   - Verify jobs are created for each media message
   - Test with various media types
   - Ensure archiver performance is not impacted

### Phase 3: Analyzer Service Foundation

1. **Service Setup** (`services/analyzer/`)
   - Create new TypeScript service
   - Implement job polling with `FOR UPDATE SKIP LOCKED`
   - Add job status management (pending → processing → completed/failed)
   - Implement prompt composition logic (master → media-type → org)
   - Add error handling and retry logic (max 3 attempts)

2. **Scripts**
   - Create `start-analyzer.sh`, `stop-analyzer.sh`, `status-analyzer.sh`
   - Add to global `npm run` commands

### Phase 4: Image Analysis

1. **Implementation**
   - Integrate Google Gemini 2.5 Flash API
   - Download image from Matrix (using mxc:// URL)
   - Base64 encode for API submission
   - Store results in `media_analysis` table
   - Update job status to completed

2. **Testing**
   - Test with various image types (JPEG, PNG, WebP)
   - Verify prompt hierarchy works correctly
   - Test error cases (large images, corrupted files)

### Phase 5: Audio Transcription

1. **Implementation**
   - Use Gemini 2.5 Flash for audio transcription
   - Download audio from Matrix
   - Handle various audio formats (m4a, ogg, mp3, wav)
   - Store transcription results

2. **Testing**
   - Test with voice notes from WhatsApp
   - Test with different languages
   - Test with background noise

### Phase 6: Video Analysis

1. **Implementation**
   - Send video directly to Gemini (native video support)
   - Implement 5-minute duration limit check
   - Get both visual description and audio transcription
   - Store combined results

2. **Testing**
   - Test with various video lengths (up to 5 min)
   - Test with videos that have no audio
   - Test memory usage with larger videos

### Phase 7: Web UI Integration

1. **Display Analysis**
   - Show image descriptions below media in message view
   - Show video descriptions and transcriptions
   - Show audio transcriptions
   - Collapsible/expandable analysis sections

2. **Admin Interface** (future)
   - UI to manage system prompts
   - UI to view analysis results
   - Re-process capability for failed items

---

## Technical Considerations

### Rate Limiting

- Gemini API: 1500 requests/min for Flash (generous limit)
- Process media in real-time but with error handling
- Implement retry with exponential backoff on failures

### Cost Management (Gemini 2.5 Flash Pricing)

| Media Type | Estimated Cost | Notes |
|------------|----------------|-------|
| Image | ~$0.0001-0.001 | Very cost effective |
| Audio | ~$0.0001/sec | Native audio processing |
| Video | ~$0.0001/sec | Native video processing |

*Gemini 2.5 Flash is significantly cheaper than Claude/GPT-4 for media*

Implement:
- Skip processing for videos > 5 minutes
- Option to disable AI processing per room
- Log token usage for monitoring

### Error Handling

- Retry failed analyses with exponential backoff (max 3 retries)
- Store error state for manual review
- Don't block message archiving on AI failures
- Graceful degradation: if AI fails, message still archived

### Privacy Considerations

- All analysis happens server-side
- Results stored alongside messages (same access controls)
- Option to disable AI analysis per organization
- Media sent to configured AI provider for processing

---

## Dependencies

### External APIs (Provider Options)

**Google Gemini API** (default)
- Model: `gemini-2.5-flash`
- Capabilities: Image, Video (native), Audio (native)
- Best for: Cost-effective multimodal analysis

**Anthropic Claude API** (optional)
- Model: `claude-sonnet-4-20250514`
- Capabilities: Image (excellent), Video (via frames), Audio (via transcription)
- Best for: Complex reasoning, nuanced descriptions

**OpenAI API** (optional)
- Model: `gpt-4o`
- Capabilities: Image, Audio (Whisper), Video (via frames)
- Best for: Broad compatibility

### System Dependencies

- **ffmpeg** (optional): May be needed for audio format conversion
  - Convert uncommon formats to supported ones
  - Already available on most systems

### NPM Packages

```json
{
  "@google/generative-ai": "^0.x.x",
  "@anthropic-ai/sdk": "^0.x.x",
  "openai": "^4.x.x"
}
```

*Note: Only install packages for providers you intend to use.*

### Environment Variables

```bash
# General settings
AI_ANALYSIS_ENABLED=true
AI_MAX_VIDEO_DURATION_SEC=300

# Provider selection (per media type)
IMAGE_PROVIDER=gemini          # gemini | claude | openai
VIDEO_PROVIDER=gemini          # gemini | claude | openai
AUDIO_PROVIDER=gemini          # gemini | claude | openai

# Google Gemini (default provider)
GOOGLE_AI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash

# Anthropic Claude (optional)
ANTHROPIC_API_KEY=your_anthropic_api_key
CLAUDE_MODEL=claude-sonnet-4-20250514

# OpenAI (optional)
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o
```

---

## Success Metrics

1. **Coverage**: % of media messages with successful analysis
2. **Accuracy**: Manual review of analysis quality (sample)
3. **Latency**: Time from message archive to analysis complete
4. **Cost**: Average cost per media type
5. **Errors**: Rate of failed analyses

---

## Resolved Decisions

| Question | Decision |
|----------|----------|
| Default Provider | Gemini 2.5 Flash (cost-effective, multimodal) |
| Provider Architecture | Abstraction layer supporting multiple providers |
| Video Processing | Native video upload to Gemini (no frame extraction) |
| Max Video Length | 5 minutes |
| Audio Transcription | Gemini 2.5 Flash (unified provider) |
| Processing Mode | Job queue - archiver enqueues, analyzer processes |
| Architecture | Separate analyzer service (decoupled from archiver) |

---

## Future Enhancements

- **Search Integration**: Full-text search across media descriptions and transcriptions
- **Translation**: Translate transcriptions to preferred language
- **Sentiment Analysis**: Detect tone/sentiment in messages
- **Smart Summaries**: Daily/weekly digests of media content
- **Backfill Processing**: Process existing media that was archived before AI was enabled
- **Custom Prompts UI**: Web interface to manage organization-specific prompts
