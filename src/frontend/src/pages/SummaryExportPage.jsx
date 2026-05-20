import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Activity, ArrowLeft, ArrowRight, Bot, CheckCircle2, CircleDashed,
  Clock, Download, FileCode, FileDiff, FileDown, FileText, Flag,
  Sparkles, ChevronRight, GitCompare,
} from "lucide-react";
import { diffWords } from "diff";

import { useAuth } from "../auth/AuthContext";
import {
  ApiError, exportCompareRunDocx, generateCompareRunAiSummaryDraft,
  getCompareRun, listCompareRunChangeItems
} from "../lib/api";
import {
  buildChangeHeadline, buildCompareRunLabel, buildCompareRunPath,
  formatChangeType, formatCompareRunCode, formatReviewStatus,
  getSelectedQueueItem, resolveSelectedChangeId, summarizeReviewCounts
} from "../lib/compareWorkspace";

/* ── helpers ──────────────────────────────────────────────────────────── */
function buildQueuePreview(queue, highlightedItem, limit = 8) {
  if (!queue.length) return [];
  const preview = [];
  if (highlightedItem) preview.push(highlightedItem);
  queue.filter(i => i.id !== highlightedItem?.id).slice(0, limit - preview.length).forEach(i => preview.push(i));
  return preview;
}
function countWords(text) { return String(text ?? "").trim().split(/\s+/).filter(Boolean).length; }
function buildMarkdownFilename(id) { return `redline-summary-${formatCompareRunCode(id)}.md`; }
function exportMarkdownDraft(text, id) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type: "text/markdown" })), download: buildMarkdownFilename(id) });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

const CT_CFG = {
  added: { bg: "#EBF9F4", col: "#16714E", border: "#2EBD8544" },
  removed: { bg: "#FFF1F0", col: "#C03050", border: "#F6465D44" },
  modified: { bg: "#FFF8E6", col: "#B07D0A", border: "#F0B90B44" },
};
const RS_CFG = {
  resolved: { bg: "#EBF9F4", col: "#16714E", Icon: CheckCircle2 },
  in_review: { bg: "#FFF8E6", col: "#B07D0A", Icon: Clock },
  open: { bg: "#FFF1F0", col: "#C03050", Icon: CircleDashed },
};

