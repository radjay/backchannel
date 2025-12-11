/**
 * Provider abstraction layer for AI media analysis
 * Supports multiple providers: Gemini, Claude, OpenAI
 */

export interface AnalysisResult {
  content: string;           // The analysis text
  tokensUsed?: number;
  processingTimeMs: number;
  modelUsed: string;         // e.g., "gemini-2.5-flash", "claude-sonnet-4"
}

export interface AnalysisProvider {
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

export type MediaType = 'image' | 'video' | 'audio';

export interface AnalysisJob {
  id: number;
  event_id: string;
  message_id: number | null;
  room_id: string;
  organization_id: number | null;
  media_type: MediaType;
  media_url: string;           // mxc:// URL
  media_info: {
    mimetype?: string;
    size?: number;
    w?: number;
    h?: number;
    duration?: number;
  } | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  last_error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface ComposedPrompt {
  master: string;
  mediaType: string;
  organization?: string;
}

/**
 * Structured JSON response from AI analysis
 * Shared structure across all media types
 */
export interface MediaAnalysisResponse {
  // Main content - always present
  description: string;              // Visual description (image/video) or content summary (audio)

  // Transcription - for audio and video with speech
  transcription?: string;           // What was said (audio/video only)

  // Metadata - shared across types
  summary: string;                  // 1-2 sentence summary
  elements: string[];               // Key objects, text, people visible

  // Type-specific fields
  actions?: string[];               // Actions/events observed (video)
  language?: string;                // Detected spoken language (audio/video with speech)

  // Additional context
  notes?: string;                   // Additional observations, quality notes, etc.
}
