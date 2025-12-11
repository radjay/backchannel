"use client";

import { useState } from "react";
import { ImageIcon, Video, Music, FileIcon, Download } from "lucide-react";

type MediaInfo = {
  url?: string;
  body?: string;
  filename?: string;
  msgtype?: string;
  info?: {
    mimetype?: string;
    size?: number;
    w?: number;
    h?: number;
    duration?: number;
  };
};

function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms?: number): string {
  if (!ms) return "";
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const remainingSecs = secs % 60;
  return `${mins}:${remainingSecs.toString().padStart(2, "0")}`;
}

function getMediaUrl(mxcUrl?: string): string {
  if (!mxcUrl) return "";
  return `/api/media?mxc=${encodeURIComponent(mxcUrl)}`;
}

export default function MediaContent({ content }: { content: MediaInfo }) {
  const [imageError, setImageError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const msgtype = content.msgtype;
  const mediaUrl = getMediaUrl(content.url);
  const filename = content.filename || content.body || "file";
  const mimetype = content.info?.mimetype || "";
  const fileSize = formatFileSize(content.info?.size);

  if (!content.url) {
    return <span className="media-placeholder">[Media unavailable]</span>;
  }

  // Image
  if (msgtype === "m.image") {
    if (imageError) {
      return (
        <div className="media-error">
          <ImageIcon size={24} />
          <span>Image failed to load</span>
          <a href={mediaUrl} download={filename} className="media-download">
            <Download size={14} /> Download
          </a>
        </div>
      );
    }

    return (
      <div className="media-image-container">
        <img
          src={mediaUrl}
          alt={filename}
          className={`media-image ${expanded ? "expanded" : ""}`}
          onClick={() => setExpanded(!expanded)}
          onError={() => setImageError(true)}
          loading="lazy"
        />
        {content.info?.w && content.info?.h && !expanded && (
          <span className="media-info">
            {content.info.w}x{content.info.h} {fileSize && `• ${fileSize}`}
          </span>
        )}
      </div>
    );
  }

  // Video
  if (msgtype === "m.video") {
    return (
      <div className="media-video-container">
        <video
          src={mediaUrl}
          controls
          className="media-video"
          preload="metadata"
        >
          <source src={mediaUrl} type={mimetype} />
          Your browser does not support video playback.
        </video>
        <div className="media-info">
          <Video size={14} />
          {content.info?.w && content.info?.h && (
            <span>
              {content.info.w}x{content.info.h}
            </span>
          )}
          {content.info?.duration && (
            <span>{formatDuration(content.info.duration)}</span>
          )}
          {fileSize && <span>{fileSize}</span>}
        </div>
      </div>
    );
  }

  // Audio
  if (msgtype === "m.audio") {
    return (
      <div className="media-audio-container">
        <audio src={mediaUrl} controls className="media-audio" preload="metadata">
          <source src={mediaUrl} type={mimetype} />
          Your browser does not support audio playback.
        </audio>
        <div className="media-info">
          <Music size={14} />
          {content.info?.duration && (
            <span>{formatDuration(content.info.duration)}</span>
          )}
          {fileSize && <span>{fileSize}</span>}
        </div>
      </div>
    );
  }

  // File (fallback)
  if (msgtype === "m.file") {
    return (
      <a href={mediaUrl} download={filename} className="media-file">
        <FileIcon size={20} />
        <div className="media-file-info">
          <span className="media-file-name">{filename}</span>
          {fileSize && <span className="media-file-size">{fileSize}</span>}
        </div>
        <Download size={16} />
      </a>
    );
  }

  // Unknown media type
  return (
    <a href={mediaUrl} download={filename} className="media-file">
      <FileIcon size={20} />
      <span>{filename}</span>
      <Download size={16} />
    </a>
  );
}
