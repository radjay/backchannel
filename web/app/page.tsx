import { supabase } from '../lib/supabaseClient';
import PageClient from '../components/PageClient';

type Organization = { id: number; name: string };
type Room = { room_id: string; room_name?: string | null; organization_id?: number | null; pinned?: boolean };
type Message = {
  event_id: string;
  room_id: string;
  sender: string;
  sender_display_name?: string | null;
  room_display_name?: string | null;
  timestamp: number;
  content: { body?: string } | null;
};

export const revalidate = 0; // Disable caching for this page
export const dynamic = 'force-dynamic'; // Force dynamic rendering

export default async function Page({ searchParams }: { searchParams?: { org?: string; room?: string } }) {
  const orgResult = await supabase.from('organizations').select('id,name').order('name', { ascending: true });
  const organizations: Organization[] = orgResult.data ?? [];

  const roomsResult = await supabase
    .from('monitored_rooms')
    .select('room_id,room_name,organization_id,enabled')
    .eq('enabled', true)
    .order('room_name', { ascending: true });

  // Log any errors for debugging
  if (roomsResult.error) {
    console.error('Error fetching rooms:', roomsResult.error);
  }

  // Try to get pinned status separately (column may not exist yet)
  const pinnedResult = await supabase
    .from('monitored_rooms')
    .select('room_id,pinned')
    .eq('enabled', true);

  const pinnedMap = new Map<string, boolean>();
  if (pinnedResult.data && !pinnedResult.error) {
    pinnedResult.data.forEach((r: { room_id: string; pinned?: boolean }) => {
      pinnedMap.set(r.room_id, r.pinned ?? false);
    });
  }

  const rooms: Room[] = (roomsResult.data ?? []).map((r) => ({
    ...r,
    pinned: pinnedMap.get(r.room_id) ?? false,
  }));

  const selectedOrgId = searchParams?.org ? Number(searchParams.org) : organizations[0]?.id;
  const roomsForOrg = selectedOrgId ? rooms.filter((r) => r.organization_id === selectedOrgId) : rooms;
  const selectedRoomId = searchParams?.room ?? roomsForOrg[0]?.room_id ?? rooms[0]?.room_id ?? null;

  const messagesResult = selectedRoomId
    ? await supabase
        .from('messages')
        .select('event_id,room_id,sender,sender_display_name,room_display_name,timestamp,content')
        .eq('room_id', selectedRoomId)
        .order('timestamp', { ascending: false })
        .limit(100)
    : { data: [] as Message[] };

  // Reverse to display oldest first (chronological order)
  const messages: Message[] = ((messagesResult as any).data ?? []).reverse();

  return (
    <PageClient
      organizations={organizations}
      rooms={rooms}
      initialOrgId={selectedOrgId ?? null}
      initialRoomId={selectedRoomId}
      initialMessages={messages}
    />
  );
}


