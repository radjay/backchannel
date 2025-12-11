/**
 * Provider factory and exports
 */

import { AnalysisProvider, MediaType } from './types.js';
import { GeminiProvider } from './gemini.js';

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
export function createProvider(name: ProviderName, config: ProviderConfig): AnalysisProvider {
  switch (name) {
    case 'gemini':
      if (!config.gemini?.apiKey) {
        throw new Error('Gemini API key is required');
      }
      return new GeminiProvider(config.gemini.apiKey, config.gemini.model);

    case 'claude':
      // TODO: Implement Claude provider
      throw new Error('Claude provider not yet implemented');

    case 'openai':
      // TODO: Implement OpenAI provider
      throw new Error('OpenAI provider not yet implemented');

    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

/**
 * Get the configured provider for a specific media type
 */
export function getProviderForMediaType(
  mediaType: MediaType,
  providers: Record<MediaType, ProviderName>,
  config: ProviderConfig
): AnalysisProvider {
  const providerName = providers[mediaType];
  return createProvider(providerName, config);
}
