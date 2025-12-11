/**
 * Provider factory and exports
 */
import { AnalysisProvider, MediaType } from './types.js';
export * from './types.js';
export { GeminiProvider } from './gemini.js';
export type ProviderName = 'gemini' | 'claude' | 'openai';
interface ProviderConfig {
    gemini?: {
        apiKey: string;
        model?: string;
    };
    claude?: {
        apiKey: string;
        model?: string;
    };
    openai?: {
        apiKey: string;
        model?: string;
    };
}
/**
 * Create a provider instance by name
 */
export declare function createProvider(name: ProviderName, config: ProviderConfig): AnalysisProvider;
/**
 * Get the configured provider for a specific media type
 */
export declare function getProviderForMediaType(mediaType: MediaType, providers: Record<MediaType, ProviderName>, config: ProviderConfig): AnalysisProvider;
