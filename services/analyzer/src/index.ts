/**
 * Media Analyzer Service
 * Polls for pending analysis jobs and processes them using configured AI providers
 */

import 'dotenv/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config, validateConfig } from './config.js';
import {
  AnalysisJob,
  AnalysisProvider,
  AnalysisResult,
  MediaType,
  getProviderForMediaType,
} from './providers/index.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class Analyzer {
  private supabase: SupabaseClient;
  private matrixToken: string | null = null;
  private providers: Map<MediaType, AnalysisProvider> = new Map();
  private running = false;

  constructor() {
    validateConfig();

    this.supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Initialize providers for each media type
    this.initializeProviders();
  }

  private initializeProviders(): void {
    const mediaTypes: MediaType[] = ['image', 'video', 'audio'];
    const providerConfig = {
      gemini: config.gemini,
      claude: config.claude,
      openai: config.openai,
    };

    for (const mediaType of mediaTypes) {
      try {
        const provider = getProviderForMediaType(mediaType, config.providers, providerConfig);
        this.providers.set(mediaType, provider);
        console.info(`Initialized ${provider.name} provider for ${mediaType}`);
      } catch (err) {
        console.warn(`Failed to initialize provider for ${mediaType}:`, err);
      }
    }
  }

  async run(): Promise<void> {
    console.info('Starting Media Analyzer Service');
    console.info(`Polling interval: ${config.pollIntervalMs}ms`);
    console.info(`Max retries: ${config.maxRetries}`);
    console.info(`Providers: image=${config.providers.image}, video=${config.providers.video}, audio=${config.providers.audio}`);

    await this.matrixLogin();
    this.running = true;

    while (this.running) {
      try {
        await this.processNextJob();
      } catch (err) {
        console.error('Error in processing loop:', err);
      }
      await sleep(config.pollIntervalMs);
    }
  }

  stop(): void {
    console.info('Stopping analyzer...');
    this.running = false;
  }

  private async matrixLogin(): Promise<void> {
    const loginUrl = `${config.matrix.homeserverUrl}/_matrix/client/r0/login`;
    const payload = {
      type: 'm.login.password',
      user: config.matrix.user,
      password: config.matrix.password,
    };

    while (!this.matrixToken) {
      try {
        const resp = await fetch(loginUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (resp.status === 200) {
          const data = (await resp.json()) as { access_token: string };
          this.matrixToken = data.access_token;
          console.info('Matrix login successful');
          return;
        }

        if (resp.status === 429) {
          const body = (await resp.json()) as { retry_after_ms?: number };
          const waitMs = body.retry_after_ms ?? 60000;
          console.warn(`Rate limited; retrying in ${waitMs}ms`);
          await sleep(waitMs);
          continue;
        }

        const errorText = await resp.text();
        console.error(`Matrix login failed (${resp.status}): ${errorText}`);
        await sleep(5000);
      } catch (err) {
        console.error('Matrix login error:', err);
        await sleep(5000);
      }
    }
  }

  private async processNextJob(): Promise<void> {
    // Poll for next pending job using FOR UPDATE SKIP LOCKED pattern
    const { data: jobs, error: fetchError } = await this.supabase
      .rpc('claim_analysis_job')
      .single();

    if (fetchError) {
      // No job available or RPC doesn't exist yet - this is normal
      if (fetchError.code !== 'PGRST116') {
        // PGRST116 = no rows returned
        console.debug('No pending jobs or error:', fetchError.message);
      }
      return;
    }

    if (!jobs) {
      return;
    }

    const job = jobs as AnalysisJob;
    console.info(`Processing job ${job.id} for event ${job.event_id} (${job.media_type})`);

    try {
      await this.processJob(job);
    } catch (err) {
      await this.handleJobError(job, err);
    }
  }

  private async processJob(job: AnalysisJob): Promise<void> {
    const provider = this.providers.get(job.media_type);
    if (!provider) {
      throw new Error(`No provider configured for media type: ${job.media_type}`);
    }

    // Check video duration limit
    if (job.media_type === 'video' && job.media_info?.duration) {
      const durationSec = job.media_info.duration / 1000;
      if (durationSec > config.maxVideoDurationSec) {
        throw new Error(`Video duration (${durationSec}s) exceeds limit (${config.maxVideoDurationSec}s)`);
      }
    }

    // Download media from Matrix
    const media = await this.downloadMedia(job.media_url);
    if (!media) {
      throw new Error('Failed to download media');
    }

    // Build prompt
    const prompt = await this.buildPrompt(job.media_type, job.organization_id);

    // Analyze with provider
    const mimeType = job.media_info?.mimetype ?? this.guessMimeType(job.media_type);
    let result: AnalysisResult;

    switch (job.media_type) {
      case 'image':
        result = await provider.analyzeImage(media, mimeType, prompt);
        break;
      case 'video':
        result = await provider.analyzeVideo(media, mimeType, prompt);
        break;
      case 'audio':
        result = await provider.analyzeAudio(media, mimeType, prompt);
        break;
      default:
        throw new Error(`Unknown media type: ${job.media_type}`);
    }

    // Store result
    await this.storeResult(job, result, provider.name);

    // Mark job as completed
    await this.supabase
      .from('analysis_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    console.info(`Completed job ${job.id} in ${result.processingTimeMs}ms`);
  }

  private async downloadMedia(mxcUrl: string): Promise<Buffer | null> {
    if (!this.matrixToken) {
      console.error('No Matrix token available');
      return null;
    }

    const parts = this.parseMxcUrl(mxcUrl);
    if (!parts) {
      console.error('Invalid mxc URL:', mxcUrl);
      return null;
    }

    const downloadUrl = `${config.matrix.homeserverUrl}/_matrix/client/v1/media/download/${encodeURIComponent(parts.server)}/${encodeURIComponent(parts.mediaId)}`;
    const headers = { Authorization: `Bearer ${this.matrixToken}` };

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await fetch(downloadUrl, { headers });
        if (resp.status === 200) {
          const arrayBuf = await resp.arrayBuffer();
          return Buffer.from(arrayBuf);
        }
        if (resp.status === 404 && attempt < 2) {
          await sleep(2000);
          continue;
        }
        console.error(`Failed to download media (${resp.status})`);
        return null;
      } catch (err) {
        if (attempt < 2) {
          console.warn(`Download error attempt ${attempt + 1}:`, err);
          await sleep(1000);
          continue;
        }
        console.error('Download failed after retries', err);
        return null;
      }
    }
    return null;
  }

  private parseMxcUrl(mxcUrl: string): { server: string; mediaId: string } | null {
    if (!mxcUrl.startsWith('mxc://')) return null;
    const withoutPrefix = mxcUrl.slice('mxc://'.length);
    const [server, mediaId] = withoutPrefix.split('/', 2);
    if (!server || !mediaId) return null;
    return { server, mediaId };
  }

  private async buildPrompt(mediaType: MediaType, organizationId: number | null): Promise<string> {
    const prompts: string[] = [];

    // Get master prompt
    const { data: masterPrompt } = await this.supabase
      .from('ai_prompts')
      .select('prompt_content')
      .eq('prompt_type', 'master')
      .is('organization_id', null)
      .eq('is_active', true)
      .single();

    if (masterPrompt?.prompt_content) {
      prompts.push(masterPrompt.prompt_content);
    }

    // Get media-type prompt
    const { data: mediaPrompt } = await this.supabase
      .from('ai_prompts')
      .select('prompt_content')
      .eq('prompt_type', mediaType)
      .is('organization_id', null)
      .eq('is_active', true)
      .single();

    if (mediaPrompt?.prompt_content) {
      prompts.push(mediaPrompt.prompt_content);
    }

    // Get organization-specific prompt if applicable
    if (organizationId) {
      const { data: orgPrompt } = await this.supabase
        .from('ai_prompts')
        .select('prompt_content')
        .eq('prompt_type', mediaType)
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .single();

      if (orgPrompt?.prompt_content) {
        prompts.push(orgPrompt.prompt_content);
      }
    }

    return prompts.join('\n\n');
  }

  private async storeResult(job: AnalysisJob, result: AnalysisResult, providerName: string): Promise<void> {
    const analysisType = job.media_type === 'audio' ? 'transcription' : 'description';

    const { error } = await this.supabase.from('media_analysis').upsert(
      {
        message_id: job.message_id,
        event_id: job.event_id,
        media_type: job.media_type,
        analysis_type: analysisType,
        content: result.content,
        provider: providerName,
        model_used: result.modelUsed,
        tokens_used: result.tokensUsed,
        processing_time_ms: result.processingTimeMs,
      },
      { onConflict: 'event_id,analysis_type' }
    );

    if (error) {
      console.error('Failed to store analysis result:', error);
      throw error;
    }
  }

  private async handleJobError(job: AnalysisJob, err: unknown): Promise<void> {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`Job ${job.id} failed:`, errorMessage);

    const newAttempts = job.attempts + 1;
    const newStatus = newAttempts >= config.maxRetries ? 'failed' : 'pending';

    await this.supabase
      .from('analysis_jobs')
      .update({
        status: newStatus,
        attempts: newAttempts,
        last_error: errorMessage,
        started_at: null, // Reset for retry
      })
      .eq('id', job.id);

    if (newStatus === 'failed') {
      console.warn(`Job ${job.id} permanently failed after ${newAttempts} attempts`);
    } else {
      console.info(`Job ${job.id} will retry (attempt ${newAttempts}/${config.maxRetries})`);
    }
  }

  private guessMimeType(mediaType: MediaType): string {
    switch (mediaType) {
      case 'image':
        return 'image/jpeg';
      case 'video':
        return 'video/mp4';
      case 'audio':
        return 'audio/mpeg';
      default:
        return 'application/octet-stream';
    }
  }
}

// Handle graceful shutdown
let analyzer: Analyzer | null = null;

process.on('SIGINT', () => {
  console.info('Received SIGINT');
  analyzer?.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.info('Received SIGTERM');
  analyzer?.stop();
  process.exit(0);
});

async function main() {
  try {
    analyzer = new Analyzer();
    await analyzer.run();
  } catch (err) {
    console.error('Fatal error starting analyzer:', err);
    process.exit(1);
  }
}

void main();
