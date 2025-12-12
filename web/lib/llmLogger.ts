import fs from 'fs';

const LOG_FILE = '/home/matrix-ai/logs/llm.log';

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
  try {
    const timestamp = new Date().toISOString();
    const logEntry = JSON.stringify({ timestamp, ...params }) + '\n';
    fs.appendFileSync(LOG_FILE, logEntry);
  } catch (err) {
    // Don't let logging failures break the main flow
    console.error('Failed to write LLM log:', err);
  }
}
