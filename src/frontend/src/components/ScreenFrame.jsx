import { Link, useLocation, useParams } from "react-router-dom";
import {
  BarChart3,
  ChevronRight,
  ClipboardCheck,
  FileSearch,
  FileText,
  FolderOpen,
  GitCompareArrows,
  HelpCircle,
  LogOut,
  MessageSquareText,
  Moon,
  PlayCircle,
  Scale,
  Search,
  Sun
} from "lucide-react";
import { useOptionalAuth } from "../auth/AuthContext";
import { useTheme } from "../lib/ThemeContext";

function normalizeBreadcrumbs(breadcrumbs) {
  if (!breadcrumbs) return [];
  if (Array.isArray(breadcrumbs)) {
    return breadcrumbs.map((breadcrumb) =>
      typeof breadcrumb === "string" ? { label: breadcrumb } : breadcrumb
    );
  }
  return String(breadcrumbs).split(">").map((item) => item.trim()).filter(Boolean).map((label) => ({ label }));
}

function getPrimaryActionIndex(actions) {
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const label = actions[index].label.toLowerCase();
    if (!/^(back|sign out|logout|cancel|close)/.test(label)) return index;
  }
  return -1;
}

function normalizeSignals(signals) {
  if (!Array.isArray(signals)) return [];
  return signals
    .map((signal) => (typeof signal === "string" ? { label: signal } : signal))
    .filter((signal) => signal?.label);
}

function isSignOutAction(action) {
  return action.label?.toLowerCase() === "sign out";
}

export function ActionControl({ label, icon: Icon, to, variant = "secondary", kind = "link", onClick, disabled = false }) {
  const IconComponent = typeof Icon === "string" ? null : Icon;
  const baseClasses = "px-4 py-1.5 rounded-[50px] transition-colors flex items-center gap-1.5 font-inter text-[13px] font-semibold tracking-tight whitespace-nowrap h-8 shadow-sm";
  const variants = {
    primary: "bg-[#F0B90B] text-[#1E2026] hover:bg-[#FFD000]",
    secondary: "bg-[#FFFFFF] border border-[#E6E8EA] text-[#1E2026] hover:bg-[#F5F5F5]"
  };
  const className = `${baseClasses} ${variants[variant] || variants.secondary} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`;

  const content = (
    <>
      {IconComponent && <IconComponent aria-hidden="true" size={14} />}
      {label}
    </>
  );

  if (kind === "button" || !to || disabled) {
    return (
      <button className={className} disabled={disabled} onClick={onClick} type="button">
        {content}
      </button>
    );
  }
  return (
    <Link className={className} onClick={onClick} to={to}>
      {content}
    </Link>
  );
}

