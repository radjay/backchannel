"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import MediaContent from "./MediaContent";
import { EmptyState } from "./ui";

type MessageContent = {
  body?: string;
  msgtype?: string;
  url?: string;
  filename?: string;
  info?: {
    mimetype?: string;
    size?: number;
    w?: number;
    h?: number;
    duration?: number;
  };
};

type Message = {
  event_id: string;
  room_id: string;
  sender: string;
  sender_display_name?: string | null;
  room_display_name?: string | null;
  timestamp: number;
  content: MessageContent | null;
};

const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const formatDay = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });

const displaySender = (msg: Message) => {
  if (msg.sender_display_name && msg.sender_display_name.trim()) return msg.sender_display_name;
  const sender = msg.sender || "";
  if (sender.startsWith("@")) {
    const local = sender.slice(1).split(":")[0];
    // If whatsapp_ prefix, trim it
    if (local.startsWith("whatsapp_")) return local.replace("whatsapp_", "");
    return local;
  }
  return sender;
};

const isMediaMessage = (content: MessageContent | null): boolean => {
  if (!content?.msgtype) return false;
  return ["m.image", "m.video", "m.audio", "m.file"].includes(content.msgtype);
};

function MessageBody({ content, eventId }: { content: MessageContent | null; eventId: string }) {
  if (!content) {
    return <div className="body">[no content]</div>;
  }

  if (isMediaMessage(content)) {
    return (
      <div className="body">
        <MediaContent content={content} eventId={eventId} />
        {content.body && content.msgtype !== "m.text" && content.body !== content.filename && (
          <div className="media-caption">{content.body}</div>
        )}
      </div>
    );
  }

  return <div className="body">{content.body ?? "[no body]"}</div>;
}

export default function MessagesList({ messages }: { messages: Message[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Prevent hydration mismatch by only rendering dates on client
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (isClient && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isClient]);

  // Track scroll position to show/hide scroll button
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    // Show button if more than 200px from bottom
    setShowScrollButton(distanceFromBottom > 200);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [handleScroll, isClient]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const grouped = useMemo(() => {
    return messages.reduce<Record<string, Message[]>>((acc, msg) => {
      const key = formatDay(msg.timestamp);
      acc[key] = acc[key] ? [...acc[key], msg] : [msg];
      return acc;
    }, {});
  }, [messages]);

  const dayKeys = useMemo(
    () =>
      Object.keys(grouped).sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime()
      ),
    [grouped]
  );

  // Show loading state on server to avoid hydration mismatch
  if (!isClient) {
    return <div className="messages"><div>Loading messages...</div></div>;
  }

  return (
    <div className="messages-container" ref={containerRef}>
      <div className="messages">
        {messages.length === 0 && <EmptyState message="No messages" />}
        {dayKeys.map((day) => (
          <div key={day} className="day-group">
            <div className="day-header">{day}</div>
            {grouped[day]
              .slice()
              .sort((a, b) => a.timestamp - b.timestamp)
              .map((msg) => (
                <div key={msg.event_id} className="message">
                  <div className="meta">
                    <span className="sender">{displaySender(msg)}</span>
                    <span className="time">{formatTime(msg.timestamp)}</span>
                  </div>
                  <MessageBody content={msg.content} eventId={msg.event_id} />
                </div>
              ))}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {showScrollButton && (
        <button
          className="scroll-to-bottom"
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
        >
          <ChevronDownIcon className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}


