import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import MessagesList from '../components/MessagesList';
import RoomInfoModal from '../components/RoomInfoModal';
import AiReportModal from '../components/AiReportModal';

type Organization = { id: number; name: string };
type Room = { room_id: string; room_name?: string | null; organization_id?: number | null };
type Message = {
  event_id: string;
  room_id: string;
  sender: string;
  sender_display_name?: string | null;
  room_display_name?: string | null;
  timestamp: number;
  content: { body?: string } | null;
};

const roomLabel = (room: Room) => {
  if (room.room_name && room.room_name.trim()) return room.room_name;
  const core = room.room_id.startsWith('!') ? room.room_id.slice(1) : room.room_id;
  const shortId = core.split(':')[0];
  return `Room ${shortId.slice(-6)}`;
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
  const rooms: Room[] = roomsResult.data ?? [];

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
    <main>
      <h1>matrixai</h1>
      <div className="columns">
        <section className="column">
          <h3>Organizations</h3>
          <ul className="list">
            {organizations.map((org) => (
              <li key={org.id} className={org.id === selectedOrgId ? 'active' : ''}>
                <Link href={{ pathname: '/', query: { org: org.id } }}>{org.name}</Link>
              </li>
            ))}
            {!organizations.length && <li>No organizations</li>}
          </ul>
        </section>
        <section className="column">
          <h3>Group chats</h3>
          <ul className="list">
            {roomsForOrg.map((room) => (
              <li key={room.room_id} className={room.room_id === selectedRoomId ? 'active' : ''}>
                <Link
                  href={{
                    pathname: '/',
                    query: { org: selectedOrgId ?? '', room: room.room_id },
                  }}
                >
                  {roomLabel(room)}
                </Link>
              </li>
            ))}
            {!roomsForOrg.length && <li>No rooms</li>}
          </ul>
        </section>
        <section className="column">
          <div className="messages-header">
            <h3>Messages</h3>
            {selectedRoomId && (
              <div className="header-buttons">
                <AiReportModal roomId={selectedRoomId} />
                <RoomInfoModal
                  roomInfo={{
                    room_id: selectedRoomId,
                    room_name: rooms.find((r) => r.room_id === selectedRoomId)?.room_name ?? null,
                    room_display_name: messages[0]?.room_display_name ?? null,
                    message_count: messages.length,
                    latest_message: messages.length > 0 ? messages[messages.length - 1]?.event_id : null,
                  }}
                />
              </div>
            )}
          </div>
          <div className="messages-wrapper">
            <MessagesList messages={messages} />
          </div>
        </section>
      </div>
    </main>
  );
}


