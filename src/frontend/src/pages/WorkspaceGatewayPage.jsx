import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  BarChart3,
  ClipboardCheck,
  FileSearch,
  FileText,
  FolderOpen,
  GitCompareArrows,
  MessageSquareText,
  ArrowRight,
  Sparkles,
  Loader2,
} from "lucide-react";
import { encodeId } from "../lib/idCodec";
import { useActiveProject } from "../context/ActiveProjectContext";
import { useAuth } from "../auth/AuthContext";
import { listProjectContracts, listContractDrafts } from "../lib/api";

// Standalone — no ScreenFrame needed

const GATEWAY_CONTENT = {
  contracts: {
    title: "Contracts",
    eyebrow: "Workspace Picker",
    intro: "Open a project workspace to manage its contract inventory and document versions.",
    icon: FileText,
    summary: "Contracts are scoped to projects. Choose a project first, then open or create contracts from that workspace.",
    steps: ["Open Projects", "Choose a workspace", "Open Contract Inventory"],
    actionLabel: "Open Projects"
  },
  parser: {
    title: "Parser",
    eyebrow: "Parser Workspace",
    intro: "Parser workspaces are tied to a specific document version.",
    icon: FileSearch,
    summary: "Open a contract draft, then use its Parser action to inspect parse truth, diagnostics, OCR signals, and coverage policy.",
    steps: ["Open Projects", "Open a contract", "Choose a draft parser"],
    actionLabel: "Find Document"
  },
  compare: {
    title: "Compare",
    eyebrow: "Deterministic Diff",
    intro: "Compare runs are created from review-ready contract drafts.",
    icon: GitCompareArrows,
    summary: "Open a contract and choose two parser-ready versions to generate a compare run.",
    steps: ["Open Projects", "Open a contract", "Start Compare"],
    actionLabel: "Find Contract"
  },
  review: {
    title: "Review",
    eyebrow: "Human Review",
    intro: "Review opens from an existing compare run.",
    icon: ClipboardCheck,
    summary: "Create or open a compare run first, then review individual changes and resolve them with human decisions.",
    steps: ["Open Projects", "Open a compare run", "Review changes"],
    actionLabel: "Find Compare Run"
  },
  qa: {
    title: "Contract Q&A",
    eyebrow: "AI-Powered Q&A",
    intro: "Ask questions and get answers directly from your contract documents.",
    icon: MessageSquareText,
    summary: "Open a contract, then start Contract Q&A to chat with document-backed citations and session memory.",
    steps: ["Open Projects", "Open a contract", "Start Contract Q&A"],
    actionLabel: "Find Contract"
  },
  analytics: {
    title: "Analytics",
    eyebrow: "Project Analytics",
    intro: "Analytics are scoped to a project workspace.",
    icon: BarChart3,
    summary: "Open a project to view compare volume, review progress, risk distribution, and AI review quality signals.",
    steps: ["Open Projects", "Choose a workspace", "Open Analytics"],
    actionLabel: "Open Projects"
  }
};

/* Where to redirect when active project is known — simple URL-based */
const SECTION_PROJECT_URLS = {
  contracts: (id) => `/projects/${encodeId(id)}`,
  analytics: (id) => `/projects/${encodeId(id)}/analytics`,
  // parser, qa — need async fetch (contract + draft IDs)
  // compare, review — need a compare run, can't auto-resolve
};

