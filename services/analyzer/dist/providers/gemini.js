"use strict";
/**
 * Google Gemini AI Provider
 * Supports image, video, and audio analysis using Gemini 2.5 Flash
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiProvider = void 0;
const generative_ai_1 = require("@google/generative-ai");
class GeminiProvider {
    name = 'gemini';
    supportsImage = true;
    supportsVideo = true;
    supportsAudio = true;
    maxVideoDurationSec = 300; // 5 minutes
    client;
    model;
    constructor(apiKey, model = 'gemini-flash-latest') {
        if (!apiKey) {
            throw new Error('GOOGLE_AI_API_KEY is required for Gemini provider');
        }
        this.client = new generative_ai_1.GoogleGenerativeAI(apiKey);
        this.model = model;
    }
    async analyzeImage(media, mimeType, prompt) {
        const startTime = Date.now();
        const model = this.client.getGenerativeModel({ model: this.model });
        const imagePart = {
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
    async analyzeVideo(media, mimeType, prompt) {
        const startTime = Date.now();
        const model = this.client.getGenerativeModel({ model: this.model });
        // Gemini supports direct video upload via inlineData for smaller videos
        // For larger videos, we'd need to use the File API
        const videoPart = {
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
    async analyzeAudio(media, mimeType, prompt) {
        const startTime = Date.now();
        const model = this.client.getGenerativeModel({ model: this.model });
        const audioPart = {
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
exports.GeminiProvider = GeminiProvider;
