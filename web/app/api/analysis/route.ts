import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get('event_id');

  if (!eventId) {
    return NextResponse.json({ error: 'Missing event_id parameter' }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from('media_analysis')
      .select('description, transcription, summary, elements, actions, language, media_type')
      .eq('event_id', eventId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No analysis found
        return NextResponse.json({ analysis: null });
      }
      console.error('Error fetching analysis:', error);
      return NextResponse.json({ error: 'Failed to fetch analysis' }, { status: 500 });
    }

    return NextResponse.json({ analysis: data });
  } catch (err) {
    console.error('Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
