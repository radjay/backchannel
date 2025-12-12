"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { CalendarIcon, FileTextIcon, GearIcon, ChevronDownIcon, ChevronUpIcon, CheckIcon, TableIcon, GlobeIcon, LightningBoltIcon } from "@radix-ui/react-icons";
import { Modal, Button, Spinner, Markdown } from "./ui";

type AiReportModalProps = {
  roomId: string;
};

type Period = "today" | "yesterday" | "7days" | "30days" | "year";
type Language = "en" | "nl" | "es" | "fr";
type Tab = "report" | "prompts";
type ReportSubTab = "report" | "data";

const STORAGE_KEY_PERIOD = "matrixai_report_period";
const STORAGE_KEY_LANGUAGE = "matrixai_report_language";

type ReportMessage = {
  event_id: string;
  sender: string;
  sender_display_name?: string | null;
  timestamp: number;
  content: {
    body?: string;
    msgtype?: string;
    filename?: string;
  } | null;
};

const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7days", label: "Last 7 days" },
  { value: "30days", label: "Last 30 days" },
  { value: "year", label: "This Year" },
];

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "nl", label: "Dutch" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
];

export default function AiReportModal({ roomId }: AiReportModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("report");
  const [reportSubTab, setReportSubTab] = useState<ReportSubTab>("report");
  const [period, setPeriod] = useState<Period>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY_PERIOD);
      if (stored && PERIODS.some((p) => p.value === stored)) {
        return stored as Period;
      }
    }
    return "7days";
  });
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY_LANGUAGE);
      if (stored && LANGUAGES.some((l) => l.value === stored)) {
        return stored as Language;
      }
    }
    return "en";
  });
  const [report, setReport] = useState<string | null>(null);
  const [messagesUsed, setMessagesUsed] = useState<ReportMessage[]>([]);
  const [reportPeriod, setReportPeriod] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prompt state
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [roomPrompt, setRoomPrompt] = useState("");
  const [originalRoomPrompt, setOriginalRoomPrompt] = useState("");
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [promptsSaving, setPromptsSaving] = useState(false);
  const [promptsError, setPromptsError] = useState<string | null>(null);
  const [promptsSaved, setPromptsSaved] = useState(false);

  // Refs for debouncing/preventing duplicate calls
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchInProgressRef = useRef(false);

  const fetchReport = useCallback(async (selectedPeriod: Period, selectedLanguage: Language) => {
    if (fetchInProgressRef.current) return;
    fetchInProgressRef.current = true;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const resp = await fetch(
        `/api/report?room_id=${encodeURIComponent(roomId)}&period=${selectedPeriod}&language=${selectedLanguage}`,
        { signal: abortControllerRef.current.signal }
      );

      const contentType = resp.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error("Server returned an invalid response");
      }

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || "Failed to generate report");
      }

      setReport(data.report);
      setMessagesUsed(data.messagesUsed || []);
      setReportPeriod(data.period || null);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("Failed to fetch report:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
      fetchInProgressRef.current = false;
    }
  }, [roomId]);

  const fetchPrompts = useCallback(async () => {
    setPromptsLoading(true);
    setPromptsError(null);

    try {
      const resp = await fetch(`/api/report/prompts?room_id=${encodeURIComponent(roomId)}`);
      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || "Failed to fetch prompts");
      }

      setSystemPrompt(data.systemPrompt);
      setRoomPrompt(data.roomPrompt || "");
      setOriginalRoomPrompt(data.roomPrompt || "");
    } catch (err) {
      console.error("Failed to fetch prompts:", err);
      setPromptsError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setPromptsLoading(false);
    }
  }, [roomId]);

  const saveRoomPrompt = async () => {
    setPromptsSaving(true);
    setPromptsError(null);
    setPromptsSaved(false);

    try {
      const resp = await fetch("/api/report/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId, prompt_content: roomPrompt }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || "Failed to save prompt");
      }

      setOriginalRoomPrompt(roomPrompt);
      setPromptsSaved(true);
      setTimeout(() => setPromptsSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save prompt:", err);
      setPromptsError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setPromptsSaving(false);
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    setReport(null);
    setMessagesUsed([]);
    setReportPeriod(null);
    setError(null);
    setActiveTab("report");
    setReportSubTab("report");
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === "prompts" && systemPrompt === null) {
      fetchPrompts();
    }
  };

  const handleGenerate = () => {
    setReport(null);
    setMessagesUsed([]);
    setReportPeriod(null);
    setError(null);
    setReportSubTab("report");
    fetchReport(period, language);
  };

  const handlePeriodChange = (newPeriod: Period) => {
    setPeriod(newPeriod);
    localStorage.setItem(STORAGE_KEY_PERIOD, newPeriod);
  };

  const handleLanguageChange = (newLanguage: Language) => {
    setLanguage(newLanguage);
    localStorage.setItem(STORAGE_KEY_LANGUAGE, newLanguage);
  };

  const handleClose = () => {
    setIsOpen(false);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    fetchInProgressRef.current = false;
  };

  const hasUnsavedChanges = roomPrompt !== originalRoomPrompt;

  return (
    <>
      <Button
        variant="icon"
        onClick={handleOpen}
        title="Generate AI Report"
        aria-label="Generate AI report for this room"
      >
        <LightningBoltIcon className="w-4 h-4" />
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        headerContent={
          <div className="report-header-tabs">
            <button
              className={`report-tab ${activeTab === "report" ? "active" : ""}`}
              onClick={() => handleTabChange("report")}
            >
              <FileTextIcon className="w-4 h-4" />
              Report
            </button>
            <button
              className={`report-tab ${activeTab === "prompts" ? "active" : ""}`}
              onClick={() => handleTabChange("prompts")}
            >
              <GearIcon className="w-4 h-4" />
              Prompts
              {hasUnsavedChanges && <span className="unsaved-indicator" />}
            </button>
          </div>
        }
        fullscreen
      >

        {/* Report Tab */}
        {activeTab === "report" && (
          <>
            <div className="report-controls">
              <div className="report-selectors">
                <div className="period-selector">
                  <CalendarIcon className="w-4 h-4" />
                  <select
                    value={period}
                    onChange={(e) => handlePeriodChange(e.target.value as Period)}
                    disabled={loading}
                  >
                    {PERIODS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="language-selector">
                  <GlobeIcon className="w-4 h-4" />
                  <select
                    value={language}
                    onChange={(e) => handleLanguageChange(e.target.value as Language)}
                    disabled={loading}
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Button variant="default" onClick={handleGenerate} disabled={loading}>
                {loading ? "Generating..." : "Generate Report"}
              </Button>
            </div>

            {loading && (
              <div className="report-loading">
                <Spinner size={32} />
                <p>Generating report...</p>
              </div>
            )}

            {error && !loading && (
              <div className="report-error">
                <p>Error: {error}</p>
                <Button variant="retry" onClick={handleGenerate}>
                  Try Again
                </Button>
              </div>
            )}

            {report && !loading && (
              <>
                {/* Report/Data sub-tabs */}
                <div className="report-subtabs">
                  <button
                    className={`report-subtab ${reportSubTab === "report" ? "active" : ""}`}
                    onClick={() => setReportSubTab("report")}
                  >
                    <FileTextIcon className="w-3.5 h-3.5" />
                    Report
                  </button>
                  <button
                    className={`report-subtab ${reportSubTab === "data" ? "active" : ""}`}
                    onClick={() => setReportSubTab("data")}
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                    Data
                    <span className="subtab-badge">{messagesUsed.length}</span>
                  </button>
                </div>

                {reportSubTab === "report" && <Markdown content={report} />}

                {reportSubTab === "data" && (
                  <div className="data-view">
                    <div className="data-header">
                      <p className="data-summary">
                        {messagesUsed.length} messages from {reportPeriod}
                      </p>
                    </div>
                    <div className="data-messages">
                      {messagesUsed.map((msg) => (
                        <div key={msg.event_id} className="data-message">
                          <div className="data-message-meta">
                            <span className="data-sender">
                              {msg.sender_display_name || msg.sender?.split(":")[0]?.slice(1) || "Unknown"}
                            </span>
                            <span className="data-time">
                              {new Date(msg.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <div className="data-message-content">
                            {msg.content?.msgtype && msg.content.msgtype !== "m.text" ? (
                              <span className="data-media-indicator">
                                [{msg.content.msgtype.replace("m.", "").toUpperCase()}
                                {msg.content.filename ? `: ${msg.content.filename}` : ""}]
                              </span>
                            ) : null}
                            {msg.content?.body || "[no content]"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {!report && !loading && !error && (
              <div className="report-empty">
                <p>Select a time period and click Generate Report.</p>
              </div>
            )}
          </>
        )}

        {/* Prompts Tab */}
        {activeTab === "prompts" && (
          <div className="prompts-tab">
            {promptsLoading && (
              <div className="report-loading">
                <Spinner size={24} />
                <p>Loading prompts...</p>
              </div>
            )}

            {promptsError && !promptsLoading && (
              <div className="report-error">
                <p>Error: {promptsError}</p>
                <Button variant="retry" onClick={fetchPrompts}>
                  Try Again
                </Button>
              </div>
            )}

            {!promptsLoading && !promptsError && (
              <>
                {/* Room Prompt */}
                <div className="prompt-section">
                  <label className="prompt-label">
                    Room Prompt
                    <span className="prompt-hint">Custom instructions for this room&apos;s reports</span>
                  </label>
                  <textarea
                    className="prompt-textarea"
                    value={roomPrompt}
                    onChange={(e) => setRoomPrompt(e.target.value)}
                    placeholder="Add custom instructions for reports in this room. For example: 'Focus on action items and decisions. Include participant names.'"
                    rows={6}
                  />
                  <div className="prompt-actions">
                    <Button
                      variant="default"
                      onClick={saveRoomPrompt}
                      disabled={promptsSaving || !hasUnsavedChanges}
                    >
                      <CheckIcon className="w-4 h-4" />
                      {promptsSaving ? "Saving..." : "Save Prompt"}
                    </Button>
                    {promptsSaved && <span className="save-success">Saved!</span>}
                  </div>
                </div>

                {/* System Prompt (read-only) */}
                <div className="prompt-section system-prompt-section">
                  <button
                    className="system-prompt-toggle"
                    onClick={() => setShowSystemPrompt(!showSystemPrompt)}
                  >
                    {showSystemPrompt ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                    <span>System Prompt</span>
                    <span className="prompt-badge">Read-only</span>
                  </button>
                  {showSystemPrompt && (
                    <div className="system-prompt-content">
                      {systemPrompt ? (
                        <pre>{systemPrompt}</pre>
                      ) : (
                        <p className="no-prompt">No system prompt configured.</p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
