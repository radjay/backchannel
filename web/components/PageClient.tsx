"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DrawingPinIcon } from "@radix-ui/react-icons";
import OrganizationSelector from "./OrganizationSelector";
import MessagesList from "./MessagesList";
import RoomInfoModal from "./RoomInfoModal";
import AiReportModal from "./AiReportModal";
import { EmptyState } from "./ui";

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

type PageClientProps = {
  organizations: Organization[];
  rooms: Room[];
  initialOrgId: number | null;
  initialRoomId: string | null;
  initialMessages: Message[];
};

const STORAGE_KEY = "matrixai_selected_org";

const roomLabel = (room: Room) => {
  if (room.room_name && room.room_name.trim()) return room.room_name;
  const core = room.room_id.startsWith("!") ? room.room_id.slice(1) : room.room_id;
  const shortId = core.split(":")[0];
  return `Room ${shortId.slice(-6)}`;
};

export default function PageClient({
  organizations,
  rooms,
  initialOrgId,
  initialRoomId,
  initialMessages,
}: PageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize from localStorage or URL
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(() => {
    // Check URL first
    const urlOrg = searchParams.get("org");
    if (urlOrg) return Number(urlOrg);
    // Then check localStorage
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const storedId = Number(stored);
        if (organizations.some((org) => org.id === storedId)) {
          return storedId;
        }
      }
    }
    return initialOrgId;
  });

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
    searchParams.get("room") || initialRoomId
  );
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [roomsState, setRoomsState] = useState<Room[]>(rooms);

  const roomsForOrg = selectedOrgId
    ? roomsState.filter((r) => r.organization_id === selectedOrgId)
    : roomsState;

  // Sort rooms: pinned first, then alphabetically
  const sortedRooms = [...roomsForOrg].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    const nameA = a.room_name || a.room_id;
    const nameB = b.room_name || b.room_id;
    return nameA.localeCompare(nameB);
  });

  // Toggle pin status
  const handleTogglePin = async (roomId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const room = roomsState.find((r) => r.room_id === roomId);
    if (!room) return;

    const newPinned = !room.pinned;

    // Optimistic update
    setRoomsState((prev) =>
      prev.map((r) => (r.room_id === roomId ? { ...r, pinned: newPinned } : r))
    );

    try {
      await fetch("/api/rooms/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId, pinned: newPinned }),
      });
    } catch (err) {
      console.error("Failed to toggle pin:", err);
      // Revert on error
      setRoomsState((prev) =>
        prev.map((r) => (r.room_id === roomId ? { ...r, pinned: !newPinned } : r))
      );
    }
  };

  // Update URL when org changes
  const handleOrgChange = (orgId: number) => {
    setSelectedOrgId(orgId);
    localStorage.setItem(STORAGE_KEY, String(orgId));

    // Get first room for this org
    const orgRooms = roomsState.filter((r) => r.organization_id === orgId);
    const firstRoomId = orgRooms[0]?.room_id || null;

    setSelectedRoomId(firstRoomId);

    // Update URL
    const params = new URLSearchParams();
    params.set("org", String(orgId));
    if (firstRoomId) params.set("room", firstRoomId);
    router.push(`/?${params.toString()}`);
  };

  // Fetch messages when room changes
  useEffect(() => {
    if (!selectedRoomId) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      setLoadingMessages(true);
      try {
        const resp = await fetch(
          `/api/messages?room_id=${encodeURIComponent(selectedRoomId)}`
        );
        if (resp.ok) {
          const data = await resp.json();
          setMessages(data.messages || []);
        }
      } catch (err) {
        console.error("Failed to fetch messages:", err);
      } finally {
        setLoadingMessages(false);
      }
    };

    // Only fetch if room changed from initial
    if (selectedRoomId !== initialRoomId) {
      fetchMessages();
    }
  }, [selectedRoomId, initialRoomId]);

  const handleRoomClick = (roomId: string) => {
    setSelectedRoomId(roomId);
    const params = new URLSearchParams();
    if (selectedOrgId) params.set("org", String(selectedOrgId));
    params.set("room", roomId);
    router.push(`/?${params.toString()}`);
  };

  return (
    <main>
      <header className="app-header">
        <h1>matrixai</h1>
        <OrganizationSelector
          organizations={organizations}
          selectedOrgId={selectedOrgId}
          onOrgChange={handleOrgChange}
        />
      </header>
      <div className="columns two-column">
        <section className="column">
          <div className="column-header">
            <h3 className="panel-header">Group Chats</h3>
          </div>
          <ul className="list">
            {sortedRooms.map((room) => (
              <li
                key={room.room_id}
                className={`room-item ${room.room_id === selectedRoomId ? "active" : ""} ${room.pinned ? "pinned" : ""}`}
              >
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    handleRoomClick(room.room_id);
                  }}
                >
                  {roomLabel(room)}
                </a>
                <button
                  className={`pin-button ${room.pinned ? "pinned" : ""}`}
                  onClick={(e) => handleTogglePin(room.room_id, e)}
                  title={room.pinned ? "Unpin" : "Pin to top"}
                >
                  <DrawingPinIcon className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
            {!sortedRooms.length && <EmptyState message="No rooms" />}
          </ul>
        </section>
        <section className="column">
          <div className="messages-header">
            <h3 className="panel-header">Messages</h3>
            {selectedRoomId && (
              <div className="header-buttons">
                <AiReportModal roomId={selectedRoomId} />
                <RoomInfoModal
                  roomInfo={{
                    room_id: selectedRoomId,
                    room_name:
                      rooms.find((r) => r.room_id === selectedRoomId)?.room_name ?? null,
                    room_display_name: messages[0]?.room_display_name ?? null,
                    message_count: messages.length,
                    latest_message:
                      messages.length > 0
                        ? messages[messages.length - 1]?.event_id
                        : null,
                  }}
                />
              </div>
            )}
          </div>
          <div className="messages-wrapper">
            {loadingMessages ? (
              <div className="loading-messages">Loading messages...</div>
            ) : (
              <MessagesList messages={messages} />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
