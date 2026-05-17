import { startTransition, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, FileText, Pencil, Play, ScrollText, Trash2, UploadCloud, X, AlertTriangle, GitCompareArrows } from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
// Standalone layout — no ScreenFrame/WorkspaceDrawer needed
import {
  ApiError,
  createCompareRun,
  createDocumentVersion,
  deleteDocumentVersion,
  getDocument,
  listDocumentVersions,
  updateDocument,
  updateDocumentVersion
} from "../lib/api";
import { formatDateTime } from "../lib/formatters";

function hasParsedStatus(version) {
  return ["parsed", "parsed_with_warnings"].includes(version.parse_status?.toLowerCase());
}

function isCompareReadyVersion(version) {
  return hasParsedStatus(version) && Boolean(version.active_parse_run_id);
}

function getVersionStatusTone(version) {
  const s = version.parse_status?.toLowerCase();
  if (s === "parsed") return "bg-[#E8F5E9] border border-[#A5D6A7] text-[#1B5E20]";
  if (s === "parsed_with_warnings") return "bg-[#FFF8E1] border border-[#FFE082] text-[#FF8F00]";
  if (s === "failed") return "bg-[#FEECEE] border border-[#F6465D]/30 text-[#F6465D]";
  return "bg-[#F5F5F5] border border-[#E6E8EA] text-[#848E9C]";
}

function getLatestWorkspaceTimestamp(document, versions) {
  const ts = [document?.updated_at, ...versions.map(v => v.uploaded_at)].filter(Boolean);
  if (ts.length === 0) return "Not available";
  return formatDateTime(ts.reduce((a, b) => (new Date(b).getTime() > new Date(a).getTime() ? b : a)));
}

const EMPTY_DOCUMENT_FORM = { title: "", document_type: "", description: "" };
const EMPTY_VERSION_FORM = { version_label: "", notes: "" };
const SUPPORTED_VERSION_FILE_RE = /\.(docx|pdf)$/i;
const SUPPORTED_VERSION_FILE_ACCEPT = ".docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf";

