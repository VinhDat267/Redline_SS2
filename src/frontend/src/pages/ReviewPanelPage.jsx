import { useEffect, useRef, useState, useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, MessageSquare, Save, Sparkles, Flag, FileCode, Database, GitCommit, UserCircle, CheckCircle2, Clock, CircleDashed, RefreshCw, FileDiff, Download } from "lucide-react";
import { decodeId, encodeId } from "../lib/idCodec";
import { diffWords } from "diff";
import { Toast } from "../components/Toast";

import { useAuth } from "../auth/AuthContext";
import { DataTable } from "../components/ScreenFrame";
import {
  ApiError,
  createChangeItemComment,
  getChangeItem,
  getCompareRun,
  listCompareRunChangeItems,
  listProjectMembers,
  regenerateChangeItemAiDraft,
  updateChangeItem,
  exportReviewReport
} from "../lib/api";
import {
  buildChangeHeadline,
  buildCompareRunLabel,
  buildCompareRunPath,
  formatAiGenerationStatus,
  formatChangeType,
  formatCompareRunCode,
  formatReviewStatus,
  getAiGenerationTone,
  getChangeTypeTone,
  getReviewStatusTone,
  resolveSelectedChangeId
} from "../lib/compareWorkspace";
import { formatDateTime } from "../lib/formatters";

// Function removed because we render AI fields individually in the UI

const REVIEW_QUEUE_PAGE_SIZE = 8;

function buildAssigneeOptions(user, changeItem, projectMembers = []) {
  const options = new Map();

  projectMembers.forEach(member => {
    options.set(String(member.user_id), member.user_display_name || member.user_email || `User ID: ${member.user_id}`);
  });

  if (user?.id && !options.has(String(user.id))) {
    options.set(String(user.id), user.display_name || user.email || `User ${user.id}`);
  }

  if (changeItem?.assignee_user_id && !options.has(String(changeItem.assignee_user_id))) {
    options.set(
      String(changeItem.assignee_user_id),
      changeItem.assignee_display_name || `User ${changeItem.assignee_user_id}`
    );
  }

  if (changeItem?.ai_review_draft?.suggested_assignee_user_id) {
    const suggestedId = String(changeItem.ai_review_draft.suggested_assignee_user_id);
    if (!options.has(suggestedId)) {
      options.set(suggestedId, `Suggested user ${suggestedId}`);
    }
  }

  return Array.from(options.entries()).map(([value, label]) => ({ value, label }));
}

function formatItemCount(count) {
  return `${count} item${count === 1 ? "" : "s"}`;
}

function formatAiConfidence(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }

  const normalizedValue = Number(value);
  const percentage = normalizedValue <= 1
    ? Math.round(normalizedValue * 100)
    : Math.round(normalizedValue);

  return `${Math.max(0, Math.min(100, percentage))}%`;
}

function normalizeQueueSearch(value) {
  return String(value ?? "").trim().toLowerCase();
}

function matchesQueueSearch(item, search) {
  if (!search) {
    return true;
  }

  return [
    item.section_title,
    item.surface_key,
    item.summary,
    item.old_content,
    item.new_content
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(search));
}

function clampPage(value, totalPages) {
  if (!Number.isInteger(value) || value < 1) {
    return 1;
  }

  return Math.min(value, Math.max(totalPages, 1));
}

