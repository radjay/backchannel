import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// GET prompts (system and room-specific)
export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get('room_id');

  if (!roomId) {
    return NextResponse.json({ error: 'Missing room_id parameter' }, { status: 400 });
  }

  try {
    // Fetch system prompt
    const { data: systemPrompt } = await supabase
      .from('report_prompts')
      .select('prompt_content')
      .eq('prompt_type', 'system')
      .is('room_id', null)
      .eq('is_active', true)
      .single();

    // Fetch room-specific prompt
    const { data: roomPrompt } = await supabase
      .from('report_prompts')
      .select('id, prompt_content')
      .eq('prompt_type', 'room')
      .eq('room_id', roomId)
      .eq('is_active', true)
      .single();

    return NextResponse.json({
      systemPrompt: systemPrompt?.prompt_content || null,
      roomPrompt: roomPrompt?.prompt_content || '',
      roomPromptId: roomPrompt?.id || null,
    });
  } catch (err) {
    console.error('Error fetching prompts:', err);
    return NextResponse.json({ error: 'Failed to fetch prompts' }, { status: 500 });
  }
}

// POST/PUT room prompt
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { room_id, prompt_content } = body;

    if (!room_id) {
      return NextResponse.json({ error: 'Missing room_id' }, { status: 400 });
    }

    // Upsert the room prompt
    const { data, error } = await supabase
      .from('report_prompts')
      .upsert(
        {
          prompt_type: 'room',
          room_id,
          prompt_content: prompt_content || '',
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'prompt_type,room_id' }
      )
      .select('id, prompt_content')
      .single();

    if (error) {
      console.error('Error saving prompt:', error);
      return NextResponse.json({ error: 'Failed to save prompt' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      roomPrompt: data?.prompt_content || '',
      roomPromptId: data?.id || null,
    });
  } catch (err) {
    console.error('Error saving prompt:', err);
    return NextResponse.json({ error: 'Failed to save prompt' }, { status: 500 });
  }
}
