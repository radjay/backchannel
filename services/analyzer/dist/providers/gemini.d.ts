/**
 * Google Gemini AI Provider
 * Supports image, video, and audio analysis using Gemini 2.5 Flash
 */
import { AnalysisProvider, AnalysisResult } from './types.js';
export declare class GeminiProvider implements AnalysisProvider {
    name: string;
    supportsImage: boolean;
    supportsVideo: boolean;
    supportsAudio: boolean;
    maxVideoDurationSec: number;
    private client;
    private model;
    constructor(apiKey: string, model?: string);
    analyzeImage(media: Buffer, mimeType: string, prompt: string): Promise<AnalysisResult>;
    analyzeVideo(media: Buffer, mimeType: string, prompt: string): Promise<AnalysisResult>;
    analyzeAudio(media: Buffer, mimeType: string, prompt: string): Promise<AnalysisResult>;
}
