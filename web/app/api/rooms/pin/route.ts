import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { room_id, pinned } = body;

    if (!room_id) {
      return NextResponse.json({ error: 'Missing room_id' }, { status: 400 });
    }

    const { error } = await supabase
      .from('monitored_rooms')
      .update({ pinned: !!pinned })
      .eq('room_id', room_id);

    if (error) {
      // If the column doesn't exist, return success but indicate feature unavailable
      if (error.code === '42703') {
        console.warn('Pin feature not available - run migration 008_add_pinned_to_rooms.sql');
        return NextResponse.json({ success: false, error: 'Pin feature not available - migration required' }, { status: 200 });
      }
      console.error('Error updating pin status:', error);
      return NextResponse.json({ error: 'Failed to update pin status' }, { status: 500 });
    }

    return NextResponse.json({ success: true, pinned: !!pinned });
  } catch (err) {
    console.error('Error updating pin status:', err);
    return NextResponse.json({ error: 'Failed to update pin status' }, { status: 500 });
  }
}
