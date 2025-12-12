"use client";

import { useState } from "react";
import { ImageIcon, VideoIcon, SpeakerLoudIcon, FileIcon, DownloadIcon, ChevronDownIcon, ChevronUpIcon, LightningBoltIcon } from "@radix-ui/react-icons";

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

type MediaAnalysis = {
  description?: string;
  transcription?: string;
  summary?: string;
  elements?: string[];
  actions?: string[];
  language?: string;
  media_type?: string;
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

function AnalysisPanel({ eventId, mediaType }: { eventId: string; mediaType: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [analysis, setAnalysis] = useState<MediaAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetchAnalysis = async () => {
    if (fetched) {
      setIsOpen(!isOpen);
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch(`/api/analysis?event_id=${encodeURIComponent(eventId)}`);
      const data = await resp.json();
      setAnalysis(data.analysis);
      setFetched(true);
      setIsOpen(true);
    } catch (err) {
      console.error("Failed to fetch analysis:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="analysis-panel">
      <button
        className={`analysis-toggle ${isOpen ? 'open' : ''} ${analysis ? 'has-analysis' : ''}`}
        onClick={fetchAnalysis}
        disabled={loading}
      >
        <LightningBoltIcon className="w-3.5 h-3.5" />
        <span>{loading ? 'Loading...' : 'AI Analysis'}</span>
        {fetched && (isOpen ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />)}
      </button>

      {isOpen && fetched && (
        <div className="analysis-content">
          {!analysis ? (
            <p className="analysis-empty">No analysis available</p>
          ) : (
            <>
              {analysis.summary && (
                <div className="analysis-section">
                  <span className="analysis-label">Summary</span>
                  <p>{analysis.summary}</p>
                </div>
              )}

              {analysis.description && mediaType !== 'm.audio' && (
                <div className="analysis-section">
                  <span className="analysis-label">Description</span>
                  <p>{analysis.description}</p>
                </div>
              )}

              {analysis.transcription && (
                <div className="analysis-section">
                  <span className="analysis-label">Transcription</span>
                  <p className="analysis-transcription">"{analysis.transcription}"</p>
                  {analysis.language && (
                    <span className="analysis-language">Language: {analysis.language}</span>
                  )}
                </div>
              )}

              {analysis.elements && analysis.elements.length > 0 && (
                <div className="analysis-section">
                  <span className="analysis-label">Elements</span>
                  <div className="analysis-tags">
                    {analysis.elements.map((el, i) => (
                      <span key={i} className="analysis-tag">{el}</span>
                    ))}
                  </div>
                </div>
              )}

              {analysis.actions && analysis.actions.length > 0 && (
                <div className="analysis-section">
                  <span className="analysis-label">Actions</span>
                  <div className="analysis-tags">
                    {analysis.actions.map((action, i) => (
                      <span key={i} className="analysis-tag">{action}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function MediaContent({ content, eventId }: { content: MediaInfo; eventId?: string }) {
  const [imageError, setImageError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const msgtype = content.msgtype;
  const mediaUrl = getMediaUrl(content.url);
  const filename = content.filename || content.body || "file";
  const mimetype = content.info?.mimetype || "";
  const fileSize = formatFileSize(content.info?.size);

  const showAnalysis = eventId && ['m.image', 'm.video', 'm.audio'].includes(msgtype || '');

  if (!content.url) {
    return <span className="media-placeholder">[Media unavailable]</span>;
  }

  // Image
  if (msgtype === "m.image") {
    if (imageError) {
      return (
        <div className="media-error">
          <ImageIcon className="w-6 h-6" />
          <span>Image failed to load</span>
          <a href={mediaUrl} download={filename} className="media-download">
            <DownloadIcon className="w-3.5 h-3.5" /> Download
          </a>
        </div>
      );
    }

    return (
      <div className="media-wrapper">
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
        {showAnalysis && <AnalysisPanel eventId={eventId} mediaType={msgtype} />}
      </div>
    );
  }

  // Video
  if (msgtype === "m.video") {
    return (
      <div className="media-wrapper">
        <div className="media-video-container">
          <video
            src={mediaUrl}
            controls
            className="media-video"
            preload="none"
          >
            <source src={mediaUrl} type={mimetype} />
            Your browser does not support video playback.
          </video>
          <div className="media-info">
            <VideoIcon className="w-3.5 h-3.5" />
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
        {showAnalysis && <AnalysisPanel eventId={eventId} mediaType={msgtype} />}
      </div>
    );
  }

  // Audio
  if (msgtype === "m.audio") {
    return (
      <div className="media-wrapper">
        <div className="media-audio-container">
          <audio src={mediaUrl} controls className="media-audio" preload="none">
            <source src={mediaUrl} type={mimetype} />
            Your browser does not support audio playback.
          </audio>
          <div className="media-info">
            <SpeakerLoudIcon className="w-3.5 h-3.5" />
            {content.info?.duration && (
              <span>{formatDuration(content.info.duration)}</span>
            )}
            {fileSize && <span>{fileSize}</span>}
          </div>
        </div>
        {showAnalysis && <AnalysisPanel eventId={eventId} mediaType={msgtype} />}
      </div>
    );
  }

  // File (fallback)
  if (msgtype === "m.file") {
    return (
      <a href={mediaUrl} download={filename} className="media-file">
        <FileIcon className="w-5 h-5" />
        <div className="media-file-info">
          <span className="media-file-name">{filename}</span>
          {fileSize && <span className="media-file-size">{fileSize}</span>}
        </div>
        <DownloadIcon className="w-4 h-4" />
      </a>
    );
  }

  // Unknown media type
  return (
    <a href={mediaUrl} download={filename} className="media-file">
      <FileIcon className="w-5 h-5" />
      <span>{filename}</span>
      <DownloadIcon className="w-4 h-4" />
    </a>
  );
}
