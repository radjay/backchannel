import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';

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
        .limit(50)
    : { data: [] as Message[] };

  const messages: Message[] = (messagesResult as any).data ?? [];

  return (
    <main>
      <h1>Matrix Archive</h1>
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
                  {room.room_name || room.room_id}
                </Link>
              </li>
            ))}
            {!roomsForOrg.length && <li>No rooms</li>}
          </ul>
        </section>
        <section className="column">
          <h3>Messages</h3>
          <div className="messages">
            {messages.map((msg) => (
              <div key={msg.event_id} className="message">
                <div className="meta">
                  <span>{msg.sender_display_name || msg.sender}</span>
                  <span>{msg.room_display_name || msg.room_id}</span>
                  <span>{new Date(msg.timestamp).toLocaleString()}</span>
                </div>
                <div className="body">{msg.content?.body ?? '[no body]'}</div>
              </div>
            ))}
            {!messages.length && <div>No messages</div>}
          </div>
        </section>
      </div>
    </main>
  );
}


