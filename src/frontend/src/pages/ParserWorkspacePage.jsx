import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, FileSearch, FileText, GitCompare, Heading, List, Play, Sparkles, XCircle } from "lucide-react";


import { useAuth } from "../auth/AuthContext";
import { ScreenFrame, SectionCard } from "../components/ScreenFrame";
import {
  ApiError,
  acceptRequirementCandidate,
  generateRequirementCandidates,
  getParserSurface,
  getParserWorkspace,
  listRequirementCandidates,
  parseDocumentVersion,
  rejectRequirementCandidate
} from "../lib/api";
import { formatDateTime } from "../lib/formatters";
import "./parser-workspace.css";

const SURFACE_GROUP_ORDER = [
  ["body", "Body"],
  ["headers", "Headers"],
  ["footers", "Footers"],
  ["footnotes", "Footnotes"],
  ["endnotes", "Endnotes"],
  ["pages", "Pages"]
];

function parseSnapshot(snapshotValue) {
  if (!snapshotValue) {
    return {};
  }

  try {
    const payload = JSON.parse(snapshotValue);
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return {};
  }
}

function getParseActionLabel(version) {
  if (!version) {
    return "Parse";
  }

  return version.active_parse_run_id ? "Re-parse" : "Parse";
}

function isVersionCompareReady(version) {
  return Boolean(
    version?.active_parse_run_id &&
    (version.parse_status === "parsed" || version.parse_status === "parsed_with_warnings")
  );
}

function getCompareTarget(versions, compareSetupHref) {
  const readyVersions = versions.filter(isVersionCompareReady);

  if (readyVersions.length >= 2) {
    return {
      disabled: false,
      href: compareSetupHref,
      label: "Go to Compare Setup"
    };
  }

  return {
    disabled: true,
    href: compareSetupHref,
    label: "Go to Compare Setup"
  };
}

function getDefaultSurfaceSelection(surfaceGroups, preferredGroup = "body", preferredSurfaceId = null) {
  const preferredEntries = surfaceGroups?.[preferredGroup] ?? [];
  if (preferredSurfaceId && preferredEntries.some((entry) => entry.id === preferredSurfaceId)) {
    return { group: preferredGroup, surfaceId: preferredSurfaceId };
  }
  if (preferredEntries.length > 0) {
    return { group: preferredGroup, surfaceId: preferredEntries[0].id };
  }

  for (const [groupKey] of SURFACE_GROUP_ORDER) {
    const entries = surfaceGroups?.[groupKey] ?? [];
    if (entries.length > 0) {
      return { group: groupKey, surfaceId: entries[0].id };
    }
  }

  return { group: preferredGroup, surfaceId: null };
}

