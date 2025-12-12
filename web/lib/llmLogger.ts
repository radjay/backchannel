import fs from 'fs';
import path from 'path';

// Use LOG_PATH env var, fallback to local logs directory, or disable if not writable
const LOG_PATH = process.env.LOG_PATH || '/home/matrix-ai/logs';
const LOG_FILE = path.join(LOG_PATH, 'llm.log');

export type LLMLogEntry = {
  provider: string;
  model: string;
  endpoint: string;
  roomId?: string;
  promptLength: number;
  responseLength?: number;
  tokensUsed?: number;
  durationMs?: number;
  status: 'start' | 'success' | 'error';
  error?: string;
};

export function logLLMCall(params: LLMLogEntry): void {
  // Skip file logging if LOG_PATH is explicitly disabled
  if (process.env.LOG_PATH === 'disabled') {
    return;
  }

  try {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, ...params };

    // Always log to console in production for cloud logging aggregation
    if (process.env.NODE_ENV === 'production') {
      console.log(JSON.stringify(logEntry));
    }

    // Try to write to file (will fail silently on ephemeral filesystems)
    try {
      // Ensure log directory exists
      if (!fs.existsSync(LOG_PATH)) {
        fs.mkdirSync(LOG_PATH, { recursive: true });
      }
      fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');
    } catch {
      // File logging not available (e.g., Render ephemeral filesystem)
      // Console logging above handles this case
    }
  } catch (err) {
    // Don't let logging failures break the main flow
    console.error('Failed to write LLM log:', err);
  }
}
