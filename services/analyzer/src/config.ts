/**
 * Configuration for the analyzer service
 */

import { MediaType, ProviderName } from './providers/index.js';

export const config = {
  // General settings
  analysisEnabled: process.env.AI_ANALYSIS_ENABLED !== 'false',
  maxVideoDurationSec: Number(process.env.AI_MAX_VIDEO_DURATION_SEC ?? '300'),

  // Polling settings
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? '5000'),
  maxConcurrentJobs: Number(process.env.MAX_CONCURRENT_JOBS ?? '1'),
  maxRetries: Number(process.env.MAX_RETRIES ?? '3'),

  // Provider selection (per media type)
  providers: {
    image: (process.env.IMAGE_PROVIDER ?? 'gemini') as ProviderName,
    video: (process.env.VIDEO_PROVIDER ?? 'gemini') as ProviderName,
    audio: (process.env.AUDIO_PROVIDER ?? 'gemini') as ProviderName,
  } as Record<MediaType, ProviderName>,

  // Provider-specific settings
  gemini: {
    apiKey: process.env.GOOGLE_AI_API_KEY ?? '',
    model: process.env.GEMINI_MODEL ?? 'gemini-flash-latest',
  },
  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-20250514',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
  },

  // Supabase settings
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  },

  // Matrix settings (for downloading media)
  matrix: {
    homeserverUrl: process.env.MATRIX_HOMESERVER_URL ?? 'http://localhost:8008',
    user: process.env.MATRIX_USER ?? '@archiver:matrix.radx.dev',
    password: process.env.MATRIX_PASSWORD ?? '',
  },
};

export function validateConfig(): void {
  const errors: string[] = [];

  if (!config.supabase.url) errors.push('SUPABASE_URL is required');
  if (!config.supabase.serviceRoleKey) errors.push('SUPABASE_SERVICE_ROLE_KEY is required');
  if (!config.matrix.password) errors.push('MATRIX_PASSWORD is required');

  // Validate provider API keys for enabled providers
  const enabledProviders = new Set(Object.values(config.providers));

  if (enabledProviders.has('gemini') && !config.gemini.apiKey) {
    errors.push('GOOGLE_AI_API_KEY is required when using Gemini provider');
  }
  if (enabledProviders.has('claude') && !config.claude.apiKey) {
    errors.push('ANTHROPIC_API_KEY is required when using Claude provider');
  }
  if (enabledProviders.has('openai') && !config.openai.apiKey) {
    errors.push('OPENAI_API_KEY is required when using OpenAI provider');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}
