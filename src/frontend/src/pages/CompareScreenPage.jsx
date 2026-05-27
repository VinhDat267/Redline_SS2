import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Eye, FileText, GitMerge, LogOut, Sparkles, FolderDown, ArrowUpToLine, FileDiff, Flag, List, CircleDashed, Clock, CheckCircle2, Bot, Activity, XCircle, FileCode, Edit, Code, Database, Info, GitCommit, FileWarning, Calendar, Hash, RefreshCw, Download } from "lucide-react";
import { InlineDiff } from "../components/InlineDiff";
import { useAuth } from "../auth/AuthContext";
import { Sidebar } from "../components/ScreenFrame";
import { Toast } from "../components/Toast";
import {
  ApiError,
  getAiBatchJob,
  generateCompareRunAiDrafts,
  getChangeItem,
  getCompareRun,
  listCompareRunChangeItems,
  createContractCompareRun,
  exportReviewReport
} from "../lib/api";
import {
  buildChangeHeadline,
  buildCompareRunLabel,
  buildCompareRunPath,
  describeAiBatchState,
  formatAiBatchJobStatus,
  formatAiGenerationStatus,
  formatChangeType,
  formatCompareRunCode,
  formatReviewStatus,
  getAiGenerationTone,
  getChangeTypeTone,
  getReviewStatusTone,
  getSelectedQueueItem,
  resolveSelectedChangeId,
  summarizeAiGeneration,
  summarizeReviewCounts
} from "../lib/compareWorkspace";
import { formatDateTime } from "../lib/formatters";
// AI draft items are now rendered directly via structured layout
function parseJsonField(value) {
  if (!value) {
    return null;
  }
  if (typeof value === "object") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function formatWarningCount(count) {
  return `${count} warning${count === 1 ? "" : "s"}`;
}
function formatParseStatus(status) {
  if (!status) return "Unknown";
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
function buildStructuredDiffItems(structuredDiff) {
  if (!structuredDiff || !Array.isArray(structuredDiff.changed_columns)) {
    return [];
  }
  return structuredDiff.changed_columns.map((column) => {
    const label = column.header_text || column.column_key || "Field";
    const oldValue = column.old_value || "empty";
    const newValue = column.new_value || "empty";
    return `${label}: ${oldValue} -> ${newValue}`;
  });
}
function isActiveAiBatchJob(job) {
  const normalizedStatus = String(job?.status ?? "").toLowerCase();
  return normalizedStatus === "queued" || normalizedStatus === "running";
}
function buildAiBatchProgress(job) {
  if (!job) {
    return null;
  }
  return `${job.processed_count} / ${job.requested_count} processed`;
}
function buildAiBatchScopeNotice(job, totalChangeItems) {
  if (!job || !Number.isFinite(totalChangeItems)) {
    return null;
  }
  const requestedCount = Number(job.requested_count ?? 0);
  if (requestedCount <= 0 || totalChangeItems <= requestedCount) {
    return null;
  }
  return `AI review is limited to ${requestedCount} prioritized changes. Full compare contains ${totalChangeItems} changes.`;
}
const QUEUE_PAGE_SIZE = 4;
function formatItemCount(count) {
  return `${count} item${count === 1 ? "" : "s"}`;
}
function normalizeQueueSearch(value) {
  return String(value ?? "").trim().toLowerCase();
}
function normalizeQueuePage(payload) {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      total_count: payload.length,
      limit: payload.length,
      offset: 0,
      review_counts: summarizeReviewCounts(payload)
    };
  }
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const totalCount = Number(payload?.total_count);
  const limit = Number(payload?.limit);
  const offset = Number(payload?.offset);
  const reviewCounts = payload?.review_counts;
  return {
    items,
    total_count: Number.isFinite(totalCount) ? totalCount : items.length,
    limit: Number.isFinite(limit) ? limit : items.length,
    offset: Number.isFinite(offset) ? offset : 0,
    review_counts: reviewCounts && typeof reviewCounts === "object"
      ? {
        total: Number(reviewCounts.total ?? 0),
        open: Number(reviewCounts.open ?? 0),
        inReview: Number(reviewCounts.in_review ?? reviewCounts.inReview ?? 0),
        resolved: Number(reviewCounts.resolved ?? 0)
      }
      : summarizeReviewCounts(items)
  };
}
function parsePositiveInteger(value, fallback = 1) {
  const parsedValue = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}