export function SummaryExportPage() {
  const { logout, token } = useAuth();
  const { compareRunId } = useParams();
  const [searchParams] = useSearchParams();
  const [compareRun, setCompareRun] = useState(null);
  const [queue, setQueue] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [aiDraft, setAiDraft] = useState(null);
  const [editableText, setEditableText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);

  const handleExportDocx = async () => {
    setIsExportingDocx(true); setError("");
    try { await exportCompareRunDocx(token, compareRunId, editableText.trim() || null); }
    catch (e) { if (e instanceof ApiError && e.status === 401) { logout(); return; } setError(e.message); }
    finally { setIsExportingDocx(false); }
  };

  const handleGenerateSummary = async () => {
    setIsGenerating(true); setError("");
    try {
      const payload = await generateCompareRunAiSummaryDraft(token, compareRunId);
      setAiDraft(payload); setEditableText(payload.summary_text || "");
    }
    catch (e) { if (e instanceof ApiError && e.status === 401) { logout(); return; } setError(e.message); }
    finally { setIsGenerating(false); }
  };

  useEffect(() => {
    let ok = true;
    async function load() {
      setIsLoading(true); setError("");
      try {
        const [cr, q] = await Promise.all([getCompareRun(token, compareRunId), listCompareRunChangeItems(token, compareRunId)]);
        if (!ok) return;
        setCompareRun(cr); setQueue(q);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) { logout(); return; }
        if (ok) setError(e.message);
      } finally { if (ok) setIsLoading(false); }
    }
    void load();
    return () => { ok = false; };
  }, [compareRunId, logout, token]);

  const selectedChangeId = resolveSelectedChangeId(compareRun, queue, searchParams.get("change"));
  const highlightedItem = getSelectedQueueItem(queue, selectedChangeId) ?? queue[0] ?? null;
  const reviewCounts = summarizeReviewCounts(queue);
  const queuePreview = buildQueuePreview(queue, highlightedItem);
  const summaryWordCount = countWords(editableText);
  const hasSummaryDraft = editableText.trim().length > 0;
  const readyToExport = reviewCounts.open === 0 && reviewCounts.inReview === 0;
  const activeReviewCount = reviewCounts.open + reviewCounts.inReview;
  const totalChanges = compareRun?.summary?.total_changes ?? queue.length;
  const resolvedPct = totalChanges > 0 ? Math.round((reviewCounts.resolved / totalChanges) * 100) : 0;

  const reviewPath = buildCompareRunPath(compareRunId, "/review", selectedChangeId);
  const impactPath = buildCompareRunPath(compareRunId, "/impact", selectedChangeId);
  const comparePath = buildCompareRunPath(compareRunId, "", selectedChangeId);

  /* word-level diff for focus panel */
  const diffParts = useMemo(() => {
    const old = highlightedItem?.old_content ?? "";
    const nw = highlightedItem?.new_content ?? "";
    if (!old && !nw) return [];
    return diffWords(old, nw);
  }, [highlightedItem?.id, highlightedItem?.old_content, highlightedItem?.new_content]);

  return (
    <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", width: "100%", height: "calc(100vh - 64px)", background: "#F6F7F9", color: "#1E2026", fontFamily: "Inter, sans-serif", position: "relative" }}>

      {/* ── Styles ─────────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');
        @keyframes seSpin { to { transform:rotate(360deg); } }
        @keyframes seFade { from { opacity:0;transform:translateY(6px); } to { opacity:1;transform:translateY(0); } }
        .se-fade { animation:seFade 220ms ease-out both; }
        .se-card { background:#fff; border:1px solid #E6E8EA; border-radius:10px; }
        .se-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:#848E9C; }
        .se-queue-row { display:block; padding:8px 10px; border-radius:7px; border:1px solid #E6E8EA; background:#fff; text-decoration:none; transition:all 120ms; cursor:pointer; }
        .se-queue-row:hover { border-color:#F0B90B88; background:#FFFDF0; }
        .se-queue-row.active { border-color:#F0B90B; background:#FFFBE8; }
        .se-stats-grid { display:flex; flex-wrap:wrap; gap:12px; align-items:stretch; }
        .se-stat-group { display:grid; grid-template-columns:repeat(auto-fit,minmax(112px,1fr)); gap:8px; min-width:0; }
        .se-change-stat-group { flex:2 1 500px; }
        .se-review-stat-group { flex:1 1 330px; }
        .se-stat { display:flex; align-items:center; justify-content:space-between; min-width:0; padding:10px 14px; border-radius:8px; border:1px solid #E6E8EA; background:#FAFAFA; }
        .se-btn-primary { display:flex; align-items:center; justify-content:center; gap:5px; padding:8px 16px; border-radius:7px; background:#F0B90B; color:#1E2026; border:none; font-size:12px; font-weight:700; cursor:pointer; transition:all 150ms; width:100%; }
        .se-btn-primary:hover:not(:disabled) { background:#FFD000; transform:translateY(-1px); box-shadow:0 4px 12px rgba(240,185,11,0.35); }
        .se-btn-primary:disabled { opacity:.4; cursor:not-allowed; }
        .se-btn-secondary { display:flex; align-items:center; justify-content:center; gap:5px; padding:8px 16px; border-radius:7px; background:#fff; color:#474D57; border:1px solid #E6E8EA; font-size:12px; font-weight:600; cursor:pointer; transition:all 150ms; width:100%; }
        .se-btn-secondary:hover:not(:disabled) { background:#F4F5F7; }
        .se-btn-secondary:disabled { opacity:.4; cursor:not-allowed; }
        .se-diff-old mark { background:rgba(246,70,93,.15); color:#A82045; text-decoration:line-through; text-decoration-color:#F6465D; border-radius:3px; padding:0 2px; font-weight:600; }
        .se-diff-new mark { background:rgba(46,189,133,.18); color:#15643E; border-radius:3px; padding:0 2px; font-weight:600; }
        .se-textarea { width:100%; background:#F4F5F7; border:1px solid #E6E8EA; border-radius:8px; padding:14px; font-size:13px; line-height:1.75; color:#1E2026; resize:vertical; outline:none; min-height:180px; font-family:Inter,sans-serif; transition:border-color 150ms; box-sizing:border-box; }
        .se-textarea:focus { border-color:#F0B90B; }
        .se-spinner { width:11px; height:11px; border-radius:50%; border:2px solid rgba(30,32,38,.2); border-top-color:#1E2026; animation:seSpin .8s linear infinite; }
      `}</style>

      {/* ── TOP BAR ──────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, height: "52px", borderBottom: "1px solid #E6E8EA", background: "#fff", display: "flex", alignItems: "center", padding: "0 20px", gap: "10px", zIndex: 10 }}>

        <Link to={comparePath} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 12px", borderRadius: "7px", border: "1px solid #E6E8EA", background: "#fff", color: "#474D57", fontSize: "12px", fontWeight: 700, textDecoration: "none", transition: "all 150ms", flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.background = "#F4F5F7"}
          onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
          <ArrowLeft size={13} /> Back
        </Link>

        <div style={{ width: "1px", height: "20px", background: "#E6E8EA", flexShrink: 0 }} />

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: 0, overflow: "hidden" }}>
          <GitCompare size={13} style={{ color: "#848E9C", flexShrink: 0 }} />
          <h1 style={{ fontSize: "14px", fontWeight: 700, color: "#1E2026", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Summary / Export
          </h1>
          {compareRun && <span style={{ fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", background: "#F4F5F7", color: "#848E9C", border: "1px solid #E6E8EA", flexShrink: 0 }}>{buildCompareRunLabel(compareRun)}</span>}
        </div>

        {/* Status pills */}
        <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
          {[
            [reviewCounts.resolved, "Resolved", "#2EBD8522", "#16714E", CheckCircle2],
            [activeReviewCount, "Pending", "#F0B90B22", "#B07D0A", Clock],
            [totalChanges, "Total", "#E6E8EA", "#848E9C", FileDiff],
          ].map(([n, lbl, bg, col, Icon]) => (
            <div key={lbl} style={{ display: "flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "20px", background: bg, border: `1px solid ${col}44` }}>
              <Icon size={11} style={{ color: col }} />
              <span style={{ fontSize: "14px", fontWeight: 800, color: "#1E2026", fontVariantNumeric: "tabular-nums" }}>{n}</span>
              <span style={{ fontSize: "9px", fontWeight: 700, color: col, textTransform: "uppercase", letterSpacing: ".05em" }}>{lbl}</span>
            </div>
          ))}
        </div>

        <div style={{ width: "1px", height: "20px", background: "#E6E8EA", flexShrink: 0 }} />

        {/* Export actions */}
        <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
          <button type="button" className="se-btn-secondary" style={{ width: "auto", padding: "6px 14px" }}
            disabled={!hasSummaryDraft} onClick={() => hasSummaryDraft && exportMarkdownDraft(editableText, compareRun?.id ?? compareRunId)}>
            <Download size={13} /> Markdown
          </button>
          <button type="button" disabled={isExportingDocx} onClick={handleExportDocx}
            style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 16px", borderRadius: "7px", background: "#F0B90B", color: "#1E2026", border: "none", fontSize: "12px", fontWeight: 700, cursor: isExportingDocx ? "not-allowed" : "pointer", opacity: isExportingDocx ? .6 : 1, boxShadow: "0 2px 6px rgba(240,185,11,0.25)", transition: "all 150ms", flexShrink: 0 }}
            onMouseEnter={e => { if (!e.currentTarget.disabled) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(240,185,11,0.4)"; } }}
            onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 6px rgba(240,185,11,0.25)"; }}>
            {isExportingDocx ? <><div className="se-spinner" /> Exporting…</> : <><FileDown size={13} /> Export DOCX</>}
          </button>
        </div>
      </div>

      {/* ── ERROR ────────────────────────────────────────────────── */}
      {error && <div style={{ flexShrink: 0, padding: "8px 20px", background: "#FFF1F0", borderBottom: "1px solid #F6465D33", fontSize: "12px", color: "#C03050" }}>⚠ {error}</div>}

      {/* ── MAIN 3-PANEL ─────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", padding: "14px", gap: "12px" }}>

        {/* LEFT — Change Queue ─────────────────────────────────── */}
        <section aria-label="Summary command" style={{ width: "264px", flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flexShrink: 0, padding: "10px 14px", borderBottom: "1px solid #E6E8EA", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <FileDiff size={13} style={{ color: "#848E9C" }} />
              <h2 style={{ fontSize: "11px", fontWeight: 700, color: "#1E2026", margin: 0 }}>Key Change Queue</h2>
            </div>
            <span style={{ fontSize: "10px", fontWeight: 700, padding: "1px 7px", borderRadius: "20px", background: "#F4F5F7", color: "#848E9C" }}>{queue.length}</span>
          </div>

          {/* Progress bar */}
          <div style={{ flexShrink: 0, padding: "8px 14px", borderBottom: "1px solid #E6E8EA" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span className="se-label">Review progress</span>
              <span style={{ fontSize: "10px", fontWeight: 700, color: "#16714E" }}>{resolvedPct}%</span>
            </div>
            <div style={{ height: "5px", borderRadius: "3px", background: "#E6E8EA", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${resolvedPct}%`, background: "linear-gradient(90deg,#2EBD85,#16714E)", borderRadius: "3px", transition: "width 600ms ease" }} />
            </div>
          </div>

          {/* Queue list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px", display: "flex", flexDirection: "column", gap: "5px" }}>
            {isLoading ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: "2px solid #E6E8EA", borderTopColor: "#F0B90B", animation: "seSpin .8s linear infinite" }} />
              </div>
            ) : queuePreview.length ? queuePreview.map(item => {
              const isActive = item.id === selectedChangeId;
              const ct = item.change_type || "modified";
              const rs = item.review_status || "open";
              const ctCfg = CT_CFG[ct] || CT_CFG.modified;
              const rsCfg = RS_CFG[rs] || RS_CFG.open;
              return (
                <Link key={item.id} className={`se-queue-row${isActive ? " active" : ""}`}
                  to={buildCompareRunPath(compareRunId, "/summary", item.id)}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#1E2026", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "2px" }}>
                    {item.summary || buildChangeHeadline(item)}
                  </div>
                  <div style={{ fontSize: "10px", color: "#848E9C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "4px" }}>
                    {item.section_title || item.surface_key}
                  </div>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <span style={{ fontSize: "9px", fontWeight: 700, padding: "1px 5px", borderRadius: "3px", background: ctCfg.bg, color: ctCfg.col, textTransform: "uppercase" }}>{formatChangeType(ct)}</span>
                    <span style={{ fontSize: "9px", fontWeight: 700, padding: "1px 5px", borderRadius: "3px", background: rsCfg.bg, color: rsCfg.col, textTransform: "uppercase" }}>{formatReviewStatus(rs)}</span>
                  </div>
                </Link>
              );
            }) : (
              <p style={{ fontSize: "11px", color: "#848E9C", textAlign: "center", paddingTop: "20px" }}>No changes available.</p>
            )}
          </div>
        </section>

        {/* CENTER — Summary + Stats ─────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden", minWidth: 0 }}>

          {/* Executive Summary card */}
          <section aria-label="Change focus" style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden", minWidth: 0 }}>
            <div style={{ flexShrink: 0, padding: "10px 16px", borderBottom: "1px solid #E6E8EA", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                <Bot size={14} style={{ color: "#848E9C" }} />
                <h2 style={{ fontSize: "11px", fontWeight: 700, color: "#1E2026", margin: 0 }}>Executive Summary</h2>
                {hasSummaryDraft && (
                  <span style={{ fontSize: "9px", fontWeight: 700, padding: "1px 6px", borderRadius: "4px", background: "#EFF6FF", color: "#0369A1", border: "1px solid #0EA5E944" }}>
                    {summaryWordCount} words
                  </span>
                )}
                {aiDraft?.provider_used && (
                  <span style={{ fontSize: "9px", fontWeight: 700, padding: "1px 6px", borderRadius: "4px", background: "#F4F5F7", color: "#848E9C" }}>
                    {aiDraft.provider_used}
                  </span>
                )}
              </div>
              <button type="button" disabled={isGenerating} onClick={handleGenerateSummary}
                style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 12px", borderRadius: "7px", background: hasSummaryDraft ? "#F4F5F7" : "#F0B90B", color: hasSummaryDraft ? "#474D57" : "#1E2026", border: hasSummaryDraft ? "1px solid #E6E8EA" : "none", fontSize: "11px", fontWeight: 700, cursor: isGenerating ? "not-allowed" : "pointer", opacity: isGenerating ? .6 : 1, transition: "all 150ms", flexShrink: 0 }}>
                {isGenerating ? <><div className="se-spinner" style={{ borderTopColor: hasSummaryDraft ? "#474D57" : "#1E2026" }} /> Generating…</> : <><Sparkles size={12} /> {hasSummaryDraft ? "Regenerate" : "Generate Summary"}</>}
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
              {hasSummaryDraft ? (
                <textarea className="se-textarea" style={{ minHeight: "100%" }} value={editableText} onChange={e => setEditableText(e.target.value)} />
              ) : (
                <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", textAlign: "center" }}>
                  <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "#F4F5F7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Sparkles size={22} style={{ color: "#C0C6CF" }} />
                  </div>
                  <div>
                    <p style={{ fontSize: "14px", fontWeight: 700, color: "#1E2026", margin: "0 0 6px" }}>Summary draft not available yet</p>
                    <p style={{ fontSize: "12px", color: "#848E9C", maxWidth: "280px", lineHeight: 1.6, margin: 0 }}>
                      Click <strong>Generate Summary</strong> to create an AI-powered executive summary of all changes.
                    </p>
                  </div>
                  <button type="button" disabled={isGenerating} onClick={handleGenerateSummary}
                    style={{ display: "flex", alignItems: "center", gap: "6px", padding: "9px 24px", borderRadius: "8px", background: "#F0B90B", color: "#1E2026", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 10px rgba(240,185,11,0.3)", transition: "all 150ms" }}>
                    {isGenerating ? <><div className="se-spinner" /> Generating…</> : <><Sparkles size={14} /> Generate Summary</>}
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Stats row */}
          <div className="se-card" style={{ flexShrink: 0, padding: "14px 16px" }}>
            <div className="se-stats-grid" data-testid="summary-stats-grid" aria-label="Summary metrics">
              {/* Change Metrics */}
              <div className="se-stat-group se-change-stat-group" data-testid="summary-change-stats">
                {[
                  [compareRun?.summary?.total_changes ?? "–", "Total", "#F4F5F7", "#1E2026", FileDiff],
                  [compareRun?.summary?.added ?? "–", "Added", "#EBF9F4", "#16714E", Activity],
                  [compareRun?.summary?.removed ?? "–", "Removed", "#FFF1F0", "#C03050", Activity],
                  [compareRun?.summary?.modified ?? "–", "Modified", "#FFF8E6", "#B07D0A", Activity],
                ].map(([n, lbl, bg, col, Icon]) => (
                  <div key={lbl} className="se-stat" style={{ background: bg, borderColor: `${col}33` }}>
                    <div>
                      <div className="se-label">{lbl}</div>
                      <div style={{ fontSize: "20px", fontWeight: 800, color: "#1E2026", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{n}</div>
                    </div>
                    <Icon size={16} style={{ color: col, opacity: .6 }} />
                  </div>
                ))}
              </div>
              {/* Review Progress */}
              <div className="se-stat-group se-review-stat-group" data-testid="summary-review-stats">
                {[
                  [reviewCounts.resolved, "Resolved", "#EBF9F4", "#16714E", CheckCircle2],
                  [reviewCounts.inReview, "In Review", "#FFF8E6", "#B07D0A", Clock],
                  [reviewCounts.open, "Open", "#FFF1F0", "#C03050", CircleDashed],
                ].map(([n, lbl, bg, col, Icon]) => (
                  <div key={lbl} className="se-stat" style={{ background: bg, borderColor: `${col}33` }}>
                    <div>
                      <div className="se-label">{lbl}</div>
                      <div style={{ fontSize: "20px", fontWeight: 800, color: "#1E2026", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{n}</div>
                    </div>
                    <Icon size={16} style={{ color: col, opacity: .6 }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — Focus + Export Console ──────────────────────── */}
        <div style={{ width: "280px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto" }}>

          {/* Focus Change mini preview */}
          <section aria-label="Focus change" style={{ flexShrink: 0, overflow: "hidden" }}>
            <div className="se-card" style={{ flexShrink: 0, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid #E6E8EA", display: "flex", alignItems: "center", gap: "6px" }}>
                <FileText size={13} style={{ color: "#848E9C" }} />
                <h3 style={{ fontSize: "11px", fontWeight: 700, color: "#1E2026", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>Focus Change</h3>
              </div>
              {/* OLD mini diff */}
              <div style={{ padding: "8px 12px", borderBottom: "1px solid #F6465D22", background: "#FFF5F5" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "4px" }}>
                  <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#F6465D", display: "block", flexShrink: 0 }} />
                  <span className="se-label" style={{ color: "#C03050" }}>Original</span>
                </div>
                <div className="se-diff-old" style={{ fontFamily: "JetBrains Mono,monospace", fontSize: "10px", lineHeight: 1.7, color: "#2B2F36", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: "64px", overflowY: "auto" }}>
                  {diffParts.filter(p => !p.added).map((p, i) => p.removed ? <mark key={i}>{p.value}</mark> : <span key={i}>{p.value}</span>)}
                  {!diffParts.length && <span style={{ color: "#C0C6CF", fontStyle: "italic" }}>No content</span>}
                </div>
              </div>
              {/* NEW mini diff */}
              <div style={{ padding: "8px 12px", background: "#F8FFFC" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "4px" }}>
                  <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#2EBD85", display: "block", flexShrink: 0 }} />
                  <span className="se-label" style={{ color: "#16714E" }}>Revised</span>
                </div>
                <div className="se-diff-new" style={{ fontFamily: "JetBrains Mono,monospace", fontSize: "10px", lineHeight: 1.7, color: "#2B2F36", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: "64px", overflowY: "auto" }}>
                  {diffParts.filter(p => !p.removed).map((p, i) => p.added ? <mark key={i}>{p.value}</mark> : <span key={i}>{p.value}</span>)}
                  {!diffParts.length && <span style={{ color: "#C0C6CF", fontStyle: "italic" }}>No content</span>}
                </div>
              </div>
              {/* Quick links */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid #E6E8EA" }}>
                {[{ to: reviewPath, label: "Open Review" }, { to: impactPath, label: "Traceability" }].map(({ to, label }) => (
                  <Link key={label} to={to} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", padding: "8px", fontSize: "10px", fontWeight: 700, color: "#474D57", textDecoration: "none", transition: "background 150ms" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#F4F5F7"}
                    onMouseLeave={e => e.currentTarget.style.background = ""}>
                    <ArrowRight size={10} /> {label}
                  </Link>
                ))}
              </div>
            </div>
          </section>

          {/* Export Console */}
          <div className="se-card" style={{ flexShrink: 0, padding: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "12px" }}>
              <FileDown size={13} style={{ color: "#F0B90B" }} />
              <h3 style={{ fontSize: "11px", fontWeight: 700, color: "#1E2026", margin: "0 0 12px 0" }}>Export Console</h3>
            </div>

            {/* Readiness indicator */}
            <div style={{ padding: "10px 12px", borderRadius: "8px", background: readyToExport ? "#EBF9F4" : "#FFF8E6", border: `1px solid ${readyToExport ? "#2EBD8544" : "#F0B90B44"}`, marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                {readyToExport
                  ? <CheckCircle2 size={13} style={{ color: "#16714E" }} />
                  : <Clock size={13} style={{ color: "#B07D0A" }} />}
                <span style={{ fontSize: "11px", fontWeight: 700, color: readyToExport ? "#16714E" : "#B07D0A" }}>
                  {readyToExport ? "Ready for export" : `${activeReviewCount} item(s) pending`}
                </span>
              </div>
              <p style={{ fontSize: "10px", color: readyToExport ? "#16714E" : "#B07D0A", margin: 0, opacity: .8 }}>
                {readyToExport ? "All changes reviewed. Good to go." : "Complete all reviews before final export."}
              </p>
            </div>

            {/* Draft status */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "3px 8px", borderRadius: "5px", background: hasSummaryDraft ? "#EFF6FF" : "#F4F5F7", border: `1px solid ${hasSummaryDraft ? "#0EA5E944" : "#E6E8EA"}` }}>
                <Bot size={10} style={{ color: hasSummaryDraft ? "#0369A1" : "#848E9C" }} />
                <span style={{ fontSize: "9px", fontWeight: 700, color: hasSummaryDraft ? "#0369A1" : "#848E9C", textTransform: "uppercase" }}>
                  {hasSummaryDraft ? `Draft · ${summaryWordCount}w` : "No draft"}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginBottom: "12px" }}>
              <button type="button" className="se-btn-primary" disabled={isExportingDocx} onClick={handleExportDocx}>
                {isExportingDocx ? <><div className="se-spinner" /> Exporting…</> : <><FileDown size={13} /> Export DOCX</>}
              </button>
              <button type="button" className="se-btn-secondary" disabled={!hasSummaryDraft}
                onClick={() => hasSummaryDraft && exportMarkdownDraft(editableText, compareRun?.id ?? compareRunId)}>
                <Download size={13} /> Export Markdown
              </button>
            </div>

            {/* Report includes */}
            <div>
              <div className="se-label" style={{ marginBottom: "6px" }}>Report includes</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {["Executive summary", "Change metrics", "Review progress", "Change items list"].map(item => (
                  <div key={item} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#474D57" }}>
                    <CheckCircle2 size={10} style={{ color: "#2EBD85", flexShrink: 0 }} />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div >
  );
}
