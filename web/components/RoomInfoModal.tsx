"use client";

import { useState } from "react";
import { Info, X } from "lucide-react";

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
      <button
        onClick={() => setIsOpen(true)}
        className="info-button"
        title="Room information"
        aria-label="Show room information"
      >
        <Info size={16} />
      </button>
      {isOpen && (
        <div className="modal-overlay" onClick={() => setIsOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Room Information</h2>
              <button className="modal-close" onClick={() => setIsOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}
