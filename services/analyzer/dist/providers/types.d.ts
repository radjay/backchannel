/**
 * Provider abstraction layer for AI media analysis
 * Supports multiple providers: Gemini, Claude, OpenAI
 */
export interface AnalysisResult {
    content: string;
    tokensUsed?: number;
    processingTimeMs: number;
    modelUsed: string;
}
export interface AnalysisProvider {
    name: string;
    supportsImage: boolean;
    supportsVideo: boolean;
    supportsAudio: boolean;
    maxVideoDurationSec?: number;
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
    media_url: string;
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
