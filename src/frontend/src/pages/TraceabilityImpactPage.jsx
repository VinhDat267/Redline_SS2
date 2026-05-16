import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Database,
  FileCode,
  FileDiff,
  GitCommit,
  Link as LinkIcon,
  TestTubeDiagonal,
  Trash2,
  Sparkles,
  ChevronRight
} from "lucide-react";
import { diffWords } from "diff";

import { useAuth } from "../auth/AuthContext";
import {
  ApiError,
  createRequirementLink,
  createRequirementTestCaseMapping,
  deleteRequirementLink,
  deleteRequirementTestCaseMapping,
  getChangeItem,
  getCompareRun,
  listCompareRunChangeItems,
  listProjectRequirements,
  listProjectTestCases
} from "../lib/api";
import {
  buildChangeHeadline,
  buildCompareRunLabel,
  buildCompareRunPath,
  formatCompareRunCode,
  formatReviewStatus,
  resolveSelectedChangeId
} from "../lib/compareWorkspace";

export function TraceabilityImpactPage() {
  const { logout, token } = useAuth();
  const { compareRunId } = useParams();
  const [searchParams] = useSearchParams();
  const [compareRun, setCompareRun] = useState(null);
  const [changeItem, setChangeItem] = useState(null);
  const [projectRequirements, setProjectRequirements] = useState([]);
  const [projectTestCases, setProjectTestCases] = useState([]);
  const [selectedReqId, setSelectedReqId] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState(null);
  const [selectedMappingReqId, setSelectedMappingReqId] = useState("");
  const [selectedMappingTcId, setSelectedMappingTcId] = useState("");
  const [isMappingCreating, setIsMappingCreating] = useState(false);
  const [mappingDeletingKey, setMappingDeletingKey] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isCurrent = true;
    async function loadImpactWorkspace() {
      setIsLoading(true); setError("");
      try {
        const [crPayload, queuePayload] = await Promise.all([
          getCompareRun(token, compareRunId),
          listCompareRunChangeItems(token, compareRunId)
        ]);
        const selectedChangeId = resolveSelectedChangeId(crPayload, queuePayload, searchParams.get("change"));
        const ciPayload = selectedChangeId ? await getChangeItem(token, selectedChangeId) : null;
        const projectId = crPayload?.document?.project_id;
        const [reqs, tcs] = projectId
          ? await Promise.all([listProjectRequirements(token, projectId), listProjectTestCases(token, projectId)])
          : [[], []];
        if (!isCurrent) return;
        setCompareRun(crPayload); setChangeItem(ciPayload);
        setProjectRequirements(reqs); setProjectTestCases(tcs);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) { logout(); return; }
        if (isCurrent) setError(e.message);
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }
    void loadImpactWorkspace();
    return () => { isCurrent = false; };
  }, [compareRunId, logout, searchParams, token]);

  const handleLinkRequirement = async () => {
    if (!selectedReqId || !changeItem) return;
    setIsLinking(true); setError("");
    try {
      const updated = await createRequirementLink(token, changeItem.id, selectedReqId);
      setChangeItem(updated); setSelectedReqId("");
    } catch (e) { setError(e instanceof ApiError ? e.message : "Failed to link"); }
    finally { setIsLinking(false); }
  };

  const handleUnlinkRequirement = async (reqId) => {
    if (!changeItem) return;
    setUnlinkingId(reqId); setError("");
    try {
      const updated = await deleteRequirementLink(token, changeItem.id, reqId);
      setChangeItem(updated);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Failed to unlink"); }
    finally { setUnlinkingId(null); }
  };

  const handleCreateMapping = async () => {
    if (!selectedMappingReqId || !selectedMappingTcId) return;
    setIsMappingCreating(true); setError("");
    try {
      await createRequirementTestCaseMapping(token, selectedMappingReqId, selectedMappingTcId);
      if (changeItem) { const r = await getChangeItem(token, changeItem.id); setChangeItem(r); }
      setSelectedMappingTcId("");
    } catch (e) { setError(e instanceof ApiError ? e.message : "Failed to create mapping"); }
    finally { setIsMappingCreating(false); }
  };

  const handleDeleteMapping = async (reqId, tcId) => {
    const key = `${reqId}-${tcId}`; setMappingDeletingKey(key); setError("");
    try {
      await deleteRequirementTestCaseMapping(token, reqId, tcId);
      if (changeItem) { const r = await getChangeItem(token, changeItem.id); setChangeItem(r); }
    } catch (e) { setError(e instanceof ApiError ? e.message : "Failed to delete"); }
    finally { setMappingDeletingKey(null); }
  };

  const comparePath = buildCompareRunPath(compareRunId, "", changeItem?.id);
  const summaryPath = buildCompareRunPath(compareRunId, "/summary", changeItem?.id);
  const linkedReqs = (changeItem?.linked_requirements ?? []);
  const linkedReqIds = linkedReqs.map(r => r.requirement_id);
  const availableReqs = projectRequirements.filter(r => !linkedReqIds.includes(r.id));
  const selectedRequirement = linkedReqs.find(r => String(r.requirement_id) === selectedMappingReqId);
  const selectedRequirementMappedTestIds = new Set((selectedRequirement?.mapped_test_cases ?? []).map(tc => tc.test_case_id));
  const linkedRequirementCount = linkedReqs.length;
  const impactedTestCount = changeItem?.impacted_tests?.length ?? 0;

  /* Word-level diff for mini context panel */
  const diffParts = useMemo(() => {
    const old = changeItem?.old_content ?? "";
    const nw = changeItem?.new_content ?? "";
    if (!old && !nw) return [];
    return diffWords(old, nw);
  }, [changeItem?.id, changeItem?.old_content, changeItem?.new_content]);

  const CT_CFG = {
    added: ["#EBF9F4", "#2EBD85", "#16714E", "+"],
    removed: ["#FFF1F0", "#F6465D", "#C03050", "−"],
    modified: ["#FFF8E6", "#F0B90B", "#B07D0A", "~"],
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", width: "100%", height: "calc(100vh - 64px)", background: "#F6F7F9", color: "#1E2026", fontFamily: "Inter, sans-serif", position: "relative" }}>

      {/* ── Global Styles ─────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');
        @keyframes tiSpin { to { transform:rotate(360deg); } }
        @keyframes tiFade { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .ti-fade { animation: tiFade 220ms ease-out both; }
        .ti-card { background:#fff; border:1px solid #E6E8EA; border-radius:10px; }
        .ti-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:#848E9C; }
        .ti-req-row { display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:7px; border:1px solid #E6E8EA; background:#fff; transition:all 120ms; }
        .ti-req-row:hover { border-color:#F0B90B88; background:#FFFDF0; }
        .ti-tc-row { display:flex; align-items:center; justify-content:space-between; padding:6px 8px; border-radius:6px; border:1px solid #E6E8EA; background:#fff; }
        .ti-del-btn { opacity:0; padding:3px; border-radius:4px; border:none; background:transparent; cursor:pointer; color:#848E9C; transition:all 120ms; }
        .ti-req-row:hover .ti-del-btn, .ti-tc-row:hover .ti-del-btn { opacity:1; }
        .ti-del-btn:hover { color:#F6465D; background:rgba(246,70,93,0.1); }
        .ti-chain-arrow { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; color:#C0C6CF; flex-shrink:0; }
        .ti-node { flex:1; display:flex; flex-direction:column; min-height:0; }
        .ti-select { width:100%; padding:6px 10px; border-radius:7px; border:1px solid #E6E8EA; background:#F4F5F7; color:#1E2026; font-size:12px; outline:none; transition:border-color 150ms; }
        .ti-select:focus { border-color:#F0B90B; }
        .ti-btn-primary { display:flex; align-items:center; justify-content:center; gap:5px; padding:7px 14px; border-radius:7px; background:#F0B90B; color:#1E2026; border:none; font-size:12px; font-weight:700; cursor:pointer; transition:all 150ms; }
        .ti-btn-primary:hover:not(:disabled) { background:#FFD000; transform:translateY(-1px); }
        .ti-btn-primary:disabled { opacity:0.4; cursor:not-allowed; }
        .ti-diff-old mark { background:rgba(246,70,93,0.15); color:#A82045; text-decoration:line-through; text-decoration-color:#F6465D; border-radius:3px; padding:0 2px; font-weight:600; }
        .ti-diff-new mark { background:rgba(46,189,133,0.18); color:#15643E; border-radius:3px; padding:0 2px; font-weight:600; }
      `}</style>

      {/* ── TOP BAR ───────────────────────────────────────────── */}
      <div role="region" aria-label="Impact command" style={{ flexShrink: 0, height: "52px", borderBottom: "1px solid #E6E8EA", background: "#fff", display: "flex", alignItems: "center", padding: "0 20px", gap: "12px", zIndex: 10 }}>

        {/* Back */}
        <Link to={comparePath} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 12px", borderRadius: "7px", border: "1px solid #E6E8EA", background: "#fff", color: "#474D57", fontSize: "12px", fontWeight: 700, textDecoration: "none", transition: "all 150ms", flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.background = "#F4F5F7"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}>
          <ArrowLeft size={13} /> Back
        </Link>

        {/* Divider */}
        <div style={{ width: "1px", height: "20px", background: "#E6E8EA", flexShrink: 0 }} />

        {/* Title + badges */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px", minWidth: 0, overflow: "hidden" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, color: "#848E9C", textTransform: "uppercase", letterSpacing: ".06em", flexShrink: 0 }}>Traceability</span>
          <ChevronRight size={12} style={{ color: "#C0C6CF", flexShrink: 0 }} />
          {changeItem ? (
            <>
              <h1 style={{ fontSize: "14px", fontWeight: 700, color: "#1E2026", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {buildChangeHeadline(changeItem)}
              </h1>
              {(() => {
                const ct = changeItem.change_type || "modified";
                const [bg, , col] = CT_CFG[ct] || CT_CFG.modified;
                return <span style={{ fontSize: "9px", fontWeight: 800, padding: "2px 7px", borderRadius: "4px", background: bg, color: col, textTransform: "uppercase", letterSpacing: ".04em", flexShrink: 0 }}>{ct}</span>;
              })()}
              {compareRun && <span style={{ fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", background: "#F4F5F7", color: "#848E9C", border: "1px solid #E6E8EA", flexShrink: 0 }}>{formatCompareRunCode(compareRun.id)}</span>}
            </>
          ) : (
            <span style={{ fontSize: "13px", color: "#848E9C" }}>Impact Analysis</span>
          )}
        </div>

        {/* Metric pills */}
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          {[
            [linkedRequirementCount, "Obligations", "#F0B90B22", "#B07D0A", Database],
            [impactedTestCount, "Checks", "#0EA5E922", "#0369A1", GitCommit],
          ].map(([n, lbl, bg, col, Icon]) => (
            <div key={lbl} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 12px", borderRadius: "20px", background: bg, border: `1px solid ${col}44` }}>
              <Icon size={12} style={{ color: col }} />
              <span style={{ fontSize: "18px", fontWeight: 800, color: "#1E2026", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{n}</span>
              <span style={{ fontSize: "9px", fontWeight: 700, color: col, textTransform: "uppercase", letterSpacing: ".05em" }}>{lbl}</span>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ width: "1px", height: "20px", background: "#E6E8EA", flexShrink: 0 }} />

        {/* Export */}
        <Link to={summaryPath} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 14px", borderRadius: "7px", background: "#F0B90B", color: "#1E2026", fontSize: "12px", fontWeight: 700, textDecoration: "none", boxShadow: "0 2px 6px rgba(240,185,11,0.25)", transition: "all 150ms", flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(240,185,11,0.4)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 6px rgba(240,185,11,0.25)"; }}>
          <Sparkles size={12} /> Summary / Export
        </Link>
      </div>

      {/* ── ERROR BANNER ──────────────────────────────────────── */}
      {error && (
        <div style={{ flexShrink: 0, padding: "8px 20px", background: "#FFF1F0", borderBottom: "1px solid #F6465D33", fontSize: "12px", color: "#C03050" }}>
          ⚠ {error}
        </div>
      )}

      {/* ── MAIN 3-PANEL ─────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", padding: "16px", gap: "12px" }}>

        {/* LEFT — Diff Context ──────────────────────────────── */}
        <div className="ti-card" style={{ width: "300px", flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ flexShrink: 0, padding: "10px 14px", borderBottom: "1px solid #E6E8EA", display: "flex", alignItems: "center", gap: "7px" }}>
            <FileDiff size={14} style={{ color: "#848E9C" }} />
            <h2 style={{ fontSize: "11px", fontWeight: 700, color: "#1E2026", margin: 0 }}>Change Context</h2>
          </div>

          {isLoading ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: "20px", height: "20px", borderRadius: "50%", border: "2px solid #E6E8EA", borderTopColor: "#F0B90B", animation: "tiSpin 0.8s linear infinite" }} />
            </div>
          ) : changeItem ? (
            <>
              {/* Meta */}
              <div style={{ flexShrink: 0, padding: "10px 14px", borderBottom: "1px solid #E6E8EA", display: "flex", flexDirection: "column", gap: "8px" }}>
                {[
                  { icon: FileCode, label: "Section", text: changeItem.section_title || changeItem.surface_key },
                  { icon: Activity, label: "Status", text: formatReviewStatus(changeItem.review_status) },
                ].map(({ icon: Icon, label, text }) => (
                  <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: "7px" }}>
                    <Icon size={13} style={{ color: "#848E9C", marginTop: "1px", flexShrink: 0 }} />
                    <div>
                      <div className="ti-label">{label}</div>
                      <div style={{ fontSize: "12px", color: "#1E2026", fontWeight: 600, marginTop: "1px" }}>{text}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Mini Diff OLD */}
              <div style={{ flexShrink: 0, padding: "8px 12px", borderBottom: "1px solid #F6465D22", background: "#FFF5F5" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "5px" }}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#F6465D", flexShrink: 0, display: "block" }} />
                  <span className="ti-label" style={{ color: "#C03050" }}>Original · {compareRun?.source_version?.version_label ?? "v1"}</span>
                </div>
                <div className="ti-diff-old" style={{ fontFamily: "JetBrains Mono,monospace", fontSize: "11px", lineHeight: 1.7, color: "#2B2F36", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: "90px", overflowY: "auto" }}>
                  {diffParts.length === 0
                    ? <span style={{ color: "#C0C6CF", fontStyle: "italic" }}>No content</span>
                    : diffParts.filter(p => !p.added).map((part, i) =>
                      part.removed
                        ? <mark key={i}>{part.value}</mark>
                        : <span key={i}>{part.value}</span>
                    )}
                </div>
              </div>

              {/* Mini Diff NEW */}
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", background: "#F8FFFC" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "5px" }}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#2EBD85", flexShrink: 0, display: "block" }} />
                  <span className="ti-label" style={{ color: "#16714E" }}>Revised · {compareRun?.target_version?.version_label ?? "v2"}</span>
                </div>
                <div className="ti-diff-new" style={{ fontFamily: "JetBrains Mono,monospace", fontSize: "11px", lineHeight: 1.7, color: "#2B2F36", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {diffParts.length === 0
                    ? <span style={{ color: "#C0C6CF", fontStyle: "italic" }}>No content</span>
                    : diffParts.filter(p => !p.removed).map((part, i) =>
                      part.added
                        ? <mark key={i}>{part.value}</mark>
                        : <span key={i}>{part.value}</span>
                    )}
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", textAlign: "center" }}>
              <p style={{ fontSize: "12px", color: "#848E9C" }}>No change selected.</p>
            </div>
          )}
        </div>

        {/* CENTER — Impact Chain ────────────────────────────── */}
        <div className="ti-card" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {/* Header */}
          <div style={{ flexShrink: 0, padding: "10px 16px", borderBottom: "1px solid #E6E8EA", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <GitCommit size={14} style={{ color: "#848E9C" }} />
              <h2 style={{ fontSize: "11px", fontWeight: 700, color: "#1E2026", margin: 0 }}>Impact Chain</h2>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 9px", borderRadius: "20px", background: "#FFF8E6", color: "#B07D0A", border: "1px solid #F0B90B44" }}>{linkedRequirementCount} obligations</span>
              <ArrowRight size={12} style={{ color: "#C0C6CF" }} />
              <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 9px", borderRadius: "20px", background: "#EFF6FF", color: "#0369A1", border: "1px solid #0EA5E944" }}>{impactedTestCount} checks</span>
            </div>
          </div>

          {/* Chain content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", gap: "12px" }}>

            {/* Obligations column */}
            <div className="ti-node">
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                <Database size={13} style={{ color: "#F0B90B" }} />
                <span className="ti-label">Linked Obligations</span>
                <span style={{ marginLeft: "auto", fontSize: "10px", fontWeight: 700, background: "#FFF8E6", color: "#B07D0A", padding: "1px 7px", borderRadius: "20px", border: "1px solid #F0B90B44" }}>{linkedRequirementCount}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
                {linkedReqs.length ? linkedReqs.map(req => (
                  <div key={req.requirement_id} className="ti-req-row">
                    <Database size={12} style={{ color: "#F0B90B", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "#0369A1" }}>{req.requirement_code}</div>
                      <div style={{ fontSize: "11px", color: "#474D57", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{req.title}</div>
                      {req.mapped_test_cases?.length > 0 && (
                        <div style={{ marginTop: "3px", display: "flex", gap: "3px", flexWrap: "wrap" }}>
                          {req.mapped_test_cases.map(tc => (
                            <span key={tc.test_case_id} style={{ fontSize: "9px", fontWeight: 600, padding: "1px 5px", borderRadius: "4px", background: "#EFF6FF", color: "#0369A1", border: "1px solid #0EA5E922" }}>
                              {tc.test_case_code}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button type="button" className="ti-del-btn"
                      disabled={unlinkingId === req.requirement_id}
                      onClick={() => handleUnlinkRequirement(req.requirement_id)}
                      title="Unlink">
                      {unlinkingId === req.requirement_id
                        ? <div style={{ width: "11px", height: "11px", borderRadius: "50%", border: "2px solid #E6E8EA", borderTopColor: "#F6465D", animation: "tiSpin 0.8s linear infinite" }} />
                        : <Trash2 size={12} />}
                    </button>
                  </div>
                )) : (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", padding: "24px", border: "1px dashed #E6E8EA", borderRadius: "8px" }}>
                    <Database size={24} style={{ color: "#E6E8EA" }} />
                    <p style={{ fontSize: "11px", color: "#C0C6CF", textAlign: "center" }}>No obligations linked yet.<br />Use the console on the right →</p>
                  </div>
                )}
              </div>
            </div>

            {/* Arrow */}
            <div className="ti-chain-arrow" style={{ width: "28px" }}>
              <div style={{ flex: 1, width: "2px", background: "linear-gradient(to bottom, #E6E8EA 0%, #F0B90B44 100%)", borderRadius: "1px" }} />
              <ArrowRight size={16} style={{ color: "#F0B90B" }} />
              <div style={{ flex: 1, width: "2px", background: "linear-gradient(to bottom, #F0B90B44 0%, #0EA5E944 100%)", borderRadius: "1px" }} />
              <ArrowRight size={16} style={{ color: "#0EA5E9" }} />
              <div style={{ flex: 1, width: "2px", background: "linear-gradient(to bottom, #0EA5E944 0%, #E6E8EA 100%)", borderRadius: "1px" }} />
            </div>

            {/* Test Checks column */}
            <div className="ti-node">
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                <TestTubeDiagonal size={13} style={{ color: "#0EA5E9" }} />
                <span className="ti-label">Impacted Checks</span>
                <span style={{ marginLeft: "auto", fontSize: "10px", fontWeight: 700, background: "#EFF6FF", color: "#0369A1", padding: "1px 7px", borderRadius: "20px", border: "1px solid #0EA5E944" }}>{impactedTestCount}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
                {changeItem?.impacted_tests?.length ? changeItem.impacted_tests.map(tc => (
                  <div key={tc.test_case_id} className="ti-req-row" style={{ cursor: "default" }}>
                    <TestTubeDiagonal size={12} style={{ color: "#0EA5E9", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "#0369A1" }}>{tc.test_case_code}</div>
                      <div style={{ fontSize: "11px", color: "#474D57", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tc.title}</div>
                    </div>
                    <span style={{ fontSize: "9px", fontWeight: 700, padding: "1px 6px", borderRadius: "4px", background: "#FFF8E6", color: "#B07D0A", border: "1px solid #F0B90B44", flexShrink: 0 }}>
                      {tc.priority || "–"}
                    </span>
                  </div>
                )) : (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", padding: "24px", border: "1px dashed #E6E8EA", borderRadius: "8px" }}>
                    <TestTubeDiagonal size={24} style={{ color: "#E6E8EA" }} />
                    <p style={{ fontSize: "11px", color: "#C0C6CF", textAlign: "center" }}>No impacted checks yet.<br />Link obligations first.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — Action Console ───────────────────────────── */}
        <div style={{ width: "296px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto" }}>

          {/* Link Obligation card */}
          <div className="ti-card" style={{ flexShrink: 0, padding: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "12px" }}>
              <LinkIcon size={13} style={{ color: "#F0B90B" }} />
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#1E2026" }}>Link Obligation</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div>
                <div className="ti-label" style={{ marginBottom: "4px", display: "flex", alignItems: "center", gap: "4px" }}><Database size={9} /> Obligation</div>
                <select className="ti-select" value={selectedReqId} onChange={e => setSelectedReqId(e.target.value)}>
                  <option value="">{isLoading ? "Loading…" : availableReqs.length ? "Select an Obligation" : "All obligations linked"}</option>
                  {availableReqs.map(req => (
                    <option key={req.id} value={req.id}>{req.requirement_code}: {req.title}</option>
                  ))}
                </select>
              </div>
              <button type="button" className="ti-btn-primary" style={{ width: "100%" }}
                disabled={!selectedReqId || isLinking || isLoading}
                onClick={handleLinkRequirement}>
                {isLinking
                  ? <><div style={{ width: "11px", height: "11px", borderRadius: "50%", border: "2px solid rgba(30,32,38,0.2)", borderTopColor: "#1E2026", animation: "tiSpin 0.8s linear infinite" }} /> Linking…</>
                  : <><LinkIcon size={13} /> Link Obligation</>}
              </button>
            </div>
          </div>

          {/* Mapping Console card */}
          <div className="ti-card" style={{ flexShrink: 0, padding: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "12px" }}>
              <GitCommit size={13} style={{ color: "#0EA5E9" }} />
              <h2 style={{ fontSize: "11px", fontWeight: 700, color: "#1E2026", margin: 0 }}>Mapping Console</h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div>
                <div className="ti-label" style={{ marginBottom: "4px", display: "flex", alignItems: "center", gap: "4px" }}><Database size={9} /> Linked Obligation</div>
                <select className="ti-select" value={selectedMappingReqId}
                  onChange={e => { setSelectedMappingReqId(e.target.value); setSelectedMappingTcId(""); }}>
                  <option value="">Select Obligation</option>
                  {linkedReqs.map(req => (
                    <option key={req.requirement_id} value={req.requirement_id}>{req.requirement_code}: {req.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="ti-label" style={{ marginBottom: "4px", display: "flex", alignItems: "center", gap: "4px" }}><TestTubeDiagonal size={9} /> Compliance Check</div>
                <select className="ti-select" value={selectedMappingTcId}
                  disabled={!selectedMappingReqId}
                  onChange={e => setSelectedMappingTcId(e.target.value)}>
                  <option value="">{selectedMappingReqId ? "Select a Check" : "Select obligation first"}</option>
                  {projectTestCases.map(tc => {
                    const mapped = selectedRequirementMappedTestIds.has(tc.id);
                    return <option key={tc.id} value={tc.id} disabled={mapped}>{tc.test_case_code}: {tc.title}{mapped ? " (Mapped)" : ""}</option>;
                  })}
                </select>
              </div>
              <button type="button" className="ti-btn-primary" style={{ width: "100%" }}
                disabled={!selectedMappingReqId || !selectedMappingTcId || isMappingCreating}
                onClick={handleCreateMapping}>
                {isMappingCreating
                  ? <><div style={{ width: "11px", height: "11px", borderRadius: "50%", border: "2px solid rgba(30,32,38,0.2)", borderTopColor: "#1E2026", animation: "tiSpin 0.8s linear infinite" }} /> Mapping…</>
                  : <><TestTubeDiagonal size={13} /> Create Mapping</>}
              </button>
            </div>
          </div>

          {/* Active Mappings card */}
          <div className="ti-card" style={{ flex: 1, minHeight: "100px", padding: "14px", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "12px", flexShrink: 0 }}>
              <Activity size={13} style={{ color: "#848E9C" }} />
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#1E2026" }}>Active Mappings</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {linkedReqs.length ? linkedReqs.map(req => {
                const reqTests = req.mapped_test_cases ?? [];
                return (
                  <div key={req.requirement_id} style={{ borderRadius: "7px", border: "1px solid #E6E8EA", overflow: "hidden" }}>
                    <div style={{ padding: "7px 10px", background: "#FFF8E6", borderBottom: reqTests.length ? "1px solid #F0B90B22" : "none", display: "flex", alignItems: "center", gap: "5px" }}>
                      <Database size={11} style={{ color: "#F0B90B", flexShrink: 0 }} />
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "#B07D0A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{req.requirement_code}</span>
                      <span style={{ fontSize: "10px", color: "#848E9C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{req.title}</span>
                      <span style={{ marginLeft: "auto", fontSize: "9px", fontWeight: 700, background: "#FFF8E6", color: "#B07D0A", flexShrink: 0 }}>{reqTests.length}</span>
                    </div>
                    {reqTests.length ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "6px 8px" }}>
                        {reqTests.map(tc => {
                          const key = `${req.requirement_id}-${tc.test_case_id}`;
                          return (
                            <div key={key} className="ti-tc-row">
                              <div style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0 }}>
                                <TestTubeDiagonal size={11} style={{ color: "#0EA5E9", flexShrink: 0 }} />
                                <span style={{ fontSize: "10px", fontWeight: 600, color: "#0369A1" }}>{tc.test_case_code}</span>
                                <span style={{ fontSize: "10px", color: "#474D57", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tc.title}</span>
                              </div>
                              <button type="button" className="ti-del-btn"
                                disabled={mappingDeletingKey === key}
                                onClick={() => handleDeleteMapping(req.requirement_id, tc.test_case_id)}>
                                {mappingDeletingKey === key
                                  ? <div style={{ width: "10px", height: "10px", borderRadius: "50%", border: "1.5px solid #E6E8EA", borderTopColor: "#F6465D", animation: "tiSpin 0.8s linear infinite" }} />
                                  : <Trash2 size={11} />}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={{ fontSize: "10px", color: "#C0C6CF", padding: "6px 10px" }}>No checks mapped.</p>
                    )}
                  </div>
                );
              }) : (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px", color: "#C0C6CF" }}>
                  <LinkIcon size={20} />
                  <p style={{ fontSize: "11px", textAlign: "center" }}>Link obligations first<br />to manage mappings.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