export function ReviewPanelPage() {
  const { logout, token, user } = useAuth();
  const { compareRunId: rawCompareRunId } = useParams();
  const compareRunId = decodeId(rawCompareRunId);
  const [searchParams, setSearchParams] = useSearchParams();
  const [compareRun, setCompareRun] = useState(null);
  const [queue, setQueue] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]);
  const [changeItem, setChangeItem] = useState(null);
  const [reviewStatus, setReviewStatus] = useState("open");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [reviewSummary, setReviewSummary] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [error, setError] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [commentMessage, setCommentMessage] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isRegeneratingAiDraft, setIsRegeneratingAiDraft] = useState(false);
  const [queueOpen, setQueueOpen] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const requestedChangeId = decodeId(searchParams.get("change"));
  const queueSearch = searchParams.get("queueSearch") ?? "";
  const queueChangeType = searchParams.get("queueChangeType") ?? "all";
  const queueReviewStatus = searchParams.get("queueReviewStatus") ?? "all";
  const queueAiStatus = searchParams.get("queueAiStatus") ?? "all";
  const normalizedSearch = normalizeQueueSearch(queueSearch);
  const filteredQueue = queue.filter((item) => {
    if (!matchesQueueSearch(item, normalizedSearch)) {
      return false;
    }

    if (queueChangeType !== "all" && item.change_type !== queueChangeType) {
      return false;
    }

    if (queueReviewStatus !== "all" && item.review_status !== queueReviewStatus) {
      return false;
    }

    if (queueAiStatus !== "all" && item.ai_generation_status !== queueAiStatus) {
      return false;
    }

    return true;
  });
  const selectedChangeId = resolveSelectedChangeId(compareRun, filteredQueue, requestedChangeId);
  const selectedChangeIdRef = useRef(null);
  const selectedChangeReady = Boolean(
    changeItem
    && selectedChangeId
    && String(changeItem.id) === String(selectedChangeId)
  );
  const selectedQueueIndex = filteredQueue.findIndex((item) => item.id === selectedChangeId);
  const totalPages = Math.max(1, Math.ceil(filteredQueue.length / REVIEW_QUEUE_PAGE_SIZE));
  const requestedPage = Number.parseInt(searchParams.get("page") ?? "", 10);
  const currentPage = searchParams.has("page")
    ? clampPage(requestedPage, totalPages)
    : clampPage(
      selectedQueueIndex >= 0 ? Math.floor(selectedQueueIndex / REVIEW_QUEUE_PAGE_SIZE) + 1 : 1,
      totalPages
    );
  const pageStartIndex = (currentPage - 1) * REVIEW_QUEUE_PAGE_SIZE;
  const paginatedQueue = filteredQueue.slice(pageStartIndex, pageStartIndex + REVIEW_QUEUE_PAGE_SIZE);

  useEffect(() => {
    let isCurrent = true;

    async function loadReviewWorkspace() {
      setIsLoading(true);
      setError("");
      setAiMessage("");

      try {
        const compareRunPayload = await getCompareRun(token, compareRunId);
        const queuePayload = await listCompareRunChangeItems(token, compareRunId);
        const membersPayload = compareRunPayload?.document?.project_id
          ? await listProjectMembers(token, compareRunPayload.document.project_id)
          : [];

        if (!isCurrent) {
          return;
        }

        setCompareRun(compareRunPayload);
        setQueue(queuePayload);
        setProjectMembers(membersPayload);
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
          setIsLoading(false);
        }
      }
    }

    void loadReviewWorkspace();

    return () => {
      isCurrent = false;
    };
  }, [compareRunId, logout, token]);

  useEffect(() => {
    selectedChangeIdRef.current = selectedChangeId ? String(selectedChangeId) : null;
  }, [selectedChangeId]);

  function isStillSelectedChange(changeId) {
    return selectedChangeIdRef.current === String(changeId);
  }

  useEffect(() => {
    let isCurrent = true;

    async function loadSelectedChange() {
      if (!selectedChangeId) {
        setChangeItem(null);
        setReviewStatus("open");
        setAssigneeUserId("");
        setReviewSummary("");
        setCommentDraft("");
        return;
      }

      setChangeItem(null);
      setReviewStatus("open");
      setAssigneeUserId("");
      setReviewSummary("");
      setCommentDraft("");

      try {
        const changeItemPayload = await getChangeItem(token, selectedChangeId);

        if (!isCurrent) {
          return;
        }

        setChangeItem(changeItemPayload);
        setReviewStatus(changeItemPayload.review_status ?? "open");
        setAssigneeUserId(changeItemPayload.assignee_user_id ? String(changeItemPayload.assignee_user_id) : "");
        setReviewSummary(changeItemPayload.summary ?? "");
      } catch (loadError) {
        if (loadError instanceof ApiError && loadError.status === 401) {
          logout();
          return;
        }

        if (isCurrent) {
          setError(loadError.message);
          setChangeItem(null);
        }
      }
    }

    void loadSelectedChange();

    return () => {
      isCurrent = false;
    };
  }, [logout, selectedChangeId, token]);

  function updateQueueParams(updates) {
    const nextParams = new URLSearchParams(searchParams);

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "" || value === "all") {
        nextParams.delete(key);
        return;
      }

      nextParams.set(key, key === "change" ? encodeId(value) : String(value));
    });

    setSearchParams(nextParams);
  }

  async function handleSaveReview() {
    if (!selectedChangeReady) {
      return;
    }

    const activeChangeId = changeItem.id;
    setIsSavingReview(true);
    setError("");
    setReviewMessage("");
    setCommentMessage("");
    setAiMessage("");

    try {
      const payload = await updateChangeItem(token, changeItem.id, {
        review_status: reviewStatus,
        assignee_user_id: assigneeUserId ? Number(assigneeUserId) : null,
        summary: reviewSummary.trim() || null
      });

      setQueue((currentQueue) =>
        currentQueue.map((item) =>
          item.id === payload.id
            ? {
              ...item,
              review_status: payload.review_status,
              summary: payload.summary ?? item.summary
            }
            : item
        )
      );
      if (isStillSelectedChange(activeChangeId)) {
        setChangeItem(payload);
        setReviewStatus(payload.review_status);
        setAssigneeUserId(payload.assignee_user_id ? String(payload.assignee_user_id) : "");
        setReviewSummary(payload.summary ?? "");
        setReviewMessage("Review saved successfully.");

        // Clean auto-advance to next unreviewed/unresolved item after saving resolved
        if (payload.review_status === "resolved") {
          const currentIndex = filteredQueue.findIndex(item => item.id === payload.id);
          const nextUnresolved = filteredQueue.slice(currentIndex + 1).find(item => item.review_status !== "resolved");
          const targetNext = nextUnresolved || (currentIndex < filteredQueue.length - 1 ? filteredQueue[currentIndex + 1] : null);
          if (targetNext) {
            setTimeout(() => {
              updateQueueParams({ change: String(targetNext.id) });
            }, 600);
          }
        }
      }
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 401) {
        logout();
        return;
      }

      setError(saveError.message);
    } finally {
      setIsSavingReview(false);
    }
  }

  async function handleAddComment() {
    if (!selectedChangeReady) {
      return;
    }

    const activeChangeId = changeItem.id;
    const nextComment = commentDraft.trim();
    if (!nextComment) {
      setError("Review comment is required.");
      return;
    }

    setIsSubmittingComment(true);
    setError("");
    setReviewMessage("");
    setCommentMessage("");
    setAiMessage("");

    try {
      const payload = await createChangeItemComment(token, changeItem.id, {
        content: nextComment
      });

      if (!isStillSelectedChange(activeChangeId)) {
        return;
      }

      setChangeItem((currentValue) => {
        if (!currentValue || String(currentValue.id) !== String(activeChangeId)) {
          return currentValue;
        }

        return {
          ...currentValue,
          comments: [...(currentValue.comments ?? []), payload]
        };
      });
      setCommentDraft("");
      setCommentMessage("Comment added.");
    } catch (commentError) {
      if (commentError instanceof ApiError && commentError.status === 401) {
        logout();
        return;
      }

      setError(commentError.message);
    } finally {
      setIsSubmittingComment(false);
    }
  }

  async function handleRegenerateAiDraft() {
    if (!selectedChangeReady) {
      return;
    }

    const activeChangeId = changeItem.id;
    setIsRegeneratingAiDraft(true);
    setError("");
    setReviewMessage("");
    setCommentMessage("");
    setAiMessage("");

    try {
      const payload = await regenerateChangeItemAiDraft(token, changeItem.id, {
        force_regenerate: true
      });

      if (!isStillSelectedChange(activeChangeId)) {
        return;
      }

      setChangeItem((currentValue) => {
        if (!currentValue || String(currentValue.id) !== String(activeChangeId)) {
          return currentValue;
        }

        return {
          ...currentValue,
          ai_review_draft: payload.ai_review_draft
        };
      });
      setQueue((currentQueue) =>
        currentQueue.map((item) =>
          item.id === changeItem.id
            ? {
              ...item,
              ai_generation_status: payload.ai_review_draft?.generation_status ?? item.ai_generation_status,
              has_ai_review_draft: Boolean(payload.ai_review_draft)
            }
            : item
        )
      );
      setAiMessage("AI draft refreshed.");
    } catch (generationError) {
      if (generationError instanceof ApiError && generationError.status === 401) {
        logout();
        return;
      }

      setError(generationError.message);
    } finally {
      setIsRegeneratingAiDraft(false);
    }
  }

  const assigneeOptions = buildAssigneeOptions(user, changeItem, projectMembers);
  const comparePath = buildCompareRunPath(compareRunId, "", changeItem?.id ?? selectedChangeId);
  const impactPath = buildCompareRunPath(compareRunId, "/impact", changeItem?.id ?? selectedChangeId);
  const aiDraftStatus = changeItem?.ai_review_draft?.generation_status ?? "not_requested";
  const aiDraftLabel = changeItem?.ai_review_draft
    ? formatAiGenerationStatus(aiDraftStatus)
    : "No AI Draft";
  const aiConfidenceLabel = formatAiConfidence(changeItem?.ai_review_draft?.confidence);
  const currentChangeIndex = filteredQueue.findIndex(i => i.id === selectedChangeId);
  const prevChange = currentChangeIndex > 0 ? filteredQueue[currentChangeIndex - 1] : null;
  const nextChange = currentChangeIndex < filteredQueue.length - 1 ? filteredQueue[currentChangeIndex + 1] : null;

  /* ── Word-level diff for full-screen render ──────────────── */
  const diffParts = useMemo(() => {
    const old = changeItem?.old_content ?? '';
    const nw = changeItem?.new_content ?? '';
    if (!old && !nw) return [];
    return diffWords(old, nw);
  }, [changeItem?.id, changeItem?.old_content, changeItem?.new_content]);

  const oldTokens = diffParts.filter(p => !p.added);
  const newTokens = diffParts.filter(p => !p.removed);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    function handleKeyDown(e) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'j' || e.key === 'J') {
        if (prevChange) updateQueueParams({ change: String(prevChange.id) });
      } else if (e.key === 'k' || e.key === 'K') {
        if (nextChange) updateQueueParams({ change: String(nextChange.id) });
      } else if (e.key === '1') {
        setReviewStatus('open');
      } else if (e.key === '2') {
        setReviewStatus('in_review');
      } else if (e.key === '3') {
        setReviewStatus('resolved');
      } else if (e.key === 'q' || e.key === 'Q') {
        setQueueOpen(o => !o);
      } else if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSaveReview();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevChange, nextChange]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', width: '100%', height: 'calc(100vh - 64px)', background: '#F5F5F5', color: '#1E2026', fontFamily: 'Inter, sans-serif', position: 'relative' }}>

      {/* ─── Global Styles ───────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');
        @keyframes rwSpin { to { transform:rotate(360deg); } }
        @keyframes rwFadeSlideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes rwSlideInLeft { from { opacity:0; transform:translateX(-16px); } to { opacity:1; transform:translateX(0); } }
        .rw-fade-up { animation: rwFadeSlideUp 220ms cubic-bezier(.22,.68,0,1.2) both; }
        .rw-slide-left { animation: rwSlideInLeft 200ms ease-out both; }
        .diff-token-added { background:rgba(46,189,133,0.18)!important; color:#15643E!important; font-weight:600!important; border-radius:3px!important; padding:0 3px!important; }
        .diff-token-removed { background:rgba(246,70,93,0.14)!important; color:#A82045!important; text-decoration:line-through!important; border-radius:3px!important; padding:0 3px!important; }
        .diff-content { font-family:'JetBrains Mono',monospace!important; font-size:13.5px!important; line-height:1.8!important; color:#2B2F36!important; white-space:pre-wrap!important; word-break:break-word!important; }
        .jv-half { flex:1; display:flex; flex-direction:column; overflow:hidden; }
        .jv-half-body { flex:1; overflow-y:auto; padding:28px 32px; font-family:'JetBrains Mono',monospace; font-size:13.5px; line-height:1.8; color:#2B2F36; white-space:pre-wrap; word-break:break-word; }
        .jv-nav-btn { display:flex; align-items:center; gap:6px; padding:5px 12px; border-radius:7px; border:1px solid #E6E8EA; background:#fff; color:#474D57; font-size:12px; font-weight:600; cursor:pointer; transition:all 150ms; }
        .jv-nav-btn:hover:not(:disabled) { background:#F4F5F7; color:#1E2026; }
        .jv-nav-btn:disabled { opacity:0.35; cursor:not-allowed; }
        .jv-status-chip { flex:1; display:flex; flex-direction:column; align-items:center; gap:3px; padding:6px 4px; border-radius:8px; border:1px solid #E6E8EA; background:#fff; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:#848E9C; cursor:pointer; transition:all 150ms; }
        .jv-status-chip:hover { opacity:0.85; }
        .queue-q-btn:hover { background:#F4F5F7!important; }
      `}</style>

      {/* ─── TOP NAVIGATION BAR ─────────────────────────────────── */}
      <div style={{ flexShrink: 0, height: '52px', borderBottom: '1px solid #E6E8EA', background: '#fff', display: 'flex', alignItems: 'center', padding: '0 16px', gap: '10px', zIndex: 10 }}>

        {/* Queue toggle */}
        <button type="button" onClick={() => setQueueOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '7px', border: '1px solid #E6E8EA', background: queueOpen ? '#FFF8E6' : '#fff', color: queueOpen ? '#B07D0A' : '#474D57', fontSize: '11px', fontWeight: 700, cursor: 'pointer', transition: 'all 150ms', flexShrink: 0 }}>
          ☰ {queueOpen ? 'Hide' : `Queue (${filteredQueue.length})`}
        </button>

        {/* Export Review Report */}
        <button type="button" disabled={!compareRun || filteredQueue.length === 0}
          onClick={async () => {
            setError("");
            try {
              await exportReviewReport(token, compareRunId);
              setReviewMessage("Review report downloaded.");
            } catch (err) {
              if (err instanceof ApiError && err.status === 401) { logout(); return; }
              setError(err.message);
            }
          }}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '7px', border: '1px solid #E6E8EA', background: '#fff', color: '#474D57', fontSize: '11px', fontWeight: 600, cursor: !compareRun || filteredQueue.length === 0 ? 'not-allowed' : 'pointer', opacity: !compareRun || filteredQueue.length === 0 ? 0.6 : 1, transition: 'all 150ms', flexShrink: 0 }}>
          <Download size={12} /> Export
        </button>

        {/* Prev / Index / Next */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <button type="button" className="jv-nav-btn" disabled={!prevChange}
            onClick={() => prevChange && updateQueueParams({ change: String(prevChange.id) })}>
            ← Prev
          </button>
          <span style={{ fontSize: '12px', color: '#848E9C', fontWeight: 600, minWidth: '52px', textAlign: 'center' }}>
            {currentChangeIndex >= 0 ? `${currentChangeIndex + 1} / ${filteredQueue.length}` : '— / —'}
          </span>
          <button type="button" className="jv-nav-btn" disabled={!nextChange}
            onClick={() => nextChange && updateQueueParams({ change: String(nextChange.id) })}>
            Next →
          </button>
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', background: '#E6E8EA', flexShrink: 0 }} />

        {/* Change title + badges */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
          {changeItem ? (
            <>
              <h2 style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>Review Workspace</h2>
              <h1 style={{ fontSize: '14px', fontWeight: 700, color: '#1E2026', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {buildChangeHeadline(changeItem)}
              </h1>
              {(() => {
                const ct = changeItem.change_type || 'modified';
                const cfg = { added: ['#EBF9F4', '#16714E'], removed: ['#FFF1F0', '#C03050'], modified: ['#FFF8E6', '#B07D0A'] };
                const [bg, col] = cfg[ct] || cfg.modified;
                return <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 7px', borderRadius: '4px', background: bg, color: col, textTransform: 'uppercase', letterSpacing: '.04em', flexShrink: 0 }}>{ct}</span>;
              })()}
              <span style={{ fontSize: '10px', color: '#C0C6CF', fontFamily: 'monospace', flexShrink: 0 }}>#{changeItem.id}</span>
              {compareRun && <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#F4F5F7', color: '#848E9C', border: '1px solid #E6E8EA', flexShrink: 0 }}>{(() => { const n = Number(compareRun.id); return `CR-${String(n).padStart(4, '0')}`; })()}</span>}
              {/* Surface */}
              {changeItem.section_title ? null : (
                <span style={{ fontSize: '10px', color: '#848E9C', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <span style={{ padding: '1px 5px', borderRadius: '3px', background: '#F4F5F7', fontSize: '9px', fontFamily: 'monospace' }}>Clause #{changeItem.id}</span>
                </span>
              )}
            </>
          ) : (
            <span style={{ fontSize: '13px', color: '#848E9C' }}>Select a change from the queue</span>
          )}
        </div>

      </div>

      {/* ─── MAIN AREA (Queue drawer + Diff halves) ─────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* Queue slide-over panel */}
        {queueOpen && (
          <section className="rw-slide-left" style={{ width: '240px', flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%', background: '#FAFAFA', borderRight: '1px solid #E6E8EA', zIndex: 5 }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #E6E8EA', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <h2 style={{ fontSize: '11px', fontWeight: 700, color: '#1E2026', margin: 0 }}>Clause Changes</h2>
              <input type="search" aria-label="Search clause changes" value={queueSearch}
                onChange={e => updateQueueParams({ queueSearch: e.target.value, page: null })}
                placeholder="Search changes…"
                onFocus={e => e.target.style.borderColor = '#F0B90B'}
                onBlur={e => e.target.style.borderColor = '#E6E8EA'}
                style={{ width: '100%', padding: '5px 9px', borderRadius: '6px', border: '1px solid #E6E8EA', background: '#fff', color: '#1E2026', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: '4px' }}>
                <label htmlFor="rw-queue-filter" className="sr-only" style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>Review queue status</label>
                {[['all', 'All', '#848E9C', 'Filter all'], ['open', '○', '#F6465D', 'Filter open'], ['in_review', '◑', '#F0B90B', 'Filter in review'], ['resolved', '●', '#2EBD85', 'Filter resolved']].map(([v, l, c, ariaLabel]) => (
                  <button key={v} type="button" aria-label={ariaLabel} onClick={() => updateQueueParams({ queueReviewStatus: v, page: null })}
                    style={{ flex: 1, padding: '3px 0', borderRadius: '5px', border: `1px solid ${queueReviewStatus === v ? c + '88' : '#E6E8EA'}`, background: queueReviewStatus === v ? c + '18' : '#fff', color: queueReviewStatus === v ? c : '#848E9C', fontSize: '10px', fontWeight: 700, cursor: 'pointer', transition: 'all 150ms' }}>{l}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {paginatedQueue.map(item => {
                const sel = item.id === selectedChangeId;
                const cc = item.change_type === 'added' ? '#2EBD85' : item.change_type === 'removed' ? '#F6465D' : '#F0B90B';
                const rs = item.review_status === 'resolved' ? '●' : item.review_status === 'in_review' ? '◑' : '○';
                const rc = item.review_status === 'resolved' ? '#2EBD85' : item.review_status === 'in_review' ? '#F0B90B' : '#F6465D';
                return (
                  <button key={item.id} type="button" className="queue-q-btn"
                    aria-label={item.summary}
                    onClick={() => updateQueueParams({ change: String(item.id) })}
                    style={{ width: '100%', display: 'flex', border: 'none', padding: 0, cursor: 'pointer', background: sel ? '#FFF8E6' : 'transparent', textAlign: 'left', borderBottom: '1px solid #F4F5F7', transition: 'background 120ms' }}>
                    <div style={{ width: '3px', flexShrink: 0, background: cc, opacity: sel ? 1 : 0.2, borderRadius: '0 2px 2px 0' }} />
                    <div style={{ flex: 1, padding: '9px 11px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#1E2026', lineHeight: 1.3, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.section_title || item.surface_key}</span>
                        <span style={{ fontSize: '12px', color: rc, flexShrink: 0, marginLeft: '4px' }}>{rs}</span>
                      </div>
                      <p style={{ fontSize: '10px', color: '#848E9C', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{item.summary || item.change_type}</p>
                    </div>
                  </button>
                );
              })}
              {filteredQueue.length > REVIEW_QUEUE_PAGE_SIZE && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px', borderBottom: '1px solid #E6E8EA' }}>
                    <span style={{ fontSize: '10px', color: '#848E9C' }}>Page {currentPage} of {totalPages}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '5px', padding: '8px 12px', borderTop: '1px solid #E6E8EA' }}>
                    {[['\u2039', 'Previous page', currentPage <= 1, () => updateQueueParams({ page: currentPage - 1 })],
                    ['\u203a', 'Next page', currentPage >= totalPages, () => updateQueueParams({ page: currentPage + 1 })]].map(([l, label, d, fn]) => (
                      <button key={l} type="button" aria-label={label} disabled={!!d} onClick={fn}
                        style={{ flex: 1, padding: '3px', borderRadius: '5px', border: '1px solid #E6E8EA', background: '#fff', color: '#474D57', fontSize: '13px', fontWeight: 700, cursor: d ? 'not-allowed' : 'pointer', opacity: d ? 0.4 : 1 }}>{l}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {/* ── FULL-SCREEN DIFF: OLD | NEW ──────────────────────── */}
        {changeItem ? (
          <div key={changeItem.id} className="rw-fade-up" style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>

            {/* OLD half */}
            <div className="jv-half" style={{ borderRight: '2px solid #F0B90B22' }}>
              <div style={{ flexShrink: 0, height: '36px', display: 'flex', alignItems: 'center', padding: '0 24px', background: '#FFF1F0', borderBottom: '1px solid #F6465D22', gap: '8px' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#F6465D', flexShrink: 0 }} />
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#C03050', textTransform: 'uppercase', letterSpacing: '.07em' }}>Original</span>
                <span title={compareRun?.source_version?.version_label ?? 'v1'} style={{ fontSize: '10px', color: '#C03050', opacity: .7, marginLeft: '4px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'middle' }}>{compareRun?.source_version?.version_label ?? 'v1'}</span>
              </div>
              <div className="jv-half-body">
                {diffParts.length === 0
                  ? <span style={{ color: '#C0C6CF', fontStyle: 'italic' }}>No content</span>
                  : oldTokens.map((part, i) => (
                    part.removed
                      ? <mark key={i} style={{ background: 'rgba(246,70,93,0.15)', color: '#A82045', textDecoration: 'line-through', textDecorationColor: '#F6465D', borderRadius: '3px', padding: '0 2px', fontWeight: 600 }}>{part.value}</mark>
                      : <span key={i}>{part.value}</span>
                  ))
                }
              </div>
            </div>

            {/* NEW half */}
            <div className="jv-half">
              <div style={{ flexShrink: 0, height: '36px', display: 'flex', alignItems: 'center', padding: '0 24px', background: '#EBF9F4', borderBottom: '1px solid #2EBD8522', gap: '8px' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#2EBD85', flexShrink: 0 }} />
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#16714E', textTransform: 'uppercase', letterSpacing: '.07em' }}>Revised</span>
                <span title={compareRun?.target_version?.version_label ?? 'v2'} style={{ fontSize: '10px', color: '#16714E', opacity: .7, marginLeft: '4px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'middle' }}>{compareRun?.target_version?.version_label ?? 'v2'}</span>
                {changeItem.ai_review_draft && (() => {
                  const risk = (changeItem.ai_review_draft.risk_level || '').toLowerCase();
                  const cfg = { high: ['#FFF1F0', '#C03050'], medium: ['#FFF8E6', '#B07D0A'], low: ['#EBF9F4', '#16714E'] };
                  const [bg, col] = cfg[risk] || cfg.medium;
                  return risk ? <span style={{ marginLeft: 'auto', fontSize: '9px', fontWeight: 800, padding: '1px 7px', borderRadius: '4px', background: bg, color: col, textTransform: 'uppercase', letterSpacing: '.05em' }}>{risk} risk</span> : null;
                })()}
              </div>
              <div className="jv-half-body" style={{ background: changeItem.change_type === 'added' ? '#F8FFFE' : changeItem.change_type === 'removed' ? '#FFFAFA' : '#FFFFFF' }}>
                {diffParts.length === 0
                  ? <span style={{ color: '#C0C6CF', fontStyle: 'italic' }}>No content</span>
                  : newTokens.map((part, i) => (
                    part.added
                      ? <mark key={i} style={{ background: 'rgba(46,189,133,0.18)', color: '#15643E', borderRadius: '3px', padding: '0 2px', fontWeight: 600, textDecoration: 'none' }}>{part.value}</mark>
                      : <span key={i}>{part.value}</span>
                  ))
                }
              </div>
            </div>

            {/* AI sticky sidebar (only when AI draft exists) */}
            {changeItem.ai_review_draft?.explanation && (
              <section style={{ width: '260px', flexShrink: 0, borderLeft: '1px solid #E6E8EA', background: '#FAFAFA', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid #E6E8EA' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <div style={{ width: '18px', height: '18px', borderRadius: '5px', background: '#FFF8E6', border: '1px solid #F0B90B44', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Sparkles size={11} style={{ color: '#B07D0A' }} />
                    </div>
                    <h3 style={{ fontSize: '10px', fontWeight: 700, color: '#848E9C', textTransform: 'uppercase', letterSpacing: '.06em', margin: 0 }}>AI Insight</h3>
                  </div>
                  <p style={{ fontSize: '12px', color: '#474D57', lineHeight: 1.65 }}>{changeItem.ai_review_draft.explanation}</p>
                  {aiConfidenceLabel && (
                    <span style={{ marginTop: '6px', display: 'inline-block', fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '4px', background: '#F4F5F7', color: '#848E9C', border: '1px solid #E6E8EA' }}>
                      {aiConfidenceLabel} confidence
                    </span>
                  )}
                  {changeItem.ai_review_draft.provider_used && (
                    <span style={{ marginTop: '4px', display: 'inline-block', marginLeft: '4px', fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '4px', background: '#EBF9F4', color: '#16714E', border: '1px solid #2EBD8544' }}>
                      ✦ AI Generated ({changeItem.ai_review_draft.provider_used})
                    </span>
                  )}
                  {changeItem.ai_review_draft.fallback_used && (
                    <span style={{ marginTop: '4px', display: 'inline-block', marginLeft: '4px', fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '4px', background: '#FFF1F0', color: '#C03050', border: '1px solid #F6465D44' }}>
                      Fallback used
                    </span>
                  )}
                  {changeItem.ai_review_draft.error_message && (
                    <p style={{ marginTop: '6px', fontSize: '11px', color: '#C03050', lineHeight: 1.5 }}>
                      AI error: {changeItem.ai_review_draft.error_message}
                    </p>
                  )}
                  {/* Action: Apply AI explanation as review summary */}
                  <button type="button"
                    onClick={() => { setReviewSummary(changeItem.ai_review_draft.explanation); setReviewMessage('AI insight applied as review note.'); }}
                    style={{ marginTop: '8px', width: '100%', padding: '5px 0', borderRadius: '6px', border: '1px solid #F0B90B44', background: '#FFF8E6', color: '#B07D0A', fontSize: '10px', fontWeight: 700, cursor: 'pointer', transition: 'all 150ms' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F0B90B22'}
                    onMouseLeave={e => e.currentTarget.style.background = '#FFF8E6'}>
                    ✦ Apply as Review Note
                  </button>
                </div>
                {changeItem.ai_review_draft.draft_comment && (
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid #E6E8EA' }}>
                    <p style={{ fontSize: '9px', fontWeight: 700, color: '#2EBD85', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '5px' }}>✦ Suggested Redline</p>
                    <p style={{ fontSize: '11px', color: '#474D57', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.7 }}>{changeItem.ai_review_draft.draft_comment}</p>
                    {/* Action: Post AI draft as comment */}
                    <button type="button"
                      onClick={() => { setCommentDraft(changeItem.ai_review_draft.draft_comment); setCommentsOpen(true); }}
                      style={{ marginTop: '6px', width: '100%', padding: '5px 0', borderRadius: '6px', border: '1px solid #2EBD8544', background: '#EBF9F4', color: '#16714E', fontSize: '10px', fontWeight: 700, cursor: 'pointer', transition: 'all 150ms' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#2EBD8522'}
                      onMouseLeave={e => e.currentTarget.style.background = '#EBF9F4'}>
                      💬 Use as Comment Draft
                    </button>
                  </div>
                )}
                {changeItem.ai_review_draft.suggested_checks && (
                  <div style={{ padding: '10px 14px' }}>
                    <p style={{ fontSize: '9px', fontWeight: 700, color: '#848E9C', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '5px' }}>Checklist</p>
                    <p style={{ fontSize: '11px', color: '#474D57', lineHeight: 1.65 }}>{changeItem.ai_review_draft.suggested_checks}</p>
                  </div>
                )}
              </section>
            )}
          </div>
        ) : (
          /* Empty state */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: '#F4F5F7', border: '1px solid #E6E8EA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileDiff size={28} style={{ color: '#C0C6CF' }} />
            </div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: '#1E2026' }}>Open the queue to start reviewing</p>
            <p style={{ fontSize: '13px', color: '#848E9C' }}>Click "Queue" above or use Prev / Next to navigate clause changes.</p>
            <button type="button" onClick={() => setQueueOpen(true)}
              style={{ marginTop: '4px', padding: '9px 24px', borderRadius: '8px', background: '#F0B90B', color: '#1E2026', border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 10px rgba(240,185,11,0.3)' }}>
              Open Queue →
            </button>
          </div>
        )}
      </div>

      {/* ─── BOTTOM DECISION BAR ─────────────────────────────────── */}
      {selectedChangeReady && (
        <section role="region" aria-label="Human review command" style={{ flexShrink: 0, height: '72px', borderTop: '2px solid #E6E8EA', background: '#fff', display: 'flex', alignItems: 'center', padding: '0 20px', gap: '14px', zIndex: 10, boxShadow: '0 -4px 20px rgba(0,0,0,0.06)' }}>

          {/* Status quick chips */}
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <h3 style={{ fontSize: '10px', fontWeight: 700, color: '#848E9C', textTransform: 'uppercase', letterSpacing: '.05em', alignSelf: 'center', marginRight: '2px', margin: 0 }}>Verdict:</h3>
            {[['open', 'Open', CircleDashed, '#FFF1F0', '#F6465D44', '#C03050'],
            ['in_review', 'In Review', Clock, '#FFF8E6', '#F0B90B44', '#B07D0A'],
            ['resolved', 'Resolved ✓', CheckCircle2, '#EBF9F4', '#2EBD8544', '#16714E']
            ].map(([val, lbl, Icon, bg, bdr, col]) => {
              const active = reviewStatus === val;
              return (
                <button key={val} type="button" className="jv-status-chip"
                  onClick={() => setReviewStatus(val)}
                  style={{ padding: '5px 12px', flexDirection: 'row', gap: '5px', borderColor: active ? bdr : '#E6E8EA', background: active ? bg : '#fff', color: active ? col : '#848E9C' }}>
                  <Icon size={12} /> {lbl}
                </button>
              );
            })}
          </div>

          {/* Separator */}
          <div style={{ width: '1px', height: '32px', background: '#E6E8EA', flexShrink: 0 }} />

          {/* Assignee */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <label htmlFor="rw-assignee" style={{ fontSize: '10px', fontWeight: 700, color: '#848E9C', textTransform: 'uppercase', letterSpacing: '.05em' }}>Assignee</label>
            <select id="rw-assignee" aria-label="Assignee" value={assigneeUserId} onChange={e => setAssigneeUserId(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #E6E8EA', background: '#F4F5F7', color: '#1E2026', fontSize: '12px', outline: 'none', maxWidth: '140px' }}>
              <option value="">No assignee</option>
              {assigneeOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>

          {/* Notes inline */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            <label htmlFor="rw-summary" style={{ fontSize: '10px', fontWeight: 700, color: '#848E9C', textTransform: 'uppercase', letterSpacing: '.05em', flexShrink: 0 }}>Review summary</label>
            <input id="rw-summary" type="text" aria-label="Review summary" value={reviewSummary} onChange={e => setReviewSummary(e.target.value)}
              placeholder="Add a brief note…"
              onFocus={e => e.target.style.borderColor = '#F0B90B'}
              onBlur={e => e.target.style.borderColor = '#E6E8EA'}
              style={{ flex: 1, padding: '5px 10px', borderRadius: '6px', border: '1px solid #E6E8EA', background: '#F4F5F7', color: '#1E2026', fontSize: '12px', outline: 'none', minWidth: 0 }} />
          </div>

          {/* Separator */}
          <div style={{ width: '1px', height: '32px', background: '#E6E8EA', flexShrink: 0 }} />

          {/* Banners */}
          {error && <Toast message={error} type="error" onClose={() => setError("")} />}
          {reviewMessage && <Toast message={reviewMessage} type="success" onClose={() => setReviewMessage("")} />}
          {commentMessage && <Toast message={commentMessage} type="success" onClose={() => setCommentMessage("")} />}
          {aiMessage && <Toast message={aiMessage} type="success" onClose={() => setAiMessage("")} />}

          {/* Comments toggle */}
          <button type="button" aria-label="Toggle comments" onClick={() => setCommentsOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', border: '1px solid #E6E8EA', background: commentsOpen ? '#EBF9F4' : '#fff', color: commentsOpen ? '#16714E' : '#474D57', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 150ms', flexShrink: 0 }}>
            💬 {changeItem?.comments?.length ?? 0}
          </button>

          {/* AI Review */}
          <button type="button" disabled={isRegeneratingAiDraft || !selectedChangeReady} onClick={handleRegenerateAiDraft}
            onMouseEnter={e => { if (!e.currentTarget.disabled) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(240,185,11,0.35)'; } }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 6px rgba(240,185,11,0.2)'; }}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 14px', borderRadius: '7px', background: '#F4F5F7', color: '#474D57', border: '1px solid #E6E8EA', fontSize: '12px', fontWeight: 700, cursor: isRegeneratingAiDraft || !selectedChangeReady ? 'not-allowed' : 'pointer', opacity: isRegeneratingAiDraft || !selectedChangeReady ? 0.5 : 1, transition: 'all 150ms', flexShrink: 0 }}>
            {isRegeneratingAiDraft
              ? <><div style={{ width: '11px', height: '11px', borderRadius: '50%', border: '2px solid rgba(71,77,87,0.3)', borderTopColor: '#474D57', animation: 'rwSpin 0.8s linear infinite' }} /> Generating…</>
              : <><Sparkles size={13} /> {changeItem?.ai_review_draft ? 'Refresh AI' : 'AI Review'}</>}
          </button>

          {/* Save */}
          <button type="button" disabled={isSavingReview || !selectedChangeReady} onClick={handleSaveReview}
            onMouseEnter={e => { if (!e.currentTarget.disabled) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(240,185,11,0.4)'; } }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 6px rgba(240,185,11,0.2)'; }}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 20px', borderRadius: '8px', background: '#F0B90B', color: '#1E2026', border: 'none', fontSize: '13px', fontWeight: 700, cursor: isSavingReview || !selectedChangeReady ? 'not-allowed' : 'pointer', opacity: isSavingReview || !selectedChangeReady ? 0.6 : 1, boxShadow: '0 2px 6px rgba(240,185,11,0.2)', transition: 'all 150ms', flexShrink: 0 }}>
            {isSavingReview
              ? <><div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid rgba(30,32,38,0.2)', borderTopColor: '#1E2026', animation: 'rwSpin 0.8s linear infinite' }} /> Saving…</>
              : <><Save size={14} /> Save</>}
          </button>
        </section>
      )}

      {/* ─── COMMENTS SLIDE-UP DRAWER ───────────────────────────── */}
      {commentsOpen && selectedChangeReady && (
        <div className="rw-fade-up" style={{ position: 'absolute', bottom: selectedChangeReady ? '72px' : '0', right: 0, width: '340px', maxHeight: '420px', background: '#fff', borderLeft: '1px solid #E6E8EA', borderTop: '1px solid #E6E8EA', borderRadius: '12px 0 0 0', display: 'flex', flexDirection: 'column', zIndex: 20, boxShadow: '-4px -4px 20px rgba(0,0,0,0.08)' }}>
          {/* Drawer header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #E6E8EA' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#848E9C', textTransform: 'uppercase', letterSpacing: '.06em' }}>💬 Comments {changeItem.comments?.length > 0 ? `(${changeItem.comments.length})` : ''}</span>
            <button type="button" onClick={() => setCommentsOpen(false)}
              style={{ padding: '2px 8px', borderRadius: '5px', border: '1px solid #E6E8EA', background: '#fff', color: '#848E9C', fontSize: '12px', cursor: 'pointer' }}>✕</button>
          </div>
          {/* Comment list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {changeItem.comments?.length ? changeItem.comments.map(comment => {
              const name = comment.author_display_name || `User ${comment.author_user_id}`;
              const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
              return (
                <div key={comment.id} style={{ display: 'flex', gap: '7px' }}>
                  <div style={{ flexShrink: 0, width: '26px', height: '26px', borderRadius: '50%', background: '#F0B90B22', border: '1px solid #F0B90B44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: '#B07D0A' }}>{initials}</div>
                  <div style={{ flex: 1, padding: '7px 9px', borderRadius: '7px', background: '#F4F5F7', border: '1px solid #E6E8EA' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#1E2026' }}>{name}</span>
                      <span style={{ fontSize: '10px', color: '#C0C6CF' }}>{formatDateTime(comment.created_at)}</span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#474D57', lineHeight: 1.5 }}>{comment.content}</p>
                  </div>
                </div>
              );
            }) : (
              <p style={{ fontSize: '12px', color: '#C0C6CF', textAlign: 'center', padding: '16px' }}>No comments yet.</p>
            )}
          </div>
          {/* Add comment */}
          <div style={{ borderTop: '1px solid #E6E8EA', padding: '10px 14px', display: 'flex', gap: '6px' }}>
            <input type="text" aria-label="Add comment" value={commentDraft} onChange={e => setCommentDraft(e.target.value)}
              placeholder="Write a comment…"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
              style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid #E6E8EA', background: '#F4F5F7', color: '#1E2026', fontSize: '12px', outline: 'none' }}
              onFocus={e => e.target.style.borderColor = '#F0B90B'}
              onBlur={e => e.target.style.borderColor = '#E6E8EA'} />
            <button type="button" disabled={isSubmittingComment || !selectedChangeReady} onClick={handleAddComment}
              style={{ padding: '6px 12px', borderRadius: '6px', background: '#F0B90B', color: '#1E2026', border: 'none', fontSize: '12px', fontWeight: 700, cursor: isSubmittingComment || !selectedChangeReady ? 'not-allowed' : 'pointer', opacity: isSubmittingComment || !selectedChangeReady ? 0.6 : 1 }}>
              {isSubmittingComment ? '…' : 'Post'}
            </button>
          </div>
          {commentMessage && <p style={{ fontSize: '11px', color: '#16714E', padding: '5px 14px' }}>{commentMessage}</p>}
        </div>
      )}
    </div>
  );
}
