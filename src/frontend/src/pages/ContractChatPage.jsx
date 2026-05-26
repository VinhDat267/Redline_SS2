import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft, Bot, ChevronDown, CircleDot, FileText, MessageSquare,
  Plus, RotateCcw, ScrollText, Send, ShieldCheck, Sparkles, Square,
  UserCircle, Zap, BookOpen, History
} from "lucide-react";
import { Toast } from "../components/Toast";

import { useAuth } from "../auth/AuthContext";
import { Sidebar } from "../components/ScreenFrame";
import {
  ApiError, cancelContractChatAttempt, createContractChatAttempt,
  createContractChatSession, getContract, getContractCompareRun, listContractChatMessages,
  listContractChatSessions, listContractCompareRuns, listContractDrafts, sendContractChatMessage
} from "../lib/api";
import { streamChatAttempt } from "../lib/contractChatStream";
import { formatDateTime } from "../lib/formatters";

/* ── helpers (unchanged logic) ───────────────────────────────────────── */
function hasParsedStatus(d) { return ["parsed", "parsed_with_warnings"].includes(d.parse_status?.toLowerCase()); }
function createClientRequestId() { return globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

const STREAM_STATUS_LABELS = {
  starting: "Preparing", grounding: "Searching contract\u2026", answering: "Answering",
  sources_pending: "Verifying references\u2026", cancelling: "Stopping", cancelled: "Stopped", error: "Failed"
};
const STREAM_STATUS_ICONS = {
  starting: "⏳", grounding: "🔍", answering: "✍️", sources_pending: "📎", cancelling: "⏹", cancelled: "⏹", error: "❌"
};
function getStreamStatusLabel(s) { return STREAM_STATUS_LABELS[s] ?? "Answering"; }
function getStreamStatusIcon(s) { return STREAM_STATUS_ICONS[s] ?? "✍️"; }
function isAbortError(e) { return e?.name === "AbortError" || e?.message === "Aborted"; }
function isStreamingEnabled() { return import.meta.env.VITE_CONTRACT_CHAT_STREAMING_ENABLED !== "false"; }
function partialKey(cId, sId) { return `redline.contractChat.partial.${cId}.${sId}`; }
function serializePartial(m) { return { ...m, streaming: false, stopped: Boolean(m.stopped), failed: Boolean(m.failed), updated_at: new Date().toISOString() }; }
function readPartial(cId, sId) { try { const v = JSON.parse(window.localStorage.getItem(partialKey(cId, sId)) || "null"); return v?.role === "assistant" && v.content ? { ...v, streaming: false } : null; } catch { return null; } }
function writePartial(cId, m) { if (m?.session_id && m.content?.trim() && (m.stopped || m.failed)) localStorage.setItem(partialKey(cId, m.session_id), JSON.stringify(serializePartial(m))); }
function clearPartial(cId, sId) { if (sId) localStorage.removeItem(partialKey(cId, sId)); }
function draftLabel(d) { return d?.draft_label || d?.version_label || (d?.id ? `Draft ${d.id}` : "Draft"); }
function compareRunLabel(r) { return `${draftLabel(r?.source_version ?? r?.source_draft)} -> ${draftLabel(r?.target_version ?? r?.target_draft)}`; }
function compareRunPairKey(r) {
  const source = r?.source_version ?? r?.source_draft;
  const target = r?.target_version ?? r?.target_draft;
  return `${source?.id ?? draftLabel(source)}:${target?.id ?? draftLabel(target)}`;
}
function compareRunRecencyTuple(r) {
  const parsedTime = Date.parse(r?.completed_at ?? r?.started_at ?? "");
  return [Number.isFinite(parsedTime) ? parsedTime : 0, Number(r?.id ?? 0)];
}
function isNewerCompareRun(candidate, current) {
  const [candidateTime, candidateId] = compareRunRecencyTuple(candidate);
  const [currentTime, currentId] = compareRunRecencyTuple(current);
  return candidateTime > currentTime || (candidateTime === currentTime && candidateId > currentId);
}
function latestCompareRunsByPair(runs) {
  const latestByPair = new Map();
  for (const run of runs) {
    const key = compareRunPairKey(run);
    const current = latestByPair.get(key);
    if (!current || isNewerCompareRun(run, current)) latestByPair.set(key, run);
  }
  return [...latestByPair.values()].sort((a, b) => {
    const [aTime, aId] = compareRunRecencyTuple(a);
    const [bTime, bId] = compareRunRecencyTuple(b);
    return aTime - bTime || aId - bId;
  });
}
function buildCompareRunLabelMap(runs) {
  const pairCounts = new Map();
  for (const run of runs) {
    const key = compareRunPairKey(run);
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }
  const labels = new Map();
  for (const run of runs) {
    const base = compareRunLabel(run);
    const annotations = [];
    if (run?.is_stale) annotations.push("stale");
    if (run?.is_superseded) annotations.push("superseded");
    if (pairCounts.get(compareRunPairKey(run)) > 1 && run?.id) annotations.push(`run #${run.id}`);
    const suffix = annotations.length ? ` (${annotations.join(", ")})` : "";
    labels.set(String(run.id), `${base}${suffix}`);
  }
  return labels;
}
function isCompletedCompareRun(r) { return ["completed", "completed_with_warnings"].includes(r.compare_status); }
function isFreshCompletedCompareRun(r) { return isCompletedCompareRun(r) && !r.is_stale && !r.is_superseded; }
function staleCompareRunMessage() {
  return "This compare run is stale because a draft was parsed again. Run Compare again before asking compare questions.";
}
function supersededCompareRunMessage() {
  return "This compare run has been superseded. Use the latest Compare run before asking compare questions.";
}
function compareRunUnavailableMessage(run) {
  if (run?.is_stale) return staleCompareRunMessage();
  if (run?.is_superseded) return supersededCompareRunMessage();
  return "";
}
function mergeCompareRuns(currentRuns, incomingRuns) {
  const byId = new Map();
  for (const run of [...currentRuns, ...incomingRuns]) {
    if (run?.id) byId.set(String(run.id), run);
  }
  return [...byId.values()].sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0));
}
function providerBadgeLabel(message) {
  const provider = message?.provider_used;
  if (!provider) return "";
  const rawBase = provider.split(":")[0] || provider;
  const hasCompareEvidence = Array.isArray(message.citations) && message.citations.some(c => c.compare_run_id || c.change_item_id || c.source_label);
  if (rawBase === "local-compare") return "\ud83d\udcc4 from compare changes";
  if (hasCompareEvidence) return "\ud83d\udd04 from compare changes";
  if (provider === "session-memory") return "\ud83d\udcac from conversation";
  if (provider === "contract-metadata") return "\ud83d\udccb from contract info";
  return "\ud83d\udcc4 from current draft";
}
function citationScopeLabel(c) { return c.source_label === "source" ? "Source" : c.source_label === "target" ? "Target" : ""; }
function citationTitle(c) {
  const base = c.section_title || c.block_key || `Block ${c.block_id}`;
  const scope = citationScopeLabel(c);
  return scope ? `${scope}: ${base}` : base;
}
function citationSurface(c) {
  const surface = c.surface_key || c.surface_type || "contract text";
  return c.compare_run_id && c.change_item_id ? `Change #${c.change_item_id} / ${surface}` : surface;
}
function citationContent(c) { return c.content || c.snippet || ""; }