export function DocumentDetailPage() {
  const { logout, token } = useAuth();
  const { documentId } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState(null);
  const [versions, setVersions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [activeModal, setActiveModal] = useState(null);
  const [documentForm, setDocumentForm] = useState(EMPTY_DOCUMENT_FORM);
  const [isSavingDocument, setIsSavingDocument] = useState(false);
  const [editingVersionId, setEditingVersionId] = useState(null);
  const [versionForm, setVersionForm] = useState(EMPTY_VERSION_FORM);
  const [isSavingVersion, setIsSavingVersion] = useState(false);
  const [deleteVersionTarget, setDeleteVersionTarget] = useState(null);
  const [isDeletingVersion, setIsDeletingVersion] = useState(false);
  const [uploadVersionLabel, setUploadVersionLabel] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [sourceVersionId, setSourceVersionId] = useState("");
  const [targetVersionId, setTargetVersionId] = useState("");
  const [compareError, setCompareError] = useState("");
  const [isCreatingCompare, setIsCreatingCompare] = useState(false);
  const [recentVersionId, setRecentVersionId] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let isCurrent = true;
    async function load() {
      setIsLoading(true); setError("");
      try {
        const [doc, ver] = await Promise.all([getDocument(token, documentId), listDocumentVersions(token, documentId)]);
        if (!isCurrent) return;
        setDocument(doc); setVersions(ver);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) { logout(); return; }
        if (isCurrent) setError(e.message);
      } finally { if (isCurrent) setIsLoading(false); }
    }
    void load();
    return () => { isCurrent = false; };
  }, [documentId, logout, token]);

  useEffect(() => {
    if (!document) return;
    setDocumentForm({ title: document.title, document_type: document.document_type || "", description: document.description || "" });
  }, [document]);

  useEffect(() => {
    const ready = versions.filter(isCompareReadyVersion);
    if (ready.length < 2) { setSourceVersionId(""); setTargetVersionId(""); return; }
    setSourceVersionId(v => (v && ready.some(r => String(r.id) === v)) ? v : String(ready[0].id));
    setTargetVersionId(v => (v && ready.some(r => String(r.id) === v)) ? v : String(ready[1]?.id ?? ready[0].id));
  }, [versions]);

  async function reloadDocument() {
    try { const p = await getDocument(token, documentId); setDocument(p); setError(""); return true; }
    catch (e) { if (e instanceof ApiError && e.status === 401) { logout(); return false; } setError(e.message); return false; }
  }
  async function reloadVersions() {
    try { const p = await listDocumentVersions(token, documentId); setVersions(p); setError(""); return true; }
    catch (e) { if (e instanceof ApiError && e.status === 401) { logout(); return false; } setError(e.message); return false; }
  }

  function resetDocumentEditor() { setDocumentForm({ title: document?.title || "", document_type: document?.document_type || "", description: document?.description || "" }); }
  function resetVersionEditor() { setEditingVersionId(null); setDeleteVersionTarget(null); setVersionForm(EMPTY_VERSION_FORM); }
  function resetUploadForm() { setUploadVersionLabel(""); setUploadNotes(""); setUploadFile(null); setUploadError(""); if (fileInputRef.current) fileInputRef.current.value = ""; }

  function closeModal() {
    if (activeModal === "document") resetDocumentEditor();
    if (activeModal === "upload") resetUploadForm();
    if (activeModal === "version") resetVersionEditor();
    setActiveModal(null);
  }

  function openDocumentModal() { resetDocumentEditor(); setError(""); setActiveModal("document"); }
  function openUploadModal() { resetUploadForm(); setError(""); setActiveModal("upload"); }
  function beginVersionEdit(version) { setEditingVersionId(version.id); setDeleteVersionTarget(null); setVersionForm({ version_label: version.version_label, notes: version.notes || "" }); setError(""); setActiveModal("version"); }

  async function handleDocumentSubmit(event) {
    event.preventDefault();
    const t = documentForm.title.trim();
    if (!t) { setError("Document title is required."); return; }
    setIsSavingDocument(true); setError(""); setFeedback("");
    try {
      await updateDocument(token, documentId, { title: t, document_type: documentForm.document_type.trim() || null, description: documentForm.description.trim() || null });
      if (!(await reloadDocument())) return;
      setActiveModal(null); setFeedback("Document updated.");
    } catch (e) { if (e instanceof ApiError && e.status === 401) { logout(); return; } setError(e.message); }
    finally { setIsSavingDocument(false); }
  }

  async function handleVersionSubmit(event) {
    event.preventDefault();
    if (!editingVersionId) return;
    const l = versionForm.version_label.trim();
    if (!l) { setError("Version label is required."); return; }
    setIsSavingVersion(true); setError(""); setFeedback("");
    try {
      await updateDocumentVersion(token, editingVersionId, { version_label: l, notes: versionForm.notes.trim() || null });
      if (!(await reloadVersions())) return;
      resetVersionEditor(); setActiveModal(null); setFeedback("Version metadata updated.");
    } catch (e) { if (e instanceof ApiError && e.status === 401) { logout(); return; } setError(e.message); }
    finally { setIsSavingVersion(false); }
  }

  async function handleDeleteVersion() {
    if (!deleteVersionTarget) return;
    setIsDeletingVersion(true); setError(""); setFeedback("");
    try {
      await deleteDocumentVersion(token, deleteVersionTarget.id);
      if (!(await reloadVersions())) return;
      if (editingVersionId === deleteVersionTarget.id) { resetVersionEditor(); setActiveModal(null); }
      setDeleteVersionTarget(null); setFeedback("Version deleted.");
    } catch (e) { if (e instanceof ApiError && e.status === 401) { logout(); return; } setError(e.message); }
    finally { setIsDeletingVersion(false); }
  }

  async function handleUploadSubmit(event) {
    event.preventDefault(); setUploadError(""); setFeedback("");
    const l = uploadVersionLabel.trim();
    if (!l) { setUploadError("Version label is required."); return; }
    if (!uploadFile || !SUPPORTED_VERSION_FILE_RE.test(uploadFile.name)) { setUploadError("Please choose a .docx or .pdf file."); return; }
    setIsUploading(true);
    try {
      const created = await createDocumentVersion(token, documentId, { versionLabel: l, notes: uploadNotes, file: uploadFile });
      if (!(await reloadVersions())) return;
      resetUploadForm(); setActiveModal(null); setRecentVersionId(created?.id ?? null); setFeedback("Version uploaded.");
    } catch (e) { if (e instanceof ApiError && e.status === 401) { logout(); return; } setUploadError(e.message); }
    finally { setIsUploading(false); }
  }

  async function handleCompareSubmit(event) {
    event.preventDefault(); setCompareError("");
    if (!sourceVersionId || !targetVersionId) { setCompareError("Choose both source and target versions."); return; }
    if (sourceVersionId === targetVersionId) { setCompareError("Source and target must be different."); return; }
    const ids = new Set(versions.filter(isCompareReadyVersion).map(v => String(v.id)));
    if (!ids.has(sourceVersionId) || !ids.has(targetVersionId)) { setCompareError("Selected versions are not compare-ready."); return; }
    setIsCreatingCompare(true);
    try {
      const run = await createCompareRun(token, documentId, { source_version_id: Number(sourceVersionId), target_version_id: Number(targetVersionId) });
      startTransition(() => { navigate(`/compare-runs/${run.id}`); });
    } catch (e) { if (e instanceof ApiError && e.status === 401) { logout(); return; } setCompareError(e.message); }
    finally { setIsCreatingCompare(false); }
  }

  const parsedVersions = versions.filter(hasParsedStatus);
  const compareReadyVersions = versions.filter(isCompareReadyVersion);
  const compareReady = compareReadyVersions.length >= 2;
  const projectPath = document ? `/projects/${document.project_id}` : "/dashboard";

  /* ── Binance-spec inline helpers ── */
  function Card({ title, aside, children }) {
    return (
      <div className="bg-white border border-[#E6E8EA] overflow-hidden" style={{ borderRadius: "12px", boxShadow: "rgba(32,32,37,0.05) 0px 3px 5px 0px" }}>
        {title && <div className="px-5 py-4 border-b border-[#E6E8EA] flex items-center justify-between"><h3 className="text-[16px] font-semibold text-[#1E2026]">{title}</h3>{aside && <span className="text-[12px] font-semibold text-[#848E9C]">{aside}</span>}</div>}
        <div className="p-5">{children}</div>
      </div>
    );
  }

  const inputCls = "h-10 px-3 bg-[#F5F5F5] border border-[#E6E8EA] text-[14px] font-medium text-[#1E2026] placeholder-[#848E9C] w-full";
  const inputStyle = { borderRadius: "8px", outline: "none", transition: "border-color 200ms ease" };
  const pillBtnCls = "flex items-center gap-2 bg-[#F0B90B] text-[#1E2026] px-5 py-2 font-semibold text-[14px] border-none cursor-pointer disabled:opacity-50";
  const pillBtnStyle = { borderRadius: "50px", boxShadow: "rgb(153,153,153) 0px 2px 10px -3px", transition: "all 200ms ease" };
  const formBtnPrimary = "flex items-center justify-center gap-1.5 bg-[#F0B90B] text-[#1E2026] px-5 py-2 font-semibold text-[14px] border-none cursor-pointer disabled:opacity-50";
  const formBtnSecondary = "flex items-center justify-center gap-1.5 bg-white border border-[#E6E8EA] text-[#32313A] px-5 py-2 font-semibold text-[14px] cursor-pointer";
  const formBtnStyle = { borderRadius: "6px", transition: "all 200ms ease" };

  function ModalShell({ open, busy, icon, title: modalTitle, subtitle, onClose, children }) {
    if (!open) return null;
    const IconEl = icon;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(30,32,38,0.4)", backdropFilter: "blur(4px)" }} onClick={() => { if (!busy) onClose(); }}>
        <div aria-label={modalTitle} aria-modal="true" className="w-full max-w-[480px] bg-white border border-[#E6E8EA] overflow-hidden" onClick={e => e.stopPropagation()} role="dialog" style={{ borderRadius: "12px", boxShadow: "rgba(0,0,0,0.15) 0px 8px 30px", animation: "ddModalIn 0.2s ease-out" }}>
          <div className="relative px-6 pt-6 pb-4 border-b border-[#E6E8EA] bg-[#F5F5F5]">
            <button className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-transparent border-none text-[#848E9C] cursor-pointer" style={{ borderRadius: "6px" }} disabled={busy} onClick={onClose} type="button"><X size={18} /></button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center" style={{ borderRadius: "8px", background: "rgba(240,185,11,0.1)" }}><IconEl size={20} className="text-[#F0B90B]" /></div>
              <div><h2 className="text-[18px] font-semibold text-[#1E2026]">{modalTitle}</h2><p className="text-[13px] font-medium text-[#848E9C]">{subtitle}</p></div>
            </div>
          </div>
          {children}
        </div>
        <style>{`@keyframes ddModalIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      </div>
    );
  }

  return (
    <>
    <main className="max-w-[1200px] mx-auto px-8 py-8">
      {error && <div className="mb-5 p-3.5 bg-white border border-[#F6465D] text-[14px] text-[#F6465D] font-semibold" style={{ borderRadius: "8px" }}>{error}</div>}
      {feedback && <div className="mb-5 p-3.5 bg-white border border-[#0ECB81] text-[14px] text-[#0ECB81] font-semibold" style={{ borderRadius: "8px" }}>{feedback}</div>}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/dashboard" className="text-[12px] font-semibold text-[#848E9C] no-underline hover:text-[#1E2026]" style={{ transition: "color 200ms" }}>Projects</Link>
            <span className="text-[12px] text-[#848E9C]">/</span>
            <Link to={projectPath} className="text-[12px] font-semibold text-[#848E9C] no-underline hover:text-[#1E2026]" style={{ transition: "color 200ms" }}>Project</Link>
            <span className="text-[12px] text-[#848E9C]">/</span>
            <span className="text-[12px] font-semibold text-[#1E2026]">{document?.title ?? "Document"}</span>
          </div>
          <h1 className="text-[28px] font-medium text-[#1E2026] mb-1" style={{ lineHeight: "1.00" }}>{document?.title ?? "Document Workspace"}</h1>
          <p className="text-[14px] font-medium text-[#848E9C] mt-2" style={{ lineHeight: "1.43" }}>Version inventory for parser truth, compare, and review workflows.</p>
        </div>
        <div className="flex items-center gap-3 shrink-0 mt-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E6E8EA] text-[#1E2026] font-semibold text-[13px] cursor-pointer" style={{ borderRadius: "6px", transition: "all 200ms ease" }} onClick={openDocumentModal} type="button">
            <Pencil size={14} /> Edit Metadata
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Document Type", value: document?.document_type || "General", Icon: FileText },
          { label: "Total Versions", value: String(versions.length), Icon: ScrollText },
          { label: "Compare Status", value: compareReady ? "Ready" : "Locked", Icon: GitCompareArrows },
          { label: "Last Updated", value: getLatestWorkspaceTimestamp(document, versions), Icon: AlertTriangle },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-[#E6E8EA] p-4 flex items-center gap-3" style={{ borderRadius: "12px", boxShadow: "rgba(32,32,37,0.05) 0px 3px 5px 0px" }}>
            <div className="w-9 h-9 flex items-center justify-center text-[#F0B90B]" style={{ borderRadius: "8px", background: "rgba(240,185,11,0.1)" }}><s.Icon size={18} /></div>
            <div><p className="text-[16px] font-bold text-[#1E2026] leading-none mb-0.5">{s.value}</p><p className="text-[11px] font-semibold text-[#848E9C]">{s.label}</p></div>
          </div>
        ))}
      </div>

      {/* Version Inventory */}
      <Card title="Version Inventory" aside={`${versions.length} versions`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider bg-[#E8F5E9] border border-[#A5D6A7] text-[#1B5E20]" style={{ borderRadius: "4px" }}>{parsedVersions.length}/{versions.length} parsed</span>
            {compareReady
              ? <span className="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider bg-[#FFF8E1] border border-[#FFE082] text-[#FF8F00]" style={{ borderRadius: "4px" }}>Compare ready</span>
              : <span className="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider bg-[#F5F5F5] border border-[#E6E8EA] text-[#848E9C]" style={{ borderRadius: "4px" }}>Compare locked</span>}
          </div>
          <button className={pillBtnCls} style={pillBtnStyle} onClick={openUploadModal} type="button"><UploadCloud size={16} /> Upload Version</button>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            <div className="w-full h-12 bg-[#F5F5F5] animate-pulse border border-[#E6E8EA]" style={{ borderRadius: "8px" }} />
            <div className="w-full h-12 bg-[#F5F5F5] animate-pulse border border-[#E6E8EA]" style={{ borderRadius: "8px" }} />
          </div>
        ) : versions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
              <thead><tr className="border-b border-[#E6E8EA]">
                {["VERSION", "FILE", "STATUS", "UPLOADED", "NOTES", "ACTIONS"].map(h => <th key={h} className="text-[11px] font-semibold text-[#848E9C] uppercase tracking-wider py-3 px-3 first:pl-0 last:pr-0">{h}</th>)}
              </tr></thead>
              <tbody>
                {versions.map(version => (
                  <tr key={version.id} className="border-b border-[#E6E8EA] last:border-b-0" style={{ transition: "background 200ms" }} onMouseEnter={e => e.currentTarget.style.background = "#F5F5F5"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td className="py-3 px-3 first:pl-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-[#1E2026]">{version.version_label}</span>
                        {recentVersionId === version.id && <span className="px-1.5 py-0.5 bg-[rgba(240,185,11,0.1)] border border-[rgba(240,185,11,0.2)] text-[#F0B90B] text-[10px] uppercase font-bold tracking-wider" style={{ borderRadius: "4px" }}>New</span>}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-[12px] font-medium text-[#474D57]">{version.file_name}</td>
                    <td className="py-3 px-3"><span className={`px-2 py-0.5 text-[11px] uppercase tracking-wider font-semibold ${getVersionStatusTone(version)}`} style={{ borderRadius: "4px" }}>{version.parse_status}</span></td>
                    <td className="py-3 px-3">
                      <span className="text-[12px] font-medium text-[#1E2026] block">{formatDateTime(version.uploaded_at)}</span>
                      <span className="text-[11px] text-[#848E9C]">{version.uploaded_by_display_name}</span>
                    </td>
                    <td className="py-3 px-3 text-[12px] text-[#848E9C]">{version.notes || "—"}</td>
                    <td className="py-3 px-3 last:pr-0">
                      <div className="flex items-center gap-1">
                        <button aria-label={`Open Parser Workspace for ${version.version_label}`} className="p-1.5 text-[#848E9C] hover:text-[#1E2026] hover:bg-[#F5F5F5] border-none bg-transparent cursor-pointer" style={{ borderRadius: "6px", transition: "all 200ms" }} onClick={() => navigate(`/documents/${document?.id ?? documentId}/parser?version=${version.id}`)} title="Parser" type="button"><FileText size={14} /></button>
                        <button aria-label="Edit" className="p-1.5 text-[#848E9C] hover:text-[#1E2026] hover:bg-[#F5F5F5] border-none bg-transparent cursor-pointer" style={{ borderRadius: "6px", transition: "all 200ms" }} onClick={() => beginVersionEdit(version)} title="Edit" type="button"><Pencil size={14} /></button>
                        <button aria-label="Delete" className="p-1.5 text-[#848E9C] hover:text-[#F6465D] hover:bg-[#FEECEE] border-none bg-transparent cursor-pointer" style={{ borderRadius: "6px", transition: "all 200ms" }} onClick={() => setDeleteVersionTarget(version)} title="Delete" type="button"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-[#E6E8EA] bg-[#FAFAFA] p-12 text-center" style={{ borderRadius: "12px", minHeight: "200px" }}>
            <UploadCloud size={32} className="text-[#848E9C] mb-3" />
            <p className="text-[16px] font-semibold text-[#1E2026] mb-1">No versions uploaded yet</p>
            <p className="text-[14px] font-medium text-[#848E9C] mb-4">Upload your first DOCX or PDF file to start managing versions.</p>
            <button className={pillBtnCls} style={pillBtnStyle} onClick={openUploadModal} type="button"><UploadCloud size={16} /> Upload First Version</button>
          </div>
        )}
      </Card>

      {/* Compare Versions */}
      <div className="mt-6">
        <Card title="Compare Versions" aside={compareReady ? "Ready" : "Locked"}>
          {compareReady ? (
            <form className="flex flex-col sm:flex-row sm:items-end gap-4 p-4 bg-[#F5F5F5] border border-[#E6E8EA]" style={{ borderRadius: "8px" }} onSubmit={handleCompareSubmit}>
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider">Source</label>
                <select aria-label="Source" className={inputCls} style={inputStyle} disabled={isCreatingCompare} onChange={e => setSourceVersionId(e.target.value)} value={sourceVersionId}>
                  <option value="">Select source</option>
                  {compareReadyVersions.map(v => <option key={`s-${v.id}`} value={String(v.id)}>{v.version_label}</option>)}
                </select>
              </div>
              <div className="hidden sm:flex items-center justify-center pb-2"><ArrowRight size={20} className="text-[#848E9C]" /></div>
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider">Target</label>
                <select aria-label="Target" className={inputCls} style={inputStyle} disabled={isCreatingCompare} onChange={e => setTargetVersionId(e.target.value)} value={targetVersionId}>
                  <option value="">Select target</option>
                  {compareReadyVersions.map(v => <option key={`t-${v.id}`} value={String(v.id)}>{v.version_label}</option>)}
                </select>
              </div>
              <button className={pillBtnCls} style={pillBtnStyle} disabled={isCreatingCompare} type="submit">{isCreatingCompare ? "Creating..." : <><Play size={16} /> Launch Compare</>}</button>
              {compareError && <div className="w-full text-[#F6465D] text-[13px] font-semibold mt-2">{compareError}</div>}
            </form>
          ) : (
            <div className="flex items-center gap-3 py-2">
              <span className="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider bg-[#FFF8E1] border border-[#FFE082] text-[#FF8F00]" style={{ borderRadius: "4px" }}>{`${compareReadyVersions.length}/2 versions ready`}</span>
              <span className="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider bg-[#F5F5F5] border border-[#E6E8EA] text-[#848E9C]" style={{ borderRadius: "4px" }}>{versions.length - compareReadyVersions.length} still blocked</span>
            </div>
          )}
        </Card>
      </div>
    </main>

    {/* Upload Version Modal */}
    <ModalShell open={activeModal === "upload"} busy={isUploading} icon={UploadCloud} title="Upload Document Version" subtitle="Add a new DOCX or PDF version." onClose={closeModal}>
      <form className="px-6 pb-6 pt-5 space-y-4" onSubmit={handleUploadSubmit}>
        <div className="flex flex-col gap-1.5"><label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider">Version Label</label><input aria-label="Version Label" className={inputCls} style={inputStyle} onChange={e => setUploadVersionLabel(e.target.value)} placeholder="msa-v3-redline" type="text" value={uploadVersionLabel} onFocus={e => { e.target.style.borderColor = "#000"; }} onBlur={e => { e.target.style.borderColor = "#E6E8EA"; }} /></div>
        <div className="flex flex-col gap-1.5"><label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider">Notes</label><textarea aria-label="Notes" className="px-3 py-2.5 bg-[#F5F5F5] border border-[#E6E8EA] text-[14px] font-medium text-[#1E2026] placeholder-[#848E9C] min-h-[80px] resize-y w-full" style={inputStyle} onChange={e => setUploadNotes(e.target.value)} placeholder="Optional context" rows={3} value={uploadNotes} onFocus={e => { e.target.style.borderColor = "#000"; }} onBlur={e => { e.target.style.borderColor = "#E6E8EA"; }} /></div>
        <div className="flex flex-col gap-1.5"><label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider">DOCX or PDF File</label><input accept={SUPPORTED_VERSION_FILE_ACCEPT} aria-label="DOCX or PDF File" className="bg-[#F5F5F5] border border-[#E6E8EA] text-[#848E9C] text-[13px] px-3 py-2 file:mr-4 file:py-1.5 file:px-4 file:border-0 file:text-[12px] file:font-semibold file:bg-[#F0B90B] file:text-[#1E2026] file:cursor-pointer cursor-pointer w-full" style={{ borderRadius: "8px", outline: "none" }} onChange={e => setUploadFile(e.target.files?.[0] ?? null)} ref={fileInputRef} type="file" /></div>
        {uploadError && <p className="text-[#F6465D] text-[13px] font-semibold">{uploadError}</p>}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E6E8EA]">
          <button className={formBtnSecondary} style={formBtnStyle} disabled={isUploading} onClick={closeModal} type="button">Cancel</button>
          <button className={formBtnPrimary} style={formBtnStyle} disabled={isUploading} type="submit">{isUploading ? "Uploading..." : "Upload Version"}</button>
        </div>
      </form>
    </ModalShell>

    {/* Edit Document Modal */}
    <ModalShell open={activeModal === "document"} busy={isSavingDocument} icon={Pencil} title="Document Metadata" subtitle="Update document details." onClose={closeModal}>
      <form className="px-6 pb-6 pt-5 space-y-4" onSubmit={handleDocumentSubmit}>
        <div className="flex flex-col gap-1.5"><label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider">Document title</label><input aria-label="Document title" className={inputCls} style={inputStyle} onChange={e => setDocumentForm(v => ({ ...v, title: e.target.value }))} placeholder="Master Services Agreement" type="text" value={documentForm.title} onFocus={e => { e.target.style.borderColor = "#000"; }} onBlur={e => { e.target.style.borderColor = "#E6E8EA"; }} /></div>
        <div className="flex flex-col gap-1.5"><label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider">Document type</label><input aria-label="Document type" className={inputCls} style={inputStyle} onChange={e => setDocumentForm(v => ({ ...v, document_type: e.target.value }))} placeholder="MSA" type="text" value={documentForm.document_type} onFocus={e => { e.target.style.borderColor = "#000"; }} onBlur={e => { e.target.style.borderColor = "#E6E8EA"; }} /></div>
        <div className="flex flex-col gap-1.5"><label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider">Description</label><textarea aria-label="Document description" className="px-3 py-2.5 bg-[#F5F5F5] border border-[#E6E8EA] text-[14px] font-medium text-[#1E2026] placeholder-[#848E9C] min-h-[80px] resize-y w-full" style={inputStyle} onChange={e => setDocumentForm(v => ({ ...v, description: e.target.value }))} placeholder="Describe the review scope." rows={3} value={documentForm.description} onFocus={e => { e.target.style.borderColor = "#000"; }} onBlur={e => { e.target.style.borderColor = "#E6E8EA"; }} /></div>
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E6E8EA]">
          <button className={formBtnSecondary} style={formBtnStyle} disabled={isSavingDocument} onClick={closeModal} type="button">Cancel</button>
          <button className={formBtnPrimary} style={formBtnStyle} disabled={isSavingDocument} type="submit">{isSavingDocument ? "Saving..." : "Save Document"}</button>
        </div>
      </form>
    </ModalShell>

    {/* Edit Version Modal */}
    <ModalShell open={activeModal === "version"} busy={isSavingVersion} icon={Pencil} title="Edit Version" subtitle="Edit version details." onClose={closeModal}>
      <form className="px-6 pb-6 pt-5 space-y-4" onSubmit={handleVersionSubmit}>
        <div className="flex flex-col gap-1.5"><label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider">Version label</label><input aria-label="Edit Version Label" className={inputCls} style={inputStyle} onChange={e => setVersionForm(v => ({ ...v, version_label: e.target.value }))} placeholder="v1.1-reviewed" type="text" value={versionForm.version_label} onFocus={e => { e.target.style.borderColor = "#000"; }} onBlur={e => { e.target.style.borderColor = "#E6E8EA"; }} /></div>
        <div className="flex flex-col gap-1.5"><label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider">Notes</label><textarea aria-label="Edit Version Notes" className="px-3 py-2.5 bg-[#F5F5F5] border border-[#E6E8EA] text-[14px] font-medium text-[#1E2026] placeholder-[#848E9C] min-h-[80px] resize-y w-full" style={inputStyle} onChange={e => setVersionForm(v => ({ ...v, notes: e.target.value }))} placeholder="Record why this version changed." rows={3} value={versionForm.notes} onFocus={e => { e.target.style.borderColor = "#000"; }} onBlur={e => { e.target.style.borderColor = "#E6E8EA"; }} /></div>
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E6E8EA]">
          <button className={formBtnSecondary} style={formBtnStyle} disabled={isSavingVersion} onClick={closeModal} type="button">Cancel</button>
          <button className={formBtnPrimary} style={formBtnStyle} disabled={isSavingVersion} type="submit">{isSavingVersion ? "Saving..." : "Save Version"}</button>
        </div>
      </form>
    </ModalShell>

    <ConfirmDialog
      cancelLabel="Cancel Delete"
      confirmLabel={isDeletingVersion ? "Deleting..." : "Confirm Delete Version"}
      description={deleteVersionTarget ? `Delete ${deleteVersionTarget.version_label}? This cannot be undone.` : ""}
      isProcessing={isDeletingVersion}
      onCancel={() => setDeleteVersionTarget(null)}
      onConfirm={handleDeleteVersion}
      open={Boolean(deleteVersionTarget)}
      title="Delete Version"
    />
    </>
  );
}
