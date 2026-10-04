"use client";

import React, { useState, useEffect } from "react";
import { boardApi } from "../services/api";

interface ExportModalProps {
  workspaceId: string;
  boardId: string;
  boardTitle: string;
  token: string;
  onClose: () => void;
}

export default function ExportModal({
  workspaceId,
  boardId,
  boardTitle,
  token,
  onClose,
}: ExportModalProps) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("idle");
  const [exportData, setExportData] = useState<any | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  async function handleStartExport() {
    setErrorBanner(null);
    setJobStatus("enqueuing");

    const res = await boardApi.triggerExport(token, workspaceId, boardId);
    if (res.error) {
      setErrorBanner(res.error);
      setJobStatus("failed");
    } else if (res.data) {
      setJobId(res.data.jobId);
      setJobStatus(res.data.status || "waiting");
    }
  }

  // Poll status while job is waiting or active
  useEffect(() => {
    if (!jobId || jobStatus === "completed" || jobStatus === "failed") return;

    const interval = setInterval(async () => {
      const res = await boardApi.getExportStatus(token, workspaceId, boardId, jobId);
      if (res.error) {
        setErrorBanner(res.error);
        setJobStatus("failed");
      } else if (res.data) {
        setJobStatus(res.data.status);
        if (res.data.status === "completed" && res.data.result) {
          setExportData(res.data.result);
        }
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [jobId, jobStatus, workspaceId, boardId, token]);

  function handleDownloadJson() {
    if (!exportData) return;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `board-${boardTitle.toLowerCase().replace(/\s+/g, "-")}-export.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h3>Asynchronous Board Export</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginBottom: 16 }}>
          Board exports are queued to Redis-backed <strong>BullMQ</strong> workers and processed asynchronously
          without blocking the main API thread.
        </p>

        {errorBanner && (
          <div className="alert-banner alert-error" style={{ marginBottom: 16 }}>
            <span>{errorBanner}</span>
          </div>
        )}

        <div style={{ background: "var(--bg-surface-subtle)", padding: 16, borderRadius: "var(--radius-sm)", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: "0.85rem" }}>
            <span style={{ color: "var(--text-secondary)" }}>Target Board:</span>
            <span style={{ fontWeight: 600 }}>{boardTitle}</span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: "0.85rem" }}>
            <span style={{ color: "var(--text-secondary)" }}>Queue Engine:</span>
            <span style={{ fontFamily: "monospace", fontWeight: 600 }}>BullMQ + Redis</span>
          </div>

          {jobId && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: "0.85rem" }}>
              <span style={{ color: "var(--text-secondary)" }}>Job ID:</span>
              <span style={{ fontFamily: "monospace" }}>{jobId}</span>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem" }}>
            <span style={{ color: "var(--text-secondary)" }}>Current Status:</span>
            <span
              className={`status-pill ${
                jobStatus === "completed"
                  ? "success"
                  : jobStatus === "failed"
                  ? "warning"
                  : "info"
              }`}
            >
              {jobStatus.toUpperCase()}
            </span>
          </div>
        </div>

        {exportData && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Export Payload Preview:</span>
              <button type="button" className="btn-mini" onClick={handleDownloadJson}>
                💾 Download .JSON
              </button>
            </div>
            <pre
              style={{
                background: "var(--bg-canvas)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: 12,
                fontSize: "0.75rem",
                maxHeight: 180,
                overflowY: "auto",
                fontFamily: "monospace",
              }}
            >
              {JSON.stringify(exportData, null, 2)}
            </pre>
          </div>
        )}

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
          {jobStatus === "idle" && (
            <button
              id="start-export-job-btn"
              type="button"
              className="btn-primary"
              onClick={handleStartExport}
            >
              Start Asynchronous Export
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