const PROMPT_EXAMPLES = [
  { icon: "⚖️", text: "What is the liability cap?" },
  { icon: "🔚", text: "Which clauses mention termination?" },
  { icon: "💰", text: "What are the payment terms?" },
  { icon: "🛡️", text: "Summarize indemnification obligations" },
];

const COMPARE_PROMPT_EXAMPLES = [
  { icon: "🔄", text: "What changed in the liability cap?" },
  { icon: "➕", text: "Which obligations were added or removed?" },
  { icon: "✨", text: "Summarize the key negotiation changes" },
  { icon: "🚨", text: "Which changes should legal review first?" },
];

export function ContractChatPage() {
  const { logout, token, user } = useAuth();
  const { contractId } = useParams();
  const streamAbortRef = useRef(null);
  const activeAttemptRef = useRef(null);
  const stopRequestedRef = useRef(false);
  const chatEndRef = useRef(null);

  const [contract, setContract] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [compareRuns, setCompareRuns] = useState([]);
  const [selectedScope, setSelectedScope] = useState("draft");
  const [sessions, setSessions] = useState([]);
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [selectedCompareRunId, setSelectedCompareRunId] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [messages, setMessages] = useState([]);
  const [streamingAnswer, setStreamingAnswer] = useState(null);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [selectedCitationKey, setSelectedCitationKey] = useState("");
  const [error, setError] = useState("");
  const [showSessions, setShowSessions] = useState(false);

  useEffect(() => () => streamAbortRef.current?.abort(), []);

  useEffect(() => {
    let ok = true;
    async function load() {
      setIsLoading(true); setError("");
      try {
        const [cr, dr, rr, sr] = await Promise.all([
          getContract(token, contractId),
          listContractDrafts(token, contractId),
          listContractCompareRuns(token, contractId, { latestPerPair: true, freshOnly: true }),
          listContractChatSessions(token, contractId)
        ]);
        if (!ok) return;
        let loadedCompareRuns = rr;
        const latest = sr[sr.length - 1];
        if (latest?.compare_run_id && !loadedCompareRuns.some(r => String(r.id) === String(latest.compare_run_id))) {
          const historicalCompareRun = await getContractCompareRun(token, latest.compare_run_id);
          if (!ok) return;
          loadedCompareRuns = mergeCompareRuns(loadedCompareRuns, [historicalCompareRun]);
        }
        setContract(cr); setDrafts(dr); setCompareRuns(loadedCompareRuns); setSessions(sr);
        const parsed = dr.filter(hasParsedStatus);
        if (parsed.length) setSelectedDraftId(c => c || String(parsed[0].id));
        const completedRuns = latestCompareRunsByPair(loadedCompareRuns.filter(isFreshCompletedCompareRun));
        if (completedRuns.length) setSelectedCompareRunId(c => c || String(completedRuns[completedRuns.length - 1].id));
        if (sr.length) {
          setSelectedSessionId(String(latest.id));
          if (latest.compare_run_id) {
            setSelectedScope("compare");
            setSelectedCompareRunId(String(latest.compare_run_id));
          } else {
            setSelectedScope("draft");
          }
          const msgs = await listContractChatMessages(token, contractId, latest.id);
          if (!ok) return;
          setMessages(msgs);
          setStreamingAnswer(readPartial(contractId, latest.id));
          setSelectedDraftId(c => c || String(latest.draft_id));
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) { logout(); return; }
        if (ok) setError(e.message);
      } finally { if (ok) setIsLoading(false); }
    }
    void load();
    return () => { ok = false; };
  }, [contractId, logout, token]);

  // auto scroll
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamingAnswer?.content]);

  const parsedDrafts = useMemo(() => drafts.filter(hasParsedStatus), [drafts]);
  const selectedDraft = parsedDrafts.find(d => String(d.id) === selectedDraftId) ?? null;
  const completedCompareRuns = useMemo(() => compareRuns.filter(isCompletedCompareRun), [compareRuns]);
  const freshCompletedCompareRuns = useMemo(() => completedCompareRuns.filter(isFreshCompletedCompareRun), [completedCompareRuns]);
  const latestCompareRuns = useMemo(() => latestCompareRunsByPair(freshCompletedCompareRuns), [freshCompletedCompareRuns]);
  const selectedHistoricalCompareRun = completedCompareRuns.find(r => String(r.id) === selectedCompareRunId) ?? null;
  const selectableCompareRuns = useMemo(() => {
    if (!selectedHistoricalCompareRun) return latestCompareRuns;
    const hasSelected = latestCompareRuns.some(r => String(r.id) === String(selectedHistoricalCompareRun.id));
    return hasSelected ? latestCompareRuns : [...latestCompareRuns, selectedHistoricalCompareRun];
  }, [latestCompareRuns, selectedHistoricalCompareRun]);
  const compareRunLabels = useMemo(() => buildCompareRunLabelMap(selectableCompareRuns), [selectableCompareRuns]);
  const selectedCompareRun = selectedHistoricalCompareRun ?? selectableCompareRuns.find(r => String(r.id) === selectedCompareRunId) ?? null;
  const selectedCompareTargetDraft = selectedCompareRun?.target_version ?? selectedCompareRun?.target_draft ?? null;
  const selectedCompareRunLabel = selectedCompareRun ? compareRunLabels.get(String(selectedCompareRun.id)) ?? compareRunLabel(selectedCompareRun) : "";
  const selectedCompareRunIsStale = Boolean(selectedCompareRun?.is_stale);
  const selectedCompareRunIsSuperseded = Boolean(selectedCompareRun?.is_superseded);
  const selectedCompareRunUnavailableMessage = compareRunUnavailableMessage(selectedCompareRun);
  const activeDraftId = selectedScope === "compare" ? String(selectedCompareTargetDraft?.id ?? "") : selectedDraftId;
  const activeScopeLabel = selectedScope === "compare" && selectedCompareRun ? selectedCompareRunLabel : draftLabel(selectedDraft);
  const promptExamples = selectedScope === "compare" ? COMPARE_PROMPT_EXAMPLES : PROMPT_EXAMPLES;

  function resetConversationSelection() {
    setSelectedSessionId("");
    setMessages([]);
    setStreamingAnswer(null);
    setSelectedCitationKey("");
    setError("");
  }

  function handleScopeChange(nextScope) {
    setSelectedScope(nextScope);
    if (nextScope === "compare" && !selectedCompareRunId && selectableCompareRuns[0]) {
      setSelectedCompareRunId(String(selectableCompareRuns[0].id));
    }
    resetConversationSelection();
  }

  async function ensureSession() {
    if (selectedSessionId) {
      const ex = sessions.find(s => String(s.id) === selectedSessionId);
      if (selectedScope === "compare") {
        if (ex && String(ex.draft_id) === activeDraftId && String(ex.compare_run_id) === selectedCompareRunId) return ex;
      } else if (ex && String(ex.draft_id) === selectedDraftId && !ex.compare_run_id) {
        return ex;
      }
    }
    const payload = {
      draft_id: Number(activeDraftId),
      title: selectedScope === "compare" && selectedCompareRun
        ? `${selectedCompareRunLabel} Q&A`
        : `${contract?.title ?? "Contract"} Q&A`
    };
    if (selectedScope === "compare" && selectedCompareRun) {
      payload.compare_run_id = Number(selectedCompareRun.id);
    }
    const s = await createContractChatSession(token, contractId, payload);
    setSessions(c => [...c, s]); setSelectedSessionId(String(s.id)); setMessages([]); setStreamingAnswer(null);
    return s;
  }

  function buildStreamAns(attempt, query, draftId, replaceId = null) {
    return { id: replaceId ?? `attempt-${attempt.attempt.id}`, attempt_id: attempt.attempt.id, session_id: attempt.session_id, draft_id: draftId, source_query: query, role: "assistant", content: "", citations: [], provider_used: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), streaming: true, stopped: false, failed: false, status: "starting", status_label: getStreamStatusLabel("starting") };
  }

  function updateStream(attemptId, fn) {
    setStreamingAnswer(cur => {
      if (!cur || cur.attempt_id !== attemptId) return cur;
      const next = fn(cur);
      if (next?.stopped || next?.failed) writePartial(contractId, next);
      return next;
    });
  }

  async function ensureCompareRunLoaded(compareRunId) {
    if (!compareRunId) return null;
    const existing = compareRuns.find(r => String(r.id) === String(compareRunId));
    if (existing) return existing;
    const loaded = await getContractCompareRun(token, compareRunId);
    setCompareRuns(current => mergeCompareRuns(current, [loaded]));
    return loaded;
  }

  async function runAttempt({ session, normalizedQuery, draftId, supersedesAttemptId = null, replaceMessageId = null, appendUserMessage = true }) {
    const req = { query: normalizedQuery, draft_id: Number(draftId), client_request_id: createClientRequestId() };
    if (supersedesAttemptId) req.supersedes_attempt_id = supersedesAttemptId;
    const attempt = await createContractChatAttempt(token, contractId, session.id, req);
    const aid = attempt.attempt.id;
    const ac = new AbortController();
    if (appendUserMessage) setMessages(c => [...c, attempt.user_message]);
    clearPartial(contractId, attempt.session_id);
    setStreamingAnswer(buildStreamAns(attempt, normalizedQuery, Number(draftId), replaceMessageId));
    streamAbortRef.current = ac; activeAttemptRef.current = aid; stopRequestedRef.current = false;
    try {
      await streamChatAttempt({
        token, endpoint: attempt.stream_endpoint, signal: ac.signal,
        onEvent: ({ event, data }) => {
          if (data?.attempt_id && data.attempt_id !== aid) return;
          if (event === "status" || event === "sources_pending") {
            const sv = event === "sources_pending" ? "sources_pending" : data.status;
            updateStream(aid, c => ({ ...c, status: sv, status_label: getStreamStatusLabel(sv) }));
          }
          if (event === "delta") updateStream(aid, c => ({ ...c, status: "answering", status_label: getStreamStatusLabel("answering"), content: `${c.content ?? ""}${data.content ?? ""}` }));
          if (event === "citations") updateStream(aid, c => ({ ...c, citations: data.citations ?? [] }));
          if (event === "cancelled") updateStream(aid, c => ({ ...c, streaming: false, stopped: true, status: "cancelled", status_label: getStreamStatusLabel("cancelled") }));
          if (event === "error") updateStream(aid, c => ({ ...c, streaming: false, failed: true, status: "error", status_label: getStreamStatusLabel("error") }));
          if (event === "done") {
            clearPartial(contractId, attempt.session_id);
            setMessages(c => [...c, data.assistant_message]);
            setStreamingAnswer(c => c?.attempt_id === aid ? null : c);
          }
        }
      });
    } catch (e) {
      if (stopRequestedRef.current || isAbortError(e)) {
        updateStream(aid, c => c && !c.stopped ? { ...c, streaming: false, stopped: true, status: "cancelled", status_label: getStreamStatusLabel("cancelled") } : c);
        return;
      }
      updateStream(aid, c => ({ ...c, streaming: false, failed: true, status: "error", status_label: getStreamStatusLabel("error") }));
      throw e;
    } finally {
      if (activeAttemptRef.current === aid) { streamAbortRef.current = null; activeAttemptRef.current = null; stopRequestedRef.current = false; }
    }
  }

  async function handleAsk(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) { setError("Please enter a contract question."); return; }
    if (selectedScope === "compare" && !selectedCompareRun) { setError("Choose a completed compare run first."); return; }
    if (selectedScope === "compare" && selectedCompareRunUnavailableMessage) { setError(selectedCompareRunUnavailableMessage); return; }
    if (!activeDraftId) { setError("Choose a parsed contract draft first."); return; }
    setIsSending(true); setIsStopping(false); setError(""); setStreamingAnswer(null);
    try {
      const session = await ensureSession();
      if (!isStreamingEnabled()) {
        const ex = await sendContractChatMessage(token, contractId, session.id, { query: q });
        clearPartial(contractId, session.id);
        setMessages(c => [...c, ex.user_message, ex.assistant_message]);
        setQuery(""); return;
      }
      await runAttempt({ session, normalizedQuery: q, draftId: activeDraftId });
      setQuery("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { logout(); return; }
      setError(e.message);
    } finally { setIsSending(false); }
  }

  async function handleStop() {
    if (!streamingAnswer?.streaming || !streamingAnswer.attempt_id || !streamingAnswer.session_id) return;
    const aid = streamingAnswer.attempt_id, sid = streamingAnswer.session_id;
    stopRequestedRef.current = true; streamAbortRef.current?.abort(); setIsStopping(true);
    updateStream(aid, c => ({ ...c, streaming: false, stopped: true, failed: false, status: "cancelled", status_label: getStreamStatusLabel("cancelled") }));
    try { await cancelContractChatAttempt(token, contractId, sid, aid); }
    catch (e) { if (e instanceof ApiError && e.status === 401) { logout(); return; } setError(e.message); }
    finally { setIsStopping(false); }
  }

  async function handleRetry(msg) {
    if (!msg?.source_query || !msg.session_id || !msg.draft_id || !msg.attempt_id) return;
    const session = sessions.find(s => s.id === msg.session_id) ?? { id: msg.session_id, draft_id: msg.draft_id };
    setIsSending(true); setIsStopping(false); setError("");
    try {
      const sessionCompareRun = session?.compare_run_id ? await ensureCompareRunLoaded(session.compare_run_id) : null;
      const unavailableMessage = compareRunUnavailableMessage(sessionCompareRun);
      if (unavailableMessage) { setError(unavailableMessage); return; }
      await runAttempt({ session, normalizedQuery: msg.source_query, draftId: msg.draft_id, supersedesAttemptId: msg.attempt_id, replaceMessageId: msg.id, appendUserMessage: false });
    }
    catch (e) { if (e instanceof ApiError && e.status === 401) { logout(); return; } setError(e.message); }
    finally { setIsSending(false); }
  }

  async function handleSelectSession(sid) {
    setSelectedSessionId(String(sid)); setShowSessions(false);
    try {
      const s = sessions.find(s => s.id === sid);
      if (s) {
        setSelectedDraftId(String(s.draft_id));
        if (s.compare_run_id) {
          await ensureCompareRunLoaded(s.compare_run_id);
          setSelectedScope("compare");
          setSelectedCompareRunId(String(s.compare_run_id));
        } else {
          setSelectedScope("draft");
        }
      }
      const msgs = await listContractChatMessages(token, contractId, sid);
      setMessages(msgs); setStreamingAnswer(readPartial(contractId, sid)); setError("");
    } catch (e) { if (e instanceof ApiError && e.status === 401) { logout(); return; } setError(e.message); }
  }

  function handleNewSession() { resetConversationSelection(); setShowSessions(false); }

  const displayed = streamingAnswer ? [...messages, streamingAnswer] : messages;
  const hasStream = Boolean(streamingAnswer?.streaming);
  const assistantMsgs = displayed.filter(m => m.role === "assistant");
  const retryable = [...assistantMsgs].reverse().find(m => m.stopped || m.failed);
  const activeSession = sessions.find(s => String(s.id) === selectedSessionId) ?? null;
  const citationEvidence = useMemo(() => displayed.flatMap(m => m.role === "assistant" && Array.isArray(m.citations) ? m.citations.map(c => ({ ...c, key: `${m.id}-${c.compare_run_id ?? ""}-${c.change_item_id ?? ""}-${c.source_label ?? ""}-${c.block_id}-${c.block_key ?? ""}`, answer_id: m.id })) : []), [displayed]);
  const selectedCitation = citationEvidence.find(c => c.key === selectedCitationKey) ?? citationEvidence[0] ?? null;

  const streamStatusColor = { starting: "#848E9C", grounding: "#0EA5E9", answering: "#F0B90B", sources_pending: "#8B5CF6", cancelled: "#848E9C", error: "#F6465D" };
  const curCol = streamStatusColor[streamingAnswer?.status] ?? "#F0B90B";

  return (
    <div style={{ display: "flex", overflow: "hidden", width: "100%", height: "calc(100vh - 64px)", background: "#F5F5F5", color: "#1E2026", fontFamily: "Inter,sans-serif", position: "relative" }}>

      {/* ── Styles ─────────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');
        @keyframes ccSpin  { to { transform:rotate(360deg); } }
        @keyframes ccFade  { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} }
        @keyframes ccBlink { 0%,100%{opacity:1}50%{opacity:0} }
        @keyframes ccSlide { from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:translateX(0)} }
        @keyframes ccPulse { 0%,100%{opacity:1}50%{opacity:.5} }
        .cc-fade { animation:ccFade 200ms ease-out both; }
        .cc-slide { animation:ccSlide 200ms ease-out both; }
        .cc-card { background:#fff; border:1px solid #E6E8EA; border-radius:10px; }
        .cc-user-bubble { background:#FFF8E6; color:#1E2026; border:1px solid #F0B90B44; border-radius:18px 18px 4px 18px; padding:10px 16px; font-size:14px; line-height:1.65; max-width:520px; word-break:break-word; font-weight:500; }
        .cc-ai-bubble { background:#fff; border:1px solid #E6E8EA; border-radius:4px 18px 18px 18px; padding:14px 18px; font-size:14px; line-height:1.75; max-width:640px; word-break:break-word; box-shadow:0 1px 4px rgba(0,0,0,.06); }
        .cc-citation-chip { display:inline-flex; align-items:center; gap:3px; padding:1px 7px; border-radius:5px; border:1px solid #E6E8EA; background:#F4F5F7; font-size:11px; font-weight:700; color:#474D57; cursor:pointer; transition:all 120ms; margin:2px; }
        .cc-citation-chip:hover { border-color:#F0B90B88; background:#FFFDF0; color:#B07D0A; }
        .cc-citation-chip.active { border-color:#F0B90B; background:#FFF8E6; color:#B07D0A; }
        .cc-evidence-card { border:1px solid #E6E8EA; border-radius:8px; padding:12px; cursor:pointer; transition:all 150ms; background:#fff; }
        .cc-evidence-card:hover { border-color:#F0B90B88; background:#FFFDF0; }
        .cc-evidence-card.selected { border-color:#F0B90B; background:#FFF8E6; box-shadow:0 0 0 3px rgba(240,185,11,0.12); }
        .cc-session-btn { display:flex; align-items:flex-start; gap:8px; padding:8px 10px; border-radius:7px; border:none; background:transparent; cursor:pointer; transition:all 120ms; width:100%; text-align:left; }
        .cc-session-btn:hover { background:#F4F5F7; }
        .cc-session-btn.active { background:#FFF8E6; }
        .cc-prompt-pill { display:inline-flex; align-items:center; gap:5px; padding:7px 14px; border-radius:20px; border:1px solid #E6E8EA; background:#fff; font-size:12px; color:#474D57; cursor:pointer; transition:all 150ms; }
        .cc-prompt-pill:hover { border-color:#F0B90B88; background:#FFFDF0; color:#B07D0A; transform:translateY(-1px); }
        .cc-input-box { display:flex; align-items:center; gap:8px; border-radius:14px; border:1px solid #E6E8EA; background:#fff; padding:8px 10px 8px 14px; transition:border-color 150ms; box-shadow:0 2px 8px rgba(0,0,0,.06); }
        .cc-input-box:focus-within { border-color:#F0B90B; box-shadow:0 0 0 3px rgba(240,185,11,0.12); }
        .cc-textarea { flex:1; resize:none; border:none; background:transparent; font-size:14px; color:#1E2026; line-height:1.5; outline:none; max-height:128px; font-family:Inter,sans-serif; padding:0; margin:0; display:block; }
        .cc-textarea::placeholder { color:#C0C6CF; }
        .cc-send-btn { width:36px; height:36px; border-radius:10px; border:none; background:#F0B90B; color:#1E2026; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 150ms; flex-shrink:0; }
        .cc-send-btn:hover:not(:disabled) { background:#FFD000; transform:scale(1.05); }
        .cc-send-btn:disabled { opacity:.4; cursor:not-allowed; }
        .cc-stream-pill { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
        .cc-cursor { display:inline-block; width:2px; height:15px; background:#F0B90B; border-radius:1px; margin-left:2px; vertical-align:middle; animation:ccBlink 0.9s step-end infinite; }
      `}</style>

      {/* ── LEFT SESSION PANEL ───────────────────────────────────── */}
      <aside aria-label="Chat sessions" style={{ width: "256px", flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid #E6E8EA", background: "#fff", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ flexShrink: 0, padding: "12px 14px", borderBottom: "1px solid #E6E8EA", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <MessageSquare size={13} style={{ color: "#848E9C" }} />
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#1E2026" }}>Sessions</span>
            <span style={{ fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "20px", background: "#F4F5F7", color: "#848E9C" }}>{sessions.length}</span>
          </div>
          <button type="button" aria-label="New session" disabled={isSending || !activeDraftId} onClick={handleNewSession}
            style={{ width: "26px", height: "26px", borderRadius: "6px", border: "1px solid #E6E8EA", background: "#F4F5F7", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 120ms" }}>
            <Plus size={13} style={{ color: "#474D57" }} />
          </button>
        </div>

        {/* Scope selector */}
        <div style={{ flexShrink: 0, padding: "10px 12px", borderBottom: "1px solid #E6E8EA" }}>
          <div style={{ fontSize: "9px", fontWeight: 700, color: "#848E9C", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "5px", display: "flex", alignItems: "center", gap: "4px" }}>
            <BookOpen size={9} /> Question Scope
          </div>
          <div role="group" aria-label="Question scope" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", marginBottom: "8px" }}>
            <button type="button" aria-pressed={selectedScope === "draft"} disabled={isSending || hasStream}
              onClick={() => handleScopeChange("draft")}
              style={{ padding: "5px 6px", borderRadius: "7px", border: selectedScope === "draft" ? "1px solid #F0B90B" : "1px solid #E6E8EA", background: selectedScope === "draft" ? "#FFF8E6" : "#F4F5F7", color: "#1E2026", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
              Current Draft
            </button>
            <button type="button" aria-pressed={selectedScope === "compare"} disabled={isSending || hasStream || selectableCompareRuns.length === 0}
              onClick={() => handleScopeChange("compare")}
              style={{ padding: "5px 6px", borderRadius: "7px", border: selectedScope === "compare" ? "1px solid #F0B90B" : "1px solid #E6E8EA", background: selectedScope === "compare" ? "#FFF8E6" : "#F4F5F7", color: selectableCompareRuns.length ? "#1E2026" : "#848E9C", fontSize: "11px", fontWeight: 700, cursor: selectableCompareRuns.length ? "pointer" : "not-allowed" }}>
              Compare Changes
            </button>
          </div>
          <div style={{ position: "relative" }}>
            {selectedScope === "compare" ? (
              <select
                aria-label="Compare run"
                disabled={isSending || hasStream || selectableCompareRuns.length === 0}
                value={selectedCompareRunId}
                onChange={e => { setSelectedCompareRunId(e.target.value); resetConversationSelection(); }}
                style={{ width: "100%", padding: "5px 22px 5px 8px", borderRadius: "7px", border: "1px solid #E6E8EA", background: "#F4F5F7", color: "#1E2026", fontSize: "12px", fontWeight: 600, outline: "none", appearance: "none", cursor: "pointer" }}>
                <option value="">Choose compare run</option>
                {selectableCompareRuns.map(r => <option key={r.id} value={String(r.id)}>{compareRunLabels.get(String(r.id)) ?? compareRunLabel(r)}</option>)}
              </select>
            ) : (
              <select
                aria-label="Parsed draft"
                disabled={isSending || hasStream}
                value={selectedDraftId}
                onChange={e => { setSelectedDraftId(e.target.value); resetConversationSelection(); }}
                style={{ width: "100%", padding: "5px 22px 5px 8px", borderRadius: "7px", border: "1px solid #E6E8EA", background: "#F4F5F7", color: "#1E2026", fontSize: "12px", fontWeight: 600, outline: "none", appearance: "none", cursor: "pointer" }}>
                <option value="">Choose draft</option>
                {parsedDrafts.map(d => <option key={d.id} value={String(d.id)}>{d.draft_label || d.version_label}</option>)}
              </select>
            )}
            <ChevronDown size={11} style={{ position: "absolute", right: "7px", top: "50%", transform: "translateY(-50%)", color: "#848E9C", pointerEvents: "none" }} />
          </div>
          {selectedScope === "compare" && (
            <p style={{ margin: "6px 0 0", fontSize: "10px", lineHeight: 1.4, color: selectedCompareRunUnavailableMessage ? "#C47A00" : "#848E9C" }}>
              {selectedCompareRunIsStale
                ? "This historical compare used an older parse snapshot. Run Compare again before asking new questions."
                : selectedCompareRunIsSuperseded
                  ? "This historical compare was replaced by a newer run. Use the latest Compare run for new questions."
                  : "Showing the latest fresh compare changes for each draft pair."}
            </p>
          )}
        </div>

        {/* Session list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {isLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "20px" }}>
              <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: "2px solid #E6E8EA", borderTopColor: "#F0B90B", animation: "ccSpin .8s linear infinite" }} />
            </div>
          ) : sessions.length ? sessions.map(s => {
            const isActive = String(s.id) === selectedSessionId;
            return (
              <button key={s.id} type="button" className={`cc-session-btn${isActive ? " active" : ""}`}
                disabled={isSending || hasStream}
                onClick={() => void handleSelectSession(s.id)}>
                <div style={{ width: "28px", height: "28px", borderRadius: "7px", background: isActive ? "#F0B90B22" : "#F4F5F7", border: `1px solid ${isActive ? "#F0B90B44" : "#E6E8EA"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <MessageSquare size={13} style={{ color: isActive ? "#B07D0A" : "#848E9C" }} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#1E2026", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title || `Session ${s.id}`}</div>
                  <div style={{ fontSize: "10px", color: "#848E9C", marginTop: "1px" }}>
                    {streamingAnswer?.session_id === s.id ? (
                      <span style={{ color: "#F0B90B", fontWeight: 700 }}>{streamingAnswer.status_label}</span>
                    ) : "Ready"}
                  </div>
                </div>
              </button>
            );
          }) : (
            <div style={{ padding: "20px 12px", textAlign: "center" }}>
              <MessageSquare size={24} style={{ color: "#E6E8EA", margin: "0 auto 8px" }} />
              <p style={{ fontSize: "11px", color: "#C0C6CF" }}>No prior sessions.<br />Your first message creates a thread.</p>
            </div>
          )}
        </div>

        {/* Session memory note */}
        <div style={{ flexShrink: 0, borderTop: "1px solid #E6E8EA", padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "4px" }}>
            <History size={11} style={{ color: "#848E9C" }} />
            <span style={{ fontSize: "10px", fontWeight: 700, color: "#848E9C", textTransform: "uppercase", letterSpacing: ".06em" }}>Session memory</span>
          </div>
          <p style={{ fontSize: "10px", color: "#C0C6CF", lineHeight: 1.6 }}>Follow-up questions use session context. Grounded answers still cite source evidence.</p>
        </div>
      </aside>

      {/* ── MAIN CHAT ────────────────────────────────────────────── */}
      <main aria-label="Contract conversation" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Top bar */}
        <div style={{ flexShrink: 0, height: "52px", borderBottom: "1px solid #E6E8EA", background: "#fff", display: "flex", alignItems: "center", padding: "0 20px", gap: "10px", zIndex: 10 }}>
          <Link to={`/contracts/${contractId}`}
            aria-label="Back to contract"
            style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 12px", borderRadius: "7px", border: "1px solid #E6E8EA", background: "#fff", color: "#474D57", fontSize: "12px", fontWeight: 700, textDecoration: "none", transition: "all 150ms", flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.background = "#F4F5F7"}
            onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
            <ArrowLeft size={13} /> Contract
          </Link>

          <div style={{ width: "1px", height: "20px", background: "#E6E8EA", flexShrink: 0 }} />

          {/* Title */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
            <Bot size={14} style={{ color: "#F0B90B", flexShrink: 0 }} />
            <h1 aria-label="Contract Chat" style={{ fontSize: "14px", fontWeight: 700, color: "#1E2026", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {contract?.title ?? "Contract Q&A"}
            </h1>
            {activeDraftId && (
              <span style={{ fontSize: "9px", fontWeight: 700, padding: "2px 7px", borderRadius: "4px", background: "#E8F7FD", color: "#1EAEDB", border: "1px solid #1EAEDB44", flexShrink: 1, maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedScope === "compare" ? `Compare: ${activeScopeLabel}` : activeScopeLabel}
              </span>
            )}
          </div>

          {/* Capability badges */}
          <div style={{ display: "flex", gap: "5px", flexShrink: 0 }}>
            {[["⚡", "Smart Search", "#FFF8E6", "#B07D0A"], ["🧠", "Memory", "#E8F7FD", "#1EAEDB"], ["📌", "Citations", "#EBF9F4", "#16714E"]].map(([ic, lbl, bg, col]) => (
              <span key={lbl} style={{ fontSize: "9px", fontWeight: 700, padding: "2px 7px", borderRadius: "4px", background: bg, color: col, border: `1px solid ${col}33` }}>{ic} {lbl}</span>
            ))}
          </div>

          <div style={{ width: "1px", height: "20px", background: "#E6E8EA", flexShrink: 0 }} />

          <div style={{ fontSize: "12px", color: "#848E9C", flexShrink: 0 }}>{user?.display_name ?? user?.email ?? "Reviewer"}</div>
        </div>

        {/* Error */}
        {error && <Toast message={error} type="error" onClose={() => setError("")} />}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 32px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {displayed.length === 0 ? (
            /* Empty State */
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "24px", textAlign: "center", minHeight: "400px" }}>
              <div style={{ position: "relative" }}>
                <div style={{ width: "64px", height: "64px", borderRadius: "18px", background: "#FFF8E6", border: "2px solid #F0B90B44", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Bot size={28} style={{ color: "#F0B90B" }} />
                </div>
                <div style={{ position: "absolute", bottom: "-4px", right: "-4px", width: "20px", height: "20px", borderRadius: "50%", background: "#2EBD85", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Sparkles size={10} style={{ color: "#fff" }} />
                </div>
              </div>
              <div>
                <p style={{ fontSize: "11px", fontWeight: 700, color: "#848E9C", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: "8px" }}>Ready to answer</p>
                <h2 style={{ fontSize: "26px", fontWeight: 800, color: "#1E2026", margin: "0 0 10px", letterSpacing: "-.02em" }}>
                  {selectedScope === "compare" ? "Ask about the comparison" : "Ask about this contract"}
                </h2>
                <p style={{ fontSize: "13px", color: "#848E9C", maxWidth: "400px", lineHeight: 1.7 }}>
                  {selectedScope === "compare"
                    ? "Ask questions about what changed between two versions of your contract."
                    : "AI searches through your contract to find verified answers with source references."}
                </p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px", maxWidth: "600px" }}>
                {promptExamples.map(ex => (
                  <button key={ex.text} type="button" className="cc-prompt-pill" onClick={() => setQuery(ex.text)}>
                    <span>{ex.icon}</span> {ex.text}
                  </button>
                ))}
              </div>
            </div>
          ) : displayed.map((msg, i) => {
            const isAI = msg.role === "assistant";
            return (
              <div key={msg.id || i} className="cc-fade" style={{ display: "flex", flexDirection: "column", alignItems: isAI ? "flex-start" : "flex-end", gap: "4px" }}>
                {/* Role label */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px", paddingLeft: isAI ? "4px" : "0", paddingRight: isAI ? "0" : "4px" }}>
                  {isAI ? (
                    <>
                      <div style={{ width: "22px", height: "22px", borderRadius: "6px", background: "linear-gradient(135deg,#FFF8E6,#FFFBE8)", border: "1px solid #F0B90B44", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Bot size={12} style={{ color: "#F0B90B" }} />
                      </div>
                      <span style={{ fontSize: "10px", fontWeight: 700, color: "#848E9C" }}>AI Assistant</span>
                      {/* Stream status pill */}
                      {msg.status_label && (
                        <span className="cc-stream-pill" style={{ background: `${curCol}18`, color: curCol, border: `1px solid ${curCol}44` }}>
                          {getStreamStatusIcon(msg.status)} {msg.status_label}
                          {msg.streaming && <span style={{ animation: "ccPulse 1s ease infinite" }}>…</span>}
                        </span>
                      )}
                      {!msg.streaming && msg.provider_used && (
                        <span style={{ fontSize: "9px", fontWeight: 600, padding: "1px 5px", borderRadius: "3px", background: "#F4F5F7", color: "#848E9C", border: "1px solid #E6E8EA" }}>
                          {providerBadgeLabel(msg)}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: "10px", fontWeight: 700, color: "#848E9C" }}>You</span>
                      <UserCircle size={14} style={{ color: "#848E9C" }} />
                    </>
                  )}
                </div>

                {/* Bubble */}
                {isAI ? (
                  <div className="cc-ai-bubble">
                    <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                      {msg.content || (msg.streaming ? "" : "—")}
                      {msg.streaming && <span className="cc-cursor" />}
                    </p>
                    {/* Citation chips */}
                    {Array.isArray(msg.citations) && msg.citations.length > 0 && (
                      <div style={{ marginTop: "10px", borderTop: "1px solid #F4F5F7", paddingTop: "10px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        <span style={{ fontSize: "9px", fontWeight: 700, color: "#C0C6CF", textTransform: "uppercase", letterSpacing: ".06em", marginRight: "4px", alignSelf: "center" }}>Sources</span>
                        {msg.citations.map((c, ci) => {
                          const k = `${msg.id}-${c.compare_run_id ?? ""}-${c.change_item_id ?? ""}-${c.source_label ?? ""}-${c.block_id}-${c.block_key ?? ""}`;
                          return (
                            <button key={k} type="button" className={`cc-citation-chip${selectedCitationKey === k ? " active" : ""}`}
                              onClick={() => setSelectedCitationKey(k)}>
                              <ScrollText size={10} /> [{ci + 1}] {citationTitle(c)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {/* Retry */}
                    {(msg.stopped || msg.failed) && (
                      <div style={{ marginTop: "8px", display: "flex", gap: "6px" }}>
                        <span data-testid={msg.failed ? "bubble-failed-badge" : "bubble-stopped-badge"} style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "4px", background: msg.failed ? "#FFF1F0" : "#F4F5F7", color: msg.failed ? "#C03050" : "#848E9C", fontWeight: 700 }}>
                          {msg.failed ? "Failed" : "Stopped"}
                        </span>
                        {msg === retryable && (
                          <button type="button" disabled={isSending}
                            style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 700, color: "#1EAEDB", background: "none", border: "none", cursor: "pointer", padding: "0" }}
                            onClick={() => void handleRetry(msg)}>
                            <RotateCcw size={11} /> Retry answer
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="cc-user-bubble">{msg.content}</div>
                )}
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {/* Input area */}
        <div style={{ flexShrink: 0, padding: "12px 32px 16px", borderTop: "1px solid #E6E8EA", background: "#fff" }}>
          {/* Centered constraint wrapper */}
          <div style={{ maxWidth: "760px", margin: "0 auto" }}>
            <form onSubmit={hasStream ? (e) => { e.preventDefault(); void handleStop(); } : handleAsk}>
              <div className="cc-input-box">
                <textarea id="contract-chat-query" className="cc-textarea" rows={1}
                  aria-label="Ask about this contract"
                  placeholder={hasStream ? "AI is answering…" : "Ask about this contract…"}
                  value={query} onChange={e => setQuery(e.target.value)}
                  disabled={hasStream}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !hasStream) { e.preventDefault(); handleAsk(e); } }}
                />
                {/* Send ↔ Stop — same Binance amber button, icon swaps */}
                <button type="submit"
                  className="cc-send-btn"
                  aria-label={hasStream ? "Stop" : "Send message"}
                  disabled={(!hasStream && (isSending || !activeDraftId)) || (hasStream && isStopping)}
                  title={hasStream ? "Stop generating" : "Send"}
                  onClick={hasStream ? (e) => { e.preventDefault(); void handleStop(); } : undefined}
                  style={{ background: hasStream ? "#E8A900" : undefined }}>
                  {hasStream
                    ? (isStopping
                      ? <div style={{ width: "13px", height: "13px", borderRadius: "50%", border: "2px solid rgba(30,32,38,.25)", borderTopColor: "#1E2026", animation: "ccSpin .8s linear infinite" }} />
                      : <Square size={14} fill="#1E2026" strokeWidth={0} />)
                    : (isSending
                      ? <div style={{ width: "14px", height: "14px", borderRadius: "50%", border: "2px solid rgba(30,32,38,.3)", borderTopColor: "#1E2026", animation: "ccSpin .8s linear infinite" }} />
                      : <Send size={15} />)}
                </button>
              </div>
            </form>
            {/* Regenerate + disclaimer */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginTop: "6px" }}>
              {retryable && !hasStream && (
                <button type="button" aria-label="Regenerate answer" disabled={isSending} onClick={() => void handleRetry(retryable)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "10px", fontWeight: 700, color: "#848E9C", background: "none", border: "none", cursor: "pointer", padding: 0, transition: "color 150ms" }}
                  onMouseEnter={e => e.currentTarget.style.color = "#1E2026"}
                  onMouseLeave={e => e.currentTarget.style.color = "#848E9C"}>
                  <RotateCcw size={10} /> Regenerate
                </button>
              )}
              <p style={{ fontSize: "10px", color: "#C0C6CF", margin: 0 }}>AI responses may contain inaccuracies. Verify critical terms against cited source evidence.</p>
            </div>
          </div>
        </div>
      </main>

      {/* ── RIGHT EVIDENCE PANEL ─────────────────────────────────── */}
      <aside aria-label="Source evidence" style={{ width: "300px", flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid #E6E8EA", background: "#fff", overflow: "hidden" }}>
        <div style={{ flexShrink: 0, padding: "10px 14px", borderBottom: "1px solid #E6E8EA", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <ScrollText size={13} style={{ color: "#848E9C" }} />
            <h2 style={{ fontSize: "11px", fontWeight: 700, color: "#1E2026", margin: 0 }}>Source Evidence</h2>
          </div>
          {citationEvidence.length > 0 && (
            <span style={{ fontSize: "10px", fontWeight: 700, padding: "1px 7px", borderRadius: "20px", background: "#F4F5F7", color: "#848E9C" }}>{citationEvidence.length}</span>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "10px" }}>
          {citationEvidence.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {citationEvidence.map((c, i) => {
                const isSel = selectedCitation?.key === c.key;
                return (
                  <button key={c.key} type="button" className={`cc-evidence-card${isSel ? " selected" : ""}`}
                    aria-label={`Inspect citation ${citationTitle(c)}`}
                    onClick={() => setSelectedCitationKey(c.key)}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "6px" }}>
                      <span style={{ flexShrink: 0, width: "20px", height: "20px", borderRadius: "5px", background: isSel ? "#F0B90B" : "#1E2026", color: isSel ? "#1E2026" : "#fff", fontSize: "9px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "#1E2026", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{citationTitle(c)}</div>
                        <div style={{ fontSize: "10px", color: "#848E9C" }}>{citationSurface(c)}</div>
                      </div>
                    </div>
                    <div style={{ fontFamily: "JetBrains Mono,monospace", fontSize: "10px", lineHeight: 1.7, color: "#474D57", background: "#F4F5F7", borderRadius: "6px", padding: "8px", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: "80px", overflowY: "auto" }}>
                      {citationContent(c) || <span style={{ color: "#C0C6CF" }}>No content preview.</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px", height: "100%", minHeight: "200px", textAlign: "center", padding: "20px" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#F4F5F7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ShieldCheck size={20} style={{ color: "#C0C6CF" }} />
              </div>
              <div>
                <p style={{ fontSize: "11px", fontWeight: 700, color: "#1E2026", marginBottom: "4px" }}>Evidence Policy</p>
                <p style={{ fontSize: "10px", color: "#C0C6CF", lineHeight: 1.6 }}>Every answer includes references to the original contract text. Conversation-based answers don't need document references.</p>
              </div>
            </div>
          )}
        </div>

        {/* Contract footer */}
        <div style={{ flexShrink: 0, borderTop: "1px solid #E6E8EA", padding: "10px 14px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#1E2026", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "2px" }}>
            {contract?.title ?? "Loading…"}
          </div>
          <div style={{ fontSize: "10px", color: "#848E9C", marginBottom: "8px" }}>
            {selectedScope === "compare" && selectedCompareRun
              ? `${selectedCompareRunLabel} / compare truth`
              : selectedDraft ? `${selectedDraft.version_label} / ${formatDateTime(selectedDraft.uploaded_at)}` : "Choose a parsed draft to begin."}
          </div>
          <Link to={`/contracts/${contractId}`}
            style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 700, color: "#1EAEDB", textDecoration: "none" }}>
            <FileText size={11} /> Open contract workspace
          </Link>
        </div>
      </aside>
    </div >
  );
}
