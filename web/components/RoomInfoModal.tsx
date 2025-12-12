"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Modal, Button } from "./ui";

type RoomInfo = {
  room_id: string;
  room_name?: string | null;
  room_display_name?: string | null;
  message_count?: number;
  latest_message?: string | null;
};

export default function RoomInfoModal({ roomInfo }: { roomInfo: RoomInfo | null }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!roomInfo) return null;

  return (
    <>
      <Button
        variant="icon"
        onClick={() => setIsOpen(true)}
        title="Room information"
        aria-label="Show room information"
      >
        <Info size={16} />
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Room Information"
      >
        <div className="info-row">
          <strong>Room ID:</strong>
          <code>{roomInfo.room_id}</code>
        </div>
        {roomInfo.room_name && (
          <div className="info-row">
            <strong>Room Name:</strong>
            <span>{roomInfo.room_name}</span>
          </div>
        )}
        {roomInfo.room_display_name && roomInfo.room_display_name !== roomInfo.room_id && (
          <div className="info-row">
            <strong>Display Name:</strong>
            <span>{roomInfo.room_display_name}</span>
          </div>
        )}
        {roomInfo.message_count !== undefined && (
          <div className="info-row">
            <strong>Messages in view:</strong>
            <span>{roomInfo.message_count}</span>
          </div>
        )}
        {roomInfo.latest_message && (
          <div className="info-row">
            <strong>Latest message ID:</strong>
            <code className="small">{roomInfo.latest_message}</code>
          </div>
        )}
      </Modal>
    </>
  );
}
