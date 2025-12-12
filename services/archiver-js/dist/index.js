import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const MATRIX_HOMESERVER_URL = process.env.MATRIX_HOMESERVER_URL ?? 'http://localhost:8008';
const MATRIX_USER = process.env.MATRIX_USER ?? '@archiver:matrix.radx.dev';
const MATRIX_PASSWORD = process.env.MATRIX_PASSWORD ?? '';
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ROOM_REFRESH_INTERVAL_SECONDS = Number(process.env.ROOM_REFRESH_INTERVAL_SECONDS ?? '300');
const SYNC_TIMEOUT_MS = Number(process.env.SYNC_TIMEOUT_MS ?? '30000');
const AI_ANALYSIS_ENABLED = process.env.AI_ANALYSIS_ENABLED !== 'false';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
class Archiver {
    matrixToken = null;
    supabase;
    managedRooms = new Set();
    lastRoomRefresh = 0;
    constructor() {
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        }
        if (!MATRIX_PASSWORD) {
            throw new Error('Missing MATRIX_PASSWORD');
        }
        this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        });
    }
    async run() {
        console.info('Starting Unified Matrix Archiver (TypeScript)');
        await this.matrixLogin();
        await this.refreshRoomManagement(true);
        await this.syncLoop();
    }
    async matrixLogin() {
        const loginUrl = `${MATRIX_HOMESERVER_URL}/_matrix/client/r0/login`;
        const payload = { type: 'm.login.password', user: MATRIX_USER, password: MATRIX_PASSWORD };
        while (!this.matrixToken) {
            const resp = await fetch(loginUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (resp.status === 200) {
                const data = (await resp.json());
                this.matrixToken = data.access_token;
                console.info('Matrix login successful');
                return;
            }
            if (resp.status === 429) {
                const body = (await resp.json());
                const waitMs = Number(body.retry_after_ms ?? 60000);
                console.warn(`Rate limited; retrying in ${waitMs}ms`);
                await sleep(waitMs);
                continue;
            }
            const errorText = await resp.text();
            console.error(`Matrix login failed (${resp.status}): ${errorText}`);
            await sleep(5000);
        }
    }
    async resolveRoomName(roomId) {
        if (!this.matrixToken)
            return { room_name: '', room_display_name: roomId };
        const authParams = new URLSearchParams({ access_token: this.matrixToken });
        let roomName = '';
        let displayName = '';
        try {
            const nameResp = await fetch(`${MATRIX_HOMESERVER_URL}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/state/m.room.name?${authParams}`);
            if (nameResp.ok) {
                const data = (await nameResp.json());
                roomName = typeof data?.name === 'string' ? data.name : '';
            }
        }
        catch (err) {
            console.warn(`Failed to resolve room name for ${roomId}:`, err);
        }
        try {
            const aliasResp = await fetch(`${MATRIX_HOMESERVER_URL}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/state/m.room.canonical_alias?${authParams}`);
            if (aliasResp.ok) {
                const data = (await aliasResp.json());
                displayName = roomName || (typeof data?.alias === 'string' ? data.alias : '');
            }
        }
        catch (err) {
            console.warn(`Failed to resolve room alias for ${roomId}:`, err);
        }
        const finalDisplayName = displayName || roomId;
        // Upsert room name if we have either roomName or displayName (canonical alias)
        if (roomName) {
            await this.upsertRoomName(roomId, roomName);
        }
        else if (displayName && displayName !== roomId) {
            // Use displayName (canonical alias) as fallback if roomName is empty
            await this.upsertRoomName(roomId, displayName);
        }
        else {
            console.info(`No room name found for ${roomId} (roomName: "${roomName}", displayName: "${displayName}")`);
        }
        return { room_name: roomName, room_display_name: finalDisplayName };
    }
    async upsertRoomName(roomId, roomName) {
        if (!roomId || !roomName)
            return;
        const { error } = await this.supabase
            .from('monitored_rooms')
            .upsert({ room_id: roomId, room_name: roomName }, { onConflict: 'room_id' });
        if (error) {
            console.warn('Failed to update room name', roomId, error);
        }
        else {
            console.info(`Updated room name for ${roomId}: "${roomName}"`);
        }
    }
    async resolveUserDisplayName(userId, roomId) {
        if (!this.matrixToken)
            return userId;
        const authParams = new URLSearchParams({ access_token: this.matrixToken });
        try {
            const memberResp = await fetch(`${MATRIX_HOMESERVER_URL}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/state/m.room.member/${encodeURIComponent(userId)}?${authParams}`);
            if (memberResp.ok) {
                const data = (await memberResp.json());
                if (typeof data?.displayname === 'string')
                    return data.displayname;
            }
        }
        catch (err) {
            console.warn(`Failed to resolve member display name for ${userId} in ${roomId}:`, err);
        }
        try {
            const profileResp = await fetch(`${MATRIX_HOMESERVER_URL}/_matrix/client/r0/profile/${encodeURIComponent(userId)}/displayname?${authParams}`);
            if (profileResp.ok) {
                const data = (await profileResp.json());
                if (typeof data?.displayname === 'string')
                    return data.displayname;
            }
        }
        catch (err) {
            console.warn(`Failed to resolve profile display name for ${userId}:`, err);
        }
        return userId;
    }
    isNoticeOrError(event) {
        const msgtype = event.content?.msgtype ?? '';
        const body = (event.content?.body ?? '').toLowerCase();
        if (msgtype === 'm.notice')
            return true;
        if ('fi.mau.bridge_state' in (event.content ?? {}))
            return true;
        const indicators = ['not bridged', 'failed to bridge', 'was not bridged'];
        return indicators.some((marker) => body.includes(marker));
    }
    determineNoticeType(event) {
        if ('fi.mau.bridge_state' in (event.content ?? {}))
            return 'bridge_state';
        const body = (event.content?.body ?? '').toLowerCase();
        if (body.includes('not bridged') || body.includes('failed to bridge'))
            return 'error';
        if (body.includes('warning') || (event.content?.body ?? '').includes('⚠️'))
            return 'warning';
        return 'info';
    }
    async archiveNotice(event) {
        const roomId = event.room_id ?? '';
        const { room_name, room_display_name } = await this.resolveRoomName(roomId);
        const sender_display_name = await this.resolveUserDisplayName(event.sender, roomId);
        const notice_type = this.determineNoticeType(event);
        const notice = {
            event_id: event.event_id,
            room_id: roomId,
            room_name,
            room_display_name,
            sender: event.sender,
            sender_display_name,
            timestamp: event.origin_server_ts,
            message_type: event.type,
            content: event.content,
            notice_type,
            body: event.content?.body ?? '',
        };
        const { error } = await this.supabase.from('notices').upsert(notice, { onConflict: 'event_id' });
        if (error) {
            console.error('Failed to archive notice', error);
        }
        else {
            console.info(`Archived notice ${event.event_id} (${notice_type})`);
        }
    }
    async archiveMessage(event) {
        if (this.isNoticeOrError(event)) {
            await this.archiveNotice(event);
            return;
        }
        const roomId = event.room_id ?? '';
        const { room_name, room_display_name } = await this.resolveRoomName(roomId);
        const sender_display_name = await this.resolveUserDisplayName(event.sender, roomId);
        const message = {
            event_id: event.event_id,
            room_id: roomId,
            room_name,
            room_display_name,
            sender: event.sender,
            sender_display_name,
            timestamp: event.origin_server_ts,
            message_type: event.type,
            content: event.content ?? {},
        };
        const { error } = await this.supabase.from('messages').upsert(message, { onConflict: 'event_id' });
        if (error) {
            console.error('Failed to archive message', error);
            return;
        }
        console.info(`Archived message ${event.event_id} in ${roomId}`);
        await this.archiveMediaIfPresent(event);
    }
    async archiveMediaIfPresent(event) {
        const content = event.content ?? {};
        const msgtype = content.msgtype;
        const mxcUrl = content.url;
        if (!mxcUrl || !mxcUrl.startsWith('mxc://'))
            return;
        if (!['m.image', 'm.video', 'm.audio', 'm.file'].includes(msgtype ?? ''))
            return;
        const mediaData = await this.downloadMatrixMedia(mxcUrl);
        let storagePath = null;
        if (mediaData) {
            storagePath = await this.uploadToSupabaseStorage(mediaData, event.event_id, content.body ?? 'unknown', content.info?.mimetype);
            if (!storagePath) {
                console.warn(`Failed to upload media for ${event.event_id}`);
            }
        }
        else {
            console.warn(`Media not available for ${event.event_id}; saving metadata only`);
        }
        await this.saveMediaMetadata(event, storagePath, content);
        // Enqueue AI analysis job for analyzable media types
        if (AI_ANALYSIS_ENABLED && ['m.image', 'm.video', 'm.audio'].includes(msgtype ?? '')) {
            await this.enqueueAnalysisJob(event, content);
        }
    }
    async enqueueAnalysisJob(event, content) {
        const msgtype = content?.msgtype ?? '';
        const mediaTypeMap = {
            'm.image': 'image',
            'm.video': 'video',
            'm.audio': 'audio',
        };
        const mediaType = mediaTypeMap[msgtype];
        if (!mediaType)
            return;
        const job = {
            event_id: event.event_id,
            room_id: event.room_id ?? '',
            media_type: mediaType,
            media_url: content?.url ?? '',
            media_info: content?.info ?? null,
            status: 'pending',
        };
        const { error } = await this.supabase
            .from('analysis_jobs')
            .upsert(job, { onConflict: 'event_id' });
        if (error) {
            console.error('Failed to enqueue analysis job', error);
        }
        else {
            console.info(`Enqueued ${mediaType} analysis job for ${event.event_id}`);
        }
    }
    parseMxcUrl(mxcUrl) {
        if (!mxcUrl.startsWith('mxc://'))
            return null;
        const withoutPrefix = mxcUrl.slice('mxc://'.length);
        const [server, mediaId] = withoutPrefix.split('/', 2);
        if (!server || !mediaId)
            return null;
        return { server, mediaId };
    }
    async downloadMatrixMedia(mxcUrl) {
        if (!this.matrixToken)
            return null;
        const parts = this.parseMxcUrl(mxcUrl);
        if (!parts)
            return null;
        const downloadUrl = `${MATRIX_HOMESERVER_URL}/_matrix/client/v1/media/download/${encodeURIComponent(parts.server)}/${encodeURIComponent(parts.mediaId)}`;
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
            }
            catch (err) {
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
    async uploadToSupabaseStorage(mediaData, eventId, filename, mimetype = 'application/octet-stream') {
        const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '.bin';
        const storagePath = `${eventId}${ext}`;
        const { error } = await this.supabase.storage
            .from('matrix-media')
            .upload(storagePath, mediaData, { contentType: mimetype, upsert: true });
        if (error) {
            console.error('Failed to upload media', error);
            return null;
        }
        return storagePath;
    }
    async saveMediaMetadata(event, storagePath, content) {
        const info = content?.info ?? {};
        const publicUrl = storagePath
            ? this.supabase.storage.from('matrix-media').getPublicUrl(storagePath).data.publicUrl
            : '';
        const mediaRecord = {
            event_id: event.event_id,
            media_type: content?.msgtype ?? 'm.file',
            original_filename: content?.body ?? 'unknown',
            file_size: info?.size ?? null,
            mime_type: info?.mimetype ?? 'application/octet-stream',
            matrix_url: content?.url ?? '',
            storage_path: storagePath ?? '',
            public_url: publicUrl ?? '',
        };
        const { error } = await this.supabase.from('media').upsert(mediaRecord, { onConflict: 'event_id' });
        if (error) {
            console.error('Failed to save media metadata', error);
        }
    }
    async acceptRoomInvitation(roomId) {
        if (!this.matrixToken)
            return;
        const url = `${MATRIX_HOMESERVER_URL}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/join?access_token=${this.matrixToken}`;
        try {
            const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            if (resp.ok) {
                console.info(`Joined room from invite: ${roomId}`);
            }
            else {
                console.error(`Failed to accept invite for ${roomId}: ${resp.status} - ${await resp.text()}`);
            }
        }
        catch (err) {
            console.error(`Error joining invited room ${roomId}`, err);
        }
    }
    async refreshRoomManagement(force = false) {
        const now = Date.now() / 1000;
        if (!force && now - this.lastRoomRefresh < ROOM_REFRESH_INTERVAL_SECONDS)
            return;
        const { data, error } = await this.supabase.from('monitored_rooms').select('room_id,enabled');
        if (error) {
            console.error('Failed to fetch monitored rooms', error);
            return;
        }
        const enabledRooms = new Set((data ?? []).filter((r) => r.enabled !== false).map((r) => r.room_id));
        const toJoin = [...enabledRooms].filter((room) => !this.managedRooms.has(room));
        const toLeave = [...this.managedRooms].filter((room) => !enabledRooms.has(room));
        for (const roomId of toJoin) {
            await this.joinRoomIfPossible(roomId);
        }
        for (const roomId of toLeave) {
            await this.leaveRoom(roomId);
        }
        this.managedRooms = enabledRooms;
        this.lastRoomRefresh = now;
        console.info(`Room management refreshed. Monitoring ${this.managedRooms.size} rooms.`);
    }
    async joinRoomIfPossible(roomId) {
        if (!this.matrixToken)
            return;
        const url = `${MATRIX_HOMESERVER_URL}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/join?access_token=${this.matrixToken}`;
        try {
            const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            if (resp.ok) {
                console.info(`Joined room: ${roomId}`);
                this.managedRooms.add(roomId);
            }
            else if (resp.status === 403) {
                console.info(`Room ${roomId} requires invitation (private)`);
            }
            else {
                console.warn(`Failed to join room ${roomId}: ${resp.status} - ${await resp.text()}`);
            }
        }
        catch (err) {
            console.error(`Error joining room ${roomId}`, err);
        }
    }
    async leaveRoom(roomId) {
        if (!this.matrixToken)
            return;
        const url = `${MATRIX_HOMESERVER_URL}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/leave?access_token=${this.matrixToken}`;
        try {
            const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            if (resp.ok) {
                console.info(`Left room: ${roomId}`);
            }
            else {
                console.warn(`Failed to leave room ${roomId}: ${resp.status} - ${await resp.text()}`);
            }
        }
        catch (err) {
            console.error(`Error leaving room ${roomId}`, err);
        }
    }
    async syncLoop() {
        let nextBatch = '';
        while (true) {
            try {
                await this.refreshRoomManagement();
                const params = new URLSearchParams({ access_token: this.matrixToken ?? '', timeout: String(SYNC_TIMEOUT_MS) });
                if (nextBatch)
                    params.set('since', nextBatch);
                const syncUrl = `${MATRIX_HOMESERVER_URL}/_matrix/client/r0/sync?${params.toString()}`;
                const resp = await fetch(syncUrl);
                if (!resp.ok) {
                    console.error(`Sync failed ${resp.status}: ${await resp.text()}`);
                    await sleep(10000);
                    continue;
                }
                const syncData = (await resp.json());
                nextBatch = syncData?.next_batch ?? nextBatch;
                const invitedRooms = syncData?.rooms?.invite ?? {};
                for (const roomId of Object.keys(invitedRooms)) {
                    await this.acceptRoomInvitation(roomId);
                }
                const joinedRooms = syncData?.rooms?.join ?? {};
                for (const [roomId, roomData] of Object.entries(joinedRooms)) {
                    if (!this.managedRooms.has(roomId))
                        continue;
                    const roomDataAny = roomData;
                    const events = roomDataAny?.timeline?.events ?? [];
                    for (const event of events) {
                        if (event.type === 'm.room.message') {
                            event.room_id = roomId;
                            await this.archiveMessage(event);
                        }
                    }
                }
            }
            catch (err) {
                console.error('Sync loop error', err);
                await sleep(10000);
            }
        }
    }
}
async function main() {
    try {
        const archiver = new Archiver();
        await archiver.run();
    }
    catch (err) {
        console.error('Fatal error starting archiver', err);
        process.exit(1);
    }
}
void main();
