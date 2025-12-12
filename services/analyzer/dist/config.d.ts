/**
 * Configuration for the analyzer service
 */
import { MediaType, ProviderName } from './providers/index.js';
export declare const config: {
    analysisEnabled: boolean;
    maxVideoDurationSec: number;
    pollIntervalMs: number;
    maxConcurrentJobs: number;
    maxRetries: number;
    retryBackoffBaseMs: number;
    providers: Record<MediaType, ProviderName>;
    gemini: {
        apiKey: string;
        model: string;
    };
    claude: {
        apiKey: string;
        model: string;
    };
    openai: {
        apiKey: string;
        model: string;
    };
    supabase: {
        url: string;
        serviceRoleKey: string;
    };
    matrix: {
        homeserverUrl: string;
        user: string;
        password: string;
    };
};
export declare function validateConfig(): void;
