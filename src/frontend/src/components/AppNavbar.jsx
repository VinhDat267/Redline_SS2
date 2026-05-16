import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  FolderOpen, FileText, ScanSearch, GitCompare, ClipboardCheck,
  MessageSquare, BarChart3, LogOut, Settings, X, ChevronDown,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useActiveProject } from "../context/ActiveProjectContext";

/* Navigation tabs that require an active project */
const PROJECT_LINKS = [
  { key: "contracts", label: "Contracts", icon: FileText, path: (id) => `/projects/${id}` },
  { key: "parser", label: "Parser", icon: ScanSearch, path: () => `/parser` },
  { key: "compare", label: "Compare", icon: GitCompare, path: () => `/compare` },
  { key: "review", label: "Review", icon: ClipboardCheck, path: () => `/review` },
  { key: "qa", label: "Q&A", icon: MessageSquare, path: () => `/contract-q-a` },
  { key: "analytics", label: "Analytics", icon: BarChart3, path: (id) => `/projects/${id}/analytics` },
];

/* ─── Profile Dropdown Menu ─── */
function ProfileDropdown({ displayName, email, initial, avatarUrl, onLogout }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        close();
      }
    }
    function handleEscape(event) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, close]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        type="button"
        aria-label="Open profile menu"
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="flex items-center gap-2 pl-1 pr-2.5 py-1 border cursor-pointer"
        style={{
          borderRadius: "999px",
          border: isOpen ? "1px solid #F0B90B" : "1px solid #E6E8EA",
          background: isOpen ? "#FFF8E6" : "#FFFFFF",
          transition: "all 200ms ease",
        }}
        onClick={() => setIsOpen((prev) => !prev)}
        onMouseEnter={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = "#F0B90B";
            e.currentTarget.style.background = "#FFF8E6";
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = "#E6E8EA";
            e.currentTarget.style.background = "#FFFFFF";
          }
        }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-7 h-7 min-w-[1.75rem] shrink-0 object-cover"
            style={{ borderRadius: "50%" }}
          />
        ) : (
          <div
            className="w-7 h-7 min-w-[1.75rem] shrink-0 bg-[#F0B90B] flex items-center justify-center text-[#1E2026] font-bold text-xs"
            style={{ borderRadius: "50%" }}
          >
            {initial}
          </div>
        )}
        <span className="text-[13px] font-semibold text-[#1E2026] hidden sm:block max-w-[100px] truncate">
          {displayName}
        </span>
        <ChevronDown
          size={14}
          className="text-[#848E9C] shrink-0 hidden sm:block"
          style={{
            transition: "transform 200ms ease",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-[240px] bg-white border border-[#E6E8EA] overflow-hidden"
          style={{
            borderRadius: "12px",
            boxShadow:
              "0 8px 30px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)",
            animation: "profileDropdownIn 150ms ease-out",
          }}
        >
          {/* User info header */}
          <div className="px-4 pt-4 pb-3 border-b border-[#F0F0F0]">
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-10 h-10 min-w-[2.5rem] shrink-0 object-cover"
                  style={{ borderRadius: "50%" }}
                />
              ) : (
                <div
                  className="w-10 h-10 min-w-[2.5rem] shrink-0 bg-[#F0B90B] flex items-center justify-center text-[#1E2026] font-bold text-sm"
                  style={{ borderRadius: "50%" }}
                >
                  {initial}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-[#1E2026] truncate m-0 leading-snug">
                  {displayName}
                </p>
                {email && (
                  <p className="text-[12px] text-[#848E9C] truncate m-0 mt-0.5 leading-snug">
                    {email}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1.5">
            <button
              type="button"
              className="flex items-center gap-3 w-full px-4 py-2.5 text-left bg-transparent border-none cursor-pointer"
              style={{ transition: "background 150ms ease" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#F5F5F5";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
              onClick={() => {
                close();
                navigate("/account");
              }}
            >
              <Settings size={16} className="text-[#848E9C] shrink-0" />
              <span className="text-[13px] font-medium text-[#1E2026]">
                Account
              </span>
            </button>
          </div>

          {/* Divider + Sign out */}
          <div className="border-t border-[#F0F0F0] py-1.5">
            <button
              type="button"
              className="flex items-center gap-3 w-full px-4 py-2.5 text-left bg-transparent border-none cursor-pointer"
              style={{ transition: "background 150ms ease" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(246, 70, 93, 0.04)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
              onClick={() => {
                close();
                onLogout();
              }}
            >
              <LogOut size={16} className="text-[#F6465D] shrink-0" />
              <span className="text-[13px] font-medium text-[#F6465D]">
                Sign Out
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Dropdown animation keyframes */}
      <style>{`
        @keyframes profileDropdownIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

export function AppNavbar() {
  const { user, logout } = useAuth();
  const { activeProject, clearActiveProject } = useActiveProject();
  const location = useLocation();
  const navigate = useNavigate();

  function isActiveLink(key) {
    const p = location.pathname;
    if (key === "qa")
      return (
        p.startsWith("/contract-q-a") || /\/contracts\/\d+\/chat/.test(p)
      );
    if (key === "review")
      return p.startsWith("/review") || p.includes("/review");
    if (key === "compare")
      return (
        (p.startsWith("/compare") || p.startsWith("/compare-runs")) &&
        !p.includes("/review")
      );
    if (key === "contracts")
      return (
        (p.startsWith("/contracts") || p.includes("/contracts")) &&
        !/\/contracts\/\d+\/chat/.test(p)
      );
    if (key === "parser")
      return p.startsWith("/parser") || p.includes("/documents");
    if (key === "analytics")
      return p.startsWith("/analytics") || p.startsWith("/project-analytics");
    return false;
  }

  /* If a tab is clicked without an active project, go to Projects dashboard */
  function handleProjectLink(e) {
    if (!activeProject) {
      e.preventDefault();
      navigate("/dashboard");
    }
  }

  const displayName =
    user?.display_name || user?.email?.split("@")[0] || "User";
  const email = user?.email || "";
  const initial = displayName[0]?.toUpperCase() || "U";
  const avatarUrl = user?.avatar_url
    ? `${import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000"}${user.avatar_url}`
    : null;

  return (
    <header
      className="sticky top-0 z-50 bg-white border-b border-[#E6E8EA]"
      style={{ height: "64px" }}
    >
      <div className="max-w-[1200px] mx-auto px-8 h-full flex items-center justify-between">
        {/* Brand + Nav */}
        <div className="flex items-center gap-4">
          <Link
            to="/dashboard"
            className="flex items-center gap-2.5 no-underline shrink-0"
          >
            <div
              className="w-8 h-8 bg-[#F0B90B] flex items-center justify-center text-[#1E2026] font-bold text-sm"
              style={{ borderRadius: "6px" }}
            >
              R
            </div>
            <span className="text-[16px] font-bold text-[#1E2026]">
              Redline
            </span>
          </Link>

          {/* Projects link */}
          <nav className="hidden md:flex items-center gap-0.5 ml-1">
            <Link
              to="/dashboard"
              className="flex items-center gap-1.5 px-3 py-1.5 no-underline text-[13px] font-semibold"
              style={{
                borderRadius: "6px",
                color:
                  location.pathname === "/dashboard" ||
                    location.pathname.startsWith("/projects")
                    ? "#1E2026"
                    : "#848E9C",
                background:
                  location.pathname === "/dashboard" ||
                    location.pathname.startsWith("/projects")
                    ? "#F5F5F5"
                    : "transparent",
                transition: "all 200ms ease",
              }}
              onMouseEnter={(e) => {
                if (
                  !location.pathname.startsWith("/dashboard") &&
                  !location.pathname.startsWith("/projects")
                ) {
                  e.currentTarget.style.color = "#1E2026";
                  e.currentTarget.style.background = "#F5F5F5";
                }
              }}
              onMouseLeave={(e) => {
                if (
                  !location.pathname.startsWith("/dashboard") &&
                  !location.pathname.startsWith("/projects")
                ) {
                  e.currentTarget.style.color = "#848E9C";
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              <FolderOpen size={14} />
              Projects
            </Link>

            {/* Separator */}
            <div className="w-px h-4 bg-[#E6E8EA] mx-1" />

            {/* Project-scoped tabs */}
            {PROJECT_LINKS.map((link) => {
              const active = isActiveLink(link.key);
              const enabled = Boolean(activeProject);
              const href = enabled
                ? link.path(activeProject.id)
                : "/dashboard";
              return (
                <Link
                  key={link.key}
                  to={href}
                  onClick={(e) => handleProjectLink(e, link)}
                  title={!enabled ? "Select a project first" : link.label}
                  className="flex items-center gap-1.5 px-3 py-1.5 no-underline text-[13px] font-semibold"
                  style={{
                    borderRadius: "6px",
                    color: active
                      ? "#1E2026"
                      : enabled
                        ? "#848E9C"
                        : "#C0C6CF",
                    background: active ? "#F5F5F5" : "transparent",
                    transition: "all 200ms ease",
                    cursor: enabled ? "pointer" : "default",
                    opacity: enabled ? 1 : 0.6,
                  }}
                  onMouseEnter={(e) => {
                    if (!active && enabled) {
                      e.currentTarget.style.color = "#1E2026";
                      e.currentTarget.style.background = "#F5F5F5";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active && enabled) {
                      e.currentTarget.style.color = "#848E9C";
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  <link.icon size={14} />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Active project badge */}
          {activeProject && (
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 border border-[#F0B90B44] bg-[#FFF8E6]"
              style={{ borderRadius: "6px" }}
            >
              <span className="text-[11px] font-bold text-[#848E9C] uppercase tracking-wider">
                Project
              </span>
              <span
                className="text-[12px] font-semibold text-[#1E2026] max-w-[120px] truncate"
                title={activeProject.name}
              >
                {activeProject.name}
              </span>
              <button
                type="button"
                title="Clear active project"
                className="flex items-center justify-center w-4 h-4 bg-transparent border-none text-[#848E9C] cursor-pointer hover:text-[#F6465D] ml-0.5"
                style={{ padding: 0 }}
                onClick={clearActiveProject}
              >
                <X size={11} />
              </button>
            </div>
          )}

          {/* Profile dropdown */}
          <ProfileDropdown
            displayName={displayName}
            email={email}
            initial={initial}
            avatarUrl={avatarUrl}
            onLogout={logout}
          />
        </div>
      </div>
    </header>
  );
}