function parseRequestedVersionId(rawValue) {
  const parsedValue = Number(rawValue);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function buildEmptyCandidateState() {
  return {
    summary: {
      total: 0,
      pending: 0,
      accepted: 0,
      rejected: 0
    },
    candidates: [],
    provider_used: null,
    fallback_used: false,
    error_message: null
  };
}

function buildDiagnostics(workspace, selectedVersion) {
  const typedDiagnostics = workspace?.summary?.diagnostics;
  if (Array.isArray(typedDiagnostics) && typedDiagnostics.length > 0) {
    return typedDiagnostics.map((diagnostic, index) => ({
      code: diagnostic.code ?? `DIAG_${index}`,
      severity: diagnostic.severity ?? diagnostic.impact_policy ?? "warning",
      message:
        diagnostic.message ??
        diagnostic.sample ??
        diagnostic.description ??
        diagnostic.code ??
        "Parser diagnostic",
      metadata: diagnostic.metadata ?? diagnostic.details ?? {},
      source:
        diagnostic.source ??
        diagnostic.source_part ??
        diagnostic.ooxml_part ??
        (diagnostic.page_number ? `Page ${diagnostic.page_number}` : null)
    }));
  }

  const snapshot = parseSnapshot(selectedVersion?.parsed_snapshot);
  const warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings : [];
  return warnings.map((warning, index) => ({
    code: `WARN_${index}`,
    severity: "warning",
    message: warning,
    metadata: {},
    source: null
  }));
}

function summarizeCandidates(candidates) {
  return candidates.reduce(
    (summary, candidate) => ({
      total: summary.total + 1,
      pending: summary.pending + (candidate.status === "pending" ? 1 : 0),
      accepted: summary.accepted + (candidate.status === "accepted" ? 1 : 0),
      rejected: summary.rejected + (candidate.status === "rejected" ? 1 : 0)
    }),
    { total: 0, pending: 0, accepted: 0, rejected: 0 }
  );
}

function updateCandidateResult(currentResult, updatedCandidate) {
  const existingCandidates = currentResult?.candidates ?? [];
  const nextCandidates = existingCandidates.map((candidate) =>
    candidate.id === updatedCandidate.id ? updatedCandidate : candidate
  );
  return {
    ...(currentResult ?? buildEmptyCandidateState()),
    summary: summarizeCandidates(nextCandidates),
    candidates: nextCandidates
  };
}

function VersionCard({ version, isActive, onParse, onSelect, isParsing }) {
  const statusTone =
    version.parse_status === "parsed" || version.parse_status === "parsed_with_warnings"
      ? "workspace-chip-teal"
      : "workspace-chip-amber";

  return (
    <div className={`parser-version-card ${isActive ? "parser-version-card-active" : ""}`}>
      <div className="parser-version-card-topline">
        <p className="parser-version-title" title={version.version_label} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{version.version_label}</p>
        <span className={`workspace-chip ${statusTone}`}>{version.parse_status}</span>
      </div>
      <p className="parser-version-meta">{version.file_name}</p>
      <div className="parser-version-inline">
        <span>{version.warning_count} warnings</span>
        <span>{formatDateTime(version.uploaded_at)}</span>
      </div>
      <div className="parser-version-actions">
        <button
          className="workspace-action workspace-action-secondary parser-version-action"
          onClick={onSelect}
          type="button"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {isActive ? <><CheckCircle2 size={14} style={{ marginRight: '0.3rem' }} /> Selected</> : "Select"}
        </button>
        <button
          aria-label={`${getParseActionLabel(version)} ${version.version_label}`}
          className="workspace-action workspace-action-primary parser-version-action"
          disabled={isParsing}
          onClick={onParse}
          type="button"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {isParsing ? "Parsing..." : <><Play size={14} style={{ marginRight: '0.3rem' }} /> {getParseActionLabel(version)}</>}
        </button>
      </div>
    </div>
  );
}

function SurfaceTabs({ surfaceGroups, activeGroup, onSelectGroup }) {
  return (
    <div className="parser-surface-tabs" role="tablist" aria-label="Parsed surfaces">
      {SURFACE_GROUP_ORDER.map(([groupKey, label]) => {
        const entries = surfaceGroups?.[groupKey] ?? [];
        return (
          <button
            aria-selected={activeGroup === groupKey}
            className={`parser-surface-tab ${activeGroup === groupKey ? "parser-surface-tab-active" : ""}`}
            key={groupKey}
            onClick={() => onSelectGroup(groupKey)}
            role="tab"
            type="button"
          >
            <span>{label}</span>
            <span className="parser-surface-tab-count">{entries.length}</span>
          </button>
        );
      })}
    </div>
  );
}

function SurfaceInstanceRail({ entries, activeSurfaceId, onSelectSurface }) {
  if (!entries || entries.length <= 1) {
    return null;
  }

  return (
    <div className="parser-surface-instance-row" role="tablist" aria-label="Surface instances">
      {entries.map((entry) => (
        <button
          aria-selected={entry.id === activeSurfaceId}
          className={`parser-surface-instance ${entry.id === activeSurfaceId ? "parser-surface-instance-active" : ""}`}
          key={entry.id}
          onClick={() => onSelectSurface(entry.id)}
          role="tab"
          type="button"
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

function ParsedTablePreview({ table, selectedInspector, onSelectRow, onSelectTable }) {
  const isTableSelected = selectedInspector?.kind === "table" && selectedInspector.table?.id === table.id;

  return (
    <div className={`bg-white border rounded-lg overflow-hidden group transition-colors ${isTableSelected ? 'border-primary-container shadow-[0_0_15px_rgba(240,185,11,0.18)] ring-1 ring-primary-container' : 'border-border-standard'}`}>
      <div
        className="bg-white/[0.02] px-4 py-2 flex items-center justify-between border-b border-border-subtle cursor-pointer hover:bg-white/[0.04]"
        onClick={() => onSelectTable(table)}
      >
        <div className="flex items-center gap-3">
          <span className="font-mono-body text-[11px] text-text-quaternary uppercase">#{table.table_key}</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono-body uppercase bg-black/3 dark:bg-white/5 text-text-secondary border border-white/10 flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px]">table_chart</span>
            Table
          </span>
          {table.section_title && (
            <span className="font-mono-body text-[10px] text-text-tertiary">§ {table.section_title}</span>
          )}
        </div>
      </div>
      <div className="p-0 overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-full">
          <thead>
            <tr className="bg-surface-container-low border-b border-border-standard">
              {table.columns.map((column) => (
                <th key={`${table.id}-${column.column_key}`} className="font-label text-[12px] text-text-secondary px-4 py-2 font-medium bg-surface-container whitespace-nowrap">
                  {column.header_text}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono-body text-[12px] text-text-primary">
            {table.rows.map((row) => {
              const isRowSelected = selectedInspector?.kind === "row" && selectedInspector.row?.row_key === row.row_key;
              return (
                <tr
                  className={`border-b border-border-subtle hover:bg-white/[0.02] transition-colors cursor-pointer last:border-0 ${isRowSelected ? 'bg-primary-container/20' : ''}`}
                  key={row.row_key}
                  onClick={() => onSelectRow(table, row)}
                >
                  {row.cells.map((cell) => (
                    <td
                      colSpan={cell.col_span}
                      key={`${row.row_key}-${cell.column_index}`}
                      rowSpan={cell.row_span}
                      className="px-4 py-3 align-top border-r border-border-subtle last:border-0"
                    >
                      {cell.raw_value || <span className="text-text-tertiary italic">Merged cell</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ParsedPreview({ surfaceDetail, selectedInspector, onSelectBlock, onSelectRow, onSelectTable }) {
  if (!surfaceDetail) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center" style={{ minHeight: '240px', borderRadius: '10px', border: '1px dashed #E6E8EA' }}>
        <FileSearch size={32} style={{ color: '#848E9C', opacity: 0.5, marginBottom: '12px' }} />
        <h3 className="text-[15px] font-semibold mb-1" style={{ color: '#1E2026' }}>No parsed content</h3>
        <p className="text-[13px]" style={{ color: '#848E9C' }}>
          Select a version and run parse to view the document content here.
        </p>
      </div>
    );
  }

  const tablesById = Object.fromEntries(surfaceDetail.tables.map((table) => [table.id, table]));
  const blockTypeIcon = (type) => {
    if (type === 'heading') return <Heading size={11} />;
    if (type === 'list_item') return <List size={11} />;
    return <FileText size={11} />;
  };

  return (
    <div className="space-y-2">
      {surfaceDetail.items.map((item) => {
        if (item.kind === "table") {
          const table = tablesById[item.table_id];
          if (!table) return null;
          return (
            <ParsedTablePreview
              key={`table-${table.id}`}
              onSelectRow={onSelectRow}
              onSelectTable={onSelectTable}
              selectedInspector={selectedInspector}
              table={table}
            />
          );
        }

        const isSelected = selectedInspector?.kind === "block" && selectedInspector.item?.block_id === item.block_id;

        return (
          <div
            className="overflow-hidden cursor-pointer transition-all"
            key={`block-${item.block_id}`}
            onClick={() => onSelectBlock(item)}
            role="button"
            tabIndex={0}
            style={{
              borderRadius: '8px',
              border: `1px solid ${isSelected ? '#F0B90B' : '#E6E8EA'}`,
              background: isSelected ? '#FFF8E6' : '#fff',
              boxShadow: isSelected ? '0 0 0 2px rgba(240,185,11,0.2)' : 'none',
              transition: 'all 150ms ease'
            }}
          >
            {/* Block metadata header */}
            <div className="px-3 py-1.5 flex items-center gap-2" style={{ borderBottom: '1px solid #F0F1F3', background: '#FAFAFA' }}>
              <span className="text-[10px] font-mono tabular-nums" style={{ color: '#C0C6CF' }}>#{item.surface_order_index}</span>
              <span className="w-px h-3 flex-shrink-0" style={{ background: '#E6E8EA' }} />
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{
                borderRadius: '4px',
                background: isSelected ? '#FFF8E6' : '#F5F5F5',
                border: `1px solid ${isSelected ? '#F0B90B33' : '#E6E8EA'}`,
                color: isSelected ? '#B07D0A' : '#848E9C'
              }}>
                {blockTypeIcon(item.block_type)}
                {item.block_type}
              </span>
              {item.section_title && (
                <span className="text-[10px] truncate max-w-[200px]" style={{ color: '#C0C6CF' }}>§ {item.section_title}</span>
              )}
            </div>

            {/* Block content */}
            <div className={`px-4 py-3 ${item.block_type === 'list_item' ? 'flex gap-2.5 items-start' : ''}`}>
              {item.block_type === 'heading' ? (
                <h3 className="text-[15px] font-bold leading-snug" style={{ color: '#1E2026' }}>{item.raw_content}</h3>
              ) : item.block_type === 'list_item' ? (
                <>
                  <div className="w-1 h-1 rounded-full flex-shrink-0 mt-[7px]" style={{ background: '#C0C6CF' }} />
                  <p className="text-[13px] leading-relaxed" style={{ color: '#474D57' }}>{item.raw_content}</p>
                </>
              ) : (
                <p className="text-[13px] leading-relaxed" style={{ color: '#474D57' }}>{item.raw_content}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RequirementCandidatePanel({
  candidateResult,
  isActionDisabled,
  isBatchProcessing,
  isCandidatesLoading,
  isGeneratingCandidates,
  onAccept,
  onAcceptAllPending,
  onGenerate,
  onReject,
  onRegenerate,
  onRejectAllPending,
  pendingCandidateActionId,
  selectedVersion
}) {
  const summary = candidateResult?.summary ?? buildEmptyCandidateState().summary;
  const candidates = candidateResult?.candidates ?? [];
  const canExtract = isVersionCompareReady(selectedVersion);
  const hasPending = summary.pending > 0;
  const allBusy = isActionDisabled || isBatchProcessing;
  const total = summary.total ?? (summary.pending + summary.accepted + summary.rejected);

  const statusConfig = {
    pending: { label: "Pending", color: "#B07D0A", dot: "#F0B90B" },
    accepted: { label: "Accepted", color: "#0ECB81", dot: "#0ECB81" },
    rejected: { label: "Rejected", color: "#F6465D", dot: "#F6465D" },
  };

  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid #E6E8EA",
        borderRadius: "12px",
        overflow: "hidden",
        boxShadow: "rgba(32, 32, 37, 0.05) 0px 3px 5px 0px",
      }}
      aria-label="AI Obligation Extraction"
    >
      {/* ── Panel Header ────────────────────────────────── */}
      <div style={{
        padding: "18px 22px 16px",
        background: "#FAFAFA",
        borderBottom: "1px solid #E6E8EA",
        borderLeft: "3px solid #F0B90B",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "34px", height: "34px", borderRadius: "8px",
            background: "rgba(240,185,11,0.1)", border: "1px solid rgba(240,185,11,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Sparkles size={16} style={{ color: "#F0B90B" }} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#1E2026", letterSpacing: "-0.01em" }}>
              AI Obligation Extraction
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#848E9C", lineHeight: 1.4 }}>
              Review AI-detected candidates before they become project truth
            </p>
          </div>
        </div>

        {/* Stats summary row */}
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          {[
            { key: "pending", count: summary.pending },
            { key: "accepted", count: summary.accepted },
            { key: "rejected", count: summary.rejected },
          ].map(({ key, count }) => {
            const cfg = statusConfig[key];
            return (
              <span key={key} aria-label={`${cfg.label} ${count}`} style={{
                display: "inline-flex", alignItems: "center", gap: "5px",
                padding: "4px 10px", borderRadius: "10px",
                background: "#fff", border: "1px solid #E6E8EA",
                fontSize: "11px", fontWeight: 600,
                boxShadow: "0 1px 2px rgba(32,32,37,0.04)",
              }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
                <span style={{ color: "#848E9C", fontWeight: 400 }}>{cfg.label}</span>
                <span style={{ color: cfg.color, fontWeight: 700 }}>{count}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* ── Progress bar (only when there are candidates) ── */}
      {total > 0 && (
        <div style={{ height: "4px", background: "#F0F1F3", display: "flex", overflow: "hidden" }}>
          {summary.accepted > 0 && (
            <div style={{ width: `${(summary.accepted / total) * 100}%`, background: "#0ECB81", transition: "width 400ms ease" }} />
          )}
          {summary.pending > 0 && (
            <div style={{ width: `${(summary.pending / total) * 100}%`, background: "#F0B90B", transition: "width 400ms ease" }} />
          )}
          {summary.rejected > 0 && (
            <div style={{ width: `${(summary.rejected / total) * 100}%`, background: "#F6465D", transition: "width 400ms ease" }} />
          )}
        </div>
      )}

      {/* ── Body ────────────────────────────────────────── */}
      <div style={{ padding: "18px 22px 20px" }}>

        {/* Not-parsed info message */}
        {!canExtract && (
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "10px 14px", borderRadius: "8px",
            background: "rgba(240,185,11,0.06)", border: "1px solid rgba(240,185,11,0.22)",
            marginBottom: "14px",
          }}>
            <AlertTriangle size={14} style={{ color: "#B07D0A", flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: "12px", color: "#B07D0A", lineHeight: 1.5 }}>
              Parse this document version first before running AI obligation extraction.
            </p>
          </div>
        )}

        {/* Primary + rescan action row */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: hasPending && candidates.length > 1 ? "8px" : "0" }}>
          <button
            disabled={!canExtract || allBusy || isGeneratingCandidates}
            onClick={onGenerate}
            type="button"
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "9px 18px", borderRadius: "50px", border: "none",
              background: !canExtract || allBusy || isGeneratingCandidates ? "#E6E8EA" : "#F0B90B",
              color: !canExtract || allBusy || isGeneratingCandidates ? "#848E9C" : "#1E2026",
              fontWeight: 700, fontSize: "13px", cursor: !canExtract || allBusy || isGeneratingCandidates ? "not-allowed" : "pointer",
              transition: "all 180ms ease",
              boxShadow: !canExtract || allBusy || isGeneratingCandidates ? "none" : "0 2px 8px rgba(240,185,11,0.24)",
            }}
          >
            {isGeneratingCandidates ? (
              <>
                <span style={{
                  width: "13px", height: "13px", borderRadius: "50%",
                  border: "2px solid #1E2026", borderTopColor: "transparent",
                  animation: "spin 0.7s linear infinite", display: "inline-block",
                }} />
                Extracting…
              </>
            ) : (
              <>
                <Sparkles size={14} />
                Extract Obligations with AI
              </>
            )}
          </button>

          {candidates.length > 0 && (
            <button
              disabled={!canExtract || allBusy || isGeneratingCandidates}
              onClick={onRegenerate}
              type="button"
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "8px 16px", borderRadius: "50px",
                border: "1px solid #E6E8EA", background: "#fff",
                color: "#474D57", fontSize: "13px", fontWeight: 600,
                cursor: !canExtract || allBusy || isGeneratingCandidates ? "not-allowed" : "pointer",
                opacity: !canExtract || allBusy || isGeneratingCandidates ? 0.5 : 1,
                transition: "all 150ms ease",
              }}
            >
              Rescan
            </button>
          )}

          {candidateResult?.provider_used && (
            <span style={{ fontSize: "11px", color: "#848E9C", marginLeft: "auto" }}>
              via {candidateResult.provider_used}{candidateResult.fallback_used ? " (fallback)" : ""}
            </span>
          )}
        </div>

        {/* Batch actions row */}
        {hasPending && candidates.length > 1 && (
          <div style={{
            display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center",
            padding: "10px 12px", borderRadius: "8px", marginTop: "4px",
            background: "rgba(240,185,11,0.04)", border: "1px solid rgba(240,185,11,0.16)",
          }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#B07D0A", flexGrow: 1 }}>
              {summary.pending} pending — bulk actions:
            </span>
            <button
              disabled={allBusy}
              onClick={onAcceptAllPending}
              type="button"
              style={{
                display: "inline-flex", alignItems: "center", gap: "5px",
                padding: "6px 12px", borderRadius: "50px", border: "none",
                background: "#F0B90B", color: "#1E2026",
                fontSize: "12px", fontWeight: 700,
                cursor: allBusy ? "not-allowed" : "pointer", opacity: allBusy ? 0.6 : 1,
                transition: "background 200ms ease",
              }}
            >
              <CheckCircle2 size={13} />
              {isBatchProcessing ? "Processing…" : `Accept All (${summary.pending})`}
            </button>
            <button
              disabled={allBusy}
              onClick={onRejectAllPending}
              type="button"
              style={{
                display: "inline-flex", alignItems: "center", gap: "5px",
                padding: "6px 12px", borderRadius: "50px",
                border: "1px solid #E6E8EA", background: "#FFFFFF",
                color: "#474D57", fontSize: "12px", fontWeight: 700,
                cursor: allBusy ? "not-allowed" : "pointer", opacity: allBusy ? 0.6 : 1,
                transition: "background 200ms ease",
              }}
            >
              <XCircle size={13} />
              Reject All
            </button>
          </div>
        )}

        {/* Error banner */}
        {candidateResult?.error_message && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: "10px",
            padding: "10px 14px", borderRadius: "8px", marginTop: "12px",
            background: "rgba(246,70,93,0.06)", border: "1px solid rgba(246,70,93,0.2)",
          }}>
            <AlertTriangle size={14} style={{ color: "#F6465D", flexShrink: 0, marginTop: "1px" }} />
            <p style={{ margin: 0, fontSize: "12px", color: "#F6465D", lineHeight: 1.5 }}>
              {candidateResult.error_message}
            </p>
          </div>
        )}

        {/* Loading state */}
        {isCandidatesLoading && (
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "16px", marginTop: "14px", borderRadius: "8px",
            background: "#FAFAFA", border: "1px solid #F0F1F3",
          }}>
            <span style={{
              width: "14px", height: "14px", borderRadius: "50%",
              border: "2px solid #E6E8EA", borderTopColor: "#F0B90B",
              animation: "spin 0.7s linear infinite", display: "inline-block", flexShrink: 0,
            }} />
            <p style={{ margin: 0, fontSize: "13px", color: "#848E9C" }}>Loading obligation candidates…</p>
          </div>
        )}

        {/* Candidate list */}
        {!isCandidatesLoading && candidates.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "16px" }}>
            {candidates.map((candidate) => {
              const isPending = candidate.status === "pending";
              const isCandidateBusy = pendingCandidateActionId === candidate.id;
              const cfg = statusConfig[candidate.status] ?? statusConfig.pending;
              const confidence = typeof candidate.confidence === "number" ? Math.round(candidate.confidence * 100) : null;

              return (
                <article
                  key={candidate.id}
                  style={{
                    borderRadius: "8px",
                    border: "1px solid #E6E8EA",
                    borderLeft: `3px solid ${cfg.dot}`,
                    background: "#FFFFFF",
                    overflow: "hidden",
                    transition: "box-shadow 200ms ease",
                    boxShadow: "0 1px 3px rgba(32, 32, 37, 0.05)",
                  }}
                >
                  {/* Card header — compact single row */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "7px 12px",
                    background: "#FAFAFA",
                    borderBottom: "1px solid #E6E8EA",
                    minHeight: "32px",
                  }}>
                    <span style={{
                      padding: "2px 7px", borderRadius: "4px",
                      background: "#fff", border: "1px solid #E6E8EA",
                      fontSize: "10px", fontWeight: 800, color: "#1E2026",
                      fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.02em",
                      whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                      {candidate.requirement_code}
                    </span>

                    <span style={{
                      padding: "1px 7px", borderRadius: "10px",
                      background: `${cfg.dot}12`, border: `1px solid ${cfg.dot}33`,
                      fontSize: "9px", fontWeight: 700, color: cfg.color,
                      textTransform: "uppercase", letterSpacing: "0.05em",
                      whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                      {candidate.status}
                    </span>

                    {/* Spacer */}
                    <div style={{ flex: 1 }} />

                    {/* Confidence indicator */}
                    {confidence !== null && !isCandidateBusy && (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: "4px",
                        fontSize: "11px", fontWeight: 700, flexShrink: 0,
                        color: confidence >= 80 ? "#0ECB81" : confidence >= 50 ? "#B07D0A" : "#F6465D",
                      }}>
                        <span style={{
                          width: "32px", height: "3px", borderRadius: "2px", background: "#E6E8EA", overflow: "hidden",
                          display: "inline-block", position: "relative",
                        }}>
                          <span style={{
                            position: "absolute", left: 0, top: 0, height: "100%",
                            width: `${confidence}%`,
                            background: confidence >= 80 ? "#0ECB81" : confidence >= 50 ? "#F0B90B" : "#F6465D",
                            borderRadius: "2px",
                          }} />
                        </span>
                        {confidence}%
                      </span>
                    )}

                    {/* Busy spinner */}
                    {isCandidateBusy && (
                      <span style={{
                        width: "12px", height: "12px", borderRadius: "50%",
                        border: "2px solid #E6E8EA", borderTopColor: "#F0B90B",
                        animation: "spin 0.7s linear infinite", display: "inline-block", flexShrink: 0,
                      }} />
                    )}
                  </div>

                  {/* Card body */}
                  <div style={{ padding: "10px 12px 12px" }}>
                    <h3 style={{ margin: "0 0 4px", fontSize: "13px", fontWeight: 700, color: "#1E2026", lineHeight: 1.4 }}>
                      {candidate.title}
                    </h3>

                    {candidate.description && (
                      <p style={{ margin: "0 0 6px", fontSize: "12px", color: "#474D57", lineHeight: 1.55 }}>
                        {candidate.description}
                      </p>
                    )}

                    <div style={{ fontSize: "10px", color: "#848E9C", lineHeight: 1.4, display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ fontWeight: 700, color: "#686A6C", textTransform: "uppercase", letterSpacing: "0.04em" }}>Source</span>
                      <span style={{ color: "#C0C6CF" }}>·</span>
                      {candidate.source_section || "Unscoped"}{candidate.source_block_key ? ` / ${candidate.source_block_key}` : ""}
                    </div>

                    {candidate.rejection_reason && (
                      <div style={{
                        marginTop: "6px", fontSize: "10px", color: "#B07D0A", lineHeight: 1.5,
                        padding: "4px 8px", borderRadius: "4px", background: "rgba(240,185,11,0.06)", border: "1px solid rgba(240,185,11,0.15)",
                      }}>
                        <span style={{ fontWeight: 700 }}>Rejection:</span> {candidate.rejection_reason}
                      </div>
                    )}

                    {/* Action buttons — only shown when pending */}
                    {isPending && (
                      <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
                        <button
                          aria-label={`Confirm ${candidate.requirement_code}`}
                          disabled={isCandidateBusy || allBusy}
                          onClick={() => onAccept(candidate)}
                          type="button"
                          style={{
                            display: "inline-flex", alignItems: "center", gap: "5px",
                            padding: "5px 14px", borderRadius: "50px", border: "none",
                            background: "#F0B90B", color: "#1E2026",
                            fontSize: "11px", fontWeight: 700,
                            cursor: isCandidateBusy || allBusy ? "not-allowed" : "pointer",
                            opacity: isCandidateBusy || allBusy ? 0.6 : 1,
                            transition: "all 150ms ease",
                            boxShadow: "0 1px 3px rgba(240,185,11,0.18)",
                          }}
                        >
                          <CheckCircle2 size={12} />
                          Confirm
                        </button>
                        <button
                          aria-label={`Reject ${candidate.requirement_code}`}
                          disabled={isCandidateBusy || allBusy}
                          onClick={() => onReject(candidate)}
                          type="button"
                          style={{
                            display: "inline-flex", alignItems: "center", gap: "5px",
                            padding: "5px 12px", borderRadius: "50px",
                            border: "1px solid #E6E8EA", background: "#fff",
                            color: "#686A6C", fontSize: "11px", fontWeight: 600,
                            cursor: isCandidateBusy || allBusy ? "not-allowed" : "pointer",
                            opacity: isCandidateBusy || allBusy ? 0.6 : 1,
                            transition: "all 150ms ease",
                          }}
                        >
                          <XCircle size={12} />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!isCandidatesLoading && candidates.length === 0 && canExtract && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "32px 20px", textAlign: "center", marginTop: "14px",
            borderRadius: "8px", border: "1px dashed #E6E8EA", background: "#F5F5F5",
          }}>
            <div style={{
              width: "44px", height: "44px", borderRadius: "12px", marginBottom: "12px",
              background: "rgba(240,185,11,0.08)", border: "1px solid rgba(240,185,11,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Sparkles size={20} style={{ color: "#F0B90B", opacity: 0.7 }} />
            </div>
            <p style={{ margin: "0 0 4px", fontSize: "14px", fontWeight: 700, color: "#1E2026" }}>
              No candidates yet
            </p>
            <p style={{ margin: 0, fontSize: "12px", color: "#848E9C", maxWidth: "240px", lineHeight: 1.6 }}>
              Click <strong>Extract Obligations with AI</strong> to scan this document version.
            </p>
          </div>
        )}
      </div>

      {/* Keyframe for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </section>
  );
}

function InspectPanel({ workspace, surfaceDetail, selectedInspector }) {
  const selectedVersion = workspace?.selected_version ?? null;
  const snapshot = parseSnapshot(selectedVersion?.parsed_snapshot);
  const warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings : [];
  const selectedSurfaceLabel = surfaceDetail?.surface?.label ?? "No surface selected";
  const countsBySurfaceType = snapshot.counts_by_surface_type ?? {};

  let detailSection = (
    <div className="parser-inspect-block">
      <p className="workspace-kicker">Overview</p>
      <ul className="parser-inspect-list">
        <li>Surface: {selectedSurfaceLabel}</li>
        <li>Status: {selectedVersion?.parse_status ?? "pending"}</li>
        <li>Blocks: {workspace?.summary?.total_blocks ?? 0}</li>
      </ul>
    </div>
  );

  if (selectedInspector?.kind === "block") {
    detailSection = (
      <div className="parser-inspect-block">
        <p className="workspace-kicker">Block details</p>
        <ul className="parser-inspect-list">
          <li>Type: {selectedInspector.item.block_type}</li>
          <li>Section: {selectedInspector.item.section_title || "Unscoped"}</li>
          <li>Surface slot: {selectedInspector.item.surface_order_index}</li>
          <li>Block id: {selectedInspector.item.block_id}</li>
        </ul>
      </div>
    );
  }

  if (selectedInspector?.kind === "table") {
    detailSection = (
      <div className="parser-inspect-block">
        <p className="workspace-kicker">Table details</p>
        <ul className="parser-inspect-list">
          <li>Table key: {selectedInspector.table.table_key}</li>
          <li>Header strategy: {selectedInspector.table.header_strategy}</li>
          <li>Rows: {selectedInspector.table.rows.length}</li>
          <li>Columns: {selectedInspector.table.columns.length}</li>
        </ul>
      </div>
    );
  }

  if (selectedInspector?.kind === "row") {
    detailSection = (
      <div className="parser-inspect-block">
        <p className="workspace-kicker">Row details</p>
        <ul className="parser-inspect-list">
          <li>Table key: {selectedInspector.table.table_key}</li>
          <li>Row key: {selectedInspector.row.row_key}</li>
          <li>Header row: {selectedInspector.row.is_header_row ? "Yes" : "No"}</li>
          <li>
            Merge metadata:{" "}
            {selectedInspector.row.cells.some((cell) => cell.merge_origin_key || cell.row_span > 1 || cell.col_span > 1)
              ? "Present"
              : "None"}
          </li>
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Parse Summary" subtitle="Overview of parsed content and coverage.">
        <div className="parser-inspect-grid">
          <div>
            <p className="workspace-kicker">Surface coverage</p>
            <ul className="parser-inspect-list">
              <li>Body: {countsBySurfaceType.body ?? 0}</li>
              <li>Headers: {countsBySurfaceType.header ?? 0}</li>
              <li>Footers: {countsBySurfaceType.footer ?? 0}</li>
              <li>Footnotes: {countsBySurfaceType.footnote ?? 0}</li>
              <li>Endnotes: {countsBySurfaceType.endnote ?? 0}</li>
            </ul>
          </div>
          <div>
            <p className="workspace-kicker">Operational state</p>
            <ul className="parser-inspect-list">
              <li>Status: {selectedVersion?.parse_status ?? "pending"}</li>
              <li>Warnings: {workspace?.summary?.warning_count ?? 0}</li>
              <li>Blocks: {workspace?.summary?.total_blocks ?? 0}</li>
              <li>Rows: {workspace?.summary?.row_count ?? 0}</li>
            </ul>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Warnings" subtitle="Non-blocking issues detected during parsing.">
        {warnings.length > 0 ? (
          <ul className="parser-inspect-list">
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p className="workspace-note">No warnings.</p>
        )}
      </SectionCard>

      <SectionCard title="Inspector" subtitle="Click any block, table, or row to view details.">
        {detailSection}
      </SectionCard>
    </div>
  );
}

export function ParserWorkspacePage() {
  const { logout, token } = useAuth();
  const { contractId, documentId } = useParams();
  const [searchParams] = useSearchParams();
  const routeDocumentId = documentId ?? contractId;
  const contractDetailHref = `/contracts/${contractId ?? routeDocumentId}`;
  const compareSetupHref = contractId ? `/contracts/${contractId}` : `/documents/${routeDocumentId}`;
  const [workspace, setWorkspace] = useState(null);
  const [selectedVersionId, setSelectedVersionId] = useState(null);
  const [activeSurfaceGroup, setActiveSurfaceGroup] = useState("body");
  const [activeSurfaceId, setActiveSurfaceId] = useState(null);
  const [surfaceDetail, setSurfaceDetail] = useState(null);
  const [selectedInspector, setSelectedInspector] = useState(null);
  const [candidateResult, setCandidateResult] = useState(buildEmptyCandidateState());
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);
  const [isSurfaceLoading, setIsSurfaceLoading] = useState(false);
  const [isCandidatesLoading, setIsCandidatesLoading] = useState(false);
  const [isGeneratingCandidates, setIsGeneratingCandidates] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [parseActionVersionId, setParseActionVersionId] = useState(null);
  const [pendingCandidateActionId, setPendingCandidateActionId] = useState(null);
  const [rejectionTarget, setRejectionTarget] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [error, setError] = useState("");
  const requestedVersionId = parseRequestedVersionId(searchParams.get("version"));

  async function loadSurface(versionId, surfaceId) {
    if (!surfaceId) {
      setSurfaceDetail(null);
      return;
    }

    setIsSurfaceLoading(true);
    try {
      const payload = await getParserSurface(token, versionId, surfaceId);
      setSurfaceDetail(payload);
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        logout();
        return;
      }

      setError(loadError.message);
      setSurfaceDetail(null);
    } finally {
      setIsSurfaceLoading(false);
    }
  }

  async function loadRequirementCandidates(version) {
    if (!isVersionCompareReady(version)) {
      setCandidateResult(buildEmptyCandidateState());
      return;
    }

    setIsCandidatesLoading(true);
    try {
      const payload = await listRequirementCandidates(token, version.id);
      setCandidateResult(payload);
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        logout();
        return;
      }

      setCandidateResult(buildEmptyCandidateState());
      setError(loadError.message);
    } finally {
      setIsCandidatesLoading(false);
    }
  }

  async function loadWorkspace(versionId = null, options = {}) {
    const { preferredGroup = "body", preferredSurfaceId = null } = options;

    setIsWorkspaceLoading(true);
    setError("");

    try {
      const payload = await getParserWorkspace(token, routeDocumentId, versionId);
      setWorkspace(payload);
      setSelectedVersionId(payload.selected_version.id);
      const nextSurfaceSelection = getDefaultSurfaceSelection(
        payload.surface_groups,
        preferredGroup,
        preferredSurfaceId
      );
      setActiveSurfaceGroup(nextSurfaceSelection.group);
      setActiveSurfaceId(nextSurfaceSelection.surfaceId);
      setSelectedInspector(null);

      if (nextSurfaceSelection.surfaceId) {
        await loadSurface(payload.selected_version.id, nextSurfaceSelection.surfaceId);
      } else {
        setSurfaceDetail(null);
      }
      await loadRequirementCandidates(payload.selected_version);
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        logout();
        return;
      }

      setError(loadError.message);
    } finally {
      setIsWorkspaceLoading(false);
    }
  }

  useEffect(() => {
    let isCurrent = true;

    async function bootstrapWorkspace() {
      if (!isCurrent) {
        return;
      }
      await loadWorkspace(requestedVersionId);
    }

    void bootstrapWorkspace();

    return () => {
      isCurrent = false;
    };
  }, [routeDocumentId, requestedVersionId, token]);

  async function handleParseVersion(version) {
    if (!version) {
      return;
    }

    setParseActionVersionId(version.id);
    setError("");

    try {
      await parseDocumentVersion(token, version.id);
      await loadWorkspace(version.id, {
        preferredGroup: "body"
      });
    } catch (parseError) {
      if (parseError instanceof ApiError && parseError.status === 401) {
        logout();
        return;
      }

      const parseMessage = parseError.message;
      try {
        await loadWorkspace(version.id, {
          preferredGroup: "body"
        });
      } catch (refreshError) {
        if (refreshError instanceof ApiError && refreshError.status === 401) {
          logout();
          return;
        }
      }
      setError(parseMessage);
    } finally {
      setParseActionVersionId(null);
    }
  }

  async function handleGenerateRequirementCandidates(forceRegenerate = false) {
    if (!isVersionCompareReady(selectedVersion)) {
      return;
    }

    setIsGeneratingCandidates(true);
    setError("");
    try {
      const payload = await generateRequirementCandidates(token, selectedVersion.id, {
        force_regenerate: forceRegenerate
      });
      setCandidateResult(payload);
    } catch (generateError) {
      if (generateError instanceof ApiError && generateError.status === 401) {
        logout();
        return;
      }

      setError(generateError.message);
    } finally {
      setIsGeneratingCandidates(false);
    }
  }

  async function handleAcceptRequirementCandidate(candidate) {
    setPendingCandidateActionId(candidate.id);
    setError("");
    try {
      const updatedCandidate = await acceptRequirementCandidate(token, candidate.id);
      setCandidateResult((currentResult) => updateCandidateResult(currentResult, updatedCandidate));
    } catch (acceptError) {
      if (acceptError instanceof ApiError && acceptError.status === 401) {
        logout();
        return;
      }

      setError(acceptError.message);
    } finally {
      setPendingCandidateActionId(null);
    }
  }

  async function handleRejectRequirementCandidate(candidate, reason = "") {
    setPendingCandidateActionId(candidate.id);
    setError("");
    try {
      const updatedCandidate = await rejectRequirementCandidate(
        token,
        candidate.id,
        reason.trim() || null
      );
      setCandidateResult((currentResult) => updateCandidateResult(currentResult, updatedCandidate));
    } catch (rejectError) {
      if (rejectError instanceof ApiError && rejectError.status === 401) {
        logout();
        return;
      }

      setError(rejectError.message);
    } finally {
      setPendingCandidateActionId(null);
    }
  }

  function openRejectionDialog(candidate) {
    setRejectionTarget(candidate);
    setRejectionReason("");
  }

  async function confirmRejection() {
    if (!rejectionTarget) return;
    const target = rejectionTarget;
    const reason = rejectionReason;
    setRejectionTarget(null);
    setRejectionReason("");
    await handleRejectRequirementCandidate(target, reason);
  }

  function cancelRejection() {
    setRejectionTarget(null);
    setRejectionReason("");
  }

  async function handleAcceptAllPending() {
    const pendingCandidates = (candidateResult?.candidates ?? []).filter(
      (c) => c.status === "pending"
    );
    if (pendingCandidates.length === 0) return;

    setIsBatchProcessing(true);
    setError("");
    try {
      for (const candidate of pendingCandidates) {
        const updatedCandidate = await acceptRequirementCandidate(token, candidate.id);
        setCandidateResult((currentResult) => updateCandidateResult(currentResult, updatedCandidate));
      }
    } catch (batchError) {
      if (batchError instanceof ApiError && batchError.status === 401) {
        logout();
        return;
      }
      setError(batchError.message);
    } finally {
      setIsBatchProcessing(false);
    }
  }

  async function handleRejectAllPending(reason = "") {
    const pendingCandidates = (candidateResult?.candidates ?? []).filter(
      (c) => c.status === "pending"
    );
    if (pendingCandidates.length === 0) return;

    setIsBatchProcessing(true);
    setError("");
    try {
      for (const candidate of pendingCandidates) {
        const updatedCandidate = await rejectRequirementCandidate(
          token,
          candidate.id,
          reason.trim() || null
        );
        setCandidateResult((currentResult) => updateCandidateResult(currentResult, updatedCandidate));
      }
    } catch (batchError) {
      if (batchError instanceof ApiError && batchError.status === 401) {
        logout();
        return;
      }
      setError(batchError.message);
    } finally {
      setIsBatchProcessing(false);
    }
  }

  const selectedVersion =
    workspace?.versions?.find((version) => version.id === selectedVersionId) ?? workspace?.selected_version ?? null;
  const selectedGroupEntries = workspace?.surface_groups?.[activeSurfaceGroup] ?? [];
  const snapshot = parseSnapshot(selectedVersion?.parsed_snapshot);
  const compareTarget = getCompareTarget(workspace?.versions ?? [], compareSetupHref);
  const diagnostics = buildDiagnostics(workspace, selectedVersion);
  const errorCount = diagnostics.filter((diagnostic) =>
    /^(error|failed?|critical)$/i.test(String(diagnostic.severity ?? ""))
  ).length;
  const warningCount = diagnostics.filter((diagnostic) => !/^(error|failed?|critical)$/i.test(String(diagnostic.severity ?? ""))).length;
  const selectedVersionReady = isVersionCompareReady(selectedVersion);

  // ── Accordion state for sidebar sections ──────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(() => ({
    versions: true,
    summary: true,
    diagnostics: true,
    ai: true,
    compare: true
  }));
  const toggleSection = (key) => setSidebarOpen(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="flex overflow-hidden w-full" style={{ height: 'calc(100vh - 64px)', background: '#FAFAFA', color: '#1E2026', position: 'relative' }}>

      {/* Left Panel: Context & Diagnostics */}
      <aside className="flex-shrink-0 flex flex-col h-full overflow-y-auto" style={{ width: '340px', background: '#fff', borderRight: '1px solid #E6E8EA' }}>
        {/* Sidebar header: back nav only (Re-parse is now a FAB) */}
        <div className="flex items-center gap-2 px-4 flex-shrink-0" style={{ height: '52px', borderBottom: '1px solid #E6E8EA' }}>
          <Link
            aria-label="Back to contract"
            className="flex items-center justify-center w-6 h-6 transition-all no-underline flex-shrink-0"
            style={{ borderRadius: '5px', color: '#848E9C' }}
            to={contractDetailHref}
            onMouseEnter={e => e.currentTarget.style.background = '#F5F5F5'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <ArrowLeft size={14} />
          </Link>
          <span className="text-[12px] font-semibold truncate" style={{ color: '#1E2026' }} title={workspace?.document?.title}>
            {workspace?.document?.title || 'Parser Workspace'}
          </span>
        </div>
        {error ? (
          <div className="mx-4 mt-3 p-3 text-[13px]" style={{ background: '#FFF1F0', border: '1px solid #F6465D33', borderRadius: '8px', color: '#F6465D' }}>{error}</div>
        ) : null}

        {/* ── ACCORDION: Versions ─────────────────────────────────────────── */}
        <div style={{ borderBottom: '1px solid #E6E8EA' }}>
          <button
            className="w-full flex items-center justify-between px-4 cursor-pointer transition-colors"
            style={{ height: '40px', background: 'none', border: 'none' }}
            onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
            onClick={() => toggleSection('versions')}
            type="button"
          >
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#848E9C' }}>Versions</span>
            <div className="flex items-center gap-2">
              {selectedVersion && (
                <span className="text-[10px] font-bold px-1.5 py-0.5" title={selectedVersion.version_label} style={{ borderRadius: '4px', background: '#FFF8E6', color: '#B07D0A', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                  {selectedVersion.version_label.length > 20 ? selectedVersion.version_label.slice(0, 20) + '…' : selectedVersion.version_label}
                </span>
              )}
              <ChevronDown size={13} style={{ color: '#848E9C', transform: sidebarOpen.versions ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }} />
            </div>
          </button>
          {sidebarOpen.versions && (
            <div className="px-4 pb-3 space-y-1.5">
              {isWorkspaceLoading ? (
                <div className="flex items-center gap-2 py-2">
                  <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: '#F0B90B40', borderTopColor: '#F0B90B' }} />
                  <p className="text-[12px]" style={{ color: '#848E9C' }}>Loading versions...</p>
                </div>
              ) : (
                (workspace?.versions ?? []).map((version) => {
                  const isActive = version.id === selectedVersion?.id;
                  return (
                    <button
                      key={version.id}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-left transition-all cursor-pointer"
                      style={{
                        borderRadius: '8px',
                        border: `1px solid ${isActive ? '#F0B90B66' : '#E6E8EA'}`,
                        background: isActive ? '#FFF8E6' : '#FAFAFA',
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#F5F5F5'; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = '#FAFAFA'; }}
                      onClick={() => {
                        setSelectedVersionId(version.id);
                        void loadWorkspace(version.id, { preferredGroup: 'body' });
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={13} style={{ color: isActive ? '#B07D0A' : '#848E9C', flexShrink: 0 }} />
                        <span className="text-[12px] font-medium truncate" title={version.version_label} style={{ color: isActive ? '#1E2026' : '#474D57', maxWidth: '140px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {version.version_label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                        {version.parse_status === 'parsed' && <CheckCircle2 size={13} style={{ color: '#2EBD85' }} />}
                        {version.parse_status === 'parsed_with_warnings' && <AlertTriangle size={13} style={{ color: '#F0B90B' }} />}
                        {isActive && <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#F0B90B' }} />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* ── ACCORDION: Parse Summary ─────────────────────────────────────── */}
        <div style={{ borderBottom: '1px solid #E6E8EA' }}>
          <button
            className="w-full flex items-center justify-between px-4 cursor-pointer transition-colors"
            style={{ height: '40px', background: 'none', border: 'none' }}
            onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
            onClick={() => toggleSection('summary')}
            type="button"
          >
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#848E9C' }}>Parse Summary</span>
            <div className="flex items-center gap-2">
              {selectedVersionReady && (
                <span className="text-[10px] font-bold px-1.5 py-0.5" style={{ borderRadius: '4px', background: '#EBF9F4', color: '#2EBD85' }}>
                  {workspace?.summary?.total_blocks ?? 0} blocks
                </span>
              )}
              <ChevronDown size={13} style={{ color: '#848E9C', transform: sidebarOpen.summary ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }} />
            </div>
          </button>
          {sidebarOpen.summary && (
            <div className="px-4 pb-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Blocks', value: workspace?.summary?.total_blocks ?? 0, icon: <FileText size={13} />, color: selectedVersionReady ? '#2EBD85' : '#B07D0A', bg: selectedVersionReady ? '#EBF9F4' : '#FFF8E6', border: selectedVersionReady ? '#2EBD8533' : '#F0B90B33' },
                  { label: 'Surfaces', value: workspace?.summary?.total_surfaces ?? 0, icon: <FileSearch size={13} />, color: '#B07D0A', bg: '#FFF8E6', border: '#F0B90B33' },
                  { label: 'Warnings', value: warningCount, icon: <AlertTriangle size={13} />, color: warningCount > 0 ? '#CF6600' : '#848E9C', bg: warningCount > 0 ? '#FFF5E6' : '#FAFAFA', border: warningCount > 0 ? '#F0B90B33' : '#E6E8EA' },
                  { label: 'Errors', value: errorCount, icon: <XCircle size={13} />, color: errorCount > 0 ? '#F6465D' : '#848E9C', bg: errorCount > 0 ? '#FFF1F0' : '#FAFAFA', border: errorCount > 0 ? '#F6465D33' : '#E6E8EA' }
                ].map((stat) => (
                  <div key={stat.label} className="p-3 flex flex-col gap-1" style={{ borderRadius: '8px', background: stat.bg, border: `1px solid ${stat.border}` }}>
                    <div className="flex items-center gap-1" style={{ color: stat.color }}>
                      {stat.icon}
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#848E9C' }}>{stat.label}</span>
                    </div>
                    <span className="text-[20px] font-bold leading-none" style={{ color: stat.color }}>{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── ACCORDION: Diagnostics Log ───────────────────────────────────── */}
        <div style={{ borderBottom: '1px solid #E6E8EA' }}>
          <button
            className="w-full flex items-center justify-between px-4 cursor-pointer transition-colors"
            style={{ height: '40px', background: 'none', border: 'none' }}
            onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
            onClick={() => toggleSection('diagnostics')}
            type="button"
          >
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#848E9C' }}>Diagnostics Log</span>
            <div className="flex items-center gap-2">
              {diagnostics.length > 0 ? (
                <span className="text-[10px] font-bold px-1.5 py-0.5" style={{ borderRadius: '4px', background: errorCount > 0 ? '#FFF1F0' : '#FFF5E6', color: errorCount > 0 ? '#F6465D' : '#CF6600' }}>
                  {diagnostics.length}
                </span>
              ) : (
                <CheckCircle2 size={12} style={{ color: '#2EBD85' }} />
              )}
              <ChevronDown size={13} style={{ color: '#848E9C', transform: sidebarOpen.diagnostics ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }} />
            </div>
          </button>
          {sidebarOpen.diagnostics && (
            <div className="px-4 pb-3 space-y-2">
              {selectedInspector ? (
                <div className="p-3" style={{ background: '#EFF6FF', border: '1px solid #3B82F633', borderRadius: '8px' }}>
                  <div className="flex gap-2">
                    <FileSearch size={14} style={{ color: '#2563EB', marginTop: '1px', flexShrink: 0 }} />
                    <div className="flex-1">
                      <span className="text-[11px] font-bold uppercase" style={{ color: '#2563EB' }}>Selected Item</span>
                      <p className="text-[12px] leading-snug mt-0.5" style={{ color: '#474D57' }}>
                        {selectedInspector.kind === 'block' ? `Type: ${selectedInspector.item.block_type} | Slot: ${selectedInspector.item.surface_order_index}` : null}
                        {selectedInspector.kind === 'table' ? `Table: ${selectedInspector.table.table_key}` : null}
                        {selectedInspector.kind === 'row' ? `Row: ${selectedInspector.row.row_key}` : null}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
              {diagnostics.length > 0 ? (
                diagnostics.map((diagnostic, index) => {
                  const isError = /^(error|failed?|critical)$/i.test(String(diagnostic.severity ?? ''));
                  return (
                    <div key={`${diagnostic.code}-${index}`} className="p-3" style={{ background: isError ? '#FFF1F0' : '#FFFBEB', border: `1px solid ${isError ? '#F6465D33' : '#F0B90B33'}`, borderRadius: '8px' }}>
                      <div className="flex gap-2">
                        <XCircle size={14} style={{ color: isError ? '#F6465D' : '#CF6600', marginTop: '1px', flexShrink: 0 }} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-bold" style={{ color: isError ? '#F6465D' : '#CF6600' }}>{diagnostic.code}</span>
                            <span className="text-[10px] font-semibold uppercase" style={{ color: '#848E9C' }}>{diagnostic.severity}</span>
                          </div>
                          <p className="text-[12px] leading-snug" style={{ color: '#474D57' }}>{diagnostic.message}</p>
                          {diagnostic.metadata && Object.keys(diagnostic.metadata).length > 0 ? (
                            <p className="text-[10px] mt-1" style={{ color: '#848E9C', fontFamily: 'monospace' }}>
                              {Object.entries(diagnostic.metadata).slice(0, 3).map(([k, v]) => `${k}: ${String(v)}`).join(' | ')}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center gap-2 py-4 text-center" style={{ borderRadius: '10px', border: '1px dashed #E6E8EA' }}>
                  <CheckCircle2 size={18} style={{ color: '#2EBD85', opacity: 0.7 }} />
                  <p className="text-[12px]" style={{ color: '#848E9C' }}>No diagnostics — all clear.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── ACCORDION: AI Obligation Extraction ─────────────────────────── */}
        <div style={{ borderBottom: '1px solid #E6E8EA' }}>
          <button
            className="w-full flex items-center justify-between px-4 cursor-pointer transition-colors"
            style={{ height: '40px', background: 'none', border: 'none' }}
            onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
            onClick={() => toggleSection('ai')}
            type="button"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={12} style={{ color: '#848E9C' }} />
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#848E9C' }}>AI Extraction</span>
            </div>
            <div className="flex items-center gap-2">
              {(candidateResult?.summary?.pending ?? 0) > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5" style={{ borderRadius: '4px', background: '#FFF8E6', color: '#B07D0A' }}>
                  {candidateResult.summary.pending} pending
                </span>
              )}
              <ChevronDown size={13} style={{ color: '#848E9C', transform: sidebarOpen.ai ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }} />
            </div>
          </button>
          {sidebarOpen.ai && (
            <div className="px-4 pb-3">
              <RequirementCandidatePanel
                candidateResult={candidateResult}
                isActionDisabled={isWorkspaceLoading || isSurfaceLoading}
                isBatchProcessing={isBatchProcessing}
                isCandidatesLoading={isCandidatesLoading}
                isGeneratingCandidates={isGeneratingCandidates}
                onAccept={handleAcceptRequirementCandidate}
                onAcceptAllPending={handleAcceptAllPending}
                onGenerate={() => handleGenerateRequirementCandidates(false)}
                onRegenerate={() => handleGenerateRequirementCandidates(true)}
                onReject={openRejectionDialog}
                onRejectAllPending={() => { setRejectionTarget({ _batch: true }); setRejectionReason(''); }}
                pendingCandidateActionId={pendingCandidateActionId}
                selectedVersion={selectedVersion}
              />
            </div>
          )}
        </div>

        {/* ── ACCORDION: Compare Readiness ─────────────────────────────────── */}
        <div style={{ borderBottom: '1px solid #E6E8EA' }}>
          <button
            className="w-full flex items-center justify-between px-4 cursor-pointer transition-colors"
            style={{ height: '40px', background: 'none', border: 'none' }}
            onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
            onClick={() => toggleSection('compare')}
            type="button"
          >
            <div className="flex items-center gap-2">
              <GitCompare size={12} style={{ color: '#848E9C' }} />
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#848E9C' }}>Compare Readiness</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: compareTarget.disabled ? '#C0C6CF' : '#2EBD85' }} />
              <ChevronDown size={13} style={{ color: '#848E9C', transform: sidebarOpen.compare ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }} />
            </div>
          </button>
          {sidebarOpen.compare && (
            <div className="px-4 pb-3">
              <p className="text-[12px] mb-3" style={{ color: '#474D57' }}>
                {compareTarget.disabled ? 'Need at least 2 parsed versions to enable compare.' : 'Both versions parsed. Ready for compare setup.'}
              </p>
              {compareTarget.disabled ? (
                <button className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] cursor-not-allowed" style={{ borderRadius: '6px', border: '1px solid #E6E8EA', color: '#848E9C', opacity: 0.5 }} disabled type="button">
                  <GitCompare size={13} /> {compareTarget.label}
                </button>
              ) : (
                <Link className="flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-semibold no-underline" style={{ borderRadius: '6px', background: '#F0B90B', color: '#1E2026' }} to={compareTarget.href}>
                  <GitCompare size={13} /> {compareTarget.label}
                </Link>
              )}
            </div>
          )}
        </div>

      </aside>

      {/* Right Panel: Main Preview Area */}
      <section className="flex-1 flex flex-col min-w-0 relative" style={{ background: '#FAFAFA' }}>
        {/* Accessible page heading (visually hidden) */}
        <h1 style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>Parser Workspace</h1>
        {/* Surface Group Tabs */}
        <div className="flex items-end gap-5 px-5 overflow-x-auto flex-shrink-0" style={{ borderBottom: '1px solid #E6E8EA', background: '#fff' }} role="tablist" aria-label="Parsed surfaces">
          {SURFACE_GROUP_ORDER.map(([groupKey, label]) => {
            const entries = workspace?.surface_groups?.[groupKey] ?? [];
            const totalItems = entries.reduce((sum, e) => sum + (e.item_count ?? 0), 0);
            if (totalItems === 0 && groupKey !== 'body') return null;
            const isActive = activeSurfaceGroup === groupKey;
            const icons = { body: <FileText size={14} />, headers: <ArrowLeft size={14} style={{ transform: 'rotate(90deg)' }} />, footers: <ArrowLeft size={14} style={{ transform: 'rotate(-90deg)' }} />, footnotes: <FileSearch size={14} />, endnotes: <FileSearch size={14} />, pages: <FileText size={14} /> };
            return (
              <button
                key={groupKey}
                aria-selected={isActive}
                className="flex items-center gap-1.5 text-[13px] font-semibold whitespace-nowrap transition-all cursor-pointer"
                style={{
                  color: isActive ? '#1E2026' : '#848E9C',
                  background: 'none', border: 'none',
                  borderBottom: `2px solid ${isActive ? '#F0B90B' : 'transparent'}`,
                  paddingBottom: '11px', paddingTop: '11px'
                }}
                onClick={() => {
                  const groupEntries = workspace?.surface_groups?.[groupKey] ?? [];
                  const firstSurfaceId = groupEntries.length > 0 ? groupEntries[0].id : null;
                  setActiveSurfaceGroup(groupKey);
                  setActiveSurfaceId(firstSurfaceId);
                  setSelectedInspector(null);
                  if (selectedVersion && firstSurfaceId) {
                    void loadSurface(selectedVersion.id, firstSurfaceId);
                  } else {
                    setSurfaceDetail(null);
                  }
                }}
                role="tab"
                type="button"
              >
                <span style={{ color: isActive ? '#B07D0A' : '#C0C6CF' }}>{icons[groupKey]}</span>
                {label}
                <span className="text-[10px] font-bold px-1.5 py-0.5" style={{
                  borderRadius: '99px',
                  background: isActive ? '#FFF8E6' : '#F5F5F5',
                  color: isActive ? '#B07D0A' : '#848E9C'
                }}>{totalItems}</span>
              </button>
            );
          })}
        </div>

        {selectedGroupEntries.length > 1 && (
          <div className="px-5 py-2 flex gap-2 overflow-x-auto flex-shrink-0" style={{ borderBottom: '1px solid #E6E8EA', background: '#FAFAFA' }} role="tablist" aria-label="Surface instances">
            {selectedGroupEntries.map(entry => (
              <button
                key={entry.id}
                aria-selected={entry.id === activeSurfaceId}
                className="px-3 py-1 text-[12px] font-semibold whitespace-nowrap transition-all cursor-pointer"
                style={{
                  borderRadius: '99px',
                  border: `1px solid ${entry.id === activeSurfaceId ? '#F0B90B' : '#E6E8EA'}`,
                  background: entry.id === activeSurfaceId ? '#F0B90B' : '#fff',
                  color: entry.id === activeSurfaceId ? '#1E2026' : '#474D57'
                }}
                onClick={() => {
                  setActiveSurfaceId(entry.id);
                  setSelectedInspector(null);
                  if (selectedVersion) {
                    void loadSurface(selectedVersion.id, entry.id);
                  }
                }}
                role="tab"
                type="button"
              >
                {entry.label}
              </button>
            ))}
          </div>
        )}

        {/* Content Blocks List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {isWorkspaceLoading || isSurfaceLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: '#F0B90B40', borderTopColor: '#F0B90B' }} />
                <p className="text-[14px]" style={{ color: '#848E9C' }}>Loading extracted document surface...</p>
              </div>
            </div>
          ) : selectedVersionReady ? (
            <ParsedPreview
              onSelectBlock={(item) => setSelectedInspector({ kind: 'block', item })}
              onSelectRow={(table, row) => setSelectedInspector({ kind: 'row', table, row })}
              onSelectTable={(table) => setSelectedInspector({ kind: 'table', table })}
              selectedInspector={selectedInspector}
              surfaceDetail={surfaceDetail}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-center" style={{ minHeight: '360px' }}>
              <div className="p-4 mb-4" style={{ borderRadius: '16px', background: '#F5F5F5' }}>
                {selectedVersion?.parse_status === 'failed'
                  ? <XCircle size={36} style={{ color: '#F6465D', opacity: 0.7 }} />
                  : <FileSearch size={36} style={{ color: '#848E9C', opacity: 0.5 }} />}
              </div>
              <h3 className="text-[17px] font-bold mb-2" style={{ color: '#1E2026' }}>
                {selectedVersion?.parse_status === 'failed' ? 'Parse failed' : 'Not parsed yet'}
              </h3>
              <p className="text-[13px] max-w-xs" style={{ color: '#848E9C', lineHeight: '1.6' }}>
                {selectedVersion?.parse_status === 'failed'
                  ? 'Review the Diagnostics Log in the sidebar for errors, then fix the source file and re-run parse.'
                  : 'Click "Re-parse" in the sidebar to extract and view intelligent document blocks.'}
              </p>
              {selectedVersion && selectedVersion.parse_status !== 'failed' && (
                <button
                  className="mt-5 flex items-center gap-1.5 font-semibold text-[13px] cursor-pointer"
                  style={{ background: '#F0B90B', color: '#1E2026', padding: '8px 20px', borderRadius: '50px', border: 'none', transition: 'all 200ms ease' }}
                  disabled={parseActionVersionId === selectedVersion?.id}
                  onClick={() => handleParseVersion(selectedVersion)}
                  type="button"
                >
                  <Play size={13} />
                  {parseActionVersionId === selectedVersion?.id ? 'Parsing...' : getParseActionLabel(selectedVersion)}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Rejection dialog */}
        {rejectionTarget ? (
          <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={cancelRejection}>
            <div
              aria-labelledby="parser-rejection-dialog-title"
              aria-modal="true"
              className="w-full max-w-xl p-6"
              style={{ borderRadius: '12px', border: '1px solid #E6E8EA', background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
              onClick={e => e.stopPropagation()}
              role="dialog"
            >
              <div className="space-y-2">
                <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color: '#F6465D' }}>Confirm Rejection</p>
                <h2 className="text-[20px] font-bold" style={{ color: '#1E2026' }} id="parser-rejection-dialog-title">Rejection Reason</h2>
                <p className="text-[15px] font-semibold" style={{ color: '#1E2026' }}>
                  {rejectionTarget._batch ? `Reject all ${(candidateResult?.summary?.pending ?? 0)} pending candidates?` : `Reject ${rejectionTarget.requirement_code}?`}
                </p>
                <p className="text-[14px]" style={{ color: '#474D57' }}>
                  {rejectionTarget._batch ? 'All pending candidates will be marked as rejected.' : `"${rejectionTarget.title}" will be marked as rejected.`}
                </p>
              </div>
              <div className="mt-5 flex flex-col gap-2">
                <label className="text-[12px] font-semibold" style={{ color: '#474D57' }} htmlFor="parser-rejection-reason">Reason (optional)</label>
                <textarea
                  id="parser-rejection-reason"
                  className="w-full p-3 text-[14px] transition-colors"
                  style={{ borderRadius: '8px', border: '1px solid #E6E8EA', background: '#FAFAFA', color: '#1E2026', outline: 'none', resize: 'vertical' }}
                  onChange={(event) => setRejectionReason(event.target.value)}
                  placeholder="Why is this being rejected?"
                  rows={2}
                  value={rejectionReason}
                />
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button className="px-4 py-2 text-white text-[13px] font-semibold cursor-pointer" style={{ borderRadius: '6px', background: '#F6465D', border: 'none' }} onClick={() => { if (rejectionTarget._batch) { setRejectionTarget(null); void handleRejectAllPending(rejectionReason); } else { void confirmRejection(); } }} type="button">
                  Reject
                </button>
                <button className="px-4 py-2 text-[13px] font-semibold cursor-pointer" style={{ borderRadius: '6px', border: '1px solid #E6E8EA', color: '#474D57', background: '#fff' }} onClick={cancelRejection} type="button">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

      </section>

      {/* ── Floating Action Button: Parse / Re-parse ────────────────────── */}
      {selectedVersion && (
        <button
          aria-label={parseActionVersionId === selectedVersion.id ? 'Parsing in progress…' : `${getParseActionLabel(selectedVersion)} ${selectedVersion.version_label}`}
          onClick={() => handleParseVersion(selectedVersion)}
          disabled={parseActionVersionId === selectedVersion.id}
          type="button"
          style={{
            position: 'absolute',
            bottom: '24px',
            right: '24px',
            zIndex: 70,
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            padding: '10px 20px',
            borderRadius: '50px',
            border: 'none',
            background: parseActionVersionId === selectedVersion.id ? '#E8AC0A' : '#F0B90B',
            color: '#1E2026',
            fontWeight: 700,
            fontSize: '13px',
            letterSpacing: '0.01em',
            cursor: parseActionVersionId === selectedVersion.id ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 16px rgba(240,185,11,0.45), 0 2px 6px rgba(0,0,0,0.12)',
            transition: 'all 200ms ease',
            opacity: parseActionVersionId === selectedVersion.id ? 0.75 : 1,
          }}
          onMouseEnter={e => { if (parseActionVersionId !== selectedVersion.id) e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(240,185,11,0.55), 0 3px 8px rgba(0,0,0,0.14)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(240,185,11,0.45), 0 2px 6px rgba(0,0,0,0.12)'; }}
        >
          {parseActionVersionId === selectedVersion.id ? (
            <>
              <div style={{ width: '13px', height: '13px', borderRadius: '50%', border: '2px solid rgba(30,32,38,0.25)', borderTopColor: '#1E2026', animation: 'spin 0.8s linear infinite' }} />
              Parsing…
            </>
          ) : (
            <>
              <Play size={13} fill="#1E2026" />
              {getParseActionLabel(selectedVersion)}
            </>
          )}
        </button>
      )}
    </div>
  );
}