export function StatCard({ label, value, detail, icon: Icon }) {
  const IconComponent = typeof Icon === "string" ? null : Icon;
  return (
    <div className="bg-[#FFFFFF] border border-[#E6E8EA] rounded-[12px] p-5 flex flex-col justify-between shadow-[0_3px_5px_rgba(32,32,37,0.02)] h-full transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(32,32,37,0.06)] group">
      <div className="flex items-center justify-between mb-3">
        <span className="font-inter text-[13px] font-semibold text-[#848E9C] uppercase tracking-wider">{label}</span>
        {IconComponent && (
          <div className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center group-hover:bg-[#F0B90B]/10 transition-colors duration-200">
            <IconComponent aria-hidden="true" size={16} className="text-[#32313A] group-hover:text-[#D0980B] transition-colors duration-200" />
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-inter text-[28px] font-bold text-[#1E2026] tracking-tight">{value}</span>
        {detail && <span className="font-inter text-[13px] font-medium text-[#848E9C]">{detail}</span>}
      </div>
    </div>
  );
}

function getNavItems(params) {
  const pId = params.projectId;
  const cId = params.contractId;
  const crId = params.compareRunId;
  const dId = params.documentId;
  const projectWorkspacePath = pId ? `/projects/${pId}` : "/dashboard";
  const contractWorkspacePath = cId ? `/contracts/${cId}` : pId ? projectWorkspacePath : "/contracts";
  const parserWorkspacePath = dId ? `/documents/${dId}/parser` : cId ? `/contracts/${cId}` : "/parser";
  const compareWorkspacePath = crId ? `/compare-runs/${crId}` : cId ? `/contracts/${cId}` : "/compare";
  const reviewWorkspacePath = crId ? `/compare-runs/${crId}/review` : cId ? `/contracts/${cId}` : "/review";
  const contractChatPath = cId ? `/contracts/${cId}/chat` : "/contract-q-a";
  const analyticsPath = pId ? `/projects/${pId}/analytics` : "/analytics";

  return [
    { icon: FolderOpen, label: "Projects", path: "/dashboard", match: (path) => path === "/dashboard" || /^\/projects\/[^/]+$/.test(path) },
    { icon: FileText, label: "Contracts", path: contractWorkspacePath, match: (path) => path === "/contracts" || (path.startsWith("/contracts/") && !path.endsWith("/chat")) },
    { icon: FileSearch, label: "Parser", path: parserWorkspacePath, match: (path) => path === "/parser" || (path.startsWith("/documents/") && path.endsWith("/parser")) },
    {
      icon: GitCompareArrows,
      label: "Compare",
      path: compareWorkspacePath,
      match: (path) =>
        path === "/compare" ||
        (path.startsWith("/compare-runs/") &&
        !path.endsWith("/review") &&
        !path.endsWith("/summary") &&
        !path.endsWith("/impact"))
    },
    { icon: ClipboardCheck, label: "Review", path: reviewWorkspacePath, match: (path) => path === "/review" || (path.startsWith("/compare-runs/") && path.endsWith("/review")) },
    { icon: MessageSquareText, label: "Contract Q&A", path: contractChatPath, match: (path) => path === "/contract-q-a" || (path.startsWith("/contracts/") && path.endsWith("/chat")) },
    { separator: true },
    { icon: BarChart3, label: "Analytics", path: analyticsPath, match: (path) => path === "/analytics" || (path.startsWith("/projects/") && path.endsWith("/analytics")) },
  ];
}

const SIDEBAR_FOOTER = [
  { icon: HelpCircle, label: "Help", path: null, disabled: true },
  { icon: PlayCircle, label: "Demo Guide", path: null, disabled: true },
];

function getProductNavItems(params) {
  const navItems = getNavItems(params);
  const byLabel = Object.fromEntries(navItems.map((item) => [item.label, item]));
  return [
    { ...byLabel.Contracts, label: "Contracts" },
    { ...byLabel.Parser, label: "Parser" },
    { ...byLabel.Compare, label: "Compare" },
    { ...byLabel.Review, label: "Review" },
    { ...byLabel["Contract Q&A"], label: "Q&A" },
  ];
}

function isActiveRoute(currentPath, item) {
  if (typeof item.match === "function") return item.match(currentPath);
  return Boolean(item.path && currentPath === item.path);
}

function SidebarNavItem({ icon: Icon, label, path, isActive, onClick, disabled = false }) {
  const IconComponent = typeof Icon === "string" ? null : Icon;
  const baseClasses = "sidebar-nav-item flex items-center h-10 px-3 md:px-[14px] rounded-lg shrink-0 transition-colors relative overflow-hidden group/item w-full";
  const activeClasses = disabled
    ? "text-[#848E9C]/40 cursor-not-allowed"
    : isActive
      ? "sidebar-nav-item-active bg-[#F0B90B]/12 text-[#F0B90B]"
      : "text-[#848E9C] hover:bg-white/12 hover:text-white";
  
  const content = (
    <div className="flex items-center min-w-[200px]">
      {IconComponent && <IconComponent aria-hidden="true" size={20} className="shrink-0 w-[20px]" />}
      <span className="ml-[14px] font-inter text-[13px] font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
        {label}
      </span>
    </div>
  );

  const titleText = disabled ? `${label} — Coming soon` : label;

  if (!disabled && path) {
    return (
      <Link aria-current={isActive ? "page" : undefined} to={path} className={`${baseClasses} ${activeClasses}`} title={titleText}>
        {content}
      </Link>
    );
  }

  if (!disabled && onClick) {
    return (
      <button type="button" aria-current={isActive ? "page" : undefined} onClick={onClick} className={`${baseClasses} ${activeClasses} text-left cursor-pointer`} title={titleText}>
        {content}
      </button>
    );
  }

  return (
    <span aria-disabled="true" className={`${baseClasses} ${activeClasses} cursor-default`} title={titleText}>
      {content}
    </span>
  );
}

export function Sidebar() {
  const location = useLocation();
  const params = useParams();
  const currentPath = location.pathname;
  const navItems = getNavItems(params);
  const { theme = "light", toggleTheme = () => {} } = useTheme() ?? {};

  return (
    <nav aria-label="Main navigation" className="fixed left-0 top-0 h-full flex flex-col z-[100] overflow-x-hidden bg-[#222126] border-r border-[#2B2F36] w-16 hover:w-[240px] focus-within:w-[240px] transition-[width] duration-300 ease-in-out group shadow-xl">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-[#2B2F36] shrink-0 whitespace-nowrap">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-[8px] bg-[#2B2F36] flex items-center justify-center shrink-0 border border-[#3B3F46]">
            <Scale aria-hidden="true" size={18} className="text-[#F0B90B]" />
          </div>
          <div className="ml-3 flex flex-col opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <span className="text-lg font-bold text-white leading-tight mt-0.5">Redline HQ</span>
            <span className="font-inter text-[11px] font-medium text-[#848E9C] leading-tight mt-0.5">Legal Workspace</span>
          </div>
        </div>
        
        {/* Theme Toggle Button */}
        <button 
          onClick={toggleTheme} 
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 w-7 h-7 flex items-center justify-center rounded-md border border-[#3B3F46] bg-[#2B2F36] hover:bg-[#343941] text-[#848E9C] hover:text-white"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          type="button"
        >
          {theme === "dark" ? (
            <Sun aria-hidden="true" size={16} />
          ) : (
            <Moon aria-hidden="true" size={16} />
          )}
        </button>
      </div>

      {/* Main Nav */}
      <div className="flex-1 py-4 flex flex-col gap-1 px-2 overflow-y-auto overflow-x-hidden">
        {navItems.map((item, index) => (
          item.separator
            ? <div key={`sep-${index}`} className="my-2 mx-2 border-t border-[#2B2F36]" />
            : <SidebarNavItem key={item.label} {...item} isActive={isActiveRoute(currentPath, item)} />
        ))}
      </div>

      {/* Footer Nav */}
      <div className="p-2 border-t border-[#2B2F36] flex flex-col gap-1 shrink-0">
        {SIDEBAR_FOOTER.map((item) => (
          <SidebarNavItem key={item.label} {...item} isActive={false} />
        ))}
      </div>
    </nav>
  );
}

export function SectionCard({ title, subtitle, children, aside, className = "", variant = "default" }) {
  const classes = ["bg-[#FFFFFF] border border-[#E6E8EA] rounded-[12px] p-6 shadow-[0_2px_8px_rgba(32,32,37,0.04)] flex flex-col w-full", className].filter(Boolean).join(" ");
  return (
    <section className={classes}>
      <div className="flex items-start justify-between mb-4 border-b border-[#E6E8EA] pb-4">
        <div>
          <h2 className="text-[16px] font-bold text-[#1E2026] tracking-tight">{title}</h2>
          {subtitle && <p className="text-[14px] text-[#474D57] mt-1">{subtitle}</p>}
        </div>
        {aside && <div>{aside}</div>}
      </div>
      <div className="mt-2">
        {children}
      </div>
    </section>
  );
}

export function PlaceholderTagRow({ items, ariaLabel = "Workspace controls" }) {
  return (
    <ul
      aria-label={ariaLabel}
      className="flex gap-2 flex-nowrap overflow-x-auto pb-1 scrollbar-hide"
      style={{ display: "flex", flexWrap: "nowrap", overflowX: "auto" }}
    >
      {items.map((item) => (
        <li
          key={item}
          className="flex-shrink-0 px-3 py-1 bg-[#F5F5F5] border border-[#E6E8EA] rounded-full text-[12px] text-[#474D57] whitespace-nowrap"
          style={{ flex: "0 0 auto", whiteSpace: "nowrap" }}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

export function DataTable({ headers, rows }) {
  return (
    <div className="bg-[#FFFFFF] border border-[#E6E8EA] rounded-[8px] flex flex-col overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#E6E8EA] bg-[#F5F5F5]">
              {headers.map((header) => (
                <th key={header} className="text-[12px] font-semibold text-[#848E9C] px-4 py-3 uppercase tracking-wider">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono text-[14px] text-[#1E2026]">
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-[#E6E8EA] hover:bg-[#F8F9FA] transition-colors last:border-0">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-3 text-[13px]">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BulletList({ items, ordered = false }) {
  const ListTag = ordered ? "ol" : "ul";
  return (
    <ListTag className={`flex flex-col gap-2 pl-5 text-[14px] text-[#474D57] ${ordered ? "list-decimal" : "list-disc"}`}>
      {items.map((item, index) => (
        <li key={item}>{item}</li>
      ))}
    </ListTag>
  );
}

export function ScreenFrame({ title, eyebrow, intro, signals = [], actions = [], breadcrumbs, stats = [], children }) {
  const location = useLocation();
  const params = useParams();
  const primaryActionIndex = getPrimaryActionIndex(actions);
  const breadcrumbItems = normalizeBreadcrumbs(breadcrumbs);
  const signalItems = normalizeSignals(signals);
  const auth = useOptionalAuth();
  const signOutAction = actions.find(isSignOutAction);
  const visibleActions = actions.filter((action) => !isSignOutAction(action));
  const handleSignOut = signOutAction?.onClick ?? auth?.logout;
  const productNavItems = getProductNavItems(params);

  return (
    <div className="bg-[#F5F5F5] text-[#1E2026] font-sans antialiased h-screen overflow-hidden flex flex-col md:flex-row">
      <Sidebar />
      <main className="flex-1 md:ml-16 flex flex-col h-screen overflow-hidden relative bg-[#F5F5F5] min-w-0">

        {/* TopAppBar Component */}
        <header className="sticky top-0 z-50 flex items-center justify-between px-4 h-[56px] w-full bg-[#FFFFFF]/95 backdrop-blur-md border-b border-[#E6E8EA] font-inter tracking-tight flex-shrink-0 relative">

          {/* Left: Mobile Brand & Navigation */}
          <div className="flex items-center gap-6 flex-1 min-w-0 h-full">
            <div className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-[#1E2026] hover:opacity-80 cursor-pointer lg:hidden shrink-0">
              <span>Redline HQ</span>
            </div>

            <nav aria-label="Product sections" className="hidden lg:flex items-center gap-6 h-full overflow-x-auto hide-scrollbar">
              {productNavItems.map((item) => {
                const isActive = item.match(location.pathname);
                return (
                  <Link
                    key={item.label}
                    aria-current={isActive ? "page" : undefined}
                    className={`workspace-topbar-nav-item flex items-center h-full text-[14px] font-semibold cursor-pointer border-b-[3px] transition-colors whitespace-nowrap ${isActive ? 'workspace-topbar-nav-active border-[#F0B90B] text-[#1E2026]' : 'border-transparent text-[#848E9C] hover:text-[#1E2026]'}`}
                    to={item.path}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: Search & Actions */}
          <div className="flex items-center gap-4 shrink-0 h-full">
            {/* Search Bar */}
            <div className="relative w-[280px] hidden xl:flex items-center">
              <Search aria-hidden="true" size={15} className="absolute left-3 text-[#848E9C] pointer-events-none" />
              <input className="w-full bg-[#F5F5F5] border border-transparent rounded-[50px] text-[#1E2026] text-[13px] font-medium pl-9 pr-4 py-[6px] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#F0B90B] transition-colors placeholder:text-[#848E9C] shadow-none" placeholder="Search across workspace..." type="text"/>
            </div>

            {/* Trailing Actions */}
            <div className="flex items-center gap-2">
              {visibleActions.map((action, index) => (
                <ActionControl
                  key={`${action.label}-${index}`}
                  {...action}
                  variant={index === primaryActionIndex ? "primary" : "secondary"}
                />
              ))}
            </div>

            {/* User Profile */}
            <div className="flex items-center gap-3 pl-4 border-l border-[#E6E8EA] h-8">
              
              {auth && auth.user ? (
                <div className="flex items-center gap-1 group">
                  <Link
                    aria-label={`Account settings for ${auth.user.display_name}`}
                    className="flex items-center gap-2 hover:bg-[#F5F5F5] py-1 px-1 pr-3 rounded-[50px] transition-colors border border-transparent hover:border-[#E6E8EA]"
                    title="Account settings"
                    to="/account"
                  >
                    <div className="w-7 h-7 rounded-full bg-[#F0B90B] flex items-center justify-center text-[12px] font-bold text-[#1E2026] shadow-sm overflow-hidden" title={auth.user.display_name}>
                      {auth.user.display_name?.charAt(0).toUpperCase()}
                    </div>
                    <span className="hidden sm:inline max-w-[120px] truncate text-[14px] font-semibold text-[#1E2026]" title={auth.user.display_name}>
                      {auth.user.display_name}
                    </span>
                  </Link>
                  {handleSignOut && (
                     <button
                       aria-label="Sign out"
                       className="text-[#848E9C] hover:text-[#F6465D] hover:bg-[#F6465D]/10 w-7 h-7 rounded-full flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                       onClick={(e) => { e.stopPropagation(); handleSignOut(); }}
                       title="Sign out"
                        type="button"
                      >
                        <LogOut aria-hidden="true" size={14} />
                      </button>
                   )}
                </div>
              ) : (
                signOutAction && (
                   <ActionControl key="sign-out-fallback" {...signOutAction} variant="secondary" />
                )
              )}
            </div>
          </div>
        </header>

        {/* Canvas */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 flex gap-4 md:gap-6 bg-[#F5F5F5]">
          {/* Main Column */}
          <div className="flex-1 flex flex-col gap-4 md:gap-6 min-w-0">
            
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-[#E6E8EA] pb-4 md:pb-6 gap-4">
              
              <div>
                {breadcrumbItems.length > 0 && (
                  <nav aria-label="Workspace path" className="mb-3">
                    <ol className="flex flex-wrap items-center gap-2 text-[12px] text-[#848E9C]">
                      {breadcrumbItems.map((breadcrumb, index) => {
                        const isLast = index === breadcrumbItems.length - 1;
                        return (
                          <li key={index} className="flex items-center gap-2 min-w-0 shrink-0">
                            {breadcrumb.to && !isLast ? (
                              <Link className="hover:text-[#1E2026] transition-colors truncate max-w-[120px] md:max-w-[200px] block" to={breadcrumb.to} title={breadcrumb.label}>{breadcrumb.label}</Link>
                            ) : (
                              <span className={isLast ? "text-[#1E2026] font-semibold truncate max-w-[150px] md:max-w-[300px] block" : "text-[#848E9C] truncate max-w-[150px] md:max-w-[300px] block"} title={breadcrumb.label}>{breadcrumb.label}</span>
                            )}
                            {!isLast && <ChevronRight aria-hidden="true" size={14} className="opacity-50" />}
                          </li>
                        );
                      })}
                    </ol>
                  </nav>
                )}
                
                {eyebrow && <p className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider mb-1">{eyebrow}</p>}
                <h1 className="font-bold text-[24px] md:text-[24px] text-[#1E2026] tracking-normal">{title}</h1>
                {intro && <p className="font-sans text-[14px] md:text-[14px] text-[#474D57] mt-1 max-w-3xl">{intro}</p>}
              </div>

              {signalItems.length > 0 && (
                <ul aria-label="Page signals" className="flex gap-2 flex-wrap list-none m-0 p-0">
                  {signalItems.map((signal) => (
                    <li key={signal.label} className="px-2 py-0.5 rounded-[4px] bg-[#F5F5F5] border border-[#E6E8EA] text-[11px] font-semibold text-[#848E9C] uppercase tracking-wider">
                      {signal.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Stat Cards Grid */}
            {stats.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {stats.map((stat) => (
                  <StatCard key={stat.label} {...stat} />
                ))}
              </div>
            )}

            {/* Page Content */}
            <div className="flex flex-col gap-6 pb-20">
              {children}
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
