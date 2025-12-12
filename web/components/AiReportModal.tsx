"use client";

import { useState, useRef, useCallback } from "react";
import { Sparkles } from "lucide-react";
import { Modal, Button, Spinner, Markdown } from "./ui";

type AiReportModalProps = {
  roomId: string;
};

export default function AiReportModal({ roomId }: AiReportModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for debouncing/preventing duplicate calls
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchInProgressRef = useRef(false);

  const fetchReport = useCallback(async () => {
    // Prevent duplicate calls from React re-renders
    if (fetchInProgressRef.current) {
      return;
    }
    fetchInProgressRef.current = true;

    // Cancel any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const resp = await fetch(`/api/report?room_id=${encodeURIComponent(roomId)}`, {
        signal: abortControllerRef.current.signal,
      });

      const contentType = resp.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error("Server returned an invalid response");
      }

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || "Failed to generate report");
      }

      setReport(data.report);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // Request was cancelled, ignore
        return;
      }
      console.error("Failed to fetch report:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
      fetchInProgressRef.current = false;
    }
  }, [roomId]);

  const handleOpen = () => {
    setIsOpen(true);
    // Reset state and fetch fresh report
    setReport(null);
    setError(null);
    fetchReport();
  };

  const handleClose = () => {
    setIsOpen(false);
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    fetchInProgressRef.current = false;
  };

  return (
    <>
      <Button
        variant="icon"
        onClick={handleOpen}
        title="Generate AI Report"
        aria-label="Generate AI report for this room"
      >
        <Sparkles size={16} />
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={
          <>
            <Sparkles size={20} />
            <span>AI Report</span>
          </>
        }
        fullscreen
      >
        {loading && (
          <div className="report-loading">
            <Spinner size={32} />
            <p>Generating report...</p>
          </div>
        )}

        {error && !loading && (
          <div className="report-error">
            <p>Error: {error}</p>
            <Button variant="retry" onClick={fetchReport}>
              Try Again
            </Button>
          </div>
        )}

        {report && !loading && <Markdown content={report} />}

        {!report && !loading && !error && (
          <div className="report-empty">
            <p>No report generated yet.</p>
          </div>
        )}
      </Modal>
    </>
  );
}
