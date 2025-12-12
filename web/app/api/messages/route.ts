import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get('room_id');

  if (!roomId) {
    return NextResponse.json({ error: 'Missing room_id parameter' }, { status: 400 });
  }

  try {
    const { data: messages, error } = await supabase
      .from('messages')
      .select('event_id,room_id,sender,sender_display_name,room_display_name,timestamp,content')
      .eq('room_id', roomId)
      .order('timestamp', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching messages:', error);
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }

    // Reverse to display oldest first (chronological order)
    const sortedMessages = (messages || []).reverse();

    return NextResponse.json({ messages: sortedMessages });
  } catch (err) {
    console.error('Error fetching messages:', err);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}
