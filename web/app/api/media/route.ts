import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function getSupabaseMediaUrl(mxcUrl: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('media')
      .select('public_url')
      .eq('matrix_url', mxcUrl)
      .single();

    if (error || !data?.public_url) {
      return null;
    }

    return data.public_url;
  } catch (err) {
    console.error('Error looking up media in Supabase:', err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const mxcUrl = request.nextUrl.searchParams.get('mxc');

  if (!mxcUrl) {
    return NextResponse.json({ error: 'Missing mxc parameter' }, { status: 400 });
  }

  // Look up media in Supabase storage
  const supabaseUrl = await getSupabaseMediaUrl(mxcUrl);

  if (supabaseUrl) {
    // Redirect to the Supabase public URL
    return NextResponse.redirect(supabaseUrl);
  }

  // Media not found in cache
  return NextResponse.json(
    { error: 'Media not found. It may not have been cached yet.' },
    { status: 404 }
  );
}
