/**
 * Google Gemini AI Provider
 * Supports image, video, and audio analysis using Gemini 2.5 Flash
 */

import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { AnalysisProvider, AnalysisResult } from './types.js';

export class GeminiProvider implements AnalysisProvider {
  name = 'gemini';
  supportsImage = true;
  supportsVideo = true;
  supportsAudio = true;
  maxVideoDurationSec = 300; // 5 minutes

  private client: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model = 'gemini-flash-latest') {
    if (!apiKey) {
      throw new Error('GOOGLE_AI_API_KEY is required for Gemini provider');
    }
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  async analyzeImage(media: Buffer, mimeType: string, prompt: string): Promise<AnalysisResult> {
    const startTime = Date.now();

    const model = this.client.getGenerativeModel({ model: this.model });

    const imagePart: Part = {
      inlineData: {
        mimeType: mimeType || 'image/jpeg',
        data: media.toString('base64'),
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = result.response;
    const text = response.text();

    const processingTimeMs = Date.now() - startTime;

    // Try to get token count from usage metadata
    const tokensUsed = response.usageMetadata?.totalTokenCount;

    return {
      content: text,
      tokensUsed,
      processingTimeMs,
      modelUsed: this.model,
    };
  }

  async analyzeVideo(media: Buffer, mimeType: string, prompt: string): Promise<AnalysisResult> {
    const startTime = Date.now();

    const model = this.client.getGenerativeModel({ model: this.model });

    // Gemini supports direct video upload via inlineData for smaller videos
    // For larger videos, we'd need to use the File API
    const videoPart: Part = {
      inlineData: {
        mimeType: mimeType || 'video/mp4',
        data: media.toString('base64'),
      },
    };

    const result = await model.generateContent([prompt, videoPart]);
    const response = result.response;
    const text = response.text();

    const processingTimeMs = Date.now() - startTime;
    const tokensUsed = response.usageMetadata?.totalTokenCount;

    return {
      content: text,
      tokensUsed,
      processingTimeMs,
      modelUsed: this.model,
    };
  }

  async analyzeAudio(media: Buffer, mimeType: string, prompt: string): Promise<AnalysisResult> {
    const startTime = Date.now();

    const model = this.client.getGenerativeModel({ model: this.model });

    const audioPart: Part = {
      inlineData: {
        mimeType: mimeType || 'audio/mpeg',
        data: media.toString('base64'),
      },
    };

    const result = await model.generateContent([prompt, audioPart]);
    const response = result.response;
    const text = response.text();

    const processingTimeMs = Date.now() - startTime;
    const tokensUsed = response.usageMetadata?.totalTokenCount;

    return {
      content: text,
      tokensUsed,
      processingTimeMs,
      modelUsed: this.model,
    };
  }
}
