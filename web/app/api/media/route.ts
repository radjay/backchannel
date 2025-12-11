import { NextRequest, NextResponse } from 'next/server';

const MATRIX_HOMESERVER_URL = process.env.MATRIX_HOMESERVER_URL || 'http://localhost:8008';
const MATRIX_USER = process.env.MATRIX_USER || '@archiver:matrix.radx.dev';
const MATRIX_PASSWORD = process.env.MATRIX_PASSWORD;

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getMatrixToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  if (!MATRIX_PASSWORD) {
    console.error('MATRIX_PASSWORD not set');
    return null;
  }

  try {
    const resp = await fetch(`${MATRIX_HOMESERVER_URL}/_matrix/client/v3/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'm.login.password',
        identifier: { type: 'm.id.user', user: MATRIX_USER },
        password: MATRIX_PASSWORD,
      }),
    });

    if (!resp.ok) {
      console.error('Failed to login to Matrix:', await resp.text());
      return null;
    }

    const data = await resp.json();
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + 3600000; // 1 hour
    return cachedToken;
  } catch (err) {
    console.error('Error logging into Matrix:', err);
    return null;
  }
}

function parseMxcUrl(mxcUrl: string): { server: string; mediaId: string } | null {
  if (!mxcUrl.startsWith('mxc://')) return null;
  const withoutPrefix = mxcUrl.slice('mxc://'.length);
  const [server, mediaId] = withoutPrefix.split('/', 2);
  if (!server || !mediaId) return null;
  return { server, mediaId };
}

export async function GET(request: NextRequest) {
  const mxcUrl = request.nextUrl.searchParams.get('mxc');

  if (!mxcUrl) {
    return NextResponse.json({ error: 'Missing mxc parameter' }, { status: 400 });
  }

  const parts = parseMxcUrl(mxcUrl);
  if (!parts) {
    return NextResponse.json({ error: 'Invalid mxc URL' }, { status: 400 });
  }

  const token = await getMatrixToken();
  if (!token) {
    return NextResponse.json({ error: 'Failed to authenticate with Matrix' }, { status: 500 });
  }

  const downloadUrl = `${MATRIX_HOMESERVER_URL}/_matrix/client/v1/media/download/${encodeURIComponent(
    parts.server
  )}/${encodeURIComponent(parts.mediaId)}`;

  try {
    const resp = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      console.error(`Failed to download media: ${resp.status}`);
      return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    }

    const contentType = resp.headers.get('content-type') || 'application/octet-stream';
    const buffer = await resp.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
      },
    });
  } catch (err) {
    console.error('Error downloading media:', err);
    return NextResponse.json({ error: 'Failed to download media' }, { status: 500 });
  }
}
