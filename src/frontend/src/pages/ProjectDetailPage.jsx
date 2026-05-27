import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { encodeId, decodeId } from "../lib/idCodec";
import { ArrowLeft, BarChart3, CheckSquare, ClipboardList, Clock, FileText, FolderHeart, FolderOpen, History, LogOut, MessageSquare, Pencil, Plus, Trash2, X, Users, ShieldCheck, Activity } from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { useActiveProject } from "../context/ActiveProjectContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Toast } from "../components/Toast";
// Standalone layout â€” no ScreenFrame/WorkspaceDrawer/DataTable needed
import {
  ApiError,
  createContract,
  createProjectMember,
  createProjectRequirement,
  createProjectTestCase,
  deleteContract,
  deleteProjectInvitation,
  deleteRequirement,
  deleteProjectMember,
  getProject,
  listProjectContracts,
  listProjectInvitations,
  listProjectMembers,
  listProjectRequirements,
  listProjectTestCases,
  deleteTestCase,
  listProjectActivityLogs,
  updateRequirement,
  updateTestCase,
  updateContract
} from "../lib/api";
import { formatDateTime } from "../lib/formatters";
import { useProjectEvents } from "../hooks/useProjectEvents";

const EMPTY_DOCUMENT_FORM = {
  title: "",
  document_type: "",
  description: ""
};

const EMPTY_REQUIREMENT_FORM = {
  documentId: "",
  requirementCode: "",
  title: "",
  description: ""
};

const EMPTY_TEST_CASE_FORM = {
  testCaseCode: "",
  title: "",
  description: "",
  priority: "medium"
};

function getLatestProjectWorkspaceTimestamp(project, documents) {
  const timestamps = [project?.updated_at, ...documents.map((document) => document.updated_at)].filter(Boolean);

  if (timestamps.length === 0) {
    return "Not available";
  }

  return formatDateTime(
    timestamps.reduce((latestTimestamp, currentTimestamp) =>
      new Date(currentTimestamp).getTime() > new Date(latestTimestamp).getTime()
        ? currentTimestamp
        : latestTimestamp
    )
  );
}