export function WorkspaceGatewayPage({ section = "contracts" }) {
  const config = GATEWAY_CONTENT[section] ?? GATEWAY_CONTENT.contracts;
  const Icon = config.icon ?? FolderOpen;
  const { activeProject } = useActiveProject();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState(null);
  // resolveInfo = { message, contractId, parsedCount } — shown when not enough drafts
  const [resolveInfo, setResolveInfo] = useState(null);

  /* ── Simple redirect (contracts, analytics) ── */
  useEffect(() => {
    if (!activeProject) return;
    const urlFn = SECTION_PROJECT_URLS[section];
    if (urlFn) {
      navigate(urlFn(activeProject.id), { replace: true });
    }
  }, [activeProject, section, navigate]);

  /* ── Smart fetch redirect (parser, qa, compare, review) ── */
  useEffect(() => {
    if (!activeProject || !token) return;
    const SMART_SECTIONS = ["parser", "qa", "compare", "review"];
    if (!SMART_SECTIONS.includes(section)) return;

    async function resolveWorkspace() {
      setIsResolving(true);
      setResolveError(null);
      setResolveInfo(null);
      try {
        // 1. Get first contract in the active project
        const contracts = await listProjectContracts(token, activeProject.id);
        if (!contracts || contracts.length === 0) {
          setResolveError("No contracts found in this project. Add a contract first.");
          setIsResolving(false);
          return;
        }
        const firstContract = contracts[0];

        if (section === "qa") {
          // Q&A just needs the contractId
          navigate(`/contracts/${encodeId(firstContract.id)}/chat`, { replace: true });
          return;
        }

        // parser, compare, review — need drafts
        const drafts = await listContractDrafts(token, firstContract.id);

        if (section === "parser") {
          if (!drafts || drafts.length === 0) {
            setResolveError("No document drafts found. Upload a DOCX draft to the contract first.");
            setIsResolving(false);
            return;
          }
          const firstDraft = drafts[0];
          navigate(`/contracts/${encodeId(firstContract.id)}/parser?version=${encodeId(firstDraft.id)}`, { replace: true });
          return;
        }

        // compare or review — need ≥ 2 parsed drafts
        const parsedDrafts = (drafts ?? []).filter(d =>
          ["parsed", "parsed_with_warnings"].includes(d.parse_status?.toLowerCase())
        );
        const parsedCount = parsedDrafts.length;

        if (parsedCount >= 2) {
          // Redirect to ContractDetailPage which has the Compare Setup section
          navigate(`/contracts/${encodeId(firstContract.id)}`, { replace: true });
          return;
        }

        // Not enough parsed drafts — show informational message
        const needed = 2 - parsedCount;
        setResolveInfo({
          contractId: firstContract.id,
          contractTitle: firstContract.title,
          parsedCount,
          needed,
          totalDrafts: (drafts ?? []).length,
        });
        setIsResolving(false);
      } catch (err) {
        setResolveError(err?.message ?? "Failed to resolve workspace.");
        setIsResolving(false);
      }
    }

    void resolveWorkspace();
  }, [activeProject, section, token, navigate]);

  /* Show a loading spinner while auto-resolving */
  if (isResolving) {
    return (
      <main className="max-w-[1200px] mx-auto px-8 py-16 flex flex-col items-center gap-4">
        <Loader2 size={32} className="text-[#F0B90B] animate-spin" />
        <p className="text-[14px] font-semibold text-[#848E9C]">
          Opening {config.title} workspace…
        </p>
      </main>
    );
  }

  /* ── Modal popup for insufficient parsed drafts ── */
  const ParseRequiredModal = resolveInfo ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(30,32,38,0.5)", backdropFilter: "blur(4px)" }}
      onClick={() => setResolveInfo(null)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Parsed drafts required"
        className="w-full max-w-[440px] bg-white border border-[#E6E8EA] overflow-hidden"
        style={{ borderRadius: "14px", boxShadow: "rgba(0,0,0,0.18) 0px 10px 36px", animation: "gwModalIn 0.2s ease-out" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-[#E6E8EA] bg-[#FFFBF0] flex items-start gap-4">
          <div
            className="w-10 h-10 shrink-0 flex items-center justify-center font-bold text-[20px]"
            style={{ borderRadius: "8px", background: "rgba(240,185,11,0.15)" }}
          >⚡</div>
          <div>
            <p className="text-[16px] font-bold text-[#1E2026] leading-snug">
              {resolveInfo.needed === 1
                ? "1 more parsed draft needed"
                : `${resolveInfo.needed} more parsed drafts needed`}
            </p>
            <p className="text-[12px] font-medium text-[#848E9C] mt-0.5">
              {config.title} requires 2 parsed drafts
            </p>
          </div>
        </div>
        {/* Body */}
        <div className="px-6 py-5">
          <p className="text-[13px] font-medium text-[#474D57] mb-4" style={{ lineHeight: "1.6" }}>
            <strong className="text-[#1E2026]">{config.title}</strong> needs{" "}
            <strong className="text-[#1E2026]">2 parsed drafts</strong>{" "}
            (source + target version). Your contract{" "}
            <em className="text-[#F0B90B] not-italic font-semibold">{resolveInfo.contractTitle}</em>{" "}
            currently has{" "}
            <strong className="text-[#1E2026]">{resolveInfo.parsedCount}</strong>{" "}
            {resolveInfo.parsedCount === 1 ? "parsed draft" : "parsed drafts"}.
            Upload {resolveInfo.needed === 1 ? "1 more DOCX" : `${resolveInfo.needed} more DOCX files`} and run the parser first.
          </p>

          <div className="flex items-center gap-2 mb-5">
            <span
              className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#B38900] border border-[rgba(240,185,11,0.4)] bg-[rgba(240,185,11,0.08)]"
              style={{ borderRadius: "6px" }}
            >
              {resolveInfo.parsedCount}/2 parsed
            </span>
            <span className="text-[12px] text-[#848E9C]">
              — need {resolveInfo.needed} more
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to={`/contracts/${encodeId(resolveInfo.contractId)}`}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#F0B90B] text-[#1E2026] font-semibold text-[13px] no-underline"
              style={{ borderRadius: "8px", boxShadow: "rgb(153,153,153) 0px 2px 10px -3px", transition: "opacity 200ms ease" }}
              onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
            >
              Open Contract → Upload &amp; Parse
            </Link>
            <button
              type="button"
              onClick={() => setResolveInfo(null)}
              className="px-4 py-2.5 bg-white border border-[#E6E8EA] text-[#848E9C] font-semibold text-[13px] cursor-pointer"
              style={{ borderRadius: "8px", transition: "all 200ms ease" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#1E2026"; e.currentTarget.style.color = "#1E2026"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#E6E8EA"; e.currentTarget.style.color = "#848E9C"; }}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes gwModalIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  ) : null;

  return (
    <>
      {ParseRequiredModal}
      <main className="max-w-[1200px] mx-auto px-8 py-8">

        <div className="mb-8">
          <p className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider mb-1">{config.eyebrow}</p>
          <h1 className="text-[28px] font-medium text-[#1E2026] mb-1" style={{ lineHeight: "1.00" }}>{config.title}</h1>
          <p className="text-[14px] font-medium text-[#848E9C] mt-2" style={{ lineHeight: "1.43" }}>{config.intro}</p>
        </div>

        {/* Entry point card — Binance spec: 12px radius, 5% shadow */}
        <div
          className="bg-white border border-[#E6E8EA] overflow-hidden"
          style={{ borderRadius: "12px", boxShadow: "rgba(32, 32, 37, 0.05) 0px 3px 5px 0px" }}
        >
          <div className="px-6 py-5 border-b border-[#E6E8EA]">
            <h2 className="text-[16px] font-semibold text-[#1E2026]">{config.title} Entry Point</h2>
          </div>

          <div className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              {/* Left content */}
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 shrink-0 flex items-center justify-center text-[#F0B90B]"
                  style={{ borderRadius: "10px", background: "rgba(240, 185, 11, 0.1)" }}
                >
                  <Icon aria-hidden="true" size={24} />
                </div>
                <div>
                  <p className="text-[14px] font-medium text-[#474D57] max-w-2xl" style={{ lineHeight: "1.57" }}>
                    {config.summary}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {config.steps.map((step, index) => (
                      <span
                        key={step}
                        className="text-[12px] font-semibold text-[#1E2026] px-3 py-1.5 bg-[#F5F5F5] border border-[#E6E8EA]"
                        style={{ borderRadius: "50px" }}
                      >
                        {index + 1}. {step}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* CTA — pill button per spec */}
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 bg-[#F0B90B] text-[#1E2026] px-6 py-2.5 font-semibold text-[14px] no-underline shrink-0 whitespace-nowrap"
                style={{
                  borderRadius: "50px",
                  boxShadow: "rgb(153, 153, 153) 0px 2px 10px -3px",
                  transition: "all 200ms ease"
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
              >
                {config.actionLabel}
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>

        {/* Quick tips section */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {config.steps.map((step, index) => (
            <div
              key={step}
              className="bg-white border border-[#E6E8EA] p-5"
              style={{ borderRadius: "12px", boxShadow: "rgba(32, 32, 37, 0.05) 0px 3px 5px 0px" }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-8 h-8 flex items-center justify-center text-[#F0B90B] font-bold text-[14px]"
                  style={{ borderRadius: "50%", background: "rgba(240, 185, 11, 0.1)" }}
                >
                  {index + 1}
                </div>
                <h3 className="text-[14px] font-semibold text-[#1E2026]">{step}</h3>
              </div>
              <p className="text-[13px] font-medium text-[#848E9C]" style={{ lineHeight: "1.46" }}>
                {index === 0 && "Start by navigating to your project workspace."}
                {index === 1 && "Select the specific resource you need to work with."}
                {index === 2 && `Launch the ${config.title.toLowerCase()} workflow.`}
              </p>
            </div>
          ))}
        </div>

        {/* Helpful hint */}
        <div
          className="mt-6 p-4 bg-[#F5F5F5] border border-[#E6E8EA] flex items-start gap-3"
          style={{ borderRadius: "8px" }}
        >
          <Sparkles size={16} className="text-[#F0B90B] shrink-0 mt-0.5" />
          <p className="text-[13px] font-medium text-[#474D57]" style={{ lineHeight: "1.46" }}>
            <span className="font-semibold text-[#1E2026]">Tip:</span> All {config.title.toLowerCase()} workflows begin from a project. Use the <strong>Projects</strong> link in the navbar to get started.
          </p>
        </div>
      </main>
    </>
  );
}
