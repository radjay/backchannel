import 'dotenv/config';
import { Pool } from 'pg';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const WHATSAPP_DB_URL = process.env.WHATSAPP_DB_URL ?? 'postgres://matrix@localhost/mautrix_whatsapp';
const SYNAPSE_DB_URL = process.env.SYNAPSE_DB_URL ?? 'postgres://matrix@localhost/matrix';
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? '5000');
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? '100');
const STATE_FILE = process.env.STATE_FILE ?? '/home/matrix-ai/services/archiver-db/state.json';
const MEDIA_STORE_PATH = process.env.MEDIA_STORE_PATH ?? '/home/matrix-ai/data/media_store';
const AI_ANALYSIS_ENABLED = process.env.AI_ANALYSIS_ENABLED !== 'false';

// Types
interface BridgeMessage {
  rowid: number;
  id: string;
  mxid: string;
  room_id: string;
  sender_id: string;
  sender_mxid: string;
  timestamp: bigint;
  metadata: Record<string, unknown>;
  // Joined from portal
  matrix_room_id: string;
  room_name: string;
  // Joined from ghost
  sender_name: string;
}

interface MatrixEvent {
  type: string;
  sender: string;
  content: {
    msgtype?: string;
    body?: string;
    url?: string;
    info?: { mimetype?: string; size?: number; [key: string]: unknown };
    [key: string]: unknown;
  };
  origin_server_ts: number;
  room_id: string;
}

interface State {
  lastTimestamp: string;
  lastRowId: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class DatabaseArchiver {
  private whatsappDb: Pool;
  private synapseDb: Pool;
  private supabase: SupabaseClient;
  private state: State;

  constructor() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    this.whatsappDb = new Pool({ connectionString: WHATSAPP_DB_URL });
    this.synapseDb = new Pool({ connectionString: SYNAPSE_DB_URL });
    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    this.state = this.loadState();
  }

  private loadState(): State {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const data = fs.readFileSync(STATE_FILE, 'utf-8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.warn('Failed to load state file, starting fresh:', err);
    }
    // Default: start from 24 hours ago
    const yesterday = (Date.now() - 24 * 60 * 60 * 1000) * 1000000; // nanoseconds
    return { lastTimestamp: yesterday.toString(), lastRowId: 0 };
  }

