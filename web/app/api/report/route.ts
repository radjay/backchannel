import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logLLMCall } from '@/lib/llmLogger';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

type Message = {
  event_id: string;
  sender: string;
  sender_display_name?: string | null;
  timestamp: number;
  content: {
    body?: string;
    msgtype?: string;
    filename?: string;
  } | null;
};

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

function getSenderName(msg: Message): string {
  if (msg.sender_display_name?.trim()) {
    return msg.sender_display_name;
  }
  const sender = msg.sender || '';
  if (sender.startsWith('@')) {
    const local = sender.slice(1).split(':')[0];
    if (local.startsWith('whatsapp_')) {
      return local.replace('whatsapp_', '');
    }
    return local;
  }
  return sender;
}

function getMediaIndicator(msgtype?: string, filename?: string): string {
  switch (msgtype) {
    case 'm.image':
      return filename ? `[IMAGE: ${filename}]` : '[IMAGE]';
    case 'm.video':
      return filename ? `[VIDEO: ${filename}]` : '[VIDEO]';
    case 'm.audio':
      return filename ? `[AUDIO: ${filename}]` : '[AUDIO]';
    case 'm.file':
      return filename ? `[FILE: ${filename}]` : '[FILE]';
    default:
      return '';
  }
}

function formatMessagesForLLM(messages: Message[]): string {
  return messages
    .map((msg) => {
      const timestamp = formatTimestamp(msg.timestamp);
      const sender = getSenderName(msg);
      const content = msg.content;

      if (!content) {
        return `[${timestamp}] ${sender}: [no content]`;
      }

      const mediaIndicator = getMediaIndicator(content.msgtype, content.filename);
      const body = content.body || '';

      if (mediaIndicator) {
        return body && body !== content.filename
          ? `[${timestamp}] ${sender}: ${mediaIndicator} ${body}`
          : `[${timestamp}] ${sender}: ${mediaIndicator}`;
      }

      return `[${timestamp}] ${sender}: ${body || '[no text]'}`;
    })
    .join('\n');
}

export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get('room_id');

  if (!roomId) {
    return NextResponse.json({ error: 'Missing room_id parameter' }, { status: 400 });
  }

  try {
    // 1. Fetch system prompt
    const { data: systemPrompt } = await supabase
      .from('report_prompts')
      .select('prompt_content')
      .eq('prompt_type', 'system')
      .is('room_id', null)
      .eq('is_active', true)
      .single();

    // 2. Fetch room-specific prompt (if any)
    const { data: roomPrompt } = await supabase
      .from('report_prompts')
      .select('prompt_content')
      .eq('prompt_type', 'room')
      .eq('room_id', roomId)
      .eq('is_active', true)
      .single();

    // 3. Fetch messages for the room
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('event_id,sender,sender_display_name,timestamp,content')
      .eq('room_id', roomId)
      .order('timestamp', { ascending: true })
      .limit(100);

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({ report: 'No messages found in this room.' });
    }

    // 4. Build the prompt
    const promptParts: string[] = [];

    if (systemPrompt?.prompt_content) {
      promptParts.push(systemPrompt.prompt_content);
    } else {
      // Fallback system prompt if none in database
      promptParts.push(
        'You are an AI assistant that summarizes chat conversations. Generate a concise, well-organized report based on the messages provided.'
      );
    }

    if (roomPrompt?.prompt_content) {
      promptParts.push(`\nAdditional context for this room:\n${roomPrompt.prompt_content}`);
    }

    const formattedMessages = formatMessagesForLLM(messages as Message[]);
    promptParts.push(`\n\n--- CONVERSATION (${messages.length} messages) ---\n\n${formattedMessages}`);

    const fullPrompt = promptParts.join('\n');

    // 5. Call Gemini API
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

    const startTime = Date.now();
    logLLMCall({
      provider: 'gemini',
      model: 'gemini-flash-latest',
      endpoint: 'generateContent',
      roomId,
      promptLength: fullPrompt.length,
      status: 'start',
    });

    const result = await model.generateContent(fullPrompt);
    const response = result.response;
    const report = response.text();
    const durationMs = Date.now() - startTime;

    logLLMCall({
      provider: 'gemini',
      model: 'gemini-flash-latest',
      endpoint: 'generateContent',
      roomId,
      promptLength: fullPrompt.length,
      responseLength: report.length,
      tokensUsed: response.usageMetadata?.totalTokenCount,
      durationMs,
      status: 'success',
    });

    return NextResponse.json({ report });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error generating report:', err);

    logLLMCall({
      provider: 'gemini',
      model: 'gemini-flash-latest',
      endpoint: 'generateContent',
      promptLength: 0,
      status: 'error',
      error: errorMessage,
    });

    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