/* ─── Binance-spec inline table ─── */
function InlineTable({ headers, rows, colWidths }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left" style={{ borderCollapse: "collapse", tableLayout: colWidths ? "fixed" : "auto" }}>
        {colWidths && (
          <colgroup>
            {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
        )}
        <thead>
          <tr className="border-b border-[#E6E8EA]">
            {headers.map((h, i) => (
              <th key={i} className="text-[11px] font-semibold text-[#848E9C] uppercase tracking-wider py-3 px-3 first:pl-0 last:pr-0">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-[#E6E8EA] last:border-b-0" style={{ transition: "background 200ms ease" }} onMouseEnter={e => e.currentTarget.style.background = "#F5F5F5"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {row.map((cell, ci) => (
                <td key={ci} className="text-[13px] font-medium text-[#1E2026] py-3 px-3 first:pl-0 last:pr-0">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Binance-spec section card ─── */
function Card({ title, aside, children }) {
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

/* ─── Inline form input – Binance spec: 8px radius, black focus ─── */
function FormInput({ label, "aria-label": ariaLabel, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider">{label}</label>}
      <input
        aria-label={ariaLabel ?? label}
        className="h-10 px-3 bg-[#F5F5F5] border border-[#E6E8EA] text-[14px] font-medium text-[#1E2026] placeholder-[#848E9C]"
        style={{ borderRadius: "8px", outline: "none", transition: "border-color 200ms ease" }}
        onFocus={e => { e.target.style.borderColor = "#000000"; }}
        onBlur={e => { e.target.style.borderColor = "#E6E8EA"; }}
        {...props}
      />
    </div>
  );
}

function FormTextarea({ label, "aria-label": ariaLabel, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider">{label}</label>}
      <textarea
        aria-label={ariaLabel ?? label}
        className="px-3 py-2.5 bg-[#F5F5F5] border border-[#E6E8EA] text-[14px] font-medium text-[#1E2026] placeholder-[#848E9C] min-h-[80px] resize-y"
        style={{ borderRadius: "8px", outline: "none", transition: "border-color 200ms ease", lineHeight: "1.50" }}
        onFocus={e => { e.target.style.borderColor = "#000000"; }}
        onBlur={e => { e.target.style.borderColor = "#E6E8EA"; }}
        {...props}
      />
    </div>
  );
}

function FormSelect({ label, children, "aria-label": ariaLabel, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider">{label}</label>}
      <select
        aria-label={ariaLabel ?? label}
        className="h-10 px-3 bg-[#F5F5F5] border border-[#E6E8EA] text-[14px] font-medium text-[#1E2026]"
        style={{ borderRadius: "8px", outline: "none", transition: "border-color 200ms ease" }}
        onFocus={e => { e.target.style.borderColor = "#000000"; }}
        onBlur={e => { e.target.style.borderColor = "#E6E8EA"; }}
        {...props}
      >{children}</select>
    </div>
  );
}

export function ProjectDetailPage() {
  const { logout, token, user } = useAuth();
  const { setActiveProject, clearActiveProject } = useActiveProject();
  const navigate = useNavigate();
  const { projectId: rawProjectId } = useParams();
  const projectId = decodeId(rawProjectId);
  const [project, setProject] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [testCases, setTestCases] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDocumentForm, setShowDocumentForm] = useState(false);
  const [editingDocumentId, setEditingDocumentId] = useState(null);
  const [documentForm, setDocumentForm] = useState(EMPTY_DOCUMENT_FORM);
  const [isSavingDocument, setIsSavingDocument] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeletingDocument, setIsDeletingDocument] = useState(false);
  const [showRequirementForm, setShowRequirementForm] = useState(false);
  const [editingRequirementId, setEditingRequirementId] = useState(null);
  const [requirementForm, setRequirementForm] = useState(EMPTY_REQUIREMENT_FORM);
  const [isSavingRequirement, setIsSavingRequirement] = useState(false);
  const [requirementDeleteTarget, setRequirementDeleteTarget] = useState(null);
  const [isDeletingRequirement, setIsDeletingRequirement] = useState(false);
  const [requirementSearch, setRequirementSearch] = useState("");
  const [showTestCaseForm, setShowTestCaseForm] = useState(false);
  const [editingTestCaseId, setEditingTestCaseId] = useState(null);
  const [testCaseForm, setTestCaseForm] = useState(EMPTY_TEST_CASE_FORM);
  const [isSavingTestCase, setIsSavingTestCase] = useState(false);
  const [testCaseDeleteTarget, setTestCaseDeleteTarget] = useState(null);
  const [isDeletingTestCase, setIsDeletingTestCase] = useState(false);
  const [testCaseSearch, setTestCaseSearch] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [revokingInvitationId, setRevokingInvitationId] = useState(null);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [activeTab, setActiveTab] = useState("documents");
  const [memberDeleteTarget, setMemberDeleteTarget] = useState(null);
  const [isDeletingMember, setIsDeletingMember] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    async function loadProjectWorkspace() {
      setIsLoading(true);
      setError("");

      try {
        const [projectPayload, documentPayload, memberPayload, invitationPayload, requirementPayload, testCasePayload, activityPayload] = await Promise.all([
          getProject(token, projectId),
          listProjectContracts(token, projectId),
          listProjectMembers(token, projectId),
          listProjectInvitations(token, projectId),
          listProjectRequirements(token, projectId),
          listProjectTestCases(token, projectId),
          listProjectActivityLogs(token, projectId)
        ]);

        if (!isCurrent) {
          return;
        }

        setProject(projectPayload);
        setActiveProject(projectPayload); // ← mark as active project for navbar
        setDocuments(documentPayload);
        setMembers(memberPayload);
        setInvitations(invitationPayload);
        setRequirements(requirementPayload);
        setTestCases(testCasePayload);
        setActivityLogs(activityPayload);
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

    void loadProjectWorkspace();

    return () => {
      isCurrent = false;
    };
  }, [logout, projectId, token]);

  // ── Real-time SSE: auto-refresh on project events from other members ──
  const handleProjectEvent = useCallback((event) => {
    const { type, data, actor_display_name } = event;
    const actor = actor_display_name || "A team member";

    switch (type) {
      case "document_created":
        refreshDocumentInventory();
        refreshActivityLogs();
        setFeedback(`${actor} created document "${data?.title || ""}"`);
        break;
      case "document_updated":
        refreshDocumentInventory();
        refreshActivityLogs();
        setFeedback(`${actor} updated a document`);
        break;
      case "document_deleted":
        refreshDocumentInventory();
        refreshActivityLogs();
        setFeedback(`${actor} deleted document "${data?.title || ""}"`);
        break;
      case "version_created":
        refreshDocumentInventory();
        refreshActivityLogs();
        setFeedback(`${actor} uploaded version "${data?.version_label || ""}" to "${data?.document_title || ""}"`);
        break;
      case "member_added":
        refreshMemberInventory();
        refreshActivityLogs();
        setFeedback(`${actor} ${data?.updated ? "updated a member role" : "added a new member"}`);
        break;
      case "member_removed":
        if (data?.user_id === user?.id) {
          clearActiveProject();
          navigate("/dashboard");
          return;
        }
        refreshMemberInventory();
        refreshActivityLogs();
        setFeedback(`${actor} removed a member`);
        break;
      case "invitation_created":
        refreshInvitationInventory();
        refreshActivityLogs();
        setFeedback(`${actor} sent an invitation to ${data?.email || "someone"}`);
        break;
      case "invitation_accepted":
      case "invitation_declined":
        refreshInvitationInventory();
        refreshMemberInventory();
        refreshActivityLogs();
        setFeedback(`An invitation was ${type === "invitation_accepted" ? "accepted" : data?.action === "revoked" ? "revoked" : "declined"}`);
        break;
      case "project_updated":
        loadProjectData();
        refreshActivityLogs();
        setFeedback(`${actor} updated the project`);
        break;
      case "project_deleted":
        clearActiveProject();
        navigate("/dashboard");
        break;
      case "compare_started":
      case "compare_completed":
      case "review_completed":
        refreshActivityLogs();
        setFeedback(`${actor} ${type.replace(/_/g, " ")}`);
        break;
      case "requirement_created":
      case "requirement_updated":
      case "requirement_deleted":
        refreshRequirementInventory();
        refreshActivityLogs();
        setFeedback(`${actor} ${type.replace(/_/g, " ")}`);
        break;
      case "test_case_created":
      case "test_case_updated":
      case "test_case_deleted":
        refreshTestCaseInventory();
        refreshActivityLogs();
        setFeedback(`${actor} ${type.replace(/_/g, " ")}`);
        break;
      case "change_item_reviewed":
      case "change_item_commented":
        refreshActivityLogs();
        setFeedback(`${actor} ${type.replace(/_/g, " ")}`);
        break;
      default:
        break;
    }
  }, [projectId, token]);

  useProjectEvents(projectId ? Number(projectId) : null, handleProjectEvent);

  // Lightweight refresh helpers for SSE event handler
  async function refreshMemberInventory() {
    try {
      const memberPayload = await listProjectMembers(token, projectId);
      setMembers(memberPayload);
    } catch { /* silent */ }
  }
  async function loadProjectData() {
    try {
      const p = await getProject(token, projectId);
      setProject(p);
      setActiveProject(p);
    } catch { /* silent */ }
  }

  async function refreshDocumentInventory() {
    try {
      const documentPayload = await listProjectContracts(token, projectId);
      setDocuments(documentPayload);
      setError("");
      return true;
    } catch (refreshError) {
      if (refreshError instanceof ApiError && refreshError.status === 401) {
        logout();
        return false;
      }

      setError(refreshError.message);
      return false;
    }
  }

  async function refreshRequirementInventory() {
    try {
      const requirementPayload = await listProjectRequirements(token, projectId);
      setRequirements(requirementPayload);
      setError("");
      return true;
    } catch (refreshError) {
      if (refreshError instanceof ApiError && refreshError.status === 401) {
        logout();
        return false;
      }

      setError(refreshError.message);
      return false;
    }
  }

  async function refreshInvitationInventory() {
    try {
      const invitationPayload = await listProjectInvitations(token, projectId);
      setInvitations(invitationPayload);
      setError("");
      return true;
    } catch (refreshError) {
      if (refreshError instanceof ApiError && refreshError.status === 401) {
        logout();
        return false;
      }

      setError(refreshError.message);
      return false;
    }
  }

  async function refreshActivityLogs() {
    try {
      const activityPayload = await listProjectActivityLogs(token, projectId);
      setActivityLogs(activityPayload);
    } catch { /* silent */ }
  }

  async function refreshTestCaseInventory() {
    try {
      const testCasePayload = await listProjectTestCases(token, projectId);
      setTestCases(testCasePayload);
      setError("");
      return true;
    } catch (refreshError) {
      if (refreshError instanceof ApiError && refreshError.status === 401) {
        logout();
        return false;
      }

      setError(refreshError.message);
      return false;
    }
  }

  function openCreateDocumentForm() {
    setShowDocumentForm(true);
    setEditingDocumentId(null);
    setDeleteTarget(null);
    setDocumentForm(EMPTY_DOCUMENT_FORM);
    setError("");
    setFeedback("");
  }

  function resetDocumentForm() {
    setShowDocumentForm(false);
    setEditingDocumentId(null);
    setDeleteTarget(null);
    setDocumentForm(EMPTY_DOCUMENT_FORM);
  }

  function openCreateRequirementForm() {
    setShowRequirementForm(true);
    setEditingRequirementId(null);
    setRequirementDeleteTarget(null);
    setRequirementForm({
      ...EMPTY_REQUIREMENT_FORM,
      documentId: documents[0] ? String(documents[0].id) : ""
    });
    setError("");
    setFeedback("");
  }

  function resetRequirementForm() {
    setShowRequirementForm(false);
    setEditingRequirementId(null);
    setRequirementForm(EMPTY_REQUIREMENT_FORM);
  }

  function beginRequirementEdit(requirement) {
    setShowRequirementForm(true);
    setEditingRequirementId(requirement.id);
    setRequirementDeleteTarget(null);
    setRequirementForm({
      documentId: String(requirement.document_id),
      requirementCode: requirement.requirement_code,
      title: requirement.title,
      description: requirement.description || ""
    });
    setError("");
    setFeedback("");
  }

  function openCreateTestCaseForm() {
    setShowTestCaseForm(true);
    setEditingTestCaseId(null);
    setTestCaseDeleteTarget(null);
    setTestCaseForm(EMPTY_TEST_CASE_FORM);
    setError("");
    setFeedback("");
  }

  function resetTestCaseForm() {
    setShowTestCaseForm(false);
    setEditingTestCaseId(null);
    setTestCaseForm(EMPTY_TEST_CASE_FORM);
  }

  function beginTestCaseEdit(testCase) {
    setShowTestCaseForm(true);
    setEditingTestCaseId(testCase.id);
    setTestCaseDeleteTarget(null);
    setTestCaseForm({
      testCaseCode: testCase.test_case_code,
      title: testCase.title,
      description: testCase.description || "",
      priority: testCase.priority || "medium"
    });
    setError("");
    setFeedback("");
  }

  function beginDocumentEdit(document) {
    setShowDocumentForm(true);
    setEditingDocumentId(document.id);
    setDeleteTarget(null);
    setDocumentForm({
      title: document.title,
      document_type: document.document_type || "",
      description: document.description || ""
    });
    setError("");
    setFeedback("");
  }

  async function handleDocumentSubmit(event) {
    event.preventDefault();

    const normalizedTitle = documentForm.title.trim();
    if (!normalizedTitle) {
      setError("Contract title is required.");
      return;
    }

    const payload = {
      title: normalizedTitle,
      document_type: documentForm.document_type.trim() || null,
      description: documentForm.description.trim() || null
    };
    const activeEditId = editingDocumentId;

    setIsSavingDocument(true);
    setError("");
    setFeedback("");

    try {
      if (activeEditId) {
        await updateContract(token, activeEditId, payload);
      } else {
        await createContract(token, projectId, payload);
      }

      const refreshed = await refreshDocumentInventory();
      if (!refreshed) {
        return;
      }

      resetDocumentForm();
      setFeedback(activeEditId ? "Contract updated successfully." : "Contract created successfully.");
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 401) {
        logout();
        return;
      }

      setError(saveError.message);
    } finally {
      setIsSavingDocument(false);
    }
  }

  async function handleDeleteDocument() {
    if (!deleteTarget) {
      return;
    }

    const targetDocument = deleteTarget;

    setIsDeletingDocument(true);
    setError("");
    setFeedback("");

    try {
      await deleteContract(token, targetDocument.id);

      const refreshed = await refreshDocumentInventory();
      if (!refreshed) {
        return;
      }

      if (editingDocumentId === targetDocument.id) {
        resetDocumentForm();
      }
      setDeleteTarget(null);
      setFeedback(`"${targetDocument.title}" has been deleted.`);
    } catch (deleteError) {
      if (deleteError instanceof ApiError && deleteError.status === 401) {
        logout();
        return;
      }

      setError(deleteError.message);
    } finally {
      setIsDeletingDocument(false);
    }
  }

  async function handleRequirementSubmit(event) {
    event.preventDefault();

    const normalizedTitle = requirementForm.title.trim();
    if (!normalizedTitle) {
      setError("Obligation title is required.");
      return;
    }

    if (!editingRequirementId && !requirementForm.requirementCode.trim()) {
      setError("Obligation code is required.");
      return;
    }

    if (!editingRequirementId && !requirementForm.documentId) {
      setError("Obligation contract is required.");
      return;
    }

    setIsSavingRequirement(true);
    setError("");
    setFeedback("");

    try {
      if (editingRequirementId) {
        await updateRequirement(token, editingRequirementId, {
          title: normalizedTitle,
          description: requirementForm.description.trim() || null
        });
      } else {
        await createProjectRequirement(token, projectId, {
          document_id: Number(requirementForm.documentId),
          requirement_code: requirementForm.requirementCode.trim(),
          title: normalizedTitle,
          description: requirementForm.description.trim() || null
        });
      }

      const refreshed = await refreshRequirementInventory();
      if (!refreshed) {
        return;
      }

      resetRequirementForm();
      setFeedback(editingRequirementId ? "Obligation updated." : "Obligation created.");
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 401) {
        logout();
        return;
      }

      setError(saveError.message);
    } finally {
      setIsSavingRequirement(false);
    }
  }

  async function handleDeleteRequirement() {
    if (!requirementDeleteTarget) {
      return;
    }

    setIsDeletingRequirement(true);
    setError("");
    setFeedback("");

    try {
      await deleteRequirement(token, requirementDeleteTarget.id);
      const refreshed = await refreshRequirementInventory();
      if (!refreshed) {
        return;
      }

      if (editingRequirementId === requirementDeleteTarget.id) {
        resetRequirementForm();
      }

      setRequirementDeleteTarget(null);
      setFeedback("Obligation deleted.");
    } catch (deleteError) {
      if (deleteError instanceof ApiError && deleteError.status === 401) {
        logout();
        return;
      }

      setError(deleteError.message);
    } finally {
      setIsDeletingRequirement(false);
    }
  }

  async function handleTestCaseSubmit(event) {
    event.preventDefault();

    const normalizedTitle = testCaseForm.title.trim();
    if (!normalizedTitle) {
      setError("Compliance check title is required.");
      return;
    }

    if (!editingTestCaseId && !testCaseForm.testCaseCode.trim()) {
      setError("Compliance check code is required.");
      return;
    }

    setIsSavingTestCase(true);
    setError("");
    setFeedback("");

    try {
      if (editingTestCaseId) {
        await updateTestCase(token, editingTestCaseId, {
          title: normalizedTitle,
          description: testCaseForm.description.trim() || null,
          priority: testCaseForm.priority || null
        });
      } else {
        await createProjectTestCase(token, projectId, {
          test_case_code: testCaseForm.testCaseCode.trim(),
          title: normalizedTitle,
          description: testCaseForm.description.trim() || null,
          priority: testCaseForm.priority || null
        });
      }

      const refreshed = await refreshTestCaseInventory();
      if (!refreshed) {
        return;
      }

      resetTestCaseForm();
      setFeedback(editingTestCaseId ? "Compliance check updated." : "Compliance check created.");
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 401) {
        logout();
        return;
      }

      setError(saveError.message);
    } finally {
      setIsSavingTestCase(false);
    }
  }

  async function handleDeleteTestCase() {
    if (!testCaseDeleteTarget) {
      return;
    }

    setIsDeletingTestCase(true);
    setError("");
    setFeedback("");

    try {
      await deleteTestCase(token, testCaseDeleteTarget.id);
      const refreshed = await refreshTestCaseInventory();
      if (!refreshed) {
        return;
      }

      if (editingTestCaseId === testCaseDeleteTarget.id) {
        resetTestCaseForm();
      }

      setTestCaseDeleteTarget(null);
      setFeedback("Compliance check deleted.");
    } catch (deleteError) {
      if (deleteError instanceof ApiError && deleteError.status === 401) {
        logout();
        return;
      }

      setError(deleteError.message);
    } finally {
      setIsDeletingTestCase(false);
    }
  }

  async function handleAddMember(email) {
    setIsAddingMember(true);
    setError("");
    setFeedback("");
    try {
      const result = await createProjectMember(token, projectId, { user_email: email, role: "member" });

      if (result.result_type === "member_added") {
        const memberPayload = await listProjectMembers(token, projectId);
        setMembers(memberPayload);
        setFeedback("Member added to project successfully.");
      } else {
        const invitationPayload = await listProjectInvitations(token, projectId);
        setInvitations(invitationPayload);
        setFeedback(`Invitation created for ${result.invitation?.email || email}.`);
      }

      setShowMemberForm(false);
      setNewMemberEmail("");
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return logout();
      setError(err instanceof ApiError ? err.message : "Failed to add member.");
      return false;
    } finally {
      setIsAddingMember(false);
    }
  }

  async function handleRevokeInvitation(invitationId) {
    setRevokingInvitationId(invitationId);
    setError("");
    setFeedback("");

    try {
      await deleteProjectInvitation(token, projectId, invitationId);
      const refreshed = await refreshInvitationInventory();
      if (!refreshed) {
        return;
      }

      setFeedback("Invitation revoked.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return logout();
      setError(err instanceof ApiError ? err.message : "Failed to revoke invitation.");
    } finally {
      setRevokingInvitationId(null);
    }
  }



  async function handleDeleteMember(memberId) {
    setMemberDeleteTarget(memberId);
  }

  async function confirmDeleteMember() {
    if (!memberDeleteTarget) return;
    setIsDeletingMember(true);
    setError("");
    setFeedback("");
    try {
      await deleteProjectMember(token, projectId, memberDeleteTarget);
      const memberPayload = await listProjectMembers(token, projectId);
      setMembers(memberPayload);
      setFeedback("Member removed.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return logout();
      setError(err instanceof ApiError ? err.message : "Failed to remove member.");
    } finally {
      setIsDeletingMember(false);
      setMemberDeleteTarget(null);
    }
  }

  const currentUserMembership = members.find(m => m.user_id === user?.id);
  const isCurrentUserOwner = (currentUserMembership?.role || "").toLowerCase() === "owner";

  const selectedDocument = documents[0] ?? null;
  const filteredRequirements = requirements.filter((requirement) => {
    const query = requirementSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return [
      requirement.requirement_code,
      requirement.title,
      requirement.description || ""
    ].some((value) => value.toLowerCase().includes(query));
  });
  const filteredTestCases = testCases.filter((testCase) => {
    const query = testCaseSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return [
      testCase.test_case_code,
      testCase.title,
      testCase.description || ""
    ].some((value) => value.toLowerCase().includes(query));
  });
  const documentLookup = new Map(documents.map((document) => [document.id, document.title]));
  const latestWorkspaceTimestamp = getLatestProjectWorkspaceTimestamp(project, documents);
  const stats = [
    {
      label: "Contracts",
      value: String(documents.length)
    },
    {
      label: "Members",
      value: `${members.length} active / ${invitations.length} pending`
    },
    {
      label: "Last Updated",
      value: latestWorkspaceTimestamp,
      detail: project?.description || "No project description"
    }
  ];

  const drawerTitle = editingDocumentId ? "Edit Contract" : "New Contract";
  const drawerSubtitle = editingDocumentId
    ? "Update contract metadata."
    : "Create a new contract in this project.";

  /* ─── Binance-spec buttons ─── */
  const pillBtnCls = "flex items-center gap-2 bg-[#F0B90B] text-[#1E2026] px-5 py-2 font-semibold text-[14px] border-none cursor-pointer hover:bg-[#E0AB0A] disabled:bg-[#E6E8EA] disabled:text-[#848E9C] disabled:cursor-not-allowed";
  const pillBtnStyle = { borderRadius: "50px", boxShadow: "rgb(153,153,153) 0px 2px 10px -3px", transition: "all 200ms ease" };
  const formBtnPrimary = "flex items-center gap-1.5 bg-[#F0B90B] text-[#1E2026] px-5 py-2 font-semibold text-[14px] border-none cursor-pointer disabled:opacity-50";
  const formBtnSecondary = "flex items-center gap-1.5 bg-white border border-[#E6E8EA] text-[#32313A] px-5 py-2 font-semibold text-[14px] cursor-pointer";
  const formBtnStyle = { borderRadius: "6px", transition: "all 200ms ease" };

  return (
    <>
      <main className="max-w-[1200px] mx-auto px-8 py-8">
        {/* Error/Feedback — Toast notifications */}


        {/* Project header */}
        <div className="mb-6">
          <p className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Link to="/dashboard" className="text-[#848E9C] no-underline hover:text-[#1E2026]" style={{ transition: "color 150ms ease" }}>My Projects</Link>
            <span>/</span>
            <span className="text-[#1E2026]">{project?.name ?? `Project ${projectId}`}</span>
          </p>
          <h2 className="sr-only">Project Workspace</h2>
          <h1 className="text-[28px] font-medium text-[#1E2026] mb-1" style={{ lineHeight: "1.00" }}>{project?.name ?? "Project workspace"}</h1>
          <p className="text-[14px] font-medium text-[#848E9C] mt-2" style={{ lineHeight: "1.43" }}>{project?.description || "Project workspace for contract review."}</p>
        </div>

        {/* Quick stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          {stats.map((s, i) => (
            <div key={i} className="bg-white border border-[#E6E8EA] p-5 flex items-center gap-4" style={{ borderRadius: "12px", boxShadow: "rgba(32, 32, 37, 0.05) 0px 3px 5px 0px" }}>
              <div className="w-10 h-10 flex items-center justify-center text-[#F0B90B]" style={{ borderRadius: "8px", background: "rgba(240, 185, 11, 0.1)" }}>
                {i === 0 ? <FileText size={18} /> : i === 1 ? <Users size={18} /> : <Clock size={18} />}
              </div>
              <div>
                <p className="text-[14px] font-bold text-[#1E2026] leading-tight">{s.value}</p>
                <p className="text-[12px] font-semibold text-[#848E9C]">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs â€” Binance spec: border-b with gold active indicator */}
        <nav className="flex gap-6 border-b border-[#E6E8EA] mb-6 overflow-x-auto" role="tablist">
          {[
            { key: "documents", label: "Contracts", count: documents.length },
            { key: "requirements", label: "Obligations", count: requirements.length },
            { key: "testcases", label: "Compliance Checks", count: testCases.length },
            { key: "team", label: "Team", count: members.length },
            { key: "activity", label: "Activity", count: activityLogs.length },
          ].map(tab => (
            <button
              key={tab.key}
              className={`pb-3 text-[14px] font-semibold whitespace-nowrap flex items-center gap-2 border-b-2 bg-transparent border-x-0 border-t-0 cursor-pointer ${activeTab === tab.key ? "border-[#F0B90B] text-[#1E2026]" : "border-transparent text-[#848E9C]"}`}
              style={{ transition: "all 200ms ease" }}
              onClick={() => setActiveTab(tab.key)}
              role="tab"
              aria-selected={activeTab === tab.key}
              type="button"
            >
              {tab.label}
              <span className="bg-[#F5F5F5] text-[#32313A] px-2 py-0.5 text-[11px] font-semibold" style={{ borderRadius: "50px" }}>{tab.count}</span>
            </button>
          ))}
        </nav>

        {/* â• â• â•  CONTRACTS TAB â• â• â•  */}
        {activeTab === "documents" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card
                title="Contract Inventory"
                aside={documents.length > 0 ? (
                  <button className={pillBtnCls} style={pillBtnStyle} onClick={openCreateDocumentForm} type="button"><Plus size={14} /> New Contract</button>
                ) : undefined}
              >
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map(i => <div key={i} className="h-12 bg-[#F5F5F5] animate-pulse" style={{ borderRadius: "8px" }} />)}
                  </div>
                ) : documents.length > 0 ? (
                  <InlineTable
                    headers={["Title", "Type", "Description", "Last Activity", "Actions"]}
                    colWidths={["36%", "10%", "18%", "18%", "18%"]}
                    rows={documents.map(doc => [
                      <Link key={doc.id} className="font-semibold text-[#1E2026] no-underline" style={{ transition: "color 200ms ease" }} onMouseEnter={e => { e.target.style.color = "#F0B90B"; }} onMouseLeave={e => { e.target.style.color = "#1E2026"; }} to={`/contracts/${encodeId(doc.id)}`}>{doc.title}</Link>,
                      <span key={`${doc.id}-t`} className="text-[12px] text-[#848E9C] font-medium">{doc.document_type || "Contract"}</span>,
                      <span key={`${doc.id}-d`} className="text-[12px] text-[#848E9C]">{doc.description || "No description"}</span>,
                      <span key={`${doc.id}-u`} className="text-[12px] text-[#848E9C]">{formatDateTime(doc.updated_at)}</span>,
                      <div key={`${doc.id}-a`} className="flex items-center gap-1">
                        <Link className="p-1.5 text-[#848E9C]" style={{ borderRadius: "6px", transition: "color 200ms ease" }} to={`/contracts/${encodeId(doc.id)}`} title="Open"><FolderOpen size={15} /></Link>
                        <Link className="p-1.5 text-[#F0B90B]" style={{ borderRadius: "6px", transition: "color 200ms ease" }} to={`/contracts/${encodeId(doc.id)}/chat`} title="Q&A"><MessageSquare size={15} /></Link>
                        <button aria-label="Edit" className="p-1.5 text-[#848E9C] bg-transparent border-none cursor-pointer" style={{ borderRadius: "6px", transition: "color 200ms ease" }} onClick={() => beginDocumentEdit(doc)} type="button" title="Edit"><Pencil size={15} /></button>
                        <button aria-label="Delete" className="p-1.5 text-[#848E9C] bg-transparent border-none cursor-pointer" style={{ borderRadius: "6px", transition: "color 200ms ease" }} onClick={() => setDeleteTarget(doc)} type="button" title="Delete"><Trash2 size={15} /></button>
                      </div>
                    ])}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-[#E6E8EA]" style={{ borderRadius: "12px" }}>
                    <FolderOpen size={32} className="mb-3 text-[#848E9C]" />
                    <h3 className="text-[16px] font-semibold text-[#1E2026] mb-1">No contracts yet</h3>
                    <p className="text-[14px] font-medium text-[#848E9C] mb-4">Create your first contract to start reviewing.</p>
                    <button className={pillBtnCls} style={pillBtnStyle} onClick={openCreateDocumentForm} type="button"><Plus size={16} /> New Contract</button>
                  </div>
                )}
              </Card>
            </div>
            <div className="lg:col-span-1 flex flex-col gap-6">
              <Card title="Workspace Snapshot">
                <dl className="space-y-4">
                  {[["Contracts", documents.length], ["Obligations", requirements.length], ["Compliance Checks", testCases.length]].map(([label, val], i, arr) => (
                    <div key={label} className={`flex items-center justify-between gap-4 ${i < arr.length - 1 ? "border-b border-[#E6E8EA] pb-3" : ""}`}>
                      <dt className="text-[12px] font-medium text-[#848E9C]">{label}</dt>
                      <dd className="text-[14px] font-bold text-[#1E2026]">{val}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
              <Card title="Recent Activity">
                {activityLogs.length > 0 ? (
                  <div className="relative pl-3 border-l-2 border-[#E6E8EA] space-y-5">
                    {activityLogs.slice(0, 3).map(entry => (
                      <div key={entry.id} className="relative">
                        <div className="absolute -left-[11px] top-1.5 w-2.5 h-2.5 bg-[#F0B90B]" style={{ borderRadius: "50%", border: "2px solid white" }} />
                        <p className="text-[13px] font-medium text-[#1E2026]">{entry.description}</p>
                        <p className="text-[11px] text-[#848E9C] mt-0.5">{formatDateTime(entry.created_at)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-[#848E9C] text-center py-4">No recent activity.</p>
                )}
              </Card>
            </div>
          </div>
        )}

        {/* â• â• â•  OBLIGATIONS TAB â• â• â•  */}
        {activeTab === "requirements" && (
          <Card
            title="Obligations Inventory"
            aside={
              <div className="flex items-center gap-3">
                {(requirements.length > 0 || showRequirementForm) && (
                  <div style={{ position: "relative" }}>
                    <input
                      aria-label="Search obligations"
                      placeholder="Search by code or title"
                      type="search"
                      value={requirementSearch}
                      onChange={e => setRequirementSearch(e.target.value)}
                      className="h-8 pl-3 pr-3 bg-[#F5F5F5] border border-[#E6E8EA] text-[13px] text-[#1E2026] placeholder-[#848E9C]"
                      style={{ borderRadius: "8px", outline: "none", width: "200px", transition: "border-color 200ms ease" }}
                      onFocus={e => { e.target.style.borderColor = "#000"; }}
                      onBlur={e => { e.target.style.borderColor = "#E6E8EA"; }}
                    />
                  </div>
                )}
                <button className={pillBtnCls} style={{ ...pillBtnStyle, padding: "6px 14px", fontSize: "13px" }} onClick={openCreateRequirementForm} type="button" disabled={documents.length === 0}><Plus size={14} /> New Obligation</button>
              </div>
            }
          >
            {showRequirementForm && (
              <form className="bg-[#F5F5F5] border border-[#E6E8EA] p-5 mb-5 space-y-4" style={{ borderRadius: "12px" }} onSubmit={handleRequirementSubmit}>
                <FormSelect label="Obligation contract" disabled={Boolean(editingRequirementId)} onChange={e => setRequirementForm(v => ({ ...v, documentId: e.target.value }))} value={requirementForm.documentId}>
                  <option value="">Select contract</option>
                  {documents.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                </FormSelect>
                <FormInput label="Obligation code" disabled={Boolean(editingRequirementId)} onChange={e => setRequirementForm(v => ({ ...v, requirementCode: e.target.value }))} placeholder="OBL-NDA-001" type="text" value={requirementForm.requirementCode} />
                <FormInput label="Obligation title" onChange={e => setRequirementForm(v => ({ ...v, title: e.target.value }))} placeholder="Confidentiality obligation" type="text" value={requirementForm.title} />
                <FormTextarea label="Description" onChange={e => setRequirementForm(v => ({ ...v, description: e.target.value }))} rows={2} value={requirementForm.description} />
                <div className="flex gap-3 pt-3 border-t border-[#E6E8EA]">
                  <button className={formBtnPrimary} style={formBtnStyle} disabled={isSavingRequirement} type="submit">{isSavingRequirement ? "Saving..." : editingRequirementId ? "Save Obligation" : "Create Obligation"}</button>
                  <button className={formBtnSecondary} style={formBtnStyle} disabled={isSavingRequirement} onClick={resetRequirementForm} type="button">Cancel</button>
                </div>
              </form>
            )}
            {documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-[#E6E8EA]" style={{ borderRadius: "12px" }}>
                <FileText size={32} className="mb-3 text-[#848E9C]" />
                <h3 className="text-[15px] font-semibold text-[#1E2026] mb-1">No contracts yet</h3>
                <p className="text-[13px] text-[#848E9C]">Create a contract first before adding obligations.</p>
              </div>
            ) : filteredRequirements.length > 0 ? (
              <InlineTable
                headers={["Code", "Title", "Contract", "Description", "Actions"]}
                colWidths={["12%", "25%", "22%", "30%", "11%"]}
                rows={filteredRequirements.map(r => [
                  <span key={`${r.id}-c`} className="px-2 py-0.5 bg-[#F5F5F5] border border-[#E6E8EA] text-[11px] font-semibold text-[#32313A]" style={{ borderRadius: "6px" }}>{r.requirement_code}</span>,
                  <span key={`${r.id}-t`} className="font-semibold text-[#1E2026]">{r.title}</span>,
                  <span key={`${r.id}-d`} className="text-[#848E9C]">{documentLookup.get(r.document_id) || `Contract ${r.document_id}`}</span>,
                  <span key={`${r.id}-de`} className="text-[#848E9C]">{r.description || "—"}</span>,
                  <div key={`${r.id}-a`} className="flex items-center gap-1">
                    <button aria-label={`Edit obligation ${r.requirement_code}`} className="p-1.5 text-[#848E9C] bg-transparent border-none cursor-pointer" style={{ borderRadius: "6px" }} onClick={() => beginRequirementEdit(r)} type="button"><Pencil size={14} /></button>
                    <button aria-label={`Delete obligation ${r.requirement_code}`} className="p-1.5 text-[#848E9C] bg-transparent border-none cursor-pointer" style={{ borderRadius: "6px" }} onClick={() => setRequirementDeleteTarget(r)} type="button"><Trash2 size={14} /></button>
                  </div>
                ])}
              />
            ) : requirements.length > 0 ? (
              <p className="text-[14px] text-[#848E9C] py-4 text-center">No obligations match your search.</p>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-[#E6E8EA]" style={{ borderRadius: "12px" }}>
                <ClipboardList size={32} className="mb-3 text-[#848E9C]" />
                <h3 className="text-[15px] font-semibold text-[#1E2026] mb-1">No obligations yet</h3>
                <p className="text-[13px] text-[#848E9C]">Add your first obligation to start tracking compliance.</p>
              </div>
            )}
          </Card>
        )}

        {/* â• â• â•  COMPLIANCE CHECKS TAB â• â• â•  */}
        {activeTab === "testcases" && (
          <Card
            title="Compliance Checks Inventory"
            aside={
              <div className="flex items-center gap-3">
                {(testCases.length > 0 || showTestCaseForm) && (
                  <input
                    aria-label="Search compliance checks"
                    placeholder="Search by code or title"
                    type="search"
                    value={testCaseSearch}
                    onChange={e => setTestCaseSearch(e.target.value)}
                    className="h-8 pl-3 pr-3 bg-[#F5F5F5] border border-[#E6E8EA] text-[13px] text-[#1E2026] placeholder-[#848E9C]"
                    style={{ borderRadius: "8px", outline: "none", width: "200px", transition: "border-color 200ms ease" }}
                    onFocus={e => { e.target.style.borderColor = "#000"; }}
                    onBlur={e => { e.target.style.borderColor = "#E6E8EA"; }}
                  />
                )}
                <button className={pillBtnCls} style={{ ...pillBtnStyle, padding: "6px 14px", fontSize: "13px" }} onClick={openCreateTestCaseForm} type="button"><Plus size={14} /> New Compliance Check</button>
              </div>
            }
          >
            {showTestCaseForm && (
              <form className="bg-[#F5F5F5] border border-[#E6E8EA] p-5 mb-5 space-y-4" style={{ borderRadius: "12px" }} onSubmit={handleTestCaseSubmit}>
                <FormInput label="Compliance check code" disabled={Boolean(editingTestCaseId)} onChange={e => setTestCaseForm(v => ({ ...v, testCaseCode: e.target.value }))} placeholder="CC-NDA-01" type="text" value={testCaseForm.testCaseCode} />
                <FormInput label="Compliance check title" onChange={e => setTestCaseForm(v => ({ ...v, title: e.target.value }))} placeholder="NDA confidentiality clause verified" type="text" value={testCaseForm.title} />
                <FormTextarea label="Description" onChange={e => setTestCaseForm(v => ({ ...v, description: e.target.value }))} rows={2} value={testCaseForm.description} />
                <FormSelect label="Priority" onChange={e => setTestCaseForm(v => ({ ...v, priority: e.target.value }))} value={testCaseForm.priority}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </FormSelect>
                <div className="flex gap-3 pt-3 border-t border-[#E6E8EA]">
                  <button className={formBtnPrimary} style={formBtnStyle} disabled={isSavingTestCase} type="submit">{isSavingTestCase ? "Saving..." : editingTestCaseId ? "Save Compliance Check" : "Create Compliance Check"}</button>
                  <button className={formBtnSecondary} style={formBtnStyle} disabled={isSavingTestCase} onClick={resetTestCaseForm} type="button">Cancel</button>
                </div>
              </form>
            )}
            {filteredTestCases.length > 0 ? (
              <InlineTable
                headers={["Code", "Title", "Priority", "Description", "Actions"]}
                colWidths={["12%", "28%", "12%", "36%", "12%"]}
                rows={filteredTestCases.map(tc => [
                  <span key={`${tc.id}-c`} className="px-2 py-0.5 bg-[#F5F5F5] border border-[#E6E8EA] text-[11px] font-semibold text-[#32313A]" style={{ borderRadius: "6px" }}>{tc.test_case_code}</span>,
                  <span key={`${tc.id}-t`} className="font-semibold text-[#1E2026]">{tc.title}</span>,
                  <span key={`${tc.id}-p`} className={`px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${tc.priority === "high" ? "text-[#F6465D] bg-[#F6465D]/5 border border-[#F6465D]/20" : tc.priority === "medium" ? "text-[#F0B90B] bg-[#F0B90B]/5 border border-[#F0B90B]/20" : "text-[#848E9C] bg-[#F5F5F5] border border-[#E6E8EA]"}`} style={{ borderRadius: "6px" }}>{tc.priority || "unspecified"}</span>,
                  <span key={`${tc.id}-d`} className="text-[#848E9C]">{tc.description || "—"}</span>,
                  <div key={`${tc.id}-a`} className="flex items-center gap-1">
                    <button aria-label={`Edit compliance check ${tc.test_case_code}`} className="p-1.5 text-[#848E9C] bg-transparent border-none cursor-pointer" style={{ borderRadius: "6px" }} onClick={() => beginTestCaseEdit(tc)} type="button"><Pencil size={14} /></button>
                    <button aria-label={`Delete compliance check ${tc.test_case_code}`} className="p-1.5 text-[#848E9C] bg-transparent border-none cursor-pointer" style={{ borderRadius: "6px" }} onClick={() => setTestCaseDeleteTarget(tc)} type="button"><Trash2 size={14} /></button>
                  </div>
                ])}
              />
            ) : testCases.length > 0 ? (
              <p className="text-[14px] text-[#848E9C] py-4 text-center">No compliance checks match your search.</p>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-[#E6E8EA]" style={{ borderRadius: "12px" }}>
                <CheckSquare size={32} className="mb-3 text-[#848E9C]" />
                <h3 className="text-[15px] font-semibold text-[#1E2026] mb-1">No compliance checks yet</h3>
                <p className="text-[13px] text-[#848E9C]">Add checks to verify your contracts meet obligations.</p>
              </div>
            )}
          </Card>
        )}

        {/* ═══ TEAM TAB ═══ */}
        {activeTab === "team" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ── Left: Active Members ── */}
            <div className="lg:col-span-2 space-y-5">
              <Card
                title="Active Members"
                aside={
                  isCurrentUserOwner && (
                    <button
                      className={pillBtnCls}
                      style={{ ...pillBtnStyle, padding: "6px 14px", fontSize: "13px" }}
                      onClick={() => { setShowMemberForm(true); setError(""); setFeedback(""); }}
                      type="button"
                    >
                      <Plus size={14} /> Invite Member
                    </button>
                  )
                }
              >
                {members.length > 0 ? (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }} className="space-y-2">
                    {members.map(m => {
                      const initials = (m.user_display_name || m.user_email || "U").slice(0, 2).toUpperCase();
                      const isOwner = (m.role || "").toLowerCase() === "owner";
                      const isAdmin = (m.role || "").toLowerCase() === "admin";
                      const roleColor = isOwner
                        ? "bg-[#FFF8E6] border-[#F0B90B44] text-[#B07D00]"
                        : isAdmin
                          ? "bg-[#E8F5E9] border-[#A5D6A7] text-[#1B5E20]"
                          : "bg-[#F5F5F5] border-[#E6E8EA] text-[#474D57]";
                      return (
                        <li key={m.id} className="flex items-center justify-between px-4 py-3 border border-[#E6E8EA] bg-white" style={{ borderRadius: "10px", transition: "box-shadow 200ms ease" }}
                          onMouseEnter={e => e.currentTarget.style.boxShadow = "rgba(32,32,37,0.06) 0px 2px 8px 0px"}
                          onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 flex items-center justify-center text-[13px] font-bold text-white bg-[#F0B90B] flex-shrink-0" style={{ borderRadius: "50%" }}>
                              {initials}
                            </div>
                            <div>
                              <p className="text-[14px] font-semibold text-[#1E2026] leading-snug">{m.user_display_name || "No Name"}</p>
                              <p className="text-[12px] text-[#848E9C] font-medium">{m.user_email || `User #${m.user_id}`}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2.5 py-0.5 border text-[11px] font-semibold uppercase tracking-wider ${roleColor}`} style={{ borderRadius: "6px" }}>
                              {m.role || "Member"}
                            </span>
                            {isCurrentUserOwner && (
                              <button
                                aria-label={`Remove member ${m.user_email || m.user_display_name}`}
                                className="p-1.5 text-[#848E9C] bg-transparent border-none cursor-pointer hover:text-[#F6465D]"
                                style={{ borderRadius: "6px", transition: "color 200ms ease" }}
                                onClick={() => handleDeleteMember(m.id)}
                                type="button"
                                title="Remove member"
                              >
                                <LogOut size={14} />
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center justify-center p-10 text-center border-2 border-dashed border-[#E6E8EA]" style={{ borderRadius: "12px" }}>
                    <Users size={28} className="mb-3 text-[#C0C6CF]" />
                    <p className="text-[14px] font-semibold text-[#1E2026] mb-1">No members yet</p>
                    <p className="text-[13px] text-[#848E9C] mb-4">Invite teammates to collaborate on this project.</p>
                    <button
                      className={pillBtnCls}
                      style={{ ...pillBtnStyle, padding: "6px 18px", fontSize: "13px" }}
                      onClick={() => { setShowMemberForm(true); setError(""); }}
                      type="button"
                    >
                      <Plus size={14} /> Invite First Member
                    </button>
                  </div>
                )}
              </Card>

              {/* ── Pending Invitations ── */}
              {invitations.length > 0 && (
                <Card title="Pending Invitations" aside={`${invitations.length} pending`}>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }} className="space-y-2">
                    {invitations.map(inv => (
                      <li key={inv.id} className="flex items-center justify-between px-4 py-3 border border-[#E6E8EA] bg-[#FFF8E6]" style={{ borderRadius: "10px" }}>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 flex items-center justify-center text-[12px] font-bold text-[#B07D00] bg-[#F0B90B]/15 border border-[#F0B90B]/30 flex-shrink-0" style={{ borderRadius: "50%" }}>
                            {inv.email[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold text-[#1E2026]">{inv.email}</p>
                            <p className="text-[11px] text-[#848E9C]">Invited by {inv.invited_by_display_name || "Unknown"} · {formatDateTime(inv.created_at)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 bg-[#FFF8E6] border border-[#F0B90B44] text-[11px] font-semibold text-[#B07D00] uppercase tracking-wider" style={{ borderRadius: "6px" }}>
                            Pending
                          </span>
                          {isCurrentUserOwner && (
                            <button
                              aria-label={`Revoke invitation ${inv.email}`}
                              className="p-1.5 text-[#848E9C] bg-transparent border-none cursor-pointer hover:text-[#F6465D] disabled:opacity-50"
                              style={{ borderRadius: "6px", transition: "color 200ms ease" }}
                              disabled={revokingInvitationId === inv.id}
                              onClick={() => handleRevokeInvitation(inv.id)}
                              type="button"
                              title="Revoke invitation"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>

            {/* ── Right: Info column ── */}
            <div className="space-y-5">
              <Card title="Access Levels">
                <ul className="space-y-3" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {[
                    { role: "Owner", color: "bg-[#FFF8E6] border-[#F0B90B44] text-[#B07D00]", desc: "Full access: manage members, edit & delete project" },
                    { role: "Admin", color: "bg-[#E8F5E9] border-[#A5D6A7] text-[#1B5E20]", desc: "Manage contracts, compare runs, review" },
                    { role: "Member", color: "bg-[#F5F5F5] border-[#E6E8EA] text-[#474D57]", desc: "View and collaborate on all contracts" },
                  ].map(({ role, color, desc }) => (
                    <li key={role} className="flex items-start gap-3">
                      <span className={`px-2.5 py-0.5 border text-[11px] font-semibold uppercase tracking-wider flex-shrink-0 mt-0.5 ${color}`} style={{ borderRadius: "6px" }}>{role}</span>
                      <p className="text-[12px] text-[#848E9C] font-medium leading-snug">{desc}</p>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title="Team Summary">
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-[#E6E8EA]">
                    <span className="text-[13px] font-medium text-[#848E9C]">Active members</span>
                    <span className="text-[14px] font-bold text-[#1E2026]">{members.length}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#E6E8EA]">
                    <span className="text-[13px] font-medium text-[#848E9C]">Pending invitations</span>
                    <span className="text-[14px] font-bold text-[#F0B90B]">{invitations.length}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-[13px] font-medium text-[#848E9C]">Owners</span>
                    <span className="text-[14px] font-bold text-[#1E2026]">{members.filter(m => (m.role || "").toLowerCase() === "owner").length}</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ═══ INVITE MEMBER MODAL ═══ */}
        {showMemberForm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(30,32,38,0.45)", backdropFilter: "blur(4px)" }}
            onClick={() => { if (!isAddingMember) { setShowMemberForm(false); setNewMemberEmail(""); } }}
          >
            <div
              aria-label="Invite Member"
              aria-modal="true"
              className="w-full max-w-[440px] bg-white border border-[#E6E8EA] overflow-hidden"
              onClick={e => e.stopPropagation()}
              role="dialog"
              style={{ borderRadius: "12px", boxShadow: "rgba(0,0,0,0.18) 0px 8px 32px", animation: "pdModalIn 0.2s ease-out" }}
            >
              {/* Modal header */}
              <div className="relative px-6 pt-6 pb-4 border-b border-[#E6E8EA] bg-[#F5F5F5]">
                <button
                  className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-transparent border-none text-[#848E9C] hover:text-[#1E2026] cursor-pointer"
                  style={{ borderRadius: "6px", transition: "color 200ms ease" }}
                  disabled={isAddingMember}
                  onClick={() => { setShowMemberForm(false); setNewMemberEmail(""); }}
                  type="button"
                >
                  <X size={18} />
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 flex items-center justify-center text-[#F0B90B]" style={{ borderRadius: "8px", background: "rgba(240,185,11,0.1)" }}>
                    <Users size={20} />
                  </div>
                  <div>
                    <h2 className="text-[18px] font-semibold text-[#1E2026]">Invite Member</h2>
                    <p className="text-[13px] text-[#848E9C] mt-0.5">Share this project with a teammate</p>
                  </div>
                </div>
              </div>

              {/* Modal body */}
              <form
                className="px-6 pb-6 pt-5 space-y-4"
                onSubmit={async e => {
                  e.preventDefault();
                  if (newMemberEmail.trim()) await handleAddMember(newMemberEmail.trim());
                }}
              >
                <div>
                  <label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider block mb-1.5">
                    Email address
                  </label>
                  <input
                    aria-label="Member email"
                    autoFocus
                    className="w-full h-11 px-3 bg-[#F5F5F5] border border-[#E6E8EA] text-[14px] font-medium text-[#1E2026] placeholder-[#848E9C]"
                    style={{ borderRadius: "8px", outline: "none", transition: "border-color 200ms ease" }}
                    onFocus={e => { e.target.style.borderColor = "#000"; }}
                    onBlur={e => { e.target.style.borderColor = "#E6E8EA"; }}
                    type="email"
                    placeholder="teammate@company.com"
                    value={newMemberEmail}
                    onChange={e => setNewMemberEmail(e.target.value)}
                    required
                  />
                  <p className="text-[12px] text-[#848E9C] mt-1.5">
                    If they already have an account, they'll be added immediately. Otherwise, an invitation will be sent.
                  </p>
                </div>

                <div className="flex gap-3 pt-2 border-t border-[#E6E8EA]">
                  <button
                    className={formBtnPrimary}
                    style={{ ...formBtnStyle, flex: 1, justifyContent: "center" }}
                    type="submit"
                    disabled={isAddingMember || !newMemberEmail.trim()}
                  >
                    {isAddingMember ? "Sending…" : "Send Invitation"}
                  </button>
                  <button
                    className={formBtnSecondary}
                    style={formBtnStyle}
                    type="button"
                    disabled={isAddingMember}
                    onClick={() => { setShowMemberForm(false); setNewMemberEmail(""); }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ═══ ACTIVITY TAB ═══ */}
        {activeTab === "activity" && (
          <Card title="Activity Log" aside={`${activityLogs.length} events`}>
            {activityLogs.length > 0 ? (
              <ul className="space-y-1 max-h-[60vh] overflow-y-auto pr-2" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {activityLogs.map(entry => (
                  <li key={entry.id} className="bg-white border border-transparent px-4 py-3 flex items-center justify-between" style={{ borderRadius: "8px", transition: "all 200ms ease" }} onMouseEnter={e => { e.currentTarget.style.background = "#F5F5F5"; e.currentTarget.style.borderColor = "#E6E8EA"; }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "transparent"; }}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[#F5F5F5] border border-[#E6E8EA] flex items-center justify-center flex-shrink-0 text-[#848E9C]" style={{ borderRadius: "8px" }}><History size={14} /></div>
                      <div>
                        <p className="font-semibold text-[13px] text-[#1E2026]">{entry.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-1.5 py-0.5 bg-[#F0B90B]/10 border border-[#F0B90B]/20 text-[#F0B90B] text-[10px] uppercase font-bold tracking-wider" style={{ borderRadius: "4px" }}>{entry.action}</span>
                          <span className="px-1.5 py-0.5 bg-[#F5F5F5] border border-[#E6E8EA] text-[#848E9C] text-[10px] uppercase tracking-wider" style={{ borderRadius: "4px" }}>{entry.entity_type}</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-[12px] text-[#848E9C] font-medium">{entry.created_at ? formatDateTime(entry.created_at) : ""}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-[#E6E8EA]" style={{ borderRadius: "12px" }}>
                <History size={32} className="mb-3 text-[#848E9C]" />
                <h3 className="text-[15px] font-semibold text-[#1E2026] mb-1">No activity recorded yet</h3>
                <p className="text-[13px] text-[#848E9C]">Actions like creating contracts and adding members will appear here.</p>
              </div>
            )}
          </Card>
        )}
      </main>

      {/* â• â• â•  CONTRACT MODAL (replaces WorkspaceDrawer) â• â• â•  */}
      {showDocumentForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(30,32,38,0.4)", backdropFilter: "blur(4px)" }} onClick={() => { if (!isSavingDocument) resetDocumentForm(); }}>
          <div aria-label={drawerTitle} aria-modal="true" className="w-full max-w-[480px] bg-white border border-[#E6E8EA] overflow-hidden" onClick={e => e.stopPropagation()} role="dialog" style={{ borderRadius: "12px", boxShadow: "rgba(0,0,0,0.15) 0px 8px 30px", animation: "pdModalIn 0.2s ease-out" }}>
            <div className="relative px-6 pt-6 pb-4 border-b border-[#E6E8EA] bg-[#F5F5F5]">
              <button className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-transparent border-none text-[#848E9C] cursor-pointer" style={{ borderRadius: "6px", transition: "color 200ms ease" }} disabled={isSavingDocument} onClick={resetDocumentForm} type="button"><X size={18} /></button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center" style={{ borderRadius: "8px", background: "rgba(240,185,11,0.1)" }}><FileText size={20} className="text-[#F0B90B]" /></div>
                <div>
                  <h2 className="text-[20px] font-semibold text-[#1E2026]" style={{ lineHeight: "1.25" }}>{drawerTitle}</h2>
                  <p className="text-[14px] font-medium text-[#848E9C] mt-0.5">{drawerSubtitle}</p>
                </div>
              </div>
            </div>
            <form className="px-6 pb-6 pt-5 space-y-4" onSubmit={handleDocumentSubmit}>
              <FormInput label="Contract title" onChange={e => setDocumentForm(v => ({ ...v, title: e.target.value }))} placeholder="Vendor Master Services Agreement" type="text" value={documentForm.title} />
              <FormInput label="Contract type" onChange={e => setDocumentForm(v => ({ ...v, document_type: e.target.value }))} placeholder="MSA" type="text" value={documentForm.document_type} />
              <FormTextarea label="Description" onChange={e => setDocumentForm(v => ({ ...v, description: e.target.value }))} placeholder="Describe the review purpose or scope." rows={3} value={documentForm.description} />
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E6E8EA]">
                <button className={formBtnSecondary} style={formBtnStyle} disabled={isSavingDocument} onClick={resetDocumentForm} type="button">Cancel</button>
                <button className={formBtnPrimary} style={formBtnStyle} disabled={isSavingDocument} type="submit">{isSavingDocument ? "Saving..." : editingDocumentId ? "Save Contract" : "Create Contract"}</button>
              </div>
            </form>
          </div>
          <style>{`@keyframes pdModalIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>
      )}

      <ConfirmDialog cancelLabel="Cancel" confirmLabel={isDeletingDocument ? "Deleting..." : "Delete Contract"} description={deleteTarget ? `Are you sure you want to delete "${deleteTarget.title}"? This action cannot be undone.` : ""} isProcessing={isDeletingDocument} onCancel={() => setDeleteTarget(null)} onConfirm={handleDeleteDocument} open={Boolean(deleteTarget)} title="Delete Contract" />
      <ConfirmDialog cancelLabel="Cancel" confirmLabel={isDeletingRequirement ? "Deleting..." : "Delete Obligation"} description={requirementDeleteTarget ? `Are you sure you want to delete "${requirementDeleteTarget.requirement_code}"?` : ""} isProcessing={isDeletingRequirement} onCancel={() => setRequirementDeleteTarget(null)} onConfirm={handleDeleteRequirement} open={Boolean(requirementDeleteTarget)} title="Delete Obligation" />
      <ConfirmDialog cancelLabel="Cancel" confirmLabel={isDeletingTestCase ? "Deleting..." : "Delete Compliance Check"} description={testCaseDeleteTarget ? `Are you sure you want to delete "${testCaseDeleteTarget.test_case_code}"?` : ""} isProcessing={isDeletingTestCase} onCancel={() => setTestCaseDeleteTarget(null)} onConfirm={handleDeleteTestCase} open={Boolean(testCaseDeleteTarget)} title="Delete Compliance Check" />
      <ConfirmDialog cancelLabel="Cancel" confirmLabel={isDeletingMember ? "Removing..." : "Remove Member"} description="Are you sure you want to remove this member from the project?" isProcessing={isDeletingMember} onCancel={() => setMemberDeleteTarget(null)} onConfirm={confirmDeleteMember} open={Boolean(memberDeleteTarget)} title="Remove Member" />

      {/* Toast notifications */}
      {error && <Toast message={error} type="error" onClose={() => setError("")} />}
      {feedback && <Toast message={feedback} type="success" onClose={() => setFeedback("")} />}
    </>
  );
}