function clampPage(value, totalPages) {
  if (!Number.isInteger(value) || value < 1) {
    return 1;
  }
  return Math.min(value, Math.max(totalPages, 1));
}
export function CompareScreenPage() {
  const { logout, token } = useAuth();
  const { compareRunId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [compareRun, setCompareRun] = useState(null);
  const [queue, setQueue] = useState([]);
  const [queueMeta, setQueueMeta] = useState({
    total_count: 0,
    limit: QUEUE_PAGE_SIZE,
    offset: 0,
    review_counts: summarizeReviewCounts([])
  });
  const [selectedChange, setSelectedChange] = useState(null);
  const [aiBatchJob, setAiBatchJob] = useState(null);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isRecomparing, setIsRecomparing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const requestedChangeId = searchParams.get("change");
  const queueSearch = searchParams.get("search") ?? "";
  const changeTypeFilter = searchParams.get("changeType") ?? "all";
  const reviewStatusFilter = searchParams.get("reviewStatus") ?? "all";
  const aiStatusFilter = searchParams.get("aiStatus") ?? "all";
  const normalizedSearch = normalizeQueueSearch(queueSearch);
  const filteredQueue = queue;
  const queueTotalCount = Number.isFinite(Number(queueMeta.total_count))
    ? Number(queueMeta.total_count)
    : filteredQueue.length;
  const requestedPage = parsePositiveInteger(searchParams.get("page"), 1);
  const pageStartIndex = (requestedPage - 1) * QUEUE_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(queueTotalCount / QUEUE_PAGE_SIZE));
  const currentPage = clampPage(requestedPage, totalPages);
  const requestedChangeNumber = Number.parseInt(String(requestedChangeId ?? ""), 10);
  const selectedChangeId = Number.isInteger(requestedChangeNumber) && requestedChangeNumber > 0
    ? requestedChangeNumber
    : resolveSelectedChangeId(compareRun, filteredQueue, requestedChangeId);
  const selectedQueueItem = getSelectedQueueItem(filteredQueue, selectedChangeId);
  const reviewCounts = queueMeta.review_counts ?? summarizeReviewCounts(queue);
  const aiGenerationSummary = summarizeAiGeneration(queue);
  const displayedAiBatchJob =
    aiBatchJob ?? compareRun?.active_ai_batch_job ?? compareRun?.ai_batch_summary ?? null;
  const isGeneratingAiDrafts = isActiveAiBatchJob(displayedAiBatchJob);
  const aiBatchState = displayedAiBatchJob
    ? formatAiBatchJobStatus(displayedAiBatchJob.status)
    : describeAiBatchState(queue, { isGenerating: false });
  const aiBatchProgress = buildAiBatchProgress(displayedAiBatchJob);
  const aiBatchScopeNotice = buildAiBatchScopeNotice(displayedAiBatchJob, queueTotalCount);
  const selectedQueueIndex = filteredQueue.findIndex((item) => item.id === selectedChangeId);
  const paginatedQueue = filteredQueue;
  useEffect(() => {
    let isCurrent = true;
    async function loadCompareWorkspace() {
      setIsWorkspaceLoading(true);
      setError("");
      setAiMessage("");
      try {
        const [compareRunPayload, queuePayload] = await Promise.all([
          getCompareRun(token, compareRunId),
          listCompareRunChangeItems(token, compareRunId, {
            limit: QUEUE_PAGE_SIZE,
            offset: pageStartIndex,
            search: normalizedSearch,
            changeType: changeTypeFilter,
            reviewStatus: reviewStatusFilter,
            aiStatus: aiStatusFilter
          })
        ]);
        if (!isCurrent) {
          return;
        }
        const normalizedQueuePage = normalizeQueuePage(queuePayload);
        setCompareRun(compareRunPayload);
        setQueue(normalizedQueuePage.items);
        setQueueMeta(normalizedQueuePage);
        setAiBatchJob(compareRunPayload.active_ai_batch_job ?? compareRunPayload.ai_batch_summary ?? null);
      } catch (loadError) {
        if (loadError instanceof ApiError && loadError.status === 401) {
          logout();
          return;
        }
        if (isCurrent) {
          setError(loadError.message);
        }
      } finally {
        if (isCurrent) {
          setIsWorkspaceLoading(false);
        }
      }
    }
    void loadCompareWorkspace();
    return () => {
      isCurrent = false;
    };
  }, [
    aiStatusFilter,
    changeTypeFilter,
    compareRunId,
    logout,
    normalizedSearch,
    pageStartIndex,
    reviewStatusFilter,
    token
  ]);
  useEffect(() => {
    if (!displayedAiBatchJob || !isActiveAiBatchJob(displayedAiBatchJob)) {
      return undefined;
    }
    let isCurrent = true;
    let timeoutId;
    let lastProcessedCount = displayedAiBatchJob.processed_count ?? 0;
    async function pollAiBatchJob() {
      try {
        const jobPayload = await getAiBatchJob(token, displayedAiBatchJob.job_id);
        if (!isCurrent) {
          return;
        }
        const jobDone = !isActiveAiBatchJob(jobPayload);
        const currentProcessed = jobPayload.processed_count ?? 0;
        const progressChanged = currentProcessed !== lastProcessedCount;
        if (progressChanged || jobDone) {
          lastProcessedCount = currentProcessed;
          // Refresh workspace data when progress changes or job completes
          const [compareRunPayload, queuePayload] = await Promise.all([
            getCompareRun(token, compareRunId),
            listCompareRunChangeItems(token, compareRunId, {
              limit: QUEUE_PAGE_SIZE,
              offset: pageStartIndex,
              search: normalizedSearch,
              changeType: changeTypeFilter,
              reviewStatus: reviewStatusFilter,
              aiStatus: aiStatusFilter
            })
          ]);
          if (!isCurrent) {
            return;
          }
          // Batch all state updates together — no async gap between them
          const normalizedQueuePage = normalizeQueuePage(queuePayload);
          setCompareRun(compareRunPayload);
          setQueue(normalizedQueuePage.items);
          setQueueMeta(normalizedQueuePage);
          setAiBatchJob(
            jobDone
              ? (compareRunPayload.active_ai_batch_job ?? compareRunPayload.ai_batch_summary ?? jobPayload)
              : jobPayload
          );
          // Refresh the currently selected change to show new AI draft
          if (selectedChangeId) {
            try {
              const changeItemPayload = await getChangeItem(token, selectedChangeId);
              if (!isCurrent) {
                return;
              }
              setSelectedChange(changeItemPayload);
            } catch (detailError) {
              if (detailError instanceof ApiError && detailError.status === 401) {
                logout();
                return;
              }
              // Ignore non-auth individual change fetch errors during polling
            }
          }
        } else {
          // No progress change — just update job metadata for progress display
          setAiBatchJob(jobPayload);
        }
        if (jobDone) {
          const normalizedStatus = String(jobPayload.status).toLowerCase();
          if (normalizedStatus === "completed") {
            setAiMessage("AI analysis complete.");
          } else if (normalizedStatus === "completed_with_failures") {
            setAiMessage("AI analysis complete (some items could not be analyzed).");
          } else if (normalizedStatus === "failed") {
            setAiMessage("AI analysis failed. Please try again.");
          }
          return;
        }
        timeoutId = window.setTimeout(() => {
          void pollAiBatchJob();
        }, 2000);
      } catch (pollError) {
        if (pollError instanceof ApiError && pollError.status === 401) {
          logout();
          return;
        }
        if (isCurrent) {
          setError(pollError.message);
        }
      }
    }
    timeoutId = window.setTimeout(() => {
      void pollAiBatchJob();
    }, 2000);
    return () => {
      isCurrent = false;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    aiStatusFilter,
    changeTypeFilter,
    compareRunId,
    displayedAiBatchJob?.job_id,
    logout,
    normalizedSearch,
    pageStartIndex,
    reviewStatusFilter,
    selectedChangeId,
    token
  ]);
  useEffect(() => {
    let isCurrent = true;
    async function loadSelectedChange() {
      if (!selectedChangeId) {
        setSelectedChange(null);
        return;
      }
      setIsDetailLoading(true);
      try {
        const payload = await getChangeItem(token, selectedChangeId);
        if (!isCurrent) {
          return;
        }
        setSelectedChange(payload);
      } catch (loadError) {
        if (loadError instanceof ApiError && loadError.status === 401) {
          logout();
          return;
        }
        if (isCurrent) {
          setError(loadError.message);
          setSelectedChange(null);
        }
      } finally {
        if (isCurrent) {
          setIsDetailLoading(false);
        }
      }
    }
    void loadSelectedChange();
    return () => {
      isCurrent = false;
    };
  }, [logout, selectedChangeId, token]);
  async function handleGenerateAiDrafts() {
    if (!compareRun) {
      return;
    }
    setError("");
    setAiMessage("");
    try {
      const jobPayload = await generateCompareRunAiDrafts(token, compareRun.id, { force_regenerate: false });
      setAiBatchJob(jobPayload);
    } catch (generationError) {
      if (generationError instanceof ApiError && generationError.status === 401) {
        logout();
        return;
      }
      setError(generationError.message);
    }
  }
  async function handleRerunCompare() {
    if (!compareRun) {
      return;
    }
    setIsRecomparing(true);
    setError("");
    setAiMessage("");
    try {
      const sourceId = compareRun.source_version?.id ?? compareRun.source_draft?.id;
      const targetId = compareRun.target_version?.id ?? compareRun.target_draft?.id;
      const docId = compareRun.document?.id ?? compareRun.contract?.id;
      if (!sourceId || !targetId || !docId) {
        throw new Error("Missing draft version metadata to re-run comparison.");
      }
      const newRun = await createContractCompareRun(token, docId, {
        source_draft_id: sourceId,
        target_draft_id: targetId
      });
      setAiMessage("Re-running comparison workspace succeeded! Redirecting...");
      // Hard redirect to the newly generated compare run
      window.location.href = `/compare-runs/${newRun.id}`;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err.message);
    } finally {
      setIsRecomparing(false);
    }
  }
  function updateQueueParams(updates) {
    const nextParams = new URLSearchParams(searchParams);
    const queueViewKeys = new Set(["search", "changeType", "reviewStatus", "aiStatus", "page"]);
    const shouldResetSelection = Object.keys(updates).some((key) => queueViewKeys.has(key));
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "" || value === "all") {
        nextParams.delete(key);
        return;
      }
      nextParams.set(key, String(value));
    });
    if (shouldResetSelection && !Object.prototype.hasOwnProperty.call(updates, "change")) {
      nextParams.delete("change");
    }
    setSearchParams(nextParams);
  }
  const stats = [
    {
      label: "Source Version",
      value: ((v) => !v || v.length <= 25 ? (v ?? 'Loading...') : v.slice(0, 25) + '…')(compareRun?.source_version?.version_label),
      icon: FolderDown
    },
    {
      label: "Target Version",
      value: ((v) => !v || v.length <= 25 ? (v ?? 'Loading...') : v.slice(0, 25) + '…')(compareRun?.target_version?.version_label),
      icon: ArrowUpToLine
    },
    {
      label: "Changes",
      value: compareRun ? String(compareRun.summary.total_changes) : "Loading...",
      icon: FileDiff
    },
    {
      label: "Open Items",
      value: String(reviewCounts.open),
      icon: Flag
    }
  ];
  const compareWarnings = Array.isArray(compareRun?.warnings) ? compareRun.warnings : [];
  const compareStatusSummary = compareRun
    ? `${formatParseStatus(compareRun.compare_status)} with ${formatWarningCount(compareRun.warning_count ?? 0)}`
    : "Compare status pending";
  const changeContext = parseJsonField(selectedChange?.change_context_json);
  const structuredDiff = parseJsonField(selectedChange?.structured_diff_json);
  const structuredDiffItems = buildStructuredDiffItems(structuredDiff);
  const linkedRequirementItems =
    selectedChange?.linked_requirements?.map(
      (item) => `${item.requirement_code} - ${item.title} (${item.link_type})`
    ) ?? [];
  const impactedTestItems =
    selectedChange?.impacted_tests?.map(
      (item) => `${item.test_case_code} - ${item.title}${item.priority ? ` (${item.priority})` : ""}`
    ) ?? [];
  const reviewPath = buildCompareRunPath(compareRunId, "/review", selectedChangeId);
  const impactPath = buildCompareRunPath(compareRunId, "/impact", selectedChangeId);
  const summaryPath = buildCompareRunPath(compareRunId, "/summary", selectedChangeId);
  const currentChangeIndex = selectedQueueIndex >= 0
    ? Number(queueMeta.offset ?? pageStartIndex) + selectedQueueIndex
    : -1;
  // Keyboard J/K navigation
  useEffect(() => {
    function onKey(e) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const idx = filteredQueue.findIndex(i => i.id === selectedChangeId);
      if ((e.key === 'j' || e.key === 'J') && idx > 0) {
        const nextParams = new URLSearchParams(window.location.search);
        nextParams.set('change', String(filteredQueue[idx - 1].id));
        setSearchParams(nextParams);
      }
      if ((e.key === 'k' || e.key === 'K') && idx < filteredQueue.length - 1) {
        const nextParams = new URLSearchParams(window.location.search);
        nextParams.set('change', String(filteredQueue[idx + 1].id));
        setSearchParams(nextParams);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filteredQueue, selectedChangeId, setSearchParams]);
  return (
    <>
      <div style={{ display: 'flex', overflow: 'hidden', width: '100%', height: 'calc(100vh - 64px)', background: '#F4F5F7', color: '#1E2026', fontFamily: 'Inter, sans-serif' }}>
        {/* ── Global animation + diff token override styles ──────── */}
        <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');
        @keyframes cwFade { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }
        @keyframes cwSpin { to { transform:rotate(360deg); } }
        .cw-diff-area { animation: cwFade 200ms ease-out both; }
        .diff-token-added { background:rgba(46,189,133,0.15)!important; color:#16714E!important; font-weight:600!important; border-radius:3px!important; padding:0 2px!important; }
        .diff-token-removed { background:rgba(246,70,93,0.12)!important; color:#C03050!important; text-decoration:line-through!important; border-radius:3px!important; padding:0 2px!important; }
        .diff-content,.workspace-diff-copy { font-family:'JetBrains Mono',monospace!important; font-size:13px!important; line-height:1.75!important; color:#474D57!important; white-space:pre-wrap!important; word-break:break-word!important; }
        .workspace-kicker { font-size:10px!important; font-weight:700!important; text-transform:uppercase!important; letter-spacing:.06em!important; color:#848E9C!important; margin-bottom:8px!important; }
        .diff-toolbar { padding:10px 16px!important; border-bottom:1px solid #E6E8EA!important; background:#FAFAFA!important; }
        .diff-mode-btn { font-size:11px!important; font-weight:600!important; padding:4px 10px!important; border-radius:6px!important; border:1px solid #E6E8EA!important; background:#fff!important; color:#848E9C!important; cursor:pointer!important; display:flex!important; align-items:center!important; gap:4px!important; transition:all 150ms!important; }
        .diff-mode-btn:hover { background:#F4F5F7!important; color:#474D57!important; }
        .diff-mode-btn-active { background:#FFF8E6!important; color:#B07D0A!important; border-color:#F0B90B66!important; }
        .diff-mode-group { display:flex!important; gap:4px!important; }
        .diff-wrapper { border-radius:10px!important; overflow:hidden!important; border:1px solid #E6E8EA!important; background:#fff!important; }
        .workspace-layout-halves { display:grid!important; grid-template-columns:1fr 1fr!important; }
        .workspace-subpanel { padding:16px!important; }
        .cw-q-btn:hover > .cw-q-inner { background:#F4F5F7!important; }
        .cw-nav-link:hover { background:#F4F5F7!important; color:#1E2026!important; }
      `}</style>
        {/* ═══ LEFT: Change Queue 260px ═══════════════════════════════ */}
        <section style={{ width: '260px', flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', borderRight: '1px solid #E6E8EA' }}>
          {/* Progress Ring Header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #E6E8EA', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* SVG Donut */}
              {(() => {
                const total = reviewCounts.total || 1;
                const r = 16, circ = 2 * Math.PI * r;
                const resolvedDash = (reviewCounts.resolved / total) * circ;
                const inReviewDash = (reviewCounts.inReview / total) * circ;
                return (
                  <svg width="44" height="44" viewBox="0 0 40 40" style={{ flexShrink: 0 }}>
                    <circle cx="20" cy="20" r={r} fill="none" stroke="#F4F5F7" strokeWidth="5" />
                    <circle cx="20" cy="20" r={r} fill="none" stroke="#E6E8EA" strokeWidth="5"
                      strokeDasharray={circ} style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
                    {reviewCounts.inReview > 0 && (
                      <circle cx="20" cy="20" r={r} fill="none" stroke="#F0B90B" strokeWidth="5" strokeLinecap="round"
                        strokeDasharray={`${inReviewDash} ${circ}`}
                        strokeDashoffset={-resolvedDash}
                        style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'all 600ms ease' }} />
                    )}
                    {reviewCounts.resolved > 0 && (
                      <circle cx="20" cy="20" r={r} fill="none" stroke="#2EBD85" strokeWidth="5" strokeLinecap="round"
                        strokeDasharray={`${resolvedDash} ${circ}`}
                        style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'all 600ms ease' }} />
                    )}
                    <text x="20" y="24" textAnchor="middle" fontSize="9" fontWeight="700" fill="#1E2026">
                      {Math.round((reviewCounts.resolved / total) * 100)}%
                    </text>
                  </svg>
                );
              })()}
              <div>
                <h2 style={{ fontSize: '10px', fontWeight: 700, color: '#848E9C', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '4px', margin: 0 }}>Change Queue</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#2EBD85', fontWeight: 700 }}>✓ {reviewCounts.resolved}</span>
                  <span style={{ fontSize: '11px', color: '#F0B90B', fontWeight: 700 }}>⟳ {reviewCounts.inReview}</span>
                  <span style={{ fontSize: '11px', color: '#848E9C', fontWeight: 700 }}>○ {reviewCounts.open}</span>
                </div>
              </div>
            </div>
          </div>
          {/* Search + type chips + filters */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #E6E8EA', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '7px' }}>
            <input type="search" aria-label="Search queue" value={queueSearch}
              onChange={e => updateQueueParams({ search: e.target.value, page: null })}
              placeholder="Search changes…"
              onFocus={e => e.target.style.borderColor = '#F0B90B'}
              onBlur={e => e.target.style.borderColor = '#E6E8EA'}
              style={{ width: '100%', padding: '6px 10px', borderRadius: '7px', border: '1px solid #E6E8EA', background: '#F4F5F7', color: '#1E2026', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: '5px' }}>
              {[
                ['added', '+', '#2EBD85', 'Filter added changes'],
                ['modified', '~', '#F0B90B', 'Filter modified changes'],
                ['removed', '−', '#F6465D', 'Filter removed changes']
              ].map(([t, s, c, label]) => {
                const on = changeTypeFilter === t;
                return (
                  <button key={t} type="button" onClick={() => updateQueueParams({ changeType: on ? 'all' : t, page: null })}
                    aria-label={label}
                    aria-pressed={on}
                    style={{ flex: 1, padding: '4px 0', borderRadius: '6px', border: `1px solid ${on ? c + '88' : '#E6E8EA'}`, background: on ? c + '18' : '#fff', color: on ? c : '#848E9C', fontSize: '11px', fontWeight: 700, cursor: 'pointer', transition: 'all 150ms' }}>
                    {s}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: '5px', overflow: 'hidden' }}>
              {[
                { k: 'changeType', v: changeTypeFilter, opts: [['all', 'All Types'], ['added', 'Added'], ['modified', 'Modified'], ['removed', 'Removed']] },
                { k: 'reviewStatus', v: reviewStatusFilter, opts: [['all', 'All Review'], ['open', 'Open'], ['in_review', 'In Review'], ['resolved', 'Resolved']] },
                { k: 'aiStatus', v: aiStatusFilter, opts: [['all', 'All AI'], ['not_requested', 'No AI'], ['pending', 'Generating'], ['generated', 'AI Ready'], ['failed', 'Failed']] },
              ].map(({ k, v, opts }) => (
                <select key={k} aria-label={k === 'reviewStatus' ? 'Review status' : k === 'aiStatus' ? 'AI status' : 'Change type'} value={v} onChange={e => updateQueueParams({ [k]: e.target.value, page: null })}
                  style={{ flex: 1, minWidth: 0, padding: '3px 5px', borderRadius: '5px', border: '1px solid #E6E8EA', background: '#F4F5F7', color: '#474D57', fontSize: '10px', outline: 'none', boxSizing: 'border-box' }}>
                  {opts.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                </select>
              ))}
            </div>
          </div>
          {/* Item count */}
          {(normalizedSearch || changeTypeFilter !== 'all' || reviewStatusFilter !== 'all' || aiStatusFilter !== 'all') && (
            <div style={{ padding: '4px 12px', flexShrink: 0 }}>
              <span style={{ fontSize: '10px', color: '#848E9C', fontWeight: 600 }}>{formatItemCount(queueTotalCount)}</span>
            </div>
          )}
          {/* Timeline Queue */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {isWorkspaceLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '20px 16px' }}>
                <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid rgba(240,185,11,0.3)', borderTopColor: '#F0B90B', animation: 'cwSpin 0.8s linear infinite' }} />
                <span style={{ fontSize: '12px', color: '#848E9C' }}>Loading…</span>
              </div>
            ) : paginatedQueue.length === 0 ? (
              <p style={{ padding: '20px 16px', fontSize: '12px', color: '#848E9C', textAlign: 'center' }}>No matching changes</p>
            ) : paginatedQueue.map(item => {
              const sel = item.id === selectedChangeId;
              const cc = item.change_type === 'added' ? '#2EBD85' : item.change_type === 'removed' ? '#F6465D' : '#F0B90B';
              const cs = item.change_type === 'added' ? '+' : item.change_type === 'removed' ? '−' : '~';
              const rbg = item.review_status === 'resolved' ? '#EBF9F4' : item.review_status === 'in_review' ? '#FFF8E6' : '#FFF1F0';
              const rc = item.review_status === 'resolved' ? '#16714E' : item.review_status === 'in_review' ? '#B07D0A' : '#C03050';
              return (
                <button key={item.id} type="button" className="cw-q-btn"
                  aria-label={item.summary}
                  onClick={() => updateQueueParams({ change: String(item.id) })}
                  style={{ width: '100%', display: 'flex', border: 'none', padding: 0, cursor: 'pointer', background: 'transparent', textAlign: 'left', borderBottom: '1px solid #F4F5F7' }}>
                  {/* Colored left timeline bar */}
                  <div style={{ width: '3px', flexShrink: 0, background: cc, opacity: sel ? 1 : 0.3, transition: 'opacity 150ms', borderRadius: '0 2px 2px 0' }} />
                  <div className="cw-q-inner" style={{ flex: 1, padding: '10px 12px', background: sel ? '#FFF8E6' : '#fff', transition: 'background 150ms' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '3px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#1E2026', lineHeight: 1.3, flex: 1 }}>{item.section_title || item.surface_key}</span>
                      <span style={{ flexShrink: 0, width: '18px', height: '18px', borderRadius: '50%', background: cc + '20', color: cc, fontSize: '11px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cs}</span>
                    </div>
                    <p style={{ fontSize: '11px', color: '#848E9C', marginBottom: '6px', lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {item.summary || `${item.change_type} change`}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', background: rbg, color: rc, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                        {formatReviewStatus(item.review_status)}
                      </span>
                      {item.ai_generation_status === 'generated' && (
                        <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', background: '#EBF9F4', color: '#16714E' }}>✦ AI</span>
                      )}
                      <span style={{ fontSize: '9px', color: '#C0C6CF', fontFamily: 'monospace' }}>{item.surface_key}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {/* Pagination */}
          {queueTotalCount > QUEUE_PAGE_SIZE && (
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderTop: '1px solid #E6E8EA' }}>
              <span style={{ fontSize: '11px', color: '#848E9C' }}>Page {currentPage} of {totalPages}</span>
              <div style={{ display: 'flex', gap: '5px' }}>
                {[['‹', 'Previous page', currentPage <= 1, () => updateQueueParams({ page: currentPage - 1 })],
                ['›', 'Next page', currentPage >= totalPages, () => updateQueueParams({ page: currentPage + 1 })]
                ].map(([lbl, ariaLbl, dis, fn]) => (
                  <button key={lbl} type="button" aria-label={ariaLbl} disabled={!!dis} onClick={fn}
                    style={{ padding: '3px 10px', borderRadius: '5px', border: '1px solid #E6E8EA', background: '#fff', color: '#474D57', fontSize: '13px', fontWeight: 700, cursor: dis ? 'not-allowed' : 'pointer', opacity: dis ? 0.4 : 1 }}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
        {/* ═══ CENTER: Diff Viewer ═══════════════════════════════════ */}
        <section aria-label="Clause delta" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F4F5F7' }}>
          {/* Version comparison toolbar */}
          <div style={{ flexShrink: 0, height: '52px', background: '#fff', borderBottom: '1px solid #E6E8EA', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
              {/* Version pills */}
              <span style={{ padding: '3px 10px', borderRadius: '20px', background: '#FFF1F0', border: '1px solid #F6465D33', color: '#C03050', fontSize: '11px', fontWeight: 700, flexShrink: 0, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                v1 · {compareRun?.source_version?.version_label ?? '…'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', color: '#C0C6CF', flexShrink: 0 }}>
                <div style={{ height: '1px', width: '14px', background: '#C0C6CF' }} />
                <ArrowRight size={11} />
              </div>
              <span style={{ padding: '3px 10px', borderRadius: '20px', background: '#EBF9F4', border: '1px solid #2EBD8533', color: '#16714E', fontSize: '11px', fontWeight: 700, flexShrink: 0, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                v2 · {compareRun?.target_version?.version_label ?? '…'}
              </span>
              {currentChangeIndex >= 0 && queueTotalCount > 0 && (
                <span style={{ fontSize: '11px', color: '#848E9C', flexShrink: 0, marginLeft: '4px' }}>
                  · change <strong style={{ color: '#474D57' }}>{currentChangeIndex + 1}</strong>/{queueTotalCount}
                </span>
              )}
              {selectedChangeId && (
                <span style={{ fontSize: '10px', color: '#C0C6CF', marginLeft: '6px', display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                  {['J', 'K'].map(k => (
                    <kbd key={k} style={{ display: 'inline-block', padding: '1px 5px', borderRadius: '4px', border: '1px solid #D1D5DB', background: '#F9FAFB', fontSize: '10px', fontFamily: 'monospace', color: '#6B7280' }}>{k}</kbd>
                  ))} navigate
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              {selectedChangeId && [
                { to: impactPath, icon: Flag, label: 'Trace' },
                { to: reviewPath, icon: Eye, label: 'Review' },
              ].map(({ to, icon: Icon, label }) => (
                <Link key={label} to={to} className="cw-nav-link"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '6px', border: '1px solid #E6E8EA', color: '#474D57', fontSize: '11px', fontWeight: 600, textDecoration: 'none', background: '#fff', transition: 'all 150ms' }}>
                  <Icon size={12} /> {label}
                </Link>
              ))}
              <button type="button" disabled={isExporting || !compareRun || queue.length === 0}
                onClick={async () => {
                  setIsExporting(true);
                  setError("");
                  try {
                    await exportReviewReport(token, compareRunId);
                    setAiMessage("Review report downloaded.");
                  } catch (err) {
                    if (err instanceof ApiError && err.status === 401) { logout(); return; }
                    setError(err.message);
                  } finally {
                    setIsExporting(false);
                  }
                }}
                onMouseEnter={e => { if (!e.currentTarget.disabled) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; } }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 12px', borderRadius: '6px', border: '1px solid #E6E8EA', color: '#474D57', fontSize: '11px', fontWeight: 600, background: '#fff', cursor: isExporting || !compareRun || queue.length === 0 ? 'not-allowed' : 'pointer', opacity: isExporting || !compareRun || queue.length === 0 ? 0.6 : 1, transition: 'all 150ms' }}>
                {isExporting
                  ? <><div style={{ width: '11.5px', height: '11.5px', borderRadius: '50%', border: '2px solid rgba(71,77,87,0.2)', borderTopColor: '#474D57', animation: 'cwSpin 0.8s linear infinite' }} /> Exporting…</>
                  : <><Download size={12} /> Export</>}
              </button>
              <button type="button" disabled={isRecomparing || !compareRun}
                onClick={handleRerunCompare}
                onMouseEnter={e => { if (!e.currentTarget.disabled) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; } }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 12px', borderRadius: '6px', border: '1px solid #E6E8EA', color: '#474D57', fontSize: '11px', fontWeight: 600, background: '#fff', cursor: isRecomparing || !compareRun ? 'not-allowed' : 'pointer', opacity: isRecomparing || !compareRun ? 0.6 : 1, transition: 'all 150ms' }}>
                {isRecomparing ? (
                  <><div style={{ width: '11.5px', height: '11.5px', borderRadius: '50%', border: '2px solid rgba(71,77,87,0.2)', borderTopColor: '#474D57', animation: 'cwSpin 0.8s linear infinite' }} /> Re-running…</>
                ) : (
                  <><RefreshCw size={12} /> Re-run</>
                )}
              </button>
              <button type="button" disabled={isGeneratingAiDrafts || !compareRun || queue.length === 0}
                onClick={handleGenerateAiDrafts}
                onMouseEnter={e => { if (!e.currentTarget.disabled) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(240,185,11,0.4)'; } }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(240,185,11,0.2)'; }}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 14px', borderRadius: '6px', background: '#F0B90B', color: '#1E2026', border: 'none', fontSize: '12px', fontWeight: 700, cursor: isGeneratingAiDrafts || !compareRun || queue.length === 0 ? 'not-allowed' : 'pointer', opacity: isGeneratingAiDrafts || !compareRun || queue.length === 0 ? 0.5 : 1, boxShadow: '0 2px 6px rgba(240,185,11,0.2)', transition: 'all 150ms' }}>
                {isGeneratingAiDrafts
                  ? <><div style={{ width: '11px', height: '11px', borderRadius: '50%', border: '2px solid rgba(30,32,38,0.2)', borderTopColor: '#1E2026', animation: 'cwSpin 0.8s linear infinite' }} /> Generating…</>
                  : <><Sparkles size={13} /> Generate AI</>}
              </button>
            </div>
          </div>
          {/* Banners are now handled as transient non-blocking Toast popups */}
          {/* Main diff content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
            {isDetailLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center', paddingTop: '60px' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '3px solid rgba(240,185,11,0.3)', borderTopColor: '#F0B90B', animation: 'cwSpin 0.8s linear infinite' }} />
                <span style={{ fontSize: '13px', color: '#848E9C' }}>Loading diff…</span>
              </div>
            ) : selectedChange ? (
              <div key={selectedChange.id} className="cw-diff-area" style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Change header */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    {selectedChange.section_title ? null : (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#848E9C', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                        Clause #{selectedChange.id}
                      </span>
                    )}
                    {(() => {
                      const ct = selectedChange.change_type || 'modified';
                      const cfg = { added: ['#EBF9F4', '#16714E'], removed: ['#FFF1F0', '#C03050'], modified: ['#FFF8E6', '#B07D0A'] };
                      const [bg, col] = cfg[ct] || cfg.modified;
                      return <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 7px', borderRadius: '4px', background: bg, color: col, textTransform: 'uppercase', letterSpacing: '.04em' }}>{ct}</span>;
                    })()}
                  </div>
                  <h2 aria-label="Compare Workspace" style={{ fontSize: '20px', fontWeight: 700, color: '#1E2026', lineHeight: 1.3, margin: 0 }}>
                    {buildChangeHeadline(selectedChange)}
                  </h2>
                </div>
                {/* InlineDiff */}
                <div style={{ borderRadius: '12px', border: '1px solid #E6E8EA', background: '#fff', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                  <InlineDiff oldText={selectedChange.old_content} newText={selectedChange.new_content} />
                </div>
                {/* Structured diff */}
                {structuredDiffItems.length > 0 && (
                  <div style={{ padding: '16px', borderRadius: '10px', border: '1px solid #E6E8EA', background: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '10px' }}>
                      <FileDiff size={13} style={{ color: '#848E9C' }} />
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#848E9C', textTransform: 'uppercase', letterSpacing: '.06em' }}>Row-level diff</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {structuredDiffItems.map((itm, i) => (
                        <div key={i} style={{ padding: '6px 10px', borderRadius: '6px', background: '#F4F5F7', fontSize: '12px', color: '#474D57', fontFamily: 'JetBrains Mono, monospace' }}>· {itm}</div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Context */}
                {changeContext && (
                  <div style={{ padding: '14px 16px', borderRadius: '10px', border: '1px solid #E6E8EA', background: '#FAFAFA' }}>
                    <p style={{ fontSize: '10px', fontWeight: 700, color: '#848E9C', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '5px' }}>Context</p>
                    <p style={{ fontSize: '12px', color: '#474D57' }}>
                      Block type: <strong style={{ color: '#1E2026' }}>{changeContext.block_type || 'Unknown'}</strong>
                      {selectedChange.table_key && <> · Table: <strong style={{ color: '#1E2026' }}>{selectedChange.table_key}</strong></>}
                      {selectedChange.row_key && <> · Row: <strong style={{ color: '#1E2026' }}>{selectedChange.row_key}</strong></>}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* Empty state */
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '80px', gap: '12px' }}>
                <div style={{ width: '54px', height: '54px', borderRadius: '14px', background: '#fff', border: '1px solid #E6E8EA', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <GitMerge size={24} style={{ color: '#C0C6CF' }} />
                </div>
                <p style={{ fontSize: '15px', fontWeight: 600, color: '#1E2026' }}>Select a change to review</p>
                <p style={{ fontSize: '13px', color: '#848E9C' }}>Choose an item from the queue to see the clause diff.</p>
                {filteredQueue.length > 0 && (
                  <button type="button" onClick={() => updateQueueParams({ change: String(filteredQueue[0].id) })}
                    style={{ marginTop: '6px', padding: '8px 20px', borderRadius: '8px', background: '#F0B90B', color: '#1E2026', border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(240,185,11,0.25)' }}>
                    View first change →
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
        {/* ═══ RIGHT: AI Command Center 300px ═══════════════════════ */}
        <aside style={{ width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', borderLeft: '1px solid #E6E8EA', overflowY: 'auto' }}>
          {/* Header */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px', padding: '0 16px', height: '52px', borderBottom: '1px solid #E6E8EA' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: '#FFF8E6', border: '1px solid #F0B90B44', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={13} style={{ color: '#B07D0A' }} />
            </div>
            <h3 style={{ fontSize: '11px', fontWeight: 700, color: '#848E9C', textTransform: 'uppercase', letterSpacing: '.06em', margin: 0 }}>AI Review</h3>
          </div>
          {/* AI Draft */}
          <div style={{ padding: '14px', borderBottom: '1px solid #E6E8EA' }}>
            {selectedChange?.ai_review_draft ? (() => {
              const risk = (selectedChange.ai_review_draft.risk_level || '').toLowerCase();
              const cfg = { high: ['#FFF1F0', '#F6465D33', '#C03050'], medium: ['#FFF8E6', '#F0B90B33', '#B07D0A'], low: ['#EBF9F4', '#2EBD8533', '#16714E'] };
              const [bg, bdr, col] = cfg[risk] || cfg.medium;
              return (
                <div style={{ borderRadius: '10px', border: `1px solid ${bdr}`, background: bg, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', borderBottom: `1px solid ${bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: col, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      {selectedChange.ai_review_draft.risk_level ? `${selectedChange.ai_review_draft.risk_level} Risk` : 'AI Analysis'}
                    </span>
                    <span style={{ fontSize: '10px', color: '#848E9C' }}>{selectedChange.surface_key}</span>
                  </div>
                  {selectedChange.ai_review_draft.explanation && (
                    <div style={{ padding: '12px 14px', borderBottom: `1px solid ${bdr}` }}>
                      <p style={{ fontSize: '12px', color: '#474D57', lineHeight: 1.65 }}>{selectedChange.ai_review_draft.explanation}</p>
                      {selectedChange.ai_review_draft.provider_used && (
                        <span style={{ marginTop: '6px', display: 'inline-block', fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '4px', background: '#EBF9F4', color: '#16714E', border: '1px solid #2EBD8544' }}>
                          ✦ AI Generated
                        </span>
                      )}
                    </div>
                  )}
                  {selectedChange.ai_review_draft.draft_comment && (
                    <div style={{ padding: '12px 14px' }}>
                      <p style={{ fontSize: '9px', fontWeight: 700, color: '#2EBD85', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '6px' }}>✦ Suggested Redline</p>
                      <div style={{ padding: '10px', borderRadius: '7px', background: '#fff', border: '1px solid #E6E8EA' }}>
                        <p style={{ fontSize: '11px', color: '#474D57', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.7 }}>
                          {selectedChange.ai_review_draft.draft_comment}
                        </p>
                      </div>
                    </div>
                  )}
                  {selectedChange.ai_review_draft.error_message && (
                    <div style={{ padding: '10px 14px' }}>
                      <p style={{ fontSize: '11px', color: '#C03050' }}>Error: {selectedChange.ai_review_draft.error_message}</p>
                    </div>
                  )}
                </div>
              );
            })() : (
              <div style={{ borderRadius: '10px', border: `1px dashed ${isGeneratingAiDrafts && selectedChange ? '#F0B90B66' : '#E6E8EA'}`, padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', textAlign: 'center', background: isGeneratingAiDrafts && selectedChange ? '#FFFDF5' : 'transparent', transition: 'all 300ms ease' }}>
                {isGeneratingAiDrafts && selectedChange ? (
                  <>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#FFF8E6', border: '1px solid #F0B90B44', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2.5px solid rgba(240,185,11,0.25)', borderTopColor: '#F0B90B', animation: 'cwSpin 0.8s linear infinite' }} />
                    </div>
                    <p style={{ fontSize: '12px', color: '#B07D0A', fontWeight: 600 }}>Analyzing this change…</p>
                    <p style={{ fontSize: '10px', color: '#848E9C' }}>AI draft will appear here when ready</p>
                  </>
                ) : (
                  <>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#F4F5F7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Sparkles size={16} style={{ color: '#C0C6CF' }} />
                    </div>
                    <p style={{ fontSize: '12px', color: '#848E9C' }}>
                      {selectedChange ? 'No AI draft for this change yet.' : 'Select a change to see AI analysis.'}
                    </p>
                    {selectedChange && (
                      <button type="button" disabled={isGeneratingAiDrafts} onClick={handleGenerateAiDrafts}
                        style={{ padding: '5px 14px', borderRadius: '6px', background: '#F0B90B', color: '#1E2026', border: 'none', fontSize: '11px', fontWeight: 700, cursor: 'pointer', marginTop: '4px' }}>
                        Generate AI Draft
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          {/* Run Health */}
          <div style={{ padding: '14px', borderBottom: '1px solid #E6E8EA' }}>
            <div style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid #E6E8EA', background: '#FAFAFA', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h3 style={{ fontSize: '10px', fontWeight: 700, color: '#848E9C', textTransform: 'uppercase', letterSpacing: '.06em', margin: 0 }}>Run Health</h3>
              {/* AI progress bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '11px', color: '#474D57', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                    AI Generation
                    {isGeneratingAiDrafts && (
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', border: '2px solid rgba(240,185,11,0.25)', borderTopColor: '#F0B90B', animation: 'cwSpin 0.8s linear infinite', display: 'inline-block' }} />
                    )}
                  </span>
                  <span style={{ fontSize: '11px', color: '#848E9C' }}>{aiGenerationSummary.generated}/{aiGenerationSummary.total}</span>
                </div>
                <div style={{ height: '6px', borderRadius: '99px', background: '#E6E8EA', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: '99px', background: '#F0B90B', width: `${aiGenerationSummary.total > 0 ? (aiGenerationSummary.generated / aiGenerationSummary.total) * 100 : 0}%`, transition: 'width 600ms ease' }} />
                </div>
                {aiBatchProgress && <p style={{ fontSize: '10px', color: '#848E9C', marginTop: '4px' }}>{aiBatchProgress}</p>}
                {aiBatchScopeNotice && (
                  <p style={{ fontSize: '10px', color: '#B07D0A', marginTop: '4px', lineHeight: 1.45 }}>
                    {aiBatchScopeNotice}
                  </p>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {[{ l: 'Status', v: compareStatusSummary.split(' with')[0] }, { l: 'AI State', v: aiBatchState }].map(({ l, v }) => (
                  <div key={l} style={{ padding: '8px 10px', borderRadius: '7px', background: '#fff', border: '1px solid #E6E8EA' }}>
                    <span style={{ display: 'block', fontSize: '9px', fontWeight: 700, color: '#848E9C', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '2px' }}>{l}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#1E2026' }}>{v}</span>
                  </div>
                ))}
              </div>
              {compareWarnings.length > 0 && compareWarnings.map((w, i) => (
                <div key={i} style={{ padding: '5px 8px', borderRadius: '6px', background: '#FFF8E6', fontSize: '10px', color: '#B07D0A' }}>⚠ {w}</div>
              ))}
            </div>
          </div>
          {/* Quick Navigate */}
          <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: '#848E9C', textTransform: 'uppercase', letterSpacing: '.06em' }}>Quick Navigate</p>
            {selectedChangeId ? [
              { to: reviewPath, icon: Eye, label: 'Review Workspace' },
              { to: impactPath, icon: Flag, label: 'Traceability Map' },
              { to: summaryPath, icon: FileText, label: 'Summary & Export' },
            ].map(({ to, icon: Icon, label }) => (
              <Link key={label} to={to} className="cw-nav-link"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: '8px', border: '1px solid #E6E8EA', color: '#474D57', fontSize: '12px', fontWeight: 600, background: '#fff', textDecoration: 'none', transition: 'all 150ms' }}>
                {label} <Icon size={13} />
              </Link>
            )) : <p style={{ fontSize: '12px', color: '#848E9C' }}>Select a change first.</p>}
          </div>
        </aside>
      </div>
      {/* Toast notifications — floating transient bottom-right overlay */}
      {error && <Toast message={error} type="error" onClose={() => setError("")} />}
      {aiMessage && <Toast message={aiMessage} type="success" onClose={() => setAiMessage("")} />}
    </>
  );
}
