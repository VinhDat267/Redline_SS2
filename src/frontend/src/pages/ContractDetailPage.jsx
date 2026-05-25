import { startTransition, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileSearch,
  FileText,
  GitCompareArrows,
  MessageSquare,
  Pencil,
  ScrollText,
  UploadCloud,
  X
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import {
  ApiError,
  createContractCompareRun,
  createContractDraft,
  getContract,
  listContractCompareRuns,
  listContractDrafts,
  updateContract
} from "../lib/api";
import { formatDateTime } from "../lib/formatters";
import { Toast } from "../components/Toast";
/* ─── Pure helper functions ─── */
function truncateLabel(label, maxLen = 40) {
  if (!label || label.length <= maxLen) return label ?? '';
  return label.slice(0, maxLen) + '…';
}
function hasParsedStatus(draft) {
  return ["parsed", "parsed_with_warnings"].includes(draft.parse_status?.toLowerCase());
}
function isCompareReadyDraft(draft) {
  return hasParsedStatus(draft) && Boolean(draft.active_parse_run_id);
}
function getDraftStatusTone(draft) {
  const parseStatus = draft.parse_status?.toLowerCase();
  if (parseStatus === "parsed") return "bg-[#E8F5E9] border border-[#A5D6A7] text-[#1B5E20]";
  if (parseStatus === "parsed_with_warnings") return "bg-[#FFF8E1] border border-[#FFE082] text-[#FF8F00]";
  return "bg-[#F5F5F5] border border-[#E6E8EA] text-[#848E9C]";
}
function getDraftQuality(draft) {
  const parseStatus = draft.parse_status?.toLowerCase();
  if (parseStatus === "parsed") return { label: "Pass", tone: "teal", icon: CheckCircle2 };
  if (parseStatus === "parsed_with_warnings") return { label: "Warn", tone: "amber", icon: AlertTriangle };
  if (parseStatus === "failed") return { label: "Blocked", tone: "error", icon: AlertTriangle };
  return { label: "Pending", tone: "slate", icon: FileText };
}
function getLatestWorkspaceTimestamp(contract, drafts) {
  const timestamps = [contract?.updated_at, ...drafts.map((d) => d.uploaded_at)].filter(Boolean);
  if (timestamps.length === 0) return "Not available";
  return formatDateTime(
    timestamps.reduce((a, b) => (new Date(b).getTime() > new Date(a).getTime() ? b : a))
  );
}
/* ─── Module-level components (prevent focus-loss on re-render) ─── */
function CdCard({ title, aside, children }) {
  return (
    <div className="bg-white border border-[#E6E8EA] overflow-hidden" style={{ borderRadius: "12px", boxShadow: "rgba(32, 32, 37, 0.05) 0px 3px 5px 0px" }}>
      {title && (
        <div className="px-5 py-4 border-b border-[#E6E8EA] flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-[#1E2026]">{title}</h3>
          {aside && (typeof aside === "string" ? <span className="text-[12px] font-semibold text-[#848E9C]">{aside}</span> : aside)}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
function CdFormInput({ label, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider">{label}</label>}
      <input
        aria-label={label}
        className="h-10 px-3 bg-[#F5F5F5] border border-[#E6E8EA] text-[14px] font-medium text-[#1E2026] placeholder-[#848E9C]"
        style={{ borderRadius: "8px", outline: "none", transition: "border-color 200ms ease" }}
        onFocus={e => { e.target.style.borderColor = "#000000"; }}
        onBlur={e => { e.target.style.borderColor = "#E6E8EA"; }}
        {...props}
      />
    </div>
  );
}
function CdFormTextarea({ label, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider">{label}</label>}
      <textarea
        aria-label={label}
        className="px-3 py-2.5 bg-[#F5F5F5] border border-[#E6E8EA] text-[14px] font-medium text-[#1E2026] placeholder-[#848E9C] min-h-[80px] resize-y"
        style={{ borderRadius: "8px", outline: "none", transition: "border-color 200ms ease", lineHeight: "1.50" }}
        onFocus={e => { e.target.style.borderColor = "#000000"; }}
        onBlur={e => { e.target.style.borderColor = "#E6E8EA"; }}
        {...props}
      />
    </div>
  );
}
function CdFormSelect({ label, children, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider">{label}</label>}
      <select
        aria-label={label}
        className="h-10 px-3 bg-[#F5F5F5] border border-[#E6E8EA] text-[14px] font-medium text-[#1E2026]"
        style={{ borderRadius: "8px", outline: "none", transition: "border-color 200ms ease" }}
        onFocus={e => { e.target.style.borderColor = "#000000"; }}
        onBlur={e => { e.target.style.borderColor = "#E6E8EA"; }}
        {...props}
      >{children}</select>
    </div>
  );
}
/* ─── Constants ─── */
const EMPTY_CONTRACT_FORM = { title: "", document_type: "", description: "" };
const SUPPORTED_DRAFT_FILE_RE = /\.(docx|pdf)$/i;
const SUPPORTED_DRAFT_FILE_ACCEPT = ".docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf";
const DRAFT_LABEL_MAX_LENGTH = 100;
const pillBtnCls = "flex items-center gap-2 bg-[#F0B90B] text-[#1E2026] px-5 py-2 font-semibold text-[14px] border-none cursor-pointer disabled:opacity-50";
const pillBtnStyle = { borderRadius: "50px", boxShadow: "rgb(153,153,153) 0px 2px 10px -3px", transition: "all 200ms ease" };
const formBtnPrimary = "flex items-center justify-center gap-1.5 bg-[#F0B90B] text-[#1E2026] px-5 py-2 font-semibold text-[14px] border-none cursor-pointer disabled:opacity-50";
const formBtnSecondary = "flex items-center justify-center gap-1.5 bg-white border border-[#E6E8EA] text-[#32313A] px-5 py-2 font-semibold text-[14px] cursor-pointer";
const formBtnStyle = { borderRadius: "6px", transition: "all 200ms ease" };
export function ContractDetailPage() {
  const { logout, token } = useAuth();
  const { contractId } = useParams();
  const navigate = useNavigate();
  const [contract, setContract] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [activeModal, setActiveModal] = useState(null);
  const [contractForm, setContractForm] = useState(EMPTY_CONTRACT_FORM);
  const [isSavingContract, setIsSavingContract] = useState(false);
  const [uploadDraftLabel, setUploadDraftLabel] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [sourceDraftId, setSourceDraftId] = useState("");
  const [targetDraftId, setTargetDraftId] = useState("");
  const [compareError, setCompareError] = useState("");
  const [isCreatingCompare, setIsCreatingCompare] = useState(false);
  const [recentDraftId, setRecentDraftId] = useState(null);
  const [existingCompareRuns, setExistingCompareRuns] = useState([]);
  const fileInputRef = useRef(null);
  useEffect(() => {
    let isCurrent = true;
    async function loadContractWorkspace() {
      setIsLoading(true);
      setError("");
      setExistingCompareRuns([]);
      try {
        const [contractPayload, draftPayload] = await Promise.all([
          getContract(token, contractId),
          listContractDrafts(token, contractId)
        ]);
        if (!isCurrent) return;
        setContract(contractPayload);
        setDrafts(draftPayload);
        setIsLoading(false);
        try {
          const compareRunsPayload = await listContractCompareRuns(token, contractId, { latestPerPair: true, freshOnly: true });
          if (isCurrent) {
            setExistingCompareRuns(compareRunsPayload);
          }
        } catch (compareRunsLoadError) {
          if (compareRunsLoadError instanceof ApiError && compareRunsLoadError.status === 401) { logout(); return; }
          if (isCurrent) {
            setExistingCompareRuns([]);
          }
        }
      } catch (loadError) {
        if (loadError instanceof ApiError && loadError.status === 401) { logout(); return; }
        if (isCurrent) setError(loadError.message);
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }
    void loadContractWorkspace();
    return () => { isCurrent = false; };
  }, [contractId, logout, token]);
  useEffect(() => {
    if (!contract) return;
    setContractForm({ title: contract.title, document_type: contract.document_type || "", description: contract.description || "" });
  }, [contract]);
  useEffect(() => {
    const readyDrafts = drafts.filter(isCompareReadyDraft);
    if (readyDrafts.length < 2) { setSourceDraftId(""); setTargetDraftId(""); return; }
    setSourceDraftId(v => (v && readyDrafts.some(d => String(d.id) === v)) ? v : String(readyDrafts[0].id));
    setTargetDraftId(v => (v && readyDrafts.some(d => String(d.id) === v)) ? v : String(readyDrafts[1]?.id ?? readyDrafts[0].id));
  }, [drafts]);
  async function reloadContract() {
    try { const p = await getContract(token, contractId); setContract(p); setError(""); return true; }
    catch (e) { if (e instanceof ApiError && e.status === 401) { logout(); return false; } setError(e.message); return false; }
  }
  async function reloadDrafts() {
    try { const p = await listContractDrafts(token, contractId); setDrafts(p); setError(""); return true; }
    catch (e) { if (e instanceof ApiError && e.status === 401) { logout(); return false; } setError(e.message); return false; }
  }
  function closeModal() {
    setActiveModal(null);
    setUploadError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
  async function handleContractSubmit(event) {
    event.preventDefault();
    const normalizedTitle = contractForm.title.trim();
    if (!normalizedTitle) { setError("Contract title is required."); return; }
    setIsSavingContract(true); setError(""); setFeedback("");
    try {
      await updateContract(token, contractId, { title: normalizedTitle, document_type: contractForm.document_type.trim() || null, description: contractForm.description.trim() || null });
      const refreshed = await reloadContract();
      if (!refreshed) return;
      setActiveModal(null);
      setFeedback("Contract metadata updated.");
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 401) { logout(); return; }
      setError(saveError.message);
    } finally { setIsSavingContract(false); }
  }
  async function handleUploadSubmit(event) {
    event.preventDefault(); setUploadError(""); setFeedback("");
    const normalizedLabel = uploadDraftLabel.trim();
    if (!normalizedLabel) { setUploadError("Draft label is required."); return; }
    if (normalizedLabel.length > DRAFT_LABEL_MAX_LENGTH) { setUploadError(`Draft label must be at most ${DRAFT_LABEL_MAX_LENGTH} characters (currently ${normalizedLabel.length}).`); return; }
    if (!uploadFile || !SUPPORTED_DRAFT_FILE_RE.test(uploadFile.name)) { setUploadError("Please choose a .docx or .pdf file."); return; }
    setIsUploading(true);
    try {
      const createdDraft = await createContractDraft(token, contractId, { draftLabel: normalizedLabel, notes: uploadNotes, file: uploadFile });
      const refreshed = await reloadDrafts();
      if (!refreshed) return;
      setUploadDraftLabel(""); setUploadNotes(""); setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setActiveModal(null);
      setRecentDraftId(createdDraft?.id ?? null);
      setFeedback("Contract draft uploaded.");
    } catch (uploadRequestError) {
      if (uploadRequestError instanceof ApiError && uploadRequestError.status === 401) { logout(); return; }
      setUploadError(uploadRequestError.message);
    } finally { setIsUploading(false); }
  }
  // Find existing fresh compare run for the currently selected pair
  const matchingCompareRun = existingCompareRuns.find(cr => {
    const srcId = cr.source_version?.id ?? cr.source_draft?.id;
    const tgtId = cr.target_version?.id ?? cr.target_draft?.id;
    return String(srcId) === sourceDraftId && String(tgtId) === targetDraftId;
  });
  async function handleCompareSubmit(event) {
    event.preventDefault(); setCompareError("");
    if (!sourceDraftId || !targetDraftId) { setCompareError("Choose both source and target drafts."); return; }
    if (sourceDraftId === targetDraftId) { setCompareError("Source and target drafts must be different."); return; }
    const readyDraftIds = new Set(drafts.filter(isCompareReadyDraft).map(d => String(d.id)));
    if (!readyDraftIds.has(sourceDraftId) || !readyDraftIds.has(targetDraftId)) { setCompareError("Selected drafts are not review-ready."); return; }
    // If a fresh compare run already exists for this pair, navigate to it
    if (matchingCompareRun) {
      startTransition(() => { navigate(`/compare-runs/${matchingCompareRun.id}`); });
      return;
    }
    setIsCreatingCompare(true);
    try {
      const compareRun = await createContractCompareRun(token, contractId, { source_draft_id: Number(sourceDraftId), target_draft_id: Number(targetDraftId) });
      startTransition(() => { navigate(`/compare-runs/${compareRun.id}`); });
    } catch (compareRequestError) {
      if (compareRequestError instanceof ApiError && compareRequestError.status === 401) { logout(); return; }
      setCompareError(compareRequestError.message);
    } finally { setIsCreatingCompare(false); }
  }
  const parsedDrafts = drafts.filter(hasParsedStatus);
  const compareReadyDrafts = drafts.filter(isCompareReadyDraft);
  const compareReady = compareReadyDrafts.length >= 2;
  const projectPath = contract ? `/projects/${contract.project_id}` : "/dashboard";
  const projectName = contract?.project_name || "Project";
  return (
    <>
      <main className="max-w-[1200px] mx-auto px-8 py-8">

        {/* Page header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-3">
              <Link to="/dashboard" className="text-[12px] font-semibold text-[#848E9C] no-underline uppercase tracking-wider" style={{ transition: "color 200ms" }}
                onMouseEnter={e => e.target.style.color = "#1E2026"} onMouseLeave={e => e.target.style.color = "#848E9C"}>
                My Projects
              </Link>
              <span className="text-[12px] text-[#E6E8EA]">/</span>
              <Link to={projectPath} className="text-[12px] font-semibold text-[#848E9C] no-underline uppercase tracking-wider" style={{ transition: "color 200ms" }}
                onMouseEnter={e => e.target.style.color = "#1E2026"} onMouseLeave={e => e.target.style.color = "#848E9C"}>
                {projectName}
              </Link>
              <span className="text-[12px] text-[#E6E8EA]">/</span>
              <span className="text-[12px] font-semibold text-[#1E2026] uppercase tracking-wider">{contract?.title ?? "Contract"}</span>
            </div>
            <h1 className="text-[26px] font-bold text-[#1E2026] mb-1" style={{ lineHeight: "1.2" }}>{contract?.title ?? "Contract Workspace"}</h1>
            {contract?.description && (
              <p className="text-[14px] font-medium text-[#848E9C] mt-1" style={{ lineHeight: "1.5" }}>{contract.description}</p>
            )}
          </div>
          {/* Header actions */}
          <div className="flex items-center gap-2 shrink-0 mt-1">
            <Link
              to={`/contracts/${contractId}/chat`}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E6E8EA] text-[#1E2026] no-underline font-semibold text-[13px]"
              style={{ borderRadius: "8px", transition: "all 200ms ease" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#1E2026"; e.currentTarget.style.boxShadow = "rgba(0,0,0,0.06) 0px 2px 8px"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#E6E8EA"; e.currentTarget.style.boxShadow = "none"; }}
            >
              <MessageSquare size={14} /> Contract Q&A
            </Link>
            <button
              className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E6E8EA] text-[#1E2026] font-semibold text-[13px] cursor-pointer"
              style={{ borderRadius: "8px", transition: "all 200ms ease" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#1E2026"; e.currentTarget.style.boxShadow = "rgba(0,0,0,0.06) 0px 2px 8px"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#E6E8EA"; e.currentTarget.style.boxShadow = "none"; }}
              onClick={() => setActiveModal("contract")}
              type="button"
            >
              <Pencil size={14} /> Edit Metadata
            </button>
          </div>
        </div>
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Contract Type", value: contract?.document_type || "General", icon: FileText },
            { label: "Total Drafts", value: String(drafts.length), icon: ScrollText },
            { label: "Compare Status", value: compareReady ? "Ready" : "Locked", icon: GitCompareArrows },
            { label: "Last Updated", value: getLatestWorkspaceTimestamp(contract, drafts), icon: Clock },
          ].map((s, i) => (
            <div key={i} className="bg-white border border-[#E6E8EA] p-4 flex items-center gap-3" style={{ borderRadius: "12px", boxShadow: "rgba(32, 32, 37, 0.05) 0px 3px 5px 0px" }}>
              <div className="w-9 h-9 flex items-center justify-center text-[#F0B90B] flex-shrink-0" style={{ borderRadius: "8px", background: "rgba(240, 185, 11, 0.1)" }}>
                <s.icon size={18} />
              </div>
              <div>
                <p className="text-[16px] font-bold text-[#1E2026] leading-none mb-0.5">{s.value}</p>
                <p className="text-[11px] font-semibold text-[#848E9C]">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
        {/* Draft History */}
        <CdCard
          title="Draft History"
          aside={
            <div className="flex items-center gap-3">
              {/* Parse + compare status badges */}
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider bg-[#E8F5E9] border border-[#A5D6A7] text-[#1B5E20]" style={{ borderRadius: "4px" }}>
                  {parsedDrafts.length}/{drafts.length} parsed
                </span>
                {compareReady ? (
                  <span className="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider bg-[#FFF8E1] border border-[#FFE082] text-[#FF8F00]" style={{ borderRadius: "4px" }}>Compare ready</span>
                ) : (
                  <span className="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider bg-[#F5F5F5] border border-[#E6E8EA] text-[#848E9C]" style={{ borderRadius: "4px" }}>Compare locked</span>
                )}
              </div>
              <button className={pillBtnCls} style={{ ...pillBtnStyle, padding: "6px 16px", fontSize: "13px" }} onClick={() => setActiveModal("upload")} type="button">
                <UploadCloud size={14} /> Upload Draft
              </button>
            </div>
          }
        >
          {isLoading ? (
            <div className="flex flex-col gap-2">
              <div className="w-full h-12 bg-[#F5F5F5] animate-pulse border border-[#E6E8EA]" style={{ borderRadius: "8px" }} />
              <div className="w-full h-12 bg-[#F5F5F5] animate-pulse border border-[#E6E8EA]" style={{ borderRadius: "8px" }} />
            </div>
          ) : drafts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "26%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "4%" }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-[#E6E8EA]">
                    {["VERSION", "FILE", "STATUS", "QUALITY", "UPLOADED", "NOTES", ""].map((h, i) => (
                      <th key={i} className="text-[11px] font-semibold text-[#848E9C] uppercase tracking-wider py-3 px-3 first:pl-0 last:pr-0">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {drafts.map(draft => {
                    const quality = getDraftQuality(draft);
                    const QualityIcon = quality.icon;
                    const qualityColor = quality.tone === "teal" ? "bg-[#E8F5E9] text-[#1B5E20] border-[#A5D6A7]" : quality.tone === "amber" ? "bg-[#FFF8E1] text-[#FF8F00] border-[#FFE082]" : quality.tone === "error" ? "bg-[#FEECEE] text-[#F6465D] border-[#F6465D]/30" : "bg-[#F5F5F5] text-[#848E9C] border-[#E6E8EA]";
                    return (
                      <tr key={draft.id} className="border-b border-[#E6E8EA] last:border-b-0" style={{ transition: "background 200ms ease" }} onMouseEnter={e => e.currentTarget.style.background = "#F5F5F5"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td className="py-3 px-3 first:pl-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-[#1E2026]" title={draft.version_label} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", maxWidth: "200px" }}>{draft.version_label}</span>
                            {recentDraftId === draft.id && <span className="px-1.5 py-0.5 bg-[rgba(240,185,11,0.1)] border border-[rgba(240,185,11,0.2)] text-[#F0B90B] text-[10px] uppercase font-bold tracking-wider flex-shrink-0" style={{ borderRadius: "4px" }}>New</span>}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-[12px] font-medium text-[#474D57]" title={draft.file_name} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px" }}>{draft.file_name}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 text-[11px] uppercase tracking-wider font-semibold ${getDraftStatusTone(draft)}`} style={{ borderRadius: "4px" }}>{draft.parse_status}</span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 border text-[11px] uppercase tracking-wider font-semibold ${qualityColor}`} style={{ borderRadius: "4px" }}>
                            <QualityIcon aria-hidden="true" size={12} /> {quality.label}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-[12px] font-medium text-[#1E2026] block">{formatDateTime(draft.uploaded_at)}</span>
                          <span className="text-[11px] text-[#848E9C]">{draft.uploaded_by_display_name}</span>
                        </td>
                        <td className="py-3 px-3 text-[12px] text-[#848E9C]" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{draft.notes || "—"}</td>
                        <td className="py-3 px-3 last:pr-0">
                          <button
                            aria-label={`Open Parser Workspace for ${draft.version_label}`}
                            className="p-1.5 text-[#848E9C] border-none bg-transparent cursor-pointer"
                            style={{ borderRadius: "6px", transition: "all 200ms ease" }}
                            onMouseEnter={e => { e.currentTarget.style.color = "#1E2026"; e.currentTarget.style.background = "#F5F5F5"; }}
                            onMouseLeave={e => { e.currentTarget.style.color = "#848E9C"; e.currentTarget.style.background = "transparent"; }}
                            onClick={() => navigate(`/contracts/${contract?.id ?? contractId}/parser?version=${draft.id}`)}
                            title="Open Parser"
                            type="button"
                          >
                            <FileSearch size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-[#E6E8EA] bg-[#FAFAFA] p-12 text-center" style={{ borderRadius: "12px", minHeight: "200px" }}>
              <UploadCloud size={36} className="text-[#848E9C] mb-3" />
              <p className="text-[15px] font-semibold text-[#1E2026] mb-1">No contract drafts yet</p>
              <p className="text-[13px] font-medium text-[#848E9C] mb-5">Upload the first DOCX or PDF draft to start contract review.</p>
              <button className={pillBtnCls} style={pillBtnStyle} onClick={() => setActiveModal("upload")} type="button">
                <UploadCloud size={16} /> Upload First Draft
              </button>
            </div>
          )}
        </CdCard>
        {/* Compare Setup */}
        <div className="mt-6">
          <CdCard
            title="Compare Setup"
            aside={
              compareReady
                ? <span className="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider bg-[#E8F5E9] border border-[#A5D6A7] text-[#1B5E20]" style={{ borderRadius: "4px" }}>Ready</span>
                : <span className="text-[12px] font-semibold text-[#848E9C]">{compareReadyDrafts.length}/2 drafts ready</span>
            }
          >
            {compareReady ? (
              <div className="flex flex-col gap-3">
                <form className="flex flex-col sm:flex-row sm:items-end gap-4 p-4 bg-[#F5F5F5] border border-[#E6E8EA]" style={{ borderRadius: "8px" }} onSubmit={handleCompareSubmit}>
                  <div className="flex-1">
                    <CdFormSelect label="Source Draft" disabled={isCreatingCompare} onChange={e => setSourceDraftId(e.target.value)} value={sourceDraftId}>
                      <option value="">Select source draft</option>
                      {compareReadyDrafts.map(d => <option key={`s-${d.id}`} value={String(d.id)} disabled={String(d.id) === targetDraftId}>{truncateLabel(d.version_label, 45)}</option>)}
                    </CdFormSelect>
                  </div>
                  <div className="hidden sm:flex items-center justify-center pb-2">
                    <ArrowRight size={20} className="text-[#848E9C]" />
                  </div>
                  <div className="flex-1">
                    <CdFormSelect label="Target Draft" disabled={isCreatingCompare} onChange={e => setTargetDraftId(e.target.value)} value={targetDraftId}>
                      <option value="">Select target draft</option>
                      {compareReadyDrafts.map(d => <option key={`t-${d.id}`} value={String(d.id)} disabled={String(d.id) === sourceDraftId}>{truncateLabel(d.version_label, 45)}</option>)}
                    </CdFormSelect>
                  </div>
                  <button className={pillBtnCls} style={pillBtnStyle} disabled={isCreatingCompare} type="submit">
                    {isCreatingCompare ? "Creating..." : matchingCompareRun ? <><GitCompareArrows size={16} /> Resume Compare</> : <><GitCompareArrows size={16} /> Run Compare</>}
                  </button>
                </form>
                {matchingCompareRun && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-[#E8F5E9] border border-[#A5D6A7]" style={{ borderRadius: '8px' }}>
                    <CheckCircle2 size={16} className="text-[#1B5E20] flex-shrink-0" />
                    <div>
                      <p className="text-[13px] font-semibold text-[#1B5E20] mb-0.5">Previous comparison found</p>
                      <p className="text-[12px] text-[#2E7D32]">A fresh comparison already exists for this pair — your AI drafts and review progress are preserved. Click <strong>Resume Compare</strong> to continue where you left off.</p>
                    </div>
                  </div>
                )}
                {compareError && <div className="text-[#F6465D] text-[13px] font-semibold">{compareError}</div>}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-10 text-center border-2 border-dashed border-[#E6E8EA]" style={{ borderRadius: "12px" }}>
                <GitCompareArrows size={32} className="text-[#848E9C] mb-3" />
                <h3 className="text-[15px] font-semibold text-[#1E2026] mb-1">Compare not available</h3>
                <p className="text-[13px] text-[#848E9C] mb-3">
                  {compareReadyDrafts.length === 0
                    ? "No drafts have been parsed yet. Upload and parse at least 2 drafts."
                    : `${compareReadyDrafts.length} of 2 required drafts are ready. ${drafts.length - compareReadyDrafts.length} still blocked.`}
                </p>
                <div className="flex items-center gap-2">
                  {compareReadyDrafts.length > 0 && (
                    <span className="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider bg-[#FFF8E1] border border-[#FFE082] text-[#FF8F00]" style={{ borderRadius: "4px" }}>
                      {compareReadyDrafts.length} ready
                    </span>
                  )}
                  <span className="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider bg-[#F5F5F5] border border-[#E6E8EA] text-[#848E9C]" style={{ borderRadius: "4px" }}>
                    {drafts.length - compareReadyDrafts.length} blocked
                  </span>
                </div>
              </div>
            )}
          </CdCard>
        </div>
        {/* Recent Comparisons */}
        {existingCompareRuns.length > 0 && (
          <div className="mt-6">
            <CdCard title="Recent Comparisons" aside={<span className="text-[12px] font-semibold text-[#848E9C]">{existingCompareRuns.length} active</span>}>
              <div className="flex flex-col gap-2">
                {existingCompareRuns.map(cr => {
                  const srcLabel = cr.source_version?.version_label ?? cr.source_draft?.draft_label ?? '?';
                  const tgtLabel = cr.target_version?.version_label ?? cr.target_draft?.draft_label ?? '?';
                  const totalChanges = cr.summary?.total_changes ?? 0;
                  const hasAi = cr.has_ai_review_drafts;
                  return (
                    <Link
                      key={cr.id}
                      to={`/compare-runs/${cr.id}`}
                      className="flex items-center justify-between p-3 bg-[#F5F5F5] border border-[#E6E8EA] no-underline text-inherit"
                      style={{ borderRadius: '8px', transition: 'all 200ms ease' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#F0B90B'; e.currentTarget.style.background = '#FFFDF5'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#E6E8EA'; e.currentTarget.style.background = '#F5F5F5'; }}
                    >
                      <div className="flex items-center gap-3">
                        <GitCompareArrows size={16} className="text-[#F0B90B] flex-shrink-0" />
                        <div>
                          <span className="text-[13px] font-semibold text-[#1E2026]" title={srcLabel}>{truncateLabel(srcLabel, 30)}</span>
                          <ArrowRight size={12} className="inline mx-1.5 text-[#848E9C]" />
                          <span className="text-[13px] font-semibold text-[#1E2026]" title={tgtLabel}>{truncateLabel(tgtLabel, 30)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-[#848E9C]">{totalChanges} changes</span>
                        {hasAi && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#E8F5E9] border border-[#A5D6A7] text-[#1B5E20]" style={{ borderRadius: '4px' }}>✦ AI</span>
                        )}
                        <span className="text-[11px] font-semibold text-[#F0B90B]">Open →</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CdCard>
          </div>
        )}
      </main>
      {/* ══ Upload Draft Modal ══ */}
      {activeModal === "upload" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(30,32,38,0.4)", backdropFilter: "blur(4px)" }} onClick={() => { if (!isUploading) closeModal(); }}>
          <div aria-label="Upload Contract Draft" aria-modal="true" role="dialog" className="w-full max-w-[480px] bg-white border border-[#E6E8EA] overflow-hidden" onClick={e => e.stopPropagation()} style={{ borderRadius: "12px", boxShadow: "rgba(0,0,0,0.15) 0px 8px 30px", animation: "cdModalIn 0.2s ease-out" }}>
            <div className="relative px-6 pt-6 pb-4 border-b border-[#E6E8EA] bg-[#F5F5F5]">
              <button className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-transparent border-none text-[#848E9C] cursor-pointer" style={{ borderRadius: "6px" }} disabled={isUploading} onClick={closeModal} type="button"><X size={18} /></button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center" style={{ borderRadius: "8px", background: "rgba(240,185,11,0.1)" }}><UploadCloud size={20} className="text-[#F0B90B]" /></div>
                <div>
                  <h2 className="text-[18px] font-semibold text-[#1E2026]">Upload Contract Draft</h2>
                  <p className="text-[13px] font-medium text-[#848E9C]">Add a new DOCX or PDF draft.</p>
                </div>
              </div>
            </div>
            <form className="px-6 pb-6 pt-5 space-y-4" onSubmit={handleUploadSubmit}>
              <div className="flex flex-col gap-1.5">
                <CdFormInput label="Draft Label" maxLength={DRAFT_LABEL_MAX_LENGTH} onChange={e => setUploadDraftLabel(e.target.value)} placeholder="vendor-markup-v2" type="text" value={uploadDraftLabel} />
                {uploadDraftLabel.length > DRAFT_LABEL_MAX_LENGTH - 20 && (
                  <span className="text-[11px] font-semibold" style={{ color: uploadDraftLabel.length > DRAFT_LABEL_MAX_LENGTH ? '#F6465D' : '#848E9C' }}>
                    {uploadDraftLabel.length}/{DRAFT_LABEL_MAX_LENGTH} characters
                  </span>
                )}
              </div>
              <CdFormTextarea label="Notes" onChange={e => setUploadNotes(e.target.value)} placeholder="Optional context for this draft" rows={3} value={uploadNotes} />
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider">DOCX or PDF File</label>
                <input
                  aria-label="DOCX or PDF File"
                  accept={SUPPORTED_DRAFT_FILE_ACCEPT}
                  className="bg-[#F5F5F5] border border-[#E6E8EA] text-[#848E9C] text-[13px] px-3 py-2 file:mr-4 file:py-1.5 file:px-4 file:border-0 file:text-[12px] file:font-semibold file:bg-[#F0B90B] file:text-[#1E2026] file:cursor-pointer cursor-pointer"
                  style={{ borderRadius: "8px", outline: "none" }}
                  onChange={e => {
                    const file = e.target.files?.[0] ?? null;
                    setUploadFile(file);
                    if (file && !uploadDraftLabel.trim()) {
                      const baseName = file.name.replace(/\.(docx|pdf)$/i, "");
                      setUploadDraftLabel(baseName.length > DRAFT_LABEL_MAX_LENGTH ? baseName.slice(0, DRAFT_LABEL_MAX_LENGTH) : baseName);
                    }
                  }}
                  ref={fileInputRef}
                  type="file"
                />
              </div>
              {uploadError && <p className="text-[#F6465D] text-[13px] font-semibold">{uploadError}</p>}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E6E8EA]">
                <button className={formBtnSecondary} style={formBtnStyle} disabled={isUploading} onClick={closeModal} type="button">Cancel</button>
                <button className={formBtnPrimary} style={formBtnStyle} disabled={isUploading} type="submit">{isUploading ? "Uploading..." : "Upload Draft"}</button>
              </div>
            </form>
          </div>
          <style>{`@keyframes cdModalIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>
      )}
      {/* ══ Edit Contract Modal ══ */}
      {activeModal === "contract" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(30,32,38,0.4)", backdropFilter: "blur(4px)" }} onClick={() => { if (!isSavingContract) closeModal(); }}>
          <div aria-label="Contract Metadata" aria-modal="true" role="dialog" className="w-full max-w-[480px] bg-white border border-[#E6E8EA] overflow-hidden" onClick={e => e.stopPropagation()} style={{ borderRadius: "12px", boxShadow: "rgba(0,0,0,0.15) 0px 8px 30px", animation: "cdModalIn 0.2s ease-out" }}>
            <div className="relative px-6 pt-6 pb-4 border-b border-[#E6E8EA] bg-[#F5F5F5]">
              <button className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-transparent border-none text-[#848E9C] cursor-pointer" style={{ borderRadius: "6px" }} disabled={isSavingContract} onClick={closeModal} type="button"><X size={18} /></button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center" style={{ borderRadius: "8px", background: "rgba(240,185,11,0.1)" }}><Pencil size={20} className="text-[#F0B90B]" /></div>
                <div>
                  <h2 className="text-[18px] font-semibold text-[#1E2026]">Contract Metadata</h2>
                  <p className="text-[13px] font-medium text-[#848E9C]">Update contract details.</p>
                </div>
              </div>
            </div>
            <form className="px-6 pb-6 pt-5 space-y-4" onSubmit={handleContractSubmit}>
              <CdFormInput label="Contract title" onChange={e => setContractForm(v => ({ ...v, title: e.target.value }))} placeholder="Vendor Master Services Agreement" type="text" value={contractForm.title} />
              <CdFormInput label="Contract type" onChange={e => setContractForm(v => ({ ...v, document_type: e.target.value }))} placeholder="MSA" type="text" value={contractForm.document_type} />
              <CdFormTextarea label="Description" onChange={e => setContractForm(v => ({ ...v, description: e.target.value }))} placeholder="Describe the negotiation scope." rows={3} value={contractForm.description} />
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E6E8EA]">
                <button className={formBtnSecondary} style={formBtnStyle} disabled={isSavingContract} onClick={closeModal} type="button">Cancel</button>
                <button className={formBtnPrimary} style={formBtnStyle} disabled={isSavingContract} type="submit">{isSavingContract ? "Saving..." : "Save Contract"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Toast notifications — bottom-right, auto-dismiss */}
      {error && <Toast message={error} type="error" onClose={() => setError("")} />}
      {feedback && <Toast message={feedback} type="success" onClose={() => setFeedback("")} />}
    </>
  );
}