  private saveState(): void {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error('Failed to save state:', err);
    }
  }

  async run(): Promise<void> {
    console.info('Starting Database-Based Message Archiver');
    console.info(`Polling interval: ${POLL_INTERVAL_MS}ms, Batch size: ${BATCH_SIZE}`);
    console.info(`Starting from timestamp: ${this.state.lastTimestamp}`);

    // Test database connections
    await this.testConnections();

    // Main polling loop
    while (true) {
      try {
        await this.pollMessages();
      } catch (err) {
        console.error('Poll cycle error:', err);
      }
      await sleep(POLL_INTERVAL_MS);
    }
  }

  private async testConnections(): Promise<void> {
    console.info('Testing database connections...');

    try {
      const waResult = await this.whatsappDb.query('SELECT COUNT(*) FROM message');
      console.info(`WhatsApp DB connected. Messages: ${waResult.rows[0].count}`);
    } catch (err) {
      throw new Error(`WhatsApp DB connection failed: ${err}`);
    }

    try {
      const synapseResult = await this.synapseDb.query('SELECT COUNT(*) FROM event_json');
      console.info(`Synapse DB connected. Events: ${synapseResult.rows[0].count}`);
    } catch (err) {
      throw new Error(`Synapse DB connection failed: ${err}`);
    }

    console.info('Supabase client initialized');
  }

  private async pollMessages(): Promise<void> {
    // Query new messages from mautrix_whatsapp
    const query = `
      SELECT
        m.rowid,
        m.id,
        m.mxid,
        m.room_id,
        m.sender_id,
        m.sender_mxid,
        m.timestamp,
        m.metadata,
        p.mxid as matrix_room_id,
        p.name as room_name,
        g.name as sender_name
      FROM message m
      JOIN portal p ON m.room_id = p.id AND m.bridge_id = p.bridge_id
      JOIN ghost g ON m.sender_id = g.id AND m.bridge_id = g.bridge_id
      WHERE m.timestamp > $1 OR (m.timestamp = $1 AND m.rowid > $2)
      ORDER BY m.timestamp ASC, m.rowid ASC
      LIMIT $3
    `;

    const result = await this.whatsappDb.query<BridgeMessage>(query, [
      this.state.lastTimestamp,
      this.state.lastRowId,
      BATCH_SIZE,
    ]);

    if (result.rows.length === 0) {
      return; // No new messages
    }

    console.info(`Processing ${result.rows.length} new messages...`);

    for (const msg of result.rows) {
      try {
        await this.processMessage(msg);
        // Update state after each successful message
        this.state.lastTimestamp = msg.timestamp.toString();
        this.state.lastRowId = msg.rowid;
      } catch (err) {
        console.error(`Failed to process message ${msg.mxid}:`, err);
      }
    }

    this.saveState();
    console.info(`Processed ${result.rows.length} messages. Last timestamp: ${this.state.lastTimestamp}`);
  }

  private async processMessage(msg: BridgeMessage): Promise<void> {
    // Get full event content from Synapse
    const eventQuery = 'SELECT json FROM event_json WHERE event_id = $1';
    const eventResult = await this.synapseDb.query<{ json: string }>(eventQuery, [msg.mxid]);

    if (eventResult.rows.length === 0) {
      console.warn(`Event not found in Synapse: ${msg.mxid}`);
      return;
    }

    const event: MatrixEvent = JSON.parse(eventResult.rows[0].json);

    // Skip non-message events
    if (event.type !== 'm.room.message') {
      return;
    }

    // Check if this is a notice/error
    if (this.isNoticeOrError(event)) {
      await this.archiveNotice(msg, event);
      return;
    }

    // Archive as regular message
    await this.archiveMessage(msg, event);
  }

  private isNoticeOrError(event: MatrixEvent): boolean {
    const msgtype = event.content?.msgtype ?? '';
    const body = (event.content?.body ?? '').toLowerCase();
    if (msgtype === 'm.notice') return true;
    if ('fi.mau.bridge_state' in (event.content ?? {})) return true;
    const indicators = ['not bridged', 'failed to bridge', 'was not bridged'];
    return indicators.some((marker) => body.includes(marker));
  }

  private determineNoticeType(event: MatrixEvent): string {
    if ('fi.mau.bridge_state' in (event.content ?? {})) return 'bridge_state';
    const body = (event.content?.body ?? '').toLowerCase();
    if (body.includes('not bridged') || body.includes('failed to bridge')) return 'error';
    if (body.includes('warning') || (event.content?.body ?? '').includes('warning')) return 'warning';
    return 'info';
  }

  private async archiveNotice(msg: BridgeMessage, event: MatrixEvent): Promise<void> {
    const notice = {
      event_id: msg.mxid,
      room_id: msg.matrix_room_id,
      room_name: msg.room_name,
      room_display_name: msg.room_name || msg.matrix_room_id,
      sender: msg.sender_mxid,
      sender_display_name: msg.sender_name || msg.sender_mxid,
      timestamp: event.origin_server_ts,
      message_type: event.type,
      content: event.content,
      notice_type: this.determineNoticeType(event),
      body: event.content?.body ?? '',
    };

    const { error } = await this.supabase.from('notices').upsert(notice, { onConflict: 'event_id' });
    if (error) {
      console.error('Failed to archive notice:', error);
    } else {
      console.info(`Archived notice ${msg.mxid}`);
    }
  }

  private async archiveMessage(msg: BridgeMessage, event: MatrixEvent): Promise<void> {
    const message = {
      event_id: msg.mxid,
      room_id: msg.matrix_room_id,
      room_name: msg.room_name,
      room_display_name: msg.room_name || msg.matrix_room_id,
      sender: msg.sender_mxid,
      sender_display_name: msg.sender_name || msg.sender_mxid,
      timestamp: event.origin_server_ts,
      message_type: event.type,
      content: event.content ?? {},
    };

    const { error } = await this.supabase.from('messages').upsert(message, { onConflict: 'event_id' });
    if (error) {
      console.error('Failed to archive message:', error);
      return;
    }

    console.info(`Archived message ${msg.mxid} from ${msg.sender_name} in ${msg.room_name}`);

    // Handle media if present
    await this.handleMediaIfPresent(msg, event);
  }

  private async handleMediaIfPresent(msg: BridgeMessage, event: MatrixEvent): Promise<void> {
    const content = event.content ?? {};
    const msgtype = content.msgtype;
    const mxcUrl = content.url as string | undefined;

    if (!mxcUrl || !mxcUrl.startsWith('mxc://')) return;
    if (!['m.image', 'm.video', 'm.audio', 'm.file'].includes(msgtype ?? '')) return;

    // Try to read media from local file system
    const mediaData = await this.readMediaFromStore(mxcUrl);
    let storagePath: string | null = null;

    if (mediaData) {
      storagePath = await this.uploadToSupabaseStorage(
        mediaData,
        msg.mxid,
        content.body as string ?? 'unknown',
        content.info?.mimetype as string
      );
    } else {
      console.warn(`Media not found in local store for ${msg.mxid}`);
    }

    // Save media metadata
    await this.saveMediaMetadata(msg, event, storagePath);

    // Enqueue AI analysis job
    if (AI_ANALYSIS_ENABLED && ['m.image', 'm.video', 'm.audio'].includes(msgtype ?? '')) {
      await this.enqueueAnalysisJob(msg, event);
    }
  }

  private parseMxcUrl(mxcUrl: string): { server: string; mediaId: string } | null {
    if (!mxcUrl.startsWith('mxc://')) return null;
    const withoutPrefix = mxcUrl.slice('mxc://'.length);
    const [server, mediaId] = withoutPrefix.split('/', 2);
    if (!server || !mediaId) return null;
    return { server, mediaId };
  }

  private async readMediaFromStore(mxcUrl: string): Promise<Buffer | null> {
    const parts = this.parseMxcUrl(mxcUrl);
    if (!parts) return null;

    // Synapse stores local media in: media_store/local_content/XX/YY/mediaId
    // where XX and YY are the first 2 pairs of characters of the mediaId
    const mediaId = parts.mediaId;
    const prefix = mediaId.substring(0, 2);
    const suffix = mediaId.substring(2, 4);
    const mediaPath = path.join(MEDIA_STORE_PATH, 'local_content', prefix, suffix, mediaId);

    try {
      if (fs.existsSync(mediaPath)) {
        return fs.readFileSync(mediaPath);
      }
      // Also try remote_content for federated media
      const remotePath = path.join(MEDIA_STORE_PATH, 'remote_content', parts.server, prefix, suffix, mediaId);
      if (fs.existsSync(remotePath)) {
        return fs.readFileSync(remotePath);
      }
    } catch (err) {
      console.warn(`Failed to read media from store: ${err}`);
    }

    return null;
  }

  private async uploadToSupabaseStorage(
    mediaData: Buffer,
    eventId: string,
    filename: string,
    mimetype = 'application/octet-stream'
  ): Promise<string | null> {
    const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '.bin';
    const storagePath = `${eventId}${ext}`;

    const { error } = await this.supabase.storage
      .from('matrix-media')
      .upload(storagePath, mediaData, { contentType: mimetype, upsert: true });

    if (error) {
      console.error('Failed to upload media:', error);
      return null;
    }

    return storagePath;
  }

  private async saveMediaMetadata(
    msg: BridgeMessage,
    event: MatrixEvent,
    storagePath: string | null
  ): Promise<void> {
    const content = event.content ?? {};
    const info = content.info ?? {};
    const publicUrl = storagePath
      ? this.supabase.storage.from('matrix-media').getPublicUrl(storagePath).data.publicUrl
      : '';

    const mediaRecord = {
      event_id: msg.mxid,
      media_type: content.msgtype ?? 'm.file',
      original_filename: content.body ?? 'unknown',
      file_size: info.size ?? null,
      mime_type: info.mimetype ?? 'application/octet-stream',
      matrix_url: content.url ?? '',
      storage_path: storagePath ?? '',
      public_url: publicUrl ?? '',
    };

    const { error } = await this.supabase.from('media').upsert(mediaRecord, { onConflict: 'event_id' });
    if (error) {
      console.error('Failed to save media metadata:', error);
    }
  }

  private async enqueueAnalysisJob(msg: BridgeMessage, event: MatrixEvent): Promise<void> {
    const content = event.content ?? {};
    const msgtype = content.msgtype ?? '';
    const mediaTypeMap: Record<string, string> = {
      'm.image': 'image',
      'm.video': 'video',
      'm.audio': 'audio',
    };
    const mediaType = mediaTypeMap[msgtype];
    if (!mediaType) return;

    const job = {
      event_id: msg.mxid,
      room_id: msg.matrix_room_id,
      media_type: mediaType,
      media_url: content.url ?? '',
      media_info: content.info ?? null,
      status: 'pending',
    };

    const { error } = await this.supabase
      .from('analysis_jobs')
      .upsert(job, { onConflict: 'event_id' });

    if (error) {
      console.error('Failed to enqueue analysis job:', error);
    } else {
      console.info(`Enqueued ${mediaType} analysis job for ${msg.mxid}`);
    }
  }

  async shutdown(): Promise<void> {
    console.info('Shutting down...');
    this.saveState();
    await this.whatsappDb.end();
    await this.synapseDb.end();
    console.info('Shutdown complete');
  }
}

async function main(): Promise<void> {
  const archiver = new DatabaseArchiver();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await archiver.shutdown();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await archiver.shutdown();
    process.exit(0);
  });

  try {
    await archiver.run();
  } catch (err) {
    console.error('Fatal error:', err);
    await archiver.shutdown();
    process.exit(1);
  }
}

void main();
