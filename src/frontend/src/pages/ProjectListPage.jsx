import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Database, FolderHeart, FolderOpen, Pencil, Plus, Trash2,
  Search, SearchX, Clock, FileText, ArrowRight, Sparkles, MoreVertical, X, FolderPlus
} from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { useActiveProject } from "../context/ActiveProjectContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Toast } from "../components/Toast";
// Modal is now inline — no WorkspaceDrawer needed
import { ApiError, createProject, deleteProject, listProjects, seedDemoWorkspace, updateProject } from "../lib/api";
import { formatDateTime } from "../lib/formatters";

const EMPTY_PROJECT_FORM = {
  name: "",
  description: ""
};

function getTimeAgo(dateStr) {
  if (!dateStr) return "";
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDateTime(dateStr);
}

function getInitials(name) {
  return name
    .split(/[\s_-]+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || "")
    .join("");
}

/* ─── Project Card (Binance spec: 12px radius, 5% shadow, #F0B90B only) ─── */
function ProjectCard({ project, index, onEdit, onDelete }) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className="group relative bg-white border border-[#E6E8EA] overflow-hidden cursor-pointer"
      style={{
        borderRadius: "12px",
        boxShadow: "rgba(32, 32, 37, 0.05) 0px 3px 5px 0px",
        transition: "box-shadow 200ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "rgba(8, 8, 8, 0.05) 0px 3px 5px 5px"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "rgba(32, 32, 37, 0.05) 0px 3px 5px 0px"; }}
    >
      {/* Top accent — Binance Yellow only */}
      <div className="h-[4px] w-full bg-[#F0B90B]" />

      {/* Content */}
      <Link aria-label={project.name} to={`/projects/${project.id}`} className="block p-5 no-underline" style={{ minHeight: "200px" }}>
        {/* Header row */}
        <div className="flex items-start justify-between mb-4">
          {/* Project icon — gold only */}
          <div
            className="w-11 h-11 flex items-center justify-center text-[14px] font-bold flex-shrink-0"
            style={{ borderRadius: "8px", background: "rgba(240, 185, 11, 0.1)", color: "#F0B90B" }}
          >
            {getInitials(project.name)}
          </div>

          {/* Action menu */}
          <div
            className="relative"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <button
              aria-label={`Project actions for ${project.name}`}
              className="w-8 h-8 flex items-center justify-center bg-transparent border-none text-[#848E9C] hover:text-[#1E2026] cursor-pointer opacity-30 group-hover:opacity-100"
              style={{ borderRadius: "6px", transition: "all 200ms ease" }}
              onClick={() => setShowMenu(!showMenu)}
              type="button"
            >
              <MoreVertical size={16} />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div
                  className="absolute right-0 top-full mt-1 w-36 bg-white border border-[#E6E8EA] z-50 overflow-hidden py-1"
                  style={{ borderRadius: "8px", boxShadow: "rgba(32, 32, 37, 0.05) 0px 3px 5px 0px" }}
                >
                  <button
                    aria-label={`Edit project ${project.name}`}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] text-[#32313A] font-medium hover:bg-[#F5F5F5] bg-transparent border-none cursor-pointer text-left"
                    style={{ transition: "background 200ms ease" }}
                    onClick={() => { setShowMenu(false); onEdit(project); }}
                    type="button"
                  >
                    <Pencil size={13} /> Edit Project
                  </button>
                  <button
                    aria-label={`Delete project ${project.name}`}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] text-[#F6465D] font-medium hover:bg-[#FFF5F5] bg-transparent border-none cursor-pointer text-left"
                    style={{ transition: "background 200ms ease" }}
                    onClick={() => { setShowMenu(false); onDelete(project); }}
                    type="button"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Project name — 16px/600 per spec Body SemiBold */}
        <h3
          className="text-[16px] font-semibold text-[#1E2026] mb-1.5 leading-snug"
          style={{ transition: "color 200ms ease" }}
        >
          {project.name}
        </h3>

        {/* Description — 14px/500 Caption per spec */}
        <p
          className="text-[14px] font-medium text-[#848E9C] mb-4"
          style={{ lineHeight: "1.43", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
        >
          {project.description || "No description provided"}
        </p>

        {/* Bottom metadata */}
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-[#E6E8EA]">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#848E9C]">
            <Clock size={12} />
            <span>{getTimeAgo(project.updated_at)}</span>
          </div>
          <div
            className="flex items-center gap-1 text-[12px] font-semibold text-[#F0B90B] opacity-0 group-hover:opacity-100"
            style={{ transition: "opacity 200ms ease" }}
          >
            Open <ArrowRight size={12} />
          </div>
        </div>
      </Link>
    </div>
  );
}

/* ─── Dashboard Header ─── */
function DashboardHeader({ user, projectCount }) {
  const hours = new Date().getHours();
  const greeting = hours < 12 ? "Good morning" : hours < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="mb-8">
      <h1 className="text-[28px] font-medium text-[#1E2026] mb-1" style={{ lineHeight: "1.00" }}>
        {greeting}, <span className="text-[#F0B90B]">{user?.display_name ?? "User"}</span>
      </h1>
      <p className="text-[14px] font-medium text-[#848E9C] mt-2" style={{ lineHeight: "1.43" }}>
        You have <span className="font-semibold text-[#1E2026]">{projectCount}</span> {projectCount === 1 ? "project" : "projects"} in your workspace
      </p>
    </div>
  );
}

/* ─── Quick Stats (Binance spec: 12px radius, subtle shadow, #F0B90B icon only) ─── */
function QuickStats({ projects }) {
  const recent = projects.length > 0
    ? [...projects].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0]
    : null;

  const totalContracts = projects.reduce((sum, p) => sum + (p.document_count ?? 0), 0);

  const statCardStyle = {
    borderRadius: "12px",
    boxShadow: "rgba(32, 32, 37, 0.05) 0px 3px 5px 0px",
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
      <div className="bg-white border border-[#E6E8EA] p-5 flex items-center gap-4" style={statCardStyle}>
        <div
          className="w-11 h-11 flex items-center justify-center text-[#F0B90B]"
          style={{ borderRadius: "8px", background: "rgba(240, 185, 11, 0.1)" }}
        >
          <FolderOpen size={20} />
        </div>
        <div>
          <p className="text-[24px] font-bold text-[#1E2026] leading-none mb-0.5">{projects.length}</p>
          <p className="text-[12px] font-semibold text-[#848E9C]">Total Projects</p>
        </div>
      </div>

      <div className="bg-white border border-[#E6E8EA] p-5 flex items-center gap-4" style={statCardStyle}>
        <div
          className="w-11 h-11 flex items-center justify-center text-[#F0B90B]"
          style={{ borderRadius: "8px", background: "rgba(240, 185, 11, 0.1)" }}
        >
          <FileText size={20} />
        </div>
        <div>
          <p className="text-[24px] font-bold text-[#1E2026] leading-none mb-0.5">{totalContracts}</p>
          <p className="text-[12px] font-semibold text-[#848E9C]">Total Contracts</p>
        </div>
      </div>

      <div className="bg-white border border-[#E6E8EA] p-5 flex items-center gap-4" style={statCardStyle}>
        <div
          className="w-11 h-11 flex items-center justify-center text-[#F0B90B]"
          style={{ borderRadius: "8px", background: "rgba(240, 185, 11, 0.1)" }}
        >
          <Clock size={20} />
        </div>
        <div>
          <p className="text-[14px] font-bold text-[#1E2026] leading-tight mb-0.5 truncate max-w-[160px]">{recent?.name ?? "No activity"}</p>
          <p className="text-[12px] font-semibold text-[#848E9C]">Last Active</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Empty State ─── */
function EmptyState({ onCreateProject, onSeedDemo, isSeeding }) {
  return (
    <div
      className="flex flex-col justify-center border-2 border-dashed border-[#E6E8EA] bg-[#FAFAFA] p-16 text-center"
      style={{ borderRadius: "12px", minHeight: "360px", alignItems: "center" }}
    >
      <div
        className="w-20 h-20 flex items-center justify-center mb-6"
        style={{ borderRadius: "12px", background: "rgba(240, 185, 11, 0.1)" }}
      >
        <Sparkles size={36} className="text-[#F0B90B]" />
      </div>
      <h2 className="text-[24px] font-bold text-[#1E2026] mb-2" style={{ lineHeight: "1.00" }}>No projects yet</h2>
      <p className="text-[16px] font-medium text-[#848E9C] mb-8" style={{ lineHeight: "1.50", maxWidth: "28rem", width: "100%" }}>
        Start your first project to organize contracts, run comparisons, and generate intelligent reviews.
      </p>
      <div className="flex items-center gap-4">
        {/* Primary Pill CTA — 50px radius per spec */}
        <button
          className="flex items-center gap-2 bg-[#F0B90B] text-[#1E2026] px-8 py-3 font-semibold text-[16px] border-none cursor-pointer hover:bg-[#1EAEDB] hover:text-white"
          style={{ borderRadius: "50px", boxShadow: "rgb(153,153,153) 0px 2px 10px -3px", transition: "all 200ms ease", letterSpacing: "0.16px" }}
          onClick={onCreateProject}
          type="button"
        >
          <Plus size={18} /> Create Project
        </button>
        {/* Secondary Pill CTA — outlined */}
        <button
          className="flex items-center gap-2 bg-white text-[#F0B90B] px-8 py-3 font-semibold text-[16px] border border-[#F0B90B] cursor-pointer hover:bg-[#1EAEDB] hover:text-white hover:border-[#1EAEDB] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ borderRadius: "50px", boxShadow: "rgb(153,153,153) 0px 2px 10px -3px", transition: "all 200ms ease", letterSpacing: "0.16px" }}
          disabled={isSeeding}
          onClick={onSeedDemo}
          type="button"
        >
          <Database size={18} /> {isSeeding ? "Seeding..." : "Seed Demo Data"}
        </button>
      </div>
    </div>
  );
}

export function ProjectListPage() {
  const { logout, token, user, pendingProjectInvitations, acceptPendingProjectInvitation } = useAuth();
  const { activeProject, clearActiveProject } = useActiveProject();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [acceptingInvitationId, setAcceptingInvitationId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [createForm, setCreateForm] = useState(EMPTY_PROJECT_FORM);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let isCurrent = true;

    async function loadProjectInventory() {
      setIsLoading(true);
      setError("");

      try {
        const data = await listProjects(token);
        if (isCurrent) {
          setProjects(data);
        }
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

    void loadProjectInventory();

    return () => {
      isCurrent = false;
    };
  }, [logout, token]);

  async function refreshProjects() {
    setFeedback("");

    try {
      const data = await listProjects(token);
      setProjects(data);
      setError("");
    } catch (refreshError) {
      if (refreshError instanceof ApiError && refreshError.status === 401) {
        logout();
        return;
      }

      setError(refreshError.message);
    }
  }

  function openCreateProjectForm() {
    setShowCreateForm(true);
    setEditingProjectId(null);
    setDeleteTarget(null);
    setCreateForm(EMPTY_PROJECT_FORM);
    setError("");
    setFeedback("");
  }

  function beginProjectEdit(project) {
    setShowCreateForm(true);
    setEditingProjectId(project.id);
    setDeleteTarget(null);
    setCreateForm({
      name: project.name,
      description: project.description || ""
    });
    setError("");
    setFeedback("");
  }

  function resetProjectForm() {
    setShowCreateForm(false);
    setEditingProjectId(null);
    setCreateForm(EMPTY_PROJECT_FORM);
  }

  async function handleImportDemoData() {
    setIsSeeding(true);
    setError("");
    setFeedback("");

    try {
      await seedDemoWorkspace(token);
      setFeedback("Starter workspace seeded.");
      await refreshProjects();
    } catch (seedError) {
      if (seedError instanceof ApiError && seedError.status === 401) {
        logout();
        return;
      }

      setError(seedError.message);
    } finally {
      setIsSeeding(false);
    }
  }

  async function handleCreateProject(event) {
    event.preventDefault();
    const normalizedName = createForm.name.trim();
    if (!normalizedName) {
      setError("Project name is required.");
      return;
    }

    setIsSavingProject(true);
    setError("");
    setFeedback("");

    try {
      const savedProject = editingProjectId
        ? await updateProject(token, editingProjectId, {
          name: normalizedName,
          description: createForm.description.trim() || null
        })
        : await createProject(token, {
          name: normalizedName,
          description: createForm.description.trim() || null
        });

      resetProjectForm();
      await refreshProjects();

      if (editingProjectId) {
        setFeedback("Project updated.");
      } else {
        startTransition(() => {
          navigate(`/projects/${savedProject.id}`);
        });
      }
    } catch (createError) {
      if (createError instanceof ApiError && createError.status === 401) {
        logout();
        return;
      }

      setError(createError.message);
    } finally {
      setIsSavingProject(false);
    }
  }

  async function handleDeleteProject() {
    if (!deleteTarget) {
      return;
    }

    setIsDeletingProject(true);
    setError("");
    setFeedback("");

    try {
      await deleteProject(token, deleteTarget.id);
      if (editingProjectId === deleteTarget.id) {
        resetProjectForm();
      }
      // Clear active project from navbar if it was the deleted one
      if (activeProject && activeProject.id === deleteTarget.id) {
        clearActiveProject();
      }
      setDeleteTarget(null);
      await refreshProjects();
      setFeedback("Project deleted.");
    } catch (deleteError) {
      if (deleteError instanceof ApiError && deleteError.status === 401) {
        logout();
        return;
      }

      setError(deleteError.message);
    } finally {
      setIsDeletingProject(false);
    }
  }

  async function handleAcceptInvitation(invitation) {
    setAcceptingInvitationId(invitation.id);
    setError("");
    setFeedback("");

    try {
      await acceptPendingProjectInvitation(invitation.id);
      await refreshProjects();
      setFeedback(`Invitation accepted for ${invitation.project_name || invitation.email}.`);
    } catch (acceptError) {
      if (acceptError instanceof ApiError && acceptError.status === 401) {
        logout();
        return;
      }

      setError(acceptError.message);
    } finally {
      setAcceptingInvitationId(null);
    }
  }

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase();
  const filteredProjects = normalizedSearchQuery
    ? projects.filter((project) => {
      const haystack = `${project.name} ${project.description || ""}`.toLowerCase();
      return haystack.includes(normalizedSearchQuery);
    })
    : projects;

  const drawerTitle = editingProjectId ? "Edit Project" : "New Project";
  const drawerSubtitle = editingProjectId
    ? "Update project details."
    : "Create a new project to organize contracts.";

  return (
    <>
      {/* Main content — max 1200px per spec */}
      <main className="max-w-[1200px] mx-auto px-8 py-8">


        {/* Header */}
        <DashboardHeader user={user} projectCount={projects.length} />

        {/* Quick Stats */}
        <QuickStats projects={projects} />

        {/* Pending Invitations */}
        {pendingProjectInvitations.length > 0 && (
          <div className="mb-8 bg-white border border-[#E6E8EA] overflow-hidden" style={{ borderRadius: "12px", boxShadow: "rgba(32, 32, 37, 0.05) 0px 3px 5px 0px" }}>
            <div className="px-5 py-3.5 border-b border-[#E6E8EA] flex items-center justify-between bg-[#F5F5F5]">
              <div className="flex items-center gap-2.5">
                <FolderHeart size={16} className="text-[#F0B90B]" />
                <h2 className="text-[14px] font-semibold text-[#1E2026]">Pending Invitations</h2>
              </div>
              <span className="text-[12px] font-semibold text-[#F0B90B]">{pendingProjectInvitations.length} pending</span>
            </div>
            <div className="p-5">
              <div className="space-y-3">
                {pendingProjectInvitations.map((invitation) => (
                  <div key={invitation.id} className="flex items-center justify-between p-3.5 bg-[#F5F5F5] border border-[#E6E8EA]" style={{ borderRadius: "8px" }}>
                    <div>
                      <p className="text-[14px] font-semibold text-[#1E2026]">{invitation.project_name || `Project ${invitation.project_id}`}</p>
                      <p className="text-[12px] font-medium text-[#848E9C] mt-0.5">
                        Invited by {invitation.invited_by_display_name || "Unknown"} · Role: {invitation.role || "Member"}
                      </p>
                    </div>
                    <button
                      aria-label={`Accept invitation for ${invitation.project_name || `Project ${invitation.project_id}`}`}
                      className="flex items-center gap-1.5 bg-[#F0B90B] text-[#1E2026] px-4 py-2 font-semibold text-[14px] border-none cursor-pointer hover:bg-[#D0980B] disabled:opacity-50"
                      style={{ borderRadius: "6px", transition: "background 200ms ease" }}
                      disabled={acceptingInvitationId === invitation.id}
                      onClick={() => handleAcceptInvitation(invitation)}
                      type="button"
                    >
                      {acceptingInvitationId === invitation.id ? "Accepting..." : "Accept"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Project Section Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[20px] font-semibold text-[#1E2026]" style={{ lineHeight: "1.25" }}>Project List</h2>
          <div className="flex items-center gap-3">
            {/* Search — Binance spec: 8px radius, focus border black */}
            <label className="flex items-center relative">
              <Search className="absolute left-3 text-[#848E9C]" size={15} />
              <input
                aria-label="Search projects"
                className="w-64 bg-[#F5F5F5] border border-[#E6E8EA] text-[#1E2026] text-[14px] font-medium pl-9 pr-4 py-2 placeholder:text-[#848E9C]"
                style={{ borderRadius: "8px", outline: "none", transition: "border-color 200ms ease" }}
                onFocus={(e) => { e.target.style.borderColor = "#000000"; }}
                onBlur={(e) => { e.target.style.borderColor = "#E6E8EA"; }}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search projects..."
                type="search"
                value={searchQuery}
              />
            </label>
            {/* New Project — Primary Pill CTA per spec */}
            <button
              className="flex items-center gap-2 bg-[#F0B90B] text-[#1E2026] px-6 py-2.5 font-semibold text-[16px] border-none cursor-pointer hover:bg-[#1EAEDB] hover:text-white"
              style={{ borderRadius: "50px", boxShadow: "rgb(153,153,153) 0px 2px 10px -3px", transition: "all 200ms ease", letterSpacing: "0.16px" }}
              onClick={openCreateProjectForm}
              type="button"
            >
              <Plus size={18} /> New Project
            </button>
          </div>
        </div>

        {/* Projects Grid / Empty / Loading */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white border border-[#E6E8EA] p-5 animate-pulse" style={{ borderRadius: "12px", minHeight: "200px" }}>
                <div className="h-[4px] w-full bg-[#F5F5F5] mb-5" style={{ borderRadius: "2px" }} />
                <div className="w-11 h-11 bg-[#F5F5F5] mb-4" style={{ borderRadius: "8px" }} />
                <div className="h-4 w-2/3 bg-[#F5F5F5] mb-2" style={{ borderRadius: "4px" }} />
                <div className="h-3 w-full bg-[#F5F5F5] mb-1" style={{ borderRadius: "4px" }} />
                <div className="h-3 w-4/5 bg-[#F5F5F5]" style={{ borderRadius: "4px" }} />
              </div>
            ))}
          </div>
        ) : filteredProjects.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project, idx) => (
              <ProjectCard
                key={project.id}
                project={project}
                index={idx}
                onEdit={beginProjectEdit}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        ) : projects.length > 0 ? (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-[#E6E8EA] bg-[#F5F5F5] p-16 text-center" style={{ borderRadius: "12px", minHeight: "280px" }}>
            <div className="w-16 h-16 bg-[#E6E8EA] flex items-center justify-center mb-5 text-[#848E9C]" style={{ borderRadius: "12px" }}>
              <SearchX size={28} />
            </div>
            <p className="text-[16px] font-semibold text-[#1E2026] mb-1">No matching projects</p>
            <p className="text-[14px] font-medium text-[#848E9C] mb-5">
              No projects match "<span className="font-semibold">{deferredSearchQuery.trim()}</span>"
            </p>
            <button
              className="text-[14px] text-[#F0B90B] font-semibold hover:text-[#D0980B] bg-transparent border-none cursor-pointer"
              style={{ transition: "color 200ms ease" }}
              onClick={() => setSearchQuery("")}
              type="button"
            >
              Clear search
            </button>
          </div>
        ) : (
          <EmptyState onCreateProject={openCreateProjectForm} onSeedDemo={handleImportDemoData} isSeeding={isSeeding} />
        )}
      </main>

      {/* Toast notifications — bottom-right, auto-dismiss */}
      {error && (
        <Toast message={error} type="error" onClose={() => setError("")} />
      )}
      {feedback && (
        <Toast message={feedback} type="success" onClose={() => setFeedback("")} />
      )}

      {/* ─── Project Modal (Binance spec: 12px card radius, 5% shadow, black focus inputs, 6px form buttons) ─── */}
      {showCreateForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(30, 32, 38, 0.4)", backdropFilter: "blur(4px)" }}
          onClick={() => { if (!isSavingProject) resetProjectForm(); }}
        >
          <div
            aria-label={drawerTitle}
            aria-modal="true"
            role="dialog"
            className="w-full max-w-[480px] bg-white border border-[#E6E8EA] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{
              borderRadius: "12px",
              boxShadow: "rgba(0, 0, 0, 0.15) 0px 8px 30px",
              animation: "modalFadeIn 0.2s ease-out",
            }}
          >
            {/* Modal header — white bg, clean */}
            <div className="relative px-6 pt-6 pb-4 border-b border-[#E6E8EA] bg-[#F5F5F5]">
              <button
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-transparent border-none text-[#848E9C] hover:text-[#1A1A1A] cursor-pointer"
                style={{ borderRadius: "6px", transition: "color 200ms ease" }}
                disabled={isSavingProject}
                onClick={resetProjectForm}
                type="button"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-3.5">
                <div
                  className="w-10 h-10 flex items-center justify-center"
                  style={{ borderRadius: "8px", background: "rgba(240, 185, 11, 0.1)" }}
                >
                  <FolderPlus size={20} className="text-[#F0B90B]" />
                </div>
                <div>
                  <h2 className="text-[20px] font-semibold text-[#1E2026]" style={{ lineHeight: "1.25" }}>{drawerTitle}</h2>
                  <p className="text-[14px] font-medium text-[#848E9C] mt-0.5">{drawerSubtitle}</p>
                </div>
              </div>
            </div>

            {/* Form body */}
            <form className="px-6 pb-6 pt-5" onSubmit={handleCreateProject}>
              <div className="space-y-5">
                {/* Project name — Binance input spec: 8px radius, border black on focus */}
                <div className="flex flex-col gap-2">
                  <label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider" htmlFor="modal-project-name">Project name *</label>
                  <input
                    className="h-11 px-3 bg-[#F5F5F5] border border-[#E6E8EA] text-[14px] font-medium text-[#1E2026] placeholder:text-[#848E9C]"
                    style={{ borderRadius: "8px", outline: "none", transition: "border-color 200ms ease" }}
                    onFocus={(e) => { e.target.style.borderColor = "#000000"; }}
                    onBlur={(e) => { e.target.style.borderColor = "#E6E8EA"; }}
                    id="modal-project-name"
                    onChange={(event) =>
                      setCreateForm((v) => ({ ...v, name: event.target.value }))
                    }
                    placeholder="e.g. NDA Review Q2 2026"
                    required
                    type="text"
                    value={createForm.name}
                    autoFocus
                  />
                </div>

                {/* Description */}
                <div className="flex flex-col gap-2">
                  <label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider" htmlFor="modal-project-desc">Description</label>
                  <textarea
                    className="px-3 py-3 bg-[#F5F5F5] border border-[#E6E8EA] text-[14px] font-medium text-[#1E2026] placeholder:text-[#848E9C] min-h-[100px] resize-y"
                    style={{ borderRadius: "8px", outline: "none", transition: "border-color 200ms ease", lineHeight: "1.50" }}
                    onFocus={(e) => { e.target.style.borderColor = "#000000"; }}
                    onBlur={(e) => { e.target.style.borderColor = "#E6E8EA"; }}
                    id="modal-project-desc"
                    onChange={(event) =>
                      setCreateForm((v) => ({ ...v, description: event.target.value }))
                    }
                    placeholder="Describe the project scope, contract type, or working context..."
                    rows={4}
                    value={createForm.description}
                  />
                  <p className="text-[12px] font-medium text-[#848E9C]">Optional — helps your team understand the project's purpose.</p>
                </div>
              </div>

              {/* Actions — form buttons use 6px radius per spec */}
              <div className="flex items-center justify-end gap-3 mt-6 pt-5 border-t border-[#E6E8EA]">
                <button
                  className="px-6 py-2 bg-white border border-[#E6E8EA] text-[#32313A] text-[16px] font-semibold hover:text-[#1A1A1A] hover:border-[#1A1A1A] cursor-pointer"
                  style={{ borderRadius: "6px", transition: "all 200ms ease" }}
                  disabled={isSavingProject}
                  onClick={resetProjectForm}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="px-6 py-2 bg-[#F0B90B] border-none text-[#1E2026] text-[16px] font-semibold flex items-center gap-2 cursor-pointer hover:bg-[#D0980B] disabled:bg-[#E6E8EA] disabled:text-[#848E9C] disabled:cursor-not-allowed"
                  style={{ borderRadius: "6px", transition: "background 200ms ease" }}
                  disabled={isSavingProject}
                  type="submit"
                >
                  {isSavingProject ? (
                    "Saving..."
                  ) : editingProjectId ? (
                    <><Pencil size={14} /> Save Project</>
                  ) : (
                    <><Plus size={14} /> Create Project</>
                  )}
                </button>
              </div>
            </form>
          </div>
          <style>{`@keyframes modalFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>
      )}

      <ConfirmDialog
        cancelLabel="Cancel"
        confirmLabel={isDeletingProject ? "Deleting..." : "Delete Project"}
        description={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`
            : ""
        }
        isProcessing={isDeletingProject}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteProject}
        open={Boolean(deleteTarget)}
        title="Delete Project"
      />
    </>
  );
}
